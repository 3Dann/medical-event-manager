"""
Extract text from uploaded documents and parse functional assessment data.
Supports: PDF (pdfplumber), Word .docx (python-docx), Excel .xlsx (openpyxl).
Images / scanned PDFs return empty text (no OCR installed).
"""
import re
import io
import logging

logger = logging.getLogger(__name__)


# ── Text extraction ────────────────────────────────────────────────────────────

def extract_text(content: bytes, content_type: str, filename: str = "") -> str:
    """Return plaintext from file content. Returns '' on failure or unsupported type."""
    try:
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            return _extract_pdf(content)
        if content_type in (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ) or filename.lower().endswith(".docx"):
            return _extract_docx(content)
        if content_type in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ) or filename.lower().endswith(".xlsx"):
            return _extract_xlsx(content)
    except Exception as e:
        logger.debug("extract_text failed for %s: %s", filename, e)
    return ""


def _extract_pdf(content: bytes) -> str:
    import pdfplumber
    text_parts = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    return "\n".join(text_parts)


def _extract_docx(content: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_xlsx(content: bytes) -> str:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    parts = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) for c in row if c is not None and str(c).strip()]
            if cells:
                parts.append("  ".join(cells))
    return "\n".join(parts)


# ── Functional data parser ─────────────────────────────────────────────────────

def parse_functional_data(text: str) -> dict:
    """
    Scan text for MMSE, Barthel/ADL, and IADL scores.
    Returns a dict with keys: mmse_total, adl_total, iadl_total, raw_mentions.
    All values are None when not found.
    """
    result = {
        "mmse_total":  _find_score(text, _MMSE_PATTERNS,   0, 30),
        "adl_total":   _find_score(text, _ADL_PATTERNS,    0, 100),
        "iadl_total":  _find_score(text, _IADL_PATTERNS,   0, 31),
        "raw_mentions": _collect_mentions(text),
    }
    return result


# ── Score patterns ─────────────────────────────────────────────────────────────

_MMSE_PATTERNS = [
    r"MMSE\s*[:\-=]?\s*(\d{1,2})",
    r"מיני\s*מנטל\s*[:\-=]?\s*(\d{1,2})",
    r"בדיקה\s*קוגניטיבית\s*[:\-=]?\s*(\d{1,2})",
    r"Mini\s*Mental\s*[:\-=]?\s*(\d{1,2})",
    r"MMSE\s*score\s*[:\-=]?\s*(\d{1,2})",
    r"ניקוד\s*MMSE\s*[:\-=]?\s*(\d{1,2})",
]

_ADL_PATTERNS = [
    r"ברתל\s*[:\-=]?\s*(\d{1,3})",
    r"Barthel\s*[:\-=]?\s*(\d{1,3})",
    r"ADL\s*[:\-=]?\s*(\d{1,3})",
    r"אינדקס\s*ברתל\s*[:\-=]?\s*(\d{1,3})",
    r"Barthel\s*Index\s*[:\-=]?\s*(\d{1,3})",
    r"ניקוד\s*ADL\s*[:\-=]?\s*(\d{1,3})",
]

_IADL_PATTERNS = [
    r"IADL\s*[:\-=]?\s*(\d{1,2})",
    r"לוטון\s*[:\-=]?\s*(\d{1,2})",
    r"Lawton\s*[:\-=]?\s*(\d{1,2})",
    r"ניקוד\s*IADL\s*[:\-=]?\s*(\d{1,2})",
]

_MENTION_KEYWORDS = [
    "MMSE", "ברתל", "Barthel", "ADL", "IADL", "לוטון", "Lawton",
    "מיני מנטל", "אינדקס ברתל", "הערכה תפקודית", "תפקוד יומיומי",
    "קוגניטיבי", "cognitive", "functional",
]


def _find_score(text: str, patterns: list, min_val: int, max_val: int):
    """Return first numeric score found in text that falls within [min_val, max_val]."""
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.UNICODE)
        if m:
            val = int(m.group(1))
            if min_val <= val <= max_val:
                return val
    return None


def _collect_mentions(text: str) -> list:
    """Return unique context snippets (±50 chars) around functional keywords."""
    mentions = []
    seen = set()
    for kw in _MENTION_KEYWORDS:
        for m in re.finditer(re.escape(kw), text, re.IGNORECASE | re.UNICODE):
            start = max(0, m.start() - 40)
            end   = min(len(text), m.end() + 60)
            snippet = text[start:end].replace("\n", " ").strip()
            if snippet not in seen:
                seen.add(snippet)
                mentions.append(snippet)
            if len(mentions) >= 10:
                return mentions
    return mentions
