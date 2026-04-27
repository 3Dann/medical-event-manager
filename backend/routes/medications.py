from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os
import re
import io
import json
import threading
import requests as http_requests
from database import get_db, SessionLocal
import models
import auth as auth_utils

router = APIRouter(tags=["medications"])
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "../../uploads"))

def _word_prefix_match(text: str, prefix: str) -> bool:
    """True if text or any word-component starts with prefix."""
    t = text.lower()
    if t.startswith(prefix):
        return True
    for word in re.split(r'[\s\-\+/(,]', t):
        if word and word.startswith(prefix):
            return True
    return False


def _score(name: str, generic: str, hebrew: str, q: str) -> int:
    """
    Higher score = more relevant. Sorting key (descending).
    0  exact match on trade name
    1  trade name starts with query
    2  word in trade name starts with query
    3  generic name starts with query
    4  word in generic starts with query
    5  Hebrew name contains query
    """
    n, g, h = name.lower(), (generic or "").lower(), (hebrew or "").lower()
    if n == q:              return 0
    if n.startswith(q):     return 1
    for w in re.split(r'[\s\-\+/(,]', n):
        if w and w.startswith(q): return 2
    if g.startswith(q):     return 3
    for w in re.split(r'[\s\-\+/(,]', g):
        if w and w.startswith(q): return 4
    if q in h:              return 5
    return 9


_HEBREW_CHARS = set('אבגדהוזחטיכלמנסעפצקרשתךםןףץ')


def _is_hebrew(q: str) -> bool:
    return any(c in _HEBREW_CHARS for c in q)


def _search_db(q: str, db: Session) -> list[dict]:
    q_low = q.lower()
    is_heb = _is_hebrew(q)
    drugs = db.query(models.DrugEntry).filter(models.DrugEntry.is_active == True).all()
    seen = set()
    scored = []
    for d in drugs:
        if d.name in seen:
            continue
        hebrew = d.hebrew_name or ""
        score = _score(d.name, d.generic_name or "", hebrew, q_low)
        if score < 9:
            seen.add(d.name)
            dosages = json.loads(d.common_dosages) if d.common_dosages else []
            # Sort key: for Hebrew queries sort by Hebrew name, else by English name
            sort_key = hebrew.lower() if (is_heb and hebrew) else d.name.lower()
            scored.append((score, sort_key, {
                "name": d.name,
                "generic_name": d.generic_name or "",
                "dosage_form": d.dosage_form or "",
                "manufacturer": "",
                "hebrew_name": hebrew,
                "common_dosages": dosages,
            }))
    scored.sort(key=lambda x: (x[0], x[1]))
    return [r for _, _, r in scored]

