from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import requests as http_requests
import os
import re
import io
from database import get_db
import models
import auth as auth_utils

router = APIRouter(tags=["medications"])
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "../../uploads"))

from drug_list import DRUGS as _ALL_DRUGS, HEBREW_NAMES as _HEBREW_NAMES

# ── Local drug search ─────────────────────────────────────────────────────────
_LOCAL_DRUGS = _ALL_DRUGS


def _word_prefix_match(text: str, prefix: str) -> bool:
    """True if text itself or any word/component in text starts with prefix."""
    t = text.lower()
    if t.startswith(prefix):
        return True
    for word in re.split(r'[\s\-\+/(,]', t):
        if word and word.startswith(prefix):
            return True
    return False


def _search_local(q: str) -> list[dict]:
    q_low = q.lower()
    seen = set()
    results = []
    for name, generic, form in _LOCAL_DRUGS:
        if name in seen:
            continue
        hebrew = _HEBREW_NAMES.get(name, "")
        if (
            _word_prefix_match(name, q_low)
            or _word_prefix_match(generic, q_low)
            or (hebrew and q_low in hebrew)  # Hebrew: substring match (RTL)
        ):
            seen.add(name)
            results.append({
                "name": name,
                "generic_name": generic,
                "dosage_form": form,
                "manufacturer": "",
                "hebrew_name": hebrew,
            })
    return results

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

MED_PATTERNS = [
    # Lines like "תרופה: X 10mg פעמיים ביום"
    re.compile(r"(?:תרופה|תכשיר|טיפול)[:\s]+([א-תA-Za-z][^\n,;]{2,40})", re.IGNORECASE),
    # Dose patterns: "Metformin 500mg", "Atorvastatin 20mg"
    re.compile(r"\b([A-Za-zא-ת][A-Za-zא-ת\s]{2,25})\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|ug|ml|g|IU|יח))", re.IGNORECASE),
    # Lines ending with dosage
    re.compile(r"^\s*[-•·]\s*([A-Za-zא-ת][^\n]{3,40}(?:mg|ug|mcg|ml|g))", re.MULTILINE | re.IGNORECASE),
]

# Common stop-words that look like drugs but aren't
MED_STOPWORDS = {"medical", "hospital", "report", "name", "date", "patient", "לא", "כן", "שם", "תאריך"}


def extract_medications_from_text(text: str) -> list[dict]:
    candidates = set()
    for pat in MED_PATTERNS:
        for m in pat.finditer(text):
            name = m.group(1).strip().rstrip(".,;:")
            if len(name) < 3 or len(name) > 50:
                continue
            if name.lower() in MED_STOPWORDS:
                continue
            candidates.add(name)
    return [{"name": c, "generic_name": None, "dosage": None, "frequency": None, "indication": None} for c in candidates]


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


# ── MOH drug search (proxy to data.gov.il) ───────────────────────────────────

@router.get("/api/medications/search")
def search_drugs(
    q: str,
    current_user=Depends(auth_utils.get_current_user),
):
    q = q.strip()
    if len(q) < 2:
        return []
    # Always return local results immediately (instant UX)
    return _search_local(q)
