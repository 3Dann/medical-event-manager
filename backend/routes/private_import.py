"""
ייבוא פוליסת ביטוח פרטי מקובץ Excel או PDF
מנסה לחלץ: שם חברה, מספר פוליסה, סוג ביטוח, כיסויים
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import auth as auth_utils
import openpyxl
import io
import re

router = APIRouter(prefix="/api/patients/{patient_id}/insurance", tags=["private-import"])

# ── Hebrew keyword matchers ──────────────────────────────────────────

CATEGORY_KEYWORDS = {
    "surgery":          ["ניתוח", "ניתוחים", "כירורגי"],
    "hospitalization":  ["אשפוז", "אישפוז", "אשפוזי", "יום אשפוז"],
    "second_opinion":   ["חוות דעת", "מומחה", "second opinion"],
    "transplant":       ["השתלה", "השתלות", "transplant"],
    "rehabilitation":   ["שיקום", "פיזיותרפיה", "ריפוי בעיסוק"],
    "advanced_tech":    ["תרופות מחוץ לסל", "טכנולוגיה", "ציוד רפואי", "תרופות"],
    "critical_illness": ["מחלות קשות", "מחלה קשה", "קריטי", "critical", "סרטן", "לב"],
    "diagnostics":      ["בדיקות", "הדמיה", "mri", "ct", "בדיקה", "ביופסיה"],
}

COVERAGE_NUMBER_RE = re.compile(r"[\d,]+(?:\.\d+)?")
PERCENTAGE_RE      = re.compile(r"(\d+(?:\.\d+)?)\s*%")
POLICY_NUM_RE      = re.compile(r"(?:פוליסה|מס['\s.]*פוליסה|policy)[:\s#]*(\d[\d\-]+)", re.IGNORECASE)
COPAY_RE           = re.compile(r"(?:השתתפות עצמית|השת[\"']ע|copay)[:\s]*(\d[\d,]*)", re.IGNORECASE)
LIMIT_RE           = re.compile(r"(?:תקרה|מקסימום|עד)[:\s]*(\d[\d,]*)", re.IGNORECASE)

COMPANY_NAMES = ["הראל", "מגדל", "כלל", "הפניקס", "מנורה", "איילון", "שירביט",
                 "הכשרה", "ביטוח ישיר", "AIG", "Allianz", "מיטב", "פסגות"]

# Policies to skip entirely
EXCLUDED_POLICY_KEYWORDS = [
    "ביטוח רכב", "ביטוח רכוש", "ביטוח דירה", "ביטוח בית",
    "כסף רכב", "חובה רכב", "מקיף רכב", "צד ג", "צד ג'",
    "property", "vehicle", "car insurance", "home insurance",
    "ביטוח צד ג", "נזק לרכב", "גניבת רכב", "אובדן רכב",
]

# Row-level terms to skip (won't match medical categories anyway, but extra safety)
EXCLUDED_ROW_KEYWORDS = [
    "רכב", "דירה", "מבנה", "תכולה", "צד ג", "גניבה", "שריפה",
]


def _is_excluded_policy(text: str) -> bool:
    """Return True if the document appears to be a car/home insurance policy."""
    t = text.lower()
    return any(kw.lower() in t for kw in EXCLUDED_POLICY_KEYWORDS)


def _is_excluded_row(text: str) -> bool:
    """Return True if the row is clearly about car/home — not a medical coverage."""
    t = text
    return any(kw in t for kw in EXCLUDED_ROW_KEYWORDS) and not any(
        med in t for med in ["ניתוח", "אשפוז", "בריאות", "רפואי", "מחלה"]
    )


def _extract_number(text):
    m = COVERAGE_NUMBER_RE.search(text.replace(",", ""))
    return float(m.group()) if m else None


def _match_category(text):
    t = text.lower()
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(kw.lower() in t for kw in kws):
            return cat
    return None


def _detect_company(text):
    for name in COMPANY_NAMES:
        if name in text:
            return name
    return None


def _detect_policy_number(text):
    m = POLICY_NUM_RE.search(text)
    return m.group(1) if m else None


def _detect_policy_type(text):
    if any(w in text for w in ["אובדן כושר", "כושר עבודה", "disability", "נכות"]):
        return "disability"
    return "regular"


# ── Excel parser ─────────────────────────────────────────────────────

def parse_excel_private(content: bytes) -> dict:
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    all_text = []
    rows_data = []

    for row in ws.iter_rows(values_only=True):
        cells = [str(c).strip() if c is not None else "" for c in row]
        if any(cells):
            all_text.append(" ".join(cells))
            rows_data.append(cells)

    full_text = "\n".join(all_text)
    company  = _detect_company(full_text)
    policy_num = _detect_policy_number(full_text)
    policy_type = _detect_policy_type(full_text)
    coverages = {}

    for row in rows_data:
        row_text = " ".join(row)
        if _is_excluded_row(row_text):
            continue
        cat = _match_category(row_text)
        if not cat:
            continue
        cov = {"is_covered": True}
        pct = PERCENTAGE_RE.search(row_text)
        if pct:
            cov["coverage_percentage"] = float(pct.group(1))
        copay = COPAY_RE.search(row_text)
        if copay:
            cov["copay"] = float(copay.group(1).replace(",", ""))
        limit = LIMIT_RE.search(row_text)
        if limit:
            cov["annual_limit"] = float(limit.group(1).replace(",", ""))
        # Raw notes
        cov["conditions"] = row_text[:120] if len(row_text) > 10 else None
        coverages[cat] = cov

    return {
        "company_name": company,
        "policy_number": policy_num,
        "policy_type": policy_type,
        "coverages": coverages,
        "raw_text_preview": full_text[:400],
    }


# ── PDF parser ───────────────────────────────────────────────────────

def parse_pdf_private(content: bytes) -> dict:
    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(status_code=500, detail="ספריית pdfplumber לא מותקנת")

    lines = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines.extend(text.splitlines())
            # Also try tables
            for table in (page.extract_tables() or []):
                for row in table:
                    if row:
                        lines.append(" ".join(str(c or "") for c in row))

    full_text = "\n".join(lines)
    company    = _detect_company(full_text)
    policy_num = _detect_policy_number(full_text)
    policy_type = _detect_policy_type(full_text)
    coverages = {}

    for line in lines:
        if _is_excluded_row(line):
            continue
        cat = _match_category(line)
        if not cat or len(line.strip()) < 5:
            continue
        cov = {"is_covered": True}
        pct = PERCENTAGE_RE.search(line)
        if pct:
            cov["coverage_percentage"] = float(pct.group(1))
        copay = COPAY_RE.search(line)
        if copay:
            cov["copay"] = float(copay.group(1).replace(",", ""))
        limit = LIMIT_RE.search(line)
        if limit:
            cov["annual_limit"] = float(limit.group(1).replace(",", ""))
        cov["conditions"] = line.strip()[:120]
        if cat not in coverages:  # first match wins
            coverages[cat] = cov

    return {
        "company_name": company,
        "policy_number": policy_num,
        "policy_type": policy_type,
        "coverages": coverages,
        "raw_text_preview": full_text[:400],
    }


# ── Endpoint ─────────────────────────────────────────────────────────

@router.post("/upload-private")
async def upload_private_insurance(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        parsed = parse_pdf_private(content)
    elif filename.endswith((".xlsx", ".xls")):
        parsed = parse_excel_private(content)
    else:
        raise HTTPException(status_code=400, detail="סוג קובץ לא נתמך — יש להעלות PDF או Excel")

    if _is_excluded_policy(parsed.get("raw_text_preview", "")):
        raise HTTPException(
            status_code=422,
            detail="הקובץ מזוהה כפוליסת רכב או בית — ייבוא סוג זה אינו נתמך. יש להעלות ביטוח בריאות בלבד."
        )

    # Create insurance source
    source = models.InsuranceSource(
        patient_id=patient_id,
        source_type="private",
        company_name=parsed.get("company_name") or "לא זוהה",
        policy_number=parsed.get("policy_number"),
        policy_type=parsed.get("policy_type", "regular"),
        notes=f"יובא אוטומטית מקובץ {file.filename}",
    )
    db.add(source)
    db.flush()

    coverages_saved = 0
    for category, cov in (parsed.get("coverages") or {}).items():
        db.add(models.Coverage(
            insurance_source_id=source.id,
            category=category,
            is_covered=cov.get("is_covered", True),
            coverage_percentage=cov.get("coverage_percentage"),
            coverage_amount=cov.get("coverage_amount"),
            copay=cov.get("copay"),
            annual_limit=cov.get("annual_limit"),
            conditions=cov.get("conditions"),
            abroad_covered=cov.get("abroad_covered", False),
        ))
        coverages_saved += 1

    db.commit()

    return {
        "message": f"פוליסה יובאה בהצלחה",
        "source_id": source.id,
        "company_name": source.company_name,
        "policy_number": source.policy_number,
        "policy_type": source.policy_type,
        "coverages_detected": coverages_saved,
        "note": "בדוק וערוך את הכיסויים שזוהו — הניתוח אוטומטי ועשוי להיות חלקי",
    }