# ── Known drug interactions (generic name → list of interactions) ─────────────
# severity: high / medium / low
INTERACTIONS = [
    # Anticoagulants
    {"drugs": ["warfarin", "וורפרין", "קומדין", "coumadin"],   "interacts_with": ["aspirin", "אספירין"],          "severity": "high",   "description": "סיכון מוגבר לדימום. יש להימנע מהשילוב."},
    {"drugs": ["warfarin", "וורפרין", "קומדין", "coumadin"],   "interacts_with": ["ibuprofen", "ibufen", "אדוויל"], "severity": "high",   "description": "NSAID מגדיל סיכון לדימום בשימוש עם נוגדי קרישה."},
    {"drugs": ["warfarin", "וורפרין", "קומדין"],               "interacts_with": ["fluconazole", "דיפלוקן"],       "severity": "high",   "description": "פלוקונאזול מעכב את חילוף הוורפרין, מגביר סיכון דימום."},
    {"drugs": ["warfarin", "וורפרין", "קומדין"],               "interacts_with": ["amiodarone", "קורדרון"],        "severity": "high",   "description": "אמיודרון מגביר פעילות וורפרין בצורה משמעותית."},
    {"drugs": ["warfarin", "וורפרין", "קומדין"],               "interacts_with": ["metronidazole", "פלגיל"],       "severity": "high",   "description": "מטרונידאזול מגביר פעילות וורפרין."},
    # Serotonin syndrome
    {"drugs": ["ssri", "fluoxetine", "prozac", "פרוזק", "sertraline", "zoloft", "paroxetine", "escitalopram", "cipralex", "ציפרלקס", "citalopram"], "interacts_with": ["tramadol", "טרמדול"], "severity": "high", "description": "סיכון לתסמונת סרוטונין. יש להימנע מהשילוב."},
    {"drugs": ["ssri", "fluoxetine", "prozac", "פרוזק", "sertraline", "escitalopram", "cipralex", "ציפרלקס"], "interacts_with": ["maoi", "phenelzine", "tranylcypromine"], "severity": "high", "description": "שילוב SSRI עם MAOI מסכן חיים — תסמונת סרוטונין."},
    {"drugs": ["tramadol", "טרמדול"],                          "interacts_with": ["ssri", "fluoxetine", "prozac", "sertraline", "escitalopram", "cipralex", "ציפרלקס"], "severity": "high", "description": "סיכון לתסמונת סרוטונין עם SSRI."},
    # Statins
    {"drugs": ["simvastatin", "זוקור", "atorvastatin", "ליפיטור", "lipitor", "rosuvastatin", "קרסטור", "crestor"], "interacts_with": ["clarithromycin", "קלריתרומיצין", "klacid"], "severity": "high", "description": "קלריתרומיצין מעכב פירוק סטטינים — סיכון לפגיעת שריר (רבדומיוליזיס)."},
    {"drugs": ["simvastatin", "זוקור", "atorvastatin", "ליפיטור", "lipitor"], "interacts_with": ["amiodarone", "קורדרון"],  "severity": "medium", "description": "שילוב עם אמיודרון מגביר סיכון למיופתיה."},
    {"drugs": ["simvastatin", "זוקור", "atorvastatin", "ליפיטור", "lipitor", "rosuvastatin", "קרסטור"], "interacts_with": ["fluconazole", "דיפלוקן"], "severity": "medium", "description": "פלוקונאזול מעכב פירוק סטטינים."},
    # ACE inhibitors / ARBs / Potassium
    {"drugs": ["enalapril", "lisinopril, ramipril", "perindopril", "קונקור", "amlodipine"], "interacts_with": ["potassium", "אשלגן", "spironolactone", "aldactone", "אלדקטון"], "severity": "medium", "description": "מעכבי ACE עם חוסכי אשלגן עלולים לגרום לרמות אשלגן גבוהות."},
    {"drugs": ["ace inhibitor", "enalapril", "lisinopril", "ramipril"], "interacts_with": ["nsaid", "ibuprofen", "ibufen", "diclofenac", "voltaren", "ולטרן"], "severity": "medium", "description": "NSAID עלול להפחית יעילות מעכבי ACE ולפגוע בתפקוד הכליות."},
    # Digoxin
    {"drugs": ["digoxin", "לנוקסין", "lanoxin"],               "interacts_with": ["amiodarone", "קורדרון"],        "severity": "high",   "description": "אמיודרון מגביר רמות דיגוקסין — סיכון לרעילות."},
    {"drugs": ["digoxin", "לנוקסין", "lanoxin"],               "interacts_with": ["clarithromycin", "קלריתרומיצין"], "severity": "high", "description": "קלריתרומיצין מגביר רמות דיגוקסין."},
    # Metformin
    {"drugs": ["metformin", "גלוקופאז'", "glucophage"],        "interacts_with": ["contrast", "חומר ניגוד"],      "severity": "high",   "description": "יש להפסיק מטפורמין לפני בדיקות עם חומר ניגוד — סיכון לחמצת לקטית."},
    # Clopidogrel
    {"drugs": ["clopidogrel", "פלביקס", "plavix"],             "interacts_with": ["omeprazole", "אומפרדקס", "לוסק", "losec", "prilosec"], "severity": "medium", "description": "אומפרזול מפחית יעילות קלופידוגרל."},
    # Lithium
    {"drugs": ["lithium", "ליתיום"],                           "interacts_with": ["ibuprofen", "ibufen", "diclofenac", "voltaren", "ולטרן", "nsaid"], "severity": "high", "description": "NSAID מגביר רמות ליתיום — סיכון לרעילות."},
    {"drugs": ["lithium", "ליתיום"],                           "interacts_with": ["enalapril", "lisinopril", "ramipril", "ace inhibitor"], "severity": "high", "description": "מעכבי ACE מגבירים רמות ליתיום."},
    # QT prolongation
    {"drugs": ["azithromycin", "זיתרומקס", "zithromax"],       "interacts_with": ["haloperidol", "הלדול", "chlorpromazine", "amiodarone", "קורדרון"], "severity": "medium", "description": "שני תרופות מאריכות QT — סיכון לאריתמיה."},
    # Sildenafil / nitrates
    {"drugs": ["sildenafil", "ויאגרה", "viagra", "tadalafil", "cialis", "סיאליס"], "interacts_with": ["nitrate", "nitroglycerin", "nitroglicerin", "isosorbide", "isorind", "איזורינד"], "severity": "high", "description": "שילוב עם ניטרטים גורם לירידת לחץ דם חמורה — אסור."},
    # Methotrexate
    {"drugs": ["methotrexate", "מתוטרקסט"],                   "interacts_with": ["ibuprofen", "ibufen", "diclofenac", "voltaren", "ולטרן", "aspirin", "nsaid"], "severity": "high", "description": "NSAID מגביר רעילות מתוטרקסט — סיכון חמור."},
    # Carbamazepine (enzyme inducer)
    {"drugs": ["carbamazepine", "טגרטול", "tegretol"],         "interacts_with": ["oral contraceptive", "גלולה", "warfarin", "וורפרין", "lamotrigine", "לאמיקטל"], "severity": "high", "description": "קרבמזפין מאיץ פירוק תרופות רבות — עלול להפחית יעילות."},
    # Theophylline
    {"drugs": ["theophylline", "תיאופילין"],                   "interacts_with": ["ciprofloxacin", "ציפרוקסין", "cipro"], "severity": "high", "description": "ציפרופלוקסצין מעכב פירוק תיאופילין — סיכון לרעילות."},
    # Levodopa
    {"drugs": ["levodopa", "sinemet", "מאדופר", "madopar"],    "interacts_with": ["haloperidol", "הלדול", "metoclopramide", "פרימפרן", "primpiran"], "severity": "medium", "description": "אנטגוניסטים דופמינרגיים מפחיתים יעילות לבודופה."},
]


