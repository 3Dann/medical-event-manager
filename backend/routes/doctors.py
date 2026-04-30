import json
import io
import logging
import concurrent.futures

logger = logging.getLogger("doctors")
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db, SessionLocal
import models
import auth as auth_utils
from scraper import run_scraping_job, scrape_url, run_all_sources, run_broad_search, _normalize_name
from doctor_normalize import normalize_record

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
    {
        "key": "medreviews",
        "name": "medreviews.co.il — ביקורות ורופאים ישראלים",
        "url": "https://www.medreviews.co.il",
    },
    {
        "key": "infomed",
        "name": "infomed.co.il — מידע רפואי ומומחים",
        "url": "https://www.infomed.co.il",
    },
    {
        "key": "moh_practitioners",
        "name": "משרד הבריאות — רשימת בעלי רישיון לעסוק ברפואה",
        "url": "https://practitioners.health.gov.il",
    },
    {
        "key": "doctors_co_il",
        "name": "doctors.co.il — מאגר רופאים ישראלי",
        "url": "https://www.doctors.co.il",
    },
    {
        "key": "tteam_mcm",
        "name": "tteam.co.il — אינדקס המלצות רופאים מומחים ממנהלי אירוע רפואי",
        "url": "https://docs.google.com/spreadsheets/d/1fmgDA25Rklu8VbvN-pe0vN2EUahjhXTGuk1ODuKzl3E/view",
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


@router.get("/export/excel")
def export_doctors_excel(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Export full doctors database as RTL Excel file."""
    from fastapi.responses import StreamingResponse
    if not openpyxl:
        raise HTTPException(status_code=500, detail="openpyxl לא מותקן")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "מאגר רופאים"
    ws.sheet_view.rightToLeft = True  # RTL sheet

    # Header style
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor="2563EB")
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True, readingOrder=2)
    right_align = Alignment(horizontal="right", vertical="center", wrap_text=True, readingOrder=2)
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    headers = ["שם הרופא", "מומחיות", "תת-מומחיות", "טלפון", "טלפון 2", "וואטסאפ", "אימייל", "עיר", "מיקום", "מחיר פרטי", "קופות חולים", "חוות דעת", "הערות", "מקור"]
    col_widths = [22, 18, 18, 16, 16, 16, 24, 14, 22, 12, 24, 12, 28, 30]

    for col_idx, (header, width) in enumerate(zip(headers, col_widths), start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = border
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = width

    ws.row_dimensions[1].height = 22

    # Alternate row fill
    fill_even = PatternFill("solid", fgColor="EFF6FF")
    fill_odd = PatternFill("solid", fgColor="FFFFFF")

    doctors = db.query(models.Doctor).order_by(models.Doctor.specialty, models.Doctor.name).all()

    for row_idx, doc in enumerate(doctors, start=2):
        # Parse HMO list
        try:
            hmo_list = json.loads(doc.hmo_acceptance) if doc.hmo_acceptance else []
            hmo_map = {"clalit": "כללית", "maccabi": "מכבי", "meuhedet": "מאוחדת", "leumit": "לאומית"}
            hmo_str = " | ".join(hmo_map.get(h, h) for h in hmo_list)
        except Exception:
            hmo_str = doc.hmo_acceptance or ""

        row_data = [
            doc.name or "",
            doc.specialty or "",
            doc.sub_specialty or "",
            doc.phone or "",
            getattr(doc, "phone2", None) or "",
            getattr(doc, "whatsapp", None) or "",
            getattr(doc, "email", None) or "",
            getattr(doc, "city", None) or "",
            doc.location or "",
            getattr(doc, "private_price", None) or "",
            hmo_str,
            "כן" if doc.gives_expert_opinion else "לא",
            doc.notes or "",
            doc.source_url or "",
        ]
        fill = fill_even if row_idx % 2 == 0 else fill_odd
        for col_idx, value in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.alignment = right_align
            cell.fill = fill
            cell.border = border

    # Freeze header row
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename*=UTF-8''%D7%9E%D7%90%D7%92%D7%A8%20%D7%A8%D7%95%D7%A4%D7%90%D7%99%D7%9D.xlsx"},
    )


@router.get("")
def list_doctors(
    search: Optional[str] = None,
    specialty: Optional[str] = None,
    sub_specialty: Optional[str] = None,
    hmo: Optional[str] = None,
    location: Optional[str] = None,
    expert_opinion: Optional[bool] = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
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
    total = q.count()
    doctors = q.order_by(models.Doctor.name).offset(offset).limit(limit).all()
    return {"total": total, "offset": offset, "limit": limit, "items": [doctor_to_dict(d) for d in doctors]}


@router.post("")
def create_doctor(
    data: DoctorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    rec = {
        "name": data.name,
        "specialty": data.specialty,
        "sub_specialty": data.sub_specialty,
        "phone": data.phone,
        "location": data.location,
        "hmo_acceptance": json.dumps(data.hmo_acceptance or [], ensure_ascii=False),
        "gives_expert_opinion": data.gives_expert_opinion,
        "notes": data.notes,
        "source_url": data.source_url,
    }
    rec = normalize_record(rec)
    if rec is None:
        raise HTTPException(status_code=400, detail="שם הרופא אינו תקין")
    doctor = models.Doctor(**rec)
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
        raise HTTPException(status_code=500, detail="openpyxl לא מותקן")

    try:
        content = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"לא ניתן לפתוח את הקובץ: {e}")

    ws = wb.active
    if not ws or ws.max_row < 2:
        raise HTTPException(status_code=400, detail="הקובץ ריק — חסרת שורת נתונים")

    # Keep original for display, lowercase for matching
    raw_headers = [str(cell.value).strip() if cell.value is not None else "" for cell in ws[1]]
    headers_lc  = [h.lower() for h in raw_headers]

    field_aliases = {
        "name":                ["שם הרופא", "שם רופא", "שם", "name", "doctor", "full name"],
        "title":               ["תואר", "title", "degree"],
        "specialty":           ["מומחיות", "specialty", "התמחות", "תחום"],
        "sub_specialty":       ["תת-מומחיות", "תת מומחיות", "תת-התמחות", "תת התמחות", "sub_specialty", "sub specialty"],
        "license_number":      ["מספר רישיון", "רישיון", "license", "license_number", "מס רישיון"],
        "phone":               ["טלפון ראשי", "טלפון", "phone", "נייד", "mobile", "tel"],
        "phone2":              ["טלפון 2", "טלפון נוסף", "טלפון שני", "מזכירה", "phone2", "secretary"],
        "whatsapp":            ["וואטסאפ", "whatsapp", "ווצאפ"],
        "email":               ["אימייל", "מייל", "email", "e-mail"],
        "city":                ["עיר", "city", "ישוב"],
        "location":            ["מיקום", "כתובת", "location", "היכן מקבל", "קליניקה", "address"],
        "private_price":       ["מחיר פרטי", "תשלום", "עלות", "מחיר", "price"],
        "hmo_acceptance":      ["קופות חולים", "קופה", "hmo", "חברת ביטוח", "ביטוח"],
        "languages":           ["שפות", "languages", "שפה"],
        "gives_expert_opinion":["חוות דעת", "ועדות", "expert_opinion", "opinion"],
        "notes":               ["הערות", "notes", "מידע נוסף", "备注"],
    }

    col_map = {}
    for field, aliases in field_aliases.items():
        for i, h in enumerate(headers_lc):
            if h and any(alias.lower() in h for alias in aliases):
                col_map[field] = i
                break

    if "name" not in col_map:
        found = ", ".join(h for h in raw_headers if h) or "אין עמודות"
        raise HTTPException(
            status_code=400,
            detail=f"לא זוהתה עמודת שם רופא. עמודות שנמצאו בקובץ: {found}"
        )

    def get_cell(row, field):
        idx = col_map.get(field)
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    # Pre-load existing names to detect duplicates
    existing_names = {_normalize_name(d.name) for d in db.query(models.Doctor.name).all()}

    imported = skipped_invalid = skipped_duplicate = 0
    row_errors = []
    skip_samples = []   # up to 5 examples of skipped rows + reason

    def _add_skip_sample(name_raw, reason):
        if len(skip_samples) < 5:
            skip_samples.append({"name": str(name_raw)[:60], "reason": reason})

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(v for v in row if v is not None):
            continue
        try:
            raw_name = get_cell(row, "name")
            name = str(raw_name).strip() if raw_name is not None else ""
            if not name or name.lower() in ("none", "nan"):
                _add_skip_sample(raw_name, "שם ריק")
                skipped_invalid += 1
                continue

            norm = _normalize_name(name)
            if norm in existing_names:
                _add_skip_sample(name, "כבר קיים במאגר")
                skipped_duplicate += 1
                continue

            hmo_raw = get_cell(row, "hmo_acceptance")
            raw_price = get_cell(row, "private_price")
            try:
                parsed_price = int(float(str(raw_price).replace(",", "").strip())) if raw_price else None
            except (ValueError, TypeError):
                parsed_price = None

            rec = {
                "name":                 name,
                "specialty":            str(get_cell(row, "specialty")            or "").strip() or None,
                "sub_specialty":        str(get_cell(row, "sub_specialty")        or "").strip() or None,
                "phone":                str(get_cell(row, "phone")                or "").strip() or None,
                "phone2":               str(get_cell(row, "phone2")               or "").strip() or None,
                "whatsapp":             str(get_cell(row, "whatsapp")             or "").strip() or None,
                "email":                str(get_cell(row, "email")                or "").strip() or None,
                "city":                 str(get_cell(row, "city")                 or "").strip() or None,
                "location":             str(get_cell(row, "location")             or "").strip() or None,
                "private_price":        parsed_price,
                "hmo_acceptance":       json.dumps(_parse_hmo_string(hmo_raw) if hmo_raw else [], ensure_ascii=False),
                "gives_expert_opinion": _bool_from_value(get_cell(row, "gives_expert_opinion")),
                "notes":                str(get_cell(row, "notes")                or "").strip() or None,
                "source_url":           "excel_import",
            }
            rec = normalize_record(rec)
            if rec is None:
                _add_skip_sample(name, "שם לא תקין (normalize)")
                skipped_invalid += 1
                continue

            db.add(models.Doctor(**rec))
            existing_names.add(norm)
            imported += 1

        except Exception as e:
            row_errors.append(f"שורה {row_num}: {e}")
            _add_skip_sample(f"שורה {row_num}", f"שגיאה: {e}")
            skipped_invalid += 1

    db.commit()
    return {
        "imported":           imported,
        "skipped_duplicates": skipped_duplicate,
        "skipped_invalid":    skipped_invalid,
        "detected_columns":   list(col_map.keys()),
        "skip_samples":       skip_samples,
        "errors":             row_errors[:5],
    }


@router.post("/import/pdf")
async def import_from_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    if pdfplumber is None:
        raise HTTPException(status_code=500, detail="pdfplumber לא מותקן בשרת")
    content = await file.read()
    if content[:4] != b"%PDF":
        raise HTTPException(status_code=400, detail="הקובץ אינו PDF תקני")

    imported = 0
    rows = []
    pages_scanned = 0
    tables_found = 0
    method_used = None
    sample_headers = []  # for debugging

    field_aliases = {
        "name": ["שם", "שם רופא", "שם מלא", "שם פרטי", "שם משפחה", "name", "doctor",
                 "רופא", "מומחה", "ד\"ר", "פרופ", "full name"],
        "specialty": ["מומחיות", "specialty", "התמחות", "תחום", "תחום התמחות",
                      "סוג מומחיות", "מקצוע", "specialization"],
        "sub_specialty": ["תת התמחות", "תת-התמחות", "sub_specialty", "תת מומחיות",
                          "התמחות משנית"],
        "phone": ["טלפון", "phone", "נייד", "טל", "פלאפון", "מספר טלפון", "tel"],
        "location": ["מיקום", "כתובת", "location", "היכן מקבל", "עיר", "אזור",
                     "מרפאה", "בית חולים", "address", "city"],
        "hmo_acceptance": ["קופות חולים", "קופה", "hmo", "קופות", "קבלת קופות",
                           "מקבל קופות"],
        "gives_expert_opinion": ["חוות דעת", "ועדות", "expert_opinion", "חוו\"ד",
                                 "חוות דעת מומחה"],
        "notes": ["הערות", "notes", "מידע נוסף", "remarks"],
    }

    def _extract_row(row, col_map):
        def get_col(field):
            idx = col_map.get(field)
            return row[idx] if idx is not None and idx < len(row) else None
        name = str(get_col("name") or "").strip()
        if not name:
            return None
        hmo_raw = get_col("hmo_acceptance")
        hmo_list = _parse_hmo_string(hmo_raw) if hmo_raw else []
        return {
            "name": name,
            "specialty": str(get_col("specialty") or "").strip() or None,
            "sub_specialty": str(get_col("sub_specialty") or "").strip() or None,
            "phone": str(get_col("phone") or "").strip() or None,
            "location": str(get_col("location") or "").strip() or None,
            "hmo_acceptance": json.dumps(hmo_list, ensure_ascii=False),
            "gives_expert_opinion": _bool_from_value(get_col("gives_expert_opinion")),
            "notes": str(get_col("notes") or "").strip() or None,
        }

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        pages_scanned = len(pdf.pages)

        # ── Pass 1: table extraction ──────────────────────────────────────
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                tables_found += 1
                header = [str(c).strip() if c else "" for c in table[0]]
                header_lower = [h.lower() for h in header]
                if len(sample_headers) < 3:
                    sample_headers.append(header[:8])
                col_map = {}
                for field, aliases in field_aliases.items():
                    for i, h in enumerate(header_lower):
                        if any(alias in h for alias in aliases):
                            col_map[field] = i
                            break
                # If no name column matched, fall back to first non-empty column
                if "name" not in col_map:
                    for i, h in enumerate(header):
                        if h:
                            col_map["name"] = i
                            break
                if "name" not in col_map:
                    continue
                for row in table[1:]:
                    if not row or not any(row):
                        continue
                    rec = _extract_row(row, col_map)
                    if rec:
                        rec = normalize_record(rec)
                        if rec:
                            rows.append(rec)
                            method_used = "table"

        # ── Pass 2: text fallback (line-by-line) ─────────────────────────
        if not rows:
            full_text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )
            lines = [l.strip() for l in full_text.splitlines() if l.strip()]

            # Detect delimiter: try tab, then pipe, then comma
            delim = None
            for d in ["\t", "|", ","]:
                scored = sum(1 for l in lines if d in l)
                if scored > len(lines) * 0.3:
                    delim = d
                    break

            if delim:
                # Find header line
                header_idx = None
                col_map = {}
                for i, line in enumerate(lines):
                    parts = [p.strip().lower() for p in line.split(delim)]
                    for field, aliases in field_aliases.items():
                        for j, p in enumerate(parts):
                            if any(alias in p for alias in aliases):
                                col_map[field] = j
                    if "name" in col_map:
                        header_idx = i
                        break

                if header_idx is not None:
                    for line in lines[header_idx + 1:]:
                        parts = [p.strip() for p in line.split(delim)]
                        rec = _extract_row(parts, col_map)
                        if rec:
                            rec = normalize_record(rec)
                            if rec:
                                rows.append(rec)
                                method_used = "text"
            else:
                # Last resort: each non-empty line as a doctor name
                for line in lines:
                    if len(line) < 3 or line.isdigit():
                        continue
                    rec = normalize_record({"name": line})
                    if rec:
                        rows.append(rec)
                        method_used = "text_names_only"

    for rec in rows:
        db.add(models.Doctor(**rec))
        imported += 1
    db.commit()

    if imported == 0:
        detail = f"לא נמצאו רופאים לייבוא. עמודים: {pages_scanned}, טבלאות: {tables_found}."
        if pages_scanned == 0:
            detail += " הקובץ נראה ריק."
        elif tables_found == 0:
            detail += " לא נמצאו טבלאות — נסה PDF עם טבלה או טקסט מופרד בטאב/פסיק."
        if sample_headers:
            detail += f" כותרות שנמצאו: {sample_headers}"
        raise HTTPException(status_code=422, detail=detail)

    return {"imported": imported, "method": method_used, "pages": pages_scanned}


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
            rec = normalize_record(rec)
            if rec is None:
                continue
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
