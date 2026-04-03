import json
import io
import logging
import concurrent.futures

logger = logging.getLogger("doctors")
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, SessionLocal
import models
import auth as auth_utils
from scraper import run_scraping_job, scrape_url, run_all_sources, run_broad_search, _normalize_name

_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

try:
    import openpyxl
except ImportError:
    openpyxl = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import requests as http_requests
    from bs4 import BeautifulSoup
    WEB_IMPORT_AVAILABLE = True
except ImportError:
    WEB_IMPORT_AVAILABLE = False

router = APIRouter(prefix="/api/doctors", tags=["doctors"])

HMO_OPTIONS = ["clalit", "maccabi", "meuhedet", "leumit"]

PREDEFINED_ISRAELI_SOURCES = [
    {
        "key": "court_experts",
        "name": "data.gov.il — מומחים לבתי משפט (פסיכולוגים, פסיכיאטרים, עו\"ס)",
        "url": "https://data.gov.il/api/3/action/datastore_search?resource_id=ebe7b0fa-42c8-4195-8b40-b0b0e73cc494",
    },
    {
        "key": "cannabis_doctors",
        "name": "data.gov.il — רופאים מורשים קנביס רפואי",
        "url": "https://data.gov.il/api/3/action/datastore_search?resource_id=37f14c29-47af-4b6c-b38e-e08a15e15b5b",
    },
]


class DoctorCreate(BaseModel):
    name: str
    specialty: Optional[str] = None
    sub_specialty: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    hmo_acceptance: Optional[List[str]] = None
    gives_expert_opinion: bool = False
    notes: Optional[str] = None
    source_url: Optional[str] = None


class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    sub_specialty: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    hmo_acceptance: Optional[List[str]] = None
    gives_expert_opinion: Optional[bool] = None
    notes: Optional[str] = None
    source_url: Optional[str] = None


def doctor_to_dict(d: models.Doctor) -> dict:
    hmo = []
    if d.hmo_acceptance:
        try:
            hmo = json.loads(d.hmo_acceptance)
        except Exception:
            hmo = []
    return {
        "id": d.id,
        "name": d.name,
        "specialty": d.specialty,
        "sub_specialty": d.sub_specialty,
        "phone": d.phone,
        "location": d.location,
        "hmo_acceptance": hmo,
        "gives_expert_opinion": d.gives_expert_opinion,
        "notes": d.notes,
        "source_url": d.source_url,
        "created_at": str(d.created_at) if d.created_at else None,
        "updated_at": str(d.updated_at) if d.updated_at else None,
    }