def _normalize(name: str) -> str:
    return name.lower().strip()


def check_interactions(medications: list[dict]) -> list[dict]:
    """Return list of detected interactions between provided medications."""
    found = []
    names = []
    for m in medications:
        names.append(_normalize(m.get("name", "")))
        if m.get("generic_name"):
            names.append(_normalize(m["generic_name"]))

    seen_pairs = set()
    for rule in INTERACTIONS:
        drug_a_matches = [n for n in names if any(_normalize(d) in n or n in _normalize(d) for d in rule["drugs"])]
        drug_b_matches = [n for n in names if any(_normalize(i) in n or n in _normalize(i) for i in rule["interacts_with"])]
        if drug_a_matches and drug_b_matches:
            pair = tuple(sorted([drug_a_matches[0], drug_b_matches[0]]))
            if pair not in seen_pairs:
                seen_pairs.add(pair)
                found.append({
                    "drug_a": drug_a_matches[0],
                    "drug_b": drug_b_matches[0],
                    "severity": rule["severity"],
                    "description": rule["description"],
                })
    return found


# ── Medication extraction from document text ──────────────────────────────────

_DOSE_RE = re.compile(
    r"(\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|µg|ml|g|IU|יח(?:\'?ד)?|מ\"?ג|מ\"?ל))",
    re.IGNORECASE,
)
_FREQ_WORDS = {
    "פעם": "פעם ביום", "פעמיים": "פעמיים ביום", "שלוש": "שלוש פעמים ביום",
    "daily": "פעם ביום", "twice": "פעמיים ביום", "bid": "פעמיים ביום",
    "tid": "שלוש פעמים ביום", "qid": "ארבע פעמים ביום",
    "prn": "לפי הצורך (PRN)", "sos": "לפי הצורך (PRN)",
}
_NAME_WITH_DOSE_RE = re.compile(
    r"\b([A-Za-zא-ת][A-Za-zא-ת \-]{1,30}?)[ \t]+"
    r"(\d+(?:[.,]\d+)?[ \t]*(?:mg|mcg|ug|µg|ml|g|IU|יח(?:\'?ד)?|מ\"?ג|מ\"?ל))",
    re.IGNORECASE,
)
_LABELED_RE = re.compile(
    r"(?:תרופה|תכשיר|טיפול|medication|drug)[:\s]+([A-Za-zא-ת][^\n,;]{2,50})",
    re.IGNORECASE,
)
_BULLET_RE = re.compile(
    r"^\s*[-•·*]\s*([A-Za-zא-ת][^\n]{3,60})",
    re.MULTILINE,
)

MED_STOPWORDS = {
    "medical", "hospital", "report", "name", "date", "patient",
    "לא", "כן", "שם", "תאריך", "חתימה", "טלפון", "כתובת",
    "מינון", "dosage", "dose", "frequency", "times", "tablet",
}


def _clean_name(raw: str) -> str:
    return raw.strip().rstrip(".,;:()").strip()


def extract_medications_from_text(text: str) -> list[dict]:
    results: dict[str, dict] = {}  # name → candidate

    # Pattern 1: "DrugName 10mg [frequency]"
    for m in _NAME_WITH_DOSE_RE.finditer(text):
        name = _clean_name(m.group(1))
        dosage = m.group(2).strip()
        if len(name) < 3 or name.lower() in MED_STOPWORDS:
            continue
        # Try to find frequency in the rest of the line
        line_rest = text[m.end(): m.end() + 60].split("\n")[0].lower()
        freq = next((v for k, v in _FREQ_WORDS.items() if k in line_rest), None)
        if name not in results:
            results[name] = {"name": name, "dosage": dosage, "frequency": freq, "generic_name": None, "indication": None}

    # Pattern 2: labeled lines — "תרופה: Metformin 500mg"
    for m in _LABELED_RE.finditer(text):
        raw = _clean_name(m.group(1))
        dose_m = _DOSE_RE.search(raw)
        if dose_m:
            name = _clean_name(raw[: dose_m.start()])
            dosage = dose_m.group(1).strip()
        else:
            name = raw
            dosage = None
        if len(name) < 3 or name.lower() in MED_STOPWORDS:
            continue
        if name not in results:
            results[name] = {"name": name, "dosage": dosage, "frequency": None, "generic_name": None, "indication": None}

    # Pattern 3: bullet lines that weren't caught above
    for m in _BULLET_RE.finditer(text):
        raw = _clean_name(m.group(1))
        dose_m = _DOSE_RE.search(raw)
        if dose_m:
            name = _clean_name(raw[: dose_m.start()])
            dosage = dose_m.group(1).strip()
        else:
            name = raw
            dosage = None
        if len(name) < 3 or len(name) > 50 or name.lower() in MED_STOPWORDS:
            continue
        if name not in results:
            results[name] = {"name": name, "dosage": dosage, "frequency": None, "generic_name": None, "indication": None}

    return list(results.values())


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name: str
    generic_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    indication: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    indication: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