@router.get("/filter-options")
def get_filter_options(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Return distinct values for specialty, sub_specialty, and location dropdowns."""
    def distinct(col):
        rows = db.query(col).filter(col.isnot(None), col != "").distinct().order_by(col).all()
        return [r[0] for r in rows]

    specialties = distinct(models.Doctor.specialty)
    sub_specialties = distinct(models.Doctor.sub_specialty)

    # For location extract city/area (last comma-separated token or whole value)
    raw_locations = distinct(models.Doctor.location)
    areas = sorted({loc.split(",")[-1].strip() for loc in raw_locations if loc})

    return {"specialties": specialties, "sub_specialties": sub_specialties, "areas": areas}


@router.get("")
def list_doctors(
    search: Optional[str] = None,
    specialty: Optional[str] = None,
    sub_specialty: Optional[str] = None,
    hmo: Optional[str] = None,
    location: Optional[str] = None,
    expert_opinion: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    q = db.query(models.Doctor)
    if search:
        q = q.filter(
            models.Doctor.name.ilike(f"%{search}%") |
            models.Doctor.specialty.ilike(f"%{search}%") |
            models.Doctor.sub_specialty.ilike(f"%{search}%") |
            models.Doctor.location.ilike(f"%{search}%")
        )
    if specialty:
        q = q.filter(models.Doctor.specialty.ilike(f"%{specialty}%"))
    if sub_specialty:
        q = q.filter(models.Doctor.sub_specialty.ilike(f"%{sub_specialty}%"))
    if hmo:
        q = q.filter(models.Doctor.hmo_acceptance.ilike(f"%{hmo}%"))
    if location:
        q = q.filter(models.Doctor.location.ilike(f"%{location}%"))
    if expert_opinion is not None:
        q = q.filter(models.Doctor.gives_expert_opinion == expert_opinion)
    doctors = q.order_by(models.Doctor.name).all()
    return [doctor_to_dict(d) for d in doctors]


@router.post("")
def create_doctor(
    data: DoctorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    doctor = models.Doctor(
        name=data.name,
        specialty=data.specialty,
        sub_specialty=data.sub_specialty,
        phone=data.phone,
        location=data.location,
        hmo_acceptance=json.dumps(data.hmo_acceptance or [], ensure_ascii=False),
        gives_expert_opinion=data.gives_expert_opinion,
        notes=data.notes,
        source_url=data.source_url,
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor_to_dict(doctor)


@router.put("/{doctor_id}")
def update_doctor(
    doctor_id: int,
    data: DoctorUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    update_data = data.model_dump(exclude_none=True)
    if "hmo_acceptance" in update_data:
        update_data["hmo_acceptance"] = json.dumps(update_data["hmo_acceptance"], ensure_ascii=False)
    for field, value in update_data.items():
        setattr(doctor, field, value)
    db.commit()
    db.refresh(doctor)
    return doctor_to_dict(doctor)


@router.delete("/{doctor_id}")
def delete_doctor(
    doctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    db.delete(doctor)
    db.commit()
    return {"message": "Doctor deleted"}


def _parse_hmo_string(value: str) -> List[str]:
    """Parse a free-text HMO string into a list of known HMO keys."""
    result = []
    val = str(value).lower()
    hmo_map = {
        "clalit": ["כללית", "clalit"],
        "maccabi": ["מכבי", "maccabi"],
        "meuhedet": ["מאוחדת", "meuhedet"],
        "leumit": ["לאומית", "leumit"],
    }
    for key, aliases in hmo_map.items():
        if any(alias in val for alias in aliases):
            result.append(key)
    if not result and ("כן" in val or "yes" in val or "all" in val or "כל" in val):
        result = ["clalit", "maccabi", "meuhedet", "leumit"]
    return result


def _bool_from_value(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    val = str(value).strip().lower()
    return val in ["כן", "yes", "true", "1", "נכון"]


@router.post("/import/excel")
async def import_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    if openpyxl is None:
        raise HTTPException(status_code=500, detail="openpyxl not installed")
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content))
    ws = wb.active
    headers = [str(cell.value).strip().lower() if cell.value else "" for cell in ws[1]]

    col_map = {}
    field_aliases = {
        "name": ["שם", "שם רופא", "name", "doctor"],
        "specialty": ["מומחיות", "specialty", "התמחות"],
        "sub_specialty": ["תת התמחות", "תת-התמחות", "sub_specialty", "sub specialty"],
        "phone": ["טלפון", "phone", "נייד", "mobile"],
        "location": ["מיקום", "כתובת", "location", "היכן מקבל", "קליניקה"],
        "hmo_acceptance": ["קופות חולים", "קופה", "hmo", "hmo_acceptance"],
        "gives_expert_opinion": ["חוות דעת", "ועדות", "expert_opinion", "opinion", "gives_expert_opinion"],
        "notes": ["הערות", "notes", "备注"],
    }
    for field, aliases in field_aliases.items():
        for i, h in enumerate(headers):
            if any(alias in h for alias in aliases):
                col_map[field] = i
                break

    imported = 0
    skipped = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue
        name = str(row[col_map["name"]]).strip() if "name" in col_map and row[col_map["name"]] else None
        if not name or name.lower() == "none":
            skipped += 1
            continue

        def get_col(field):
            idx = col_map.get(field)
            return row[idx] if idx is not None and idx < len(row) else None

        hmo_raw = get_col("hmo_acceptance")
        hmo_list = _parse_hmo_string(hmo_raw) if hmo_raw else []

        doctor = models.Doctor(
            name=name,
            specialty=str(get_col("specialty") or "").strip() or None,
            sub_specialty=str(get_col("sub_specialty") or "").strip() or None,
            phone=str(get_col("phone") or "").strip() or None,
            location=str(get_col("location") or "").strip() or None,
            hmo_acceptance=json.dumps(hmo_list, ensure_ascii=False),
            gives_expert_opinion=_bool_from_value(get_col("gives_expert_opinion")),
            notes=str(get_col("notes") or "").strip() or None,
        )
        db.add(doctor)
        imported += 1

    db.commit()
    return {"imported": imported, "skipped": skipped}


@router.post("/import/pdf")
async def import_from_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    if pdfplumber is None:
        raise HTTPException(status_code=500, detail="pdfplumber not installed")
    content = await file.read()
    imported = 0
    rows = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                # First table row as header
                header = [str(c).strip().lower() if c else "" for c in table[0]]
                col_map = {}
                field_aliases = {
                    "name": ["שם", "שם רופא", "name"],
                    "specialty": ["מומחיות", "specialty", "התמחות"],
                    "sub_specialty": ["תת התמחות", "תת-התמחות", "sub_specialty"],
                    "phone": ["טלפון", "phone", "נייד"],
                    "location": ["מיקום", "כתובת", "location", "היכן מקבל"],
                    "hmo_acceptance": ["קופות חולים", "קופה", "hmo"],
                    "gives_expert_opinion": ["חוות דעת", "ועדות", "expert_opinion"],
                    "notes": ["הערות", "notes"],
                }
                for field, aliases in field_aliases.items():
                    for i, h in enumerate(header):
                        if any(alias in h for alias in aliases):
                            col_map[field] = i
                            break
                for row in table[1:]:
                    if not row or not any(row):
                        continue
                    def get_col(field):
                        idx = col_map.get(field)
                        return row[idx] if idx is not None and idx < len(row) else None
                    name = str(get_col("name") or "").strip()
                    if not name:
                        continue
                    hmo_raw = get_col("hmo_acceptance")
                    hmo_list = _parse_hmo_string(hmo_raw) if hmo_raw else []
                    rows.append(models.Doctor(
                        name=name,
                        specialty=str(get_col("specialty") or "").strip() or None,
                        sub_specialty=str(get_col("sub_specialty") or "").strip() or None,
                        phone=str(get_col("phone") or "").strip() or None,
                        location=str(get_col("location") or "").strip() or None,
                        hmo_acceptance=json.dumps(hmo_list, ensure_ascii=False),
                        gives_expert_opinion=_bool_from_value(get_col("gives_expert_opinion")),
                        notes=str(get_col("notes") or "").strip() or None,
                    ))

    for doc in rows:
        db.add(doc)
        imported += 1
    db.commit()
    return {"imported": imported}


class UrlImportRequest(BaseModel):
    url: str
    name_selector: Optional[str] = None
    specialty_selector: Optional[str] = None


def _bg_scrape_url(url: str):
    """Run URL scrape in thread-pool and persist results — called via BackgroundTasks."""
    db = SessionLocal()
    try:
        records = scrape_url(url)
        existing = {_normalize_name(d.name) for d in db.query(models.Doctor.name).all()}
        added = 0
        for rec in records:
            if _normalize_name(rec["name"]) in existing:
                continue
            db.add(models.Doctor(**rec))
            existing.add(_normalize_name(rec["name"]))
            added += 1
        db.commit()
        logger.info("URL import done: %d new doctors from %s", added, url)
    except Exception as e:
        db.rollback()
        logger.error("URL import error: %s", e)
    finally:
        db.close()


@router.post("/import/url")
async def import_from_url(
    data: UrlImportRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth_utils.require_manager),
):
    """
    Kicks off a background scrape so the HTTP response returns immediately.
    The scraping runs in a thread-pool and does not block the server.
    """
    if not WEB_IMPORT_AVAILABLE:
        raise HTTPException(status_code=500, detail="requests/beautifulsoup4 not installed")
    background_tasks.add_task(_executor.submit, _bg_scrape_url, data.url)
    return {"status": "queued", "message": "הייבוא הושק ברקע — הרופאים יופיעו בטבלה בתוך מספר שניות", "url": data.url}


# ─── Scraping Sources ────────────────────────────────────────────────────────

class ScrapingSourceCreate(BaseModel):
    name: str
    url: str
    interval_hours: int = 24


class ScrapingSourceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    is_active: Optional[bool] = None
    interval_hours: Optional[int] = None


def source_to_dict(s: models.ScrapingSource) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "url": s.url,
        "is_active": s.is_active,
        "interval_hours": s.interval_hours,
        "last_scraped_at": str(s.last_scraped_at) if s.last_scraped_at else None,
        "last_scraped_count": s.last_scraped_count,
        "last_error": s.last_error,
        "created_at": str(s.created_at) if s.created_at else None,
    }


@router.get("/predefined-sources")
def get_predefined_sources(
    current_user: models.User = Depends(auth_utils.require_manager),
):
    return PREDEFINED_ISRAELI_SOURCES


@router.post("/sources/add-predefined/{key}")
def add_predefined_source(
    key: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    src = next((s for s in PREDEFINED_ISRAELI_SOURCES if s["key"] == key), None)
    if not src:
        raise HTTPException(status_code=404, detail="מקור לא נמצא")
    existing = db.query(models.ScrapingSource).filter(models.ScrapingSource.url == src["url"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="מקור זה כבר קיים במערכת")
    source = models.ScrapingSource(name=src["name"], url=src["url"], interval_hours=24)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source_to_dict(source)


@router.get("/sources")
def list_sources(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    sources = db.query(models.ScrapingSource).order_by(models.ScrapingSource.id).all()
    return [source_to_dict(s) for s in sources]


@router.post("/sources")
def create_source(
    data: ScrapingSourceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    source = models.ScrapingSource(name=data.name, url=data.url, interval_hours=data.interval_hours)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source_to_dict(source)


@router.post("/sources/run-all")
def run_all_sources_now(
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth_utils.require_manager),
):
    background_tasks.add_task(_executor.submit, run_all_sources, SessionLocal)
    return {"status": "queued", "message": "סריקת כל המקורות הושקה ברקע"}


@router.post("/sources/broad-search")
def run_broad_search_now(
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth_utils.require_manager),
):
    def _bg():
        result = run_broad_search(SessionLocal)
        logger.info("Broad search complete: %s", result)
    background_tasks.add_task(_executor.submit, _bg)
    return {"status": "queued", "message": "חיפוש רחב הושק ברקע — מחפש בכל מאגרי data.gov.il ומאמת רישיונות ישראליים"}


@router.put("/sources/{source_id}")
def update_source(
    source_id: int,
    data: ScrapingSourceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    source = db.query(models.ScrapingSource).filter(models.ScrapingSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(source, field, value)
    db.commit()
    db.refresh(source)
    return source_to_dict(source)


@router.delete("/sources/{source_id}")
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    source = db.query(models.ScrapingSource).filter(models.ScrapingSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(source)
    db.commit()
    return {"message": "Source deleted"}


@router.post("/sources/{source_id}/run")
def run_source_now(
    source_id: int,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth_utils.require_manager),
):
    background_tasks.add_task(_executor.submit, run_scraping_job, source_id, SessionLocal)
    return {"status": "queued", "message": "סריקה הושקה ברקע"}