def med_to_dict(m):
    return {
        "id": m.id,
        "patient_id": m.patient_id,
        "name": m.name,
        "generic_name": m.generic_name,
        "dosage": m.dosage,
        "frequency": m.frequency,
        "indication": m.indication,
        "start_date": m.start_date,
        "end_date": m.end_date,
        "notes": m.notes,
        "is_active": m.is_active,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/api/patients/{patient_id}/medications")
def list_medications(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="מטופל לא נמצא")
    meds = (
        db.query(models.PatientMedication)
        .filter(models.PatientMedication.patient_id == patient_id)
        .order_by(models.PatientMedication.is_active.desc(), models.PatientMedication.created_at.desc())
        .all()
    )
    result = [med_to_dict(m) for m in meds]
    interactions = check_interactions(result)
    return {"medications": result, "interactions": interactions}


@router.post("/api/patients/{patient_id}/medications")
def add_medication(
    patient_id: int,
    body: MedicationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="מטופל לא נמצא")
    med = models.PatientMedication(patient_id=patient_id, **body.dict())
    db.add(med)
    db.commit()
    db.refresh(med)
    return med_to_dict(med)


@router.put("/api/patients/{patient_id}/medications/{med_id}")
def update_medication(
    patient_id: int,
    med_id: int,
    body: MedicationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    med = (
        db.query(models.PatientMedication)
        .filter(models.PatientMedication.id == med_id, models.PatientMedication.patient_id == patient_id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=404, detail="תרופה לא נמצאה")
    for field, val in body.dict(exclude_unset=True).items():
        setattr(med, field, val)
    db.commit()
    db.refresh(med)
    return med_to_dict(med)


@router.delete("/api/patients/{patient_id}/medications/{med_id}")
def delete_medication(
    patient_id: int,
    med_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    med = (
        db.query(models.PatientMedication)
        .filter(models.PatientMedication.id == med_id, models.PatientMedication.patient_id == patient_id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=404, detail="תרופה לא נמצאה")
    db.delete(med)
    db.commit()
    return {"ok": True}


# ── Extract medications from uploaded document ────────────────────────────────

@router.get("/api/patients/{patient_id}/medications/extract/{doc_id}")
def extract_from_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    doc = (
        db.query(models.PatientDocument)
        .filter(models.PatientDocument.id == doc_id, models.PatientDocument.patient_id == patient_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="מסמך לא נמצא")

    file_path = os.path.join(UPLOAD_DIR, str(patient_id), doc.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="קובץ לא נמצא")

    text = ""
    try:
        if doc.filename.endswith(".pdf") or (doc.file_type and "pdf" in doc.file_type):
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text += (page.extract_text() or "") + "\n"
        else:
            raise HTTPException(status_code=422, detail="זיהוי תרופות תומך ב-PDF בלבד")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאה בקריאת המסמך: {str(e)}")

    candidates = extract_medications_from_text(text)
    return {"candidates": candidates, "document_name": doc.original_name}


# ── Drug search (DB-backed) ───────────────────────────────────────────────────

@router.get("/api/medications/search")
def search_drugs(
    q: str,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    q = q.strip()
    if len(q) < 2:
        return []
    return _search_db(q, db)


# ── Drug database admin ───────────────────────────────────────────────────────

@router.get("/api/drugs/status")
def drug_db_status(
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    total = db.query(models.DrugEntry).filter(models.DrugEntry.is_active == True).count()
    by_source = {}
    for row in db.query(models.DrugEntry.source, models.DrugEntry.source).distinct():
        src = row[0] or "local"
        by_source[src] = db.query(models.DrugEntry).filter(
            models.DrugEntry.source == src, models.DrugEntry.is_active == True
        ).count()
    last_log = (
        db.query(models.DrugUpdateLog)
        .order_by(models.DrugUpdateLog.started_at.desc())
        .first()
    )
    return {
        "total_drugs": total,
        "by_source": by_source,
        "last_update": {
            "started_at": last_log.started_at.isoformat() if last_log else None,
            "completed_at": last_log.completed_at.isoformat() if last_log and last_log.completed_at else None,
            "status": last_log.status if last_log else None,
            "drugs_added": last_log.drugs_added if last_log else 0,
            "message": last_log.message if last_log else None,
        } if last_log else None,
    }


@router.post("/api/drugs/update")
def trigger_drug_update(
    current_user=Depends(auth_utils.get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="נדרשות הרשאות מנהל")

    def _run():
        from drug_updater import run_drug_update
        db = SessionLocal()
        try:
            run_drug_update(db)
        finally:
            db.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {"ok": True, "message": "עדכון מאגר תרופות הופעל ברקע"}


# ── openFDA enrichment ────────────────────────────────────────────────────────

_OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"
_CACHE_TTL_DAYS = 30  # re-fetch after 30 days


def _extract_dosages_from_text(text: str) -> list[str]:
    """Pull 'Xmg' / 'X mg' patterns from free-form dosage text."""
    found = set()
    for m in re.finditer(r'\b(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|IU)\b', text, re.IGNORECASE):
        dose = f"{m.group(1)}{m.group(2).lower()}"
        found.add(dose)
    return sorted(found, key=lambda x: float(re.match(r'[\d.]+', x).group()))


def _first_sentence(text: str, max_chars: int = 200) -> str:
    """Return first meaningful sentence, truncated."""
    text = re.sub(r'\s+', ' ', text).strip()
    for sep in ['. ', '.\n', ';']:
        idx = text.find(sep)
        if 0 < idx < max_chars:
            return text[:idx + 1].strip()
    return text[:max_chars].strip()


def _fetch_openfda_drug(name: str) -> dict | None:
    """Fetch label data for a single drug from openFDA. Returns None on failure."""
    for search_field in ("openfda.brand_name", "openfda.generic_name"):
        try:
            resp = http_requests.get(
                _OPENFDA_LABEL_URL,
                params={"search": f'{search_field}:"{name}"', "limit": 1},
                timeout=8,
            )
            if resp.status_code != 200:
                continue
            results = resp.json().get("results", [])
            if results:
                return results[0]
        except Exception:
            continue
    return None


@router.get("/api/medications/enrich")
def enrich_drug(
    name: str,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    """
    Return openFDA enrichment for a drug name: indication, dosages, interactions.
    Caches result in DrugEntry for 30 days.
    """
    from datetime import datetime, timezone, timedelta

    # Check cache
    entry = db.query(models.DrugEntry).filter(models.DrugEntry.name == name).first()
    cache_valid = (
        entry
        and entry.openfda_fetched_at
        and entry.openfda_fetched_at > datetime.now(timezone.utc) - timedelta(days=_CACHE_TTL_DAYS)
        and entry.openfda_indication is not None
    )

    if cache_valid:
        dosages = json.loads(entry.openfda_dosages) if entry.openfda_dosages else []
        return {
            "name": name,
            "indication": entry.openfda_indication,
            "dosages": dosages,
            "interactions_text": entry.openfda_interactions or "",
            "from_cache": True,
        }

    # Fetch from openFDA
    label = _fetch_openfda_drug(name)
    if not label:
        return {"name": name, "indication": None, "dosages": [], "interactions_text": "", "from_cache": False}

    raw_indication = " ".join(label.get("indications_and_usage", []))
    raw_dosage    = " ".join(label.get("dosage_and_administration", []))
    raw_interact  = " ".join(label.get("drug_interactions", []))

    indication  = _first_sentence(raw_indication) if raw_indication else None
    dosages     = _extract_dosages_from_text(raw_dosage) if raw_dosage else []
    interact_txt = raw_interact[:2000] if raw_interact else ""  # cap size

    # Cache in DrugEntry (create minimal entry if not found)
    if not entry:
        entry = models.DrugEntry(name=name, source="openfda")
        db.add(entry)

    entry.openfda_indication   = indication
    entry.openfda_dosages      = json.dumps(dosages, ensure_ascii=False) if dosages else None
    entry.openfda_interactions = interact_txt or None
    entry.openfda_fetched_at   = datetime.now(timezone.utc)

    # Also update common_dosages if it was empty
    if dosages and not entry.common_dosages:
        entry.common_dosages = json.dumps(dosages, ensure_ascii=False)

    db.commit()

    return {
        "name": name,
        "indication": indication,
        "dosages": dosages,
        "interactions_text": interact_txt,
        "from_cache": False,
    }
