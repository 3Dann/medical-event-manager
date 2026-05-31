"""
Extract text and functional assessment data from uploaded medical documents.

Tier 1 — text-based (free, fast):
  PDF   → pdfplumber
  Word  → python-docx
  Excel → openpyxl

Tier 2 — scanned / image (Claude Vision):
  Triggered when pdfplumber returns < MIN_TEXT_LEN chars, or for image files.
  Uses ANTHROPIC_API_KEY + model configured via OCR_MODEL env var.
"""
import os
import re
import io
import json
import base64
import logging

logger = logging.getLogger(__name__)

_MIN_TEXT_LEN = 100          # chars below this → document is likely scanned
_OCR_MODEL    = os.getenv("OCR_MODEL", "claude-sonnet-4-6")

_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

_VISION_PROMPT = """אתה מומחה לחילוץ מידע ממסמכים רפואיים בעברית.

עבור המסמך שקיבלת:
1. תמלל את כל הטקסט שאתה רואה במלואו.
2. חפש ציוני הערכה תפקודית — כל פורמט שהוא:
   • MMSE / Mini Mental State / מיני מנטל / בדיקה קוגניטיבית (ציון 0-30)
   • ברתל / Barthel Index / ADL / אינדקס תפקודי (ציון 0-100)
   • IADL / לוטון / Lawton (ציון 0-8 עד 0-31)
3. השב בדיוק בפורמט JSON הבא, ללא טקסט לפניו ואחריו:

{
  "text": "התמלול המלא של כל הטקסט במסמך",
  "mmse_total": 24,
  "adl_total": 85,
  "iadl_total": 6,
  "raw_mentions": ["קטע קצר רלוונטי 1", "קטע 2"]
}

חוקים:
- השתמש ב-null עבור ערך שלא נמצא.
- raw_mentions: עד 5 קטעים, כל קטע עד 100 תווים.
- אם יש טבלת הערכה שלמה — חלץ כל ציון בנפרד.
- אל תמציא ציונים — רק מה שכתוב מפורשות."""


# ── Public API ─────────────────────────────────────────────────────────────────

def extract_text(content: bytes, content_type: str, filename: str = "") -> str:
    """Synchronous text extraction for text-based files. Returns '' for scanned/images."""
    try:
        if _is_pdf(content_type, filename):
            return _extract_pdf(content)
        if _is_docx(content_type, filename):
            return _extract_docx(content)
        if _is_xlsx(content_type, filename):
            return _extract_xlsx(content)
    except Exception as e:
        logger.debug("extract_text(%s): %s", filename, e)
    return ""


def parse_functional_data(text: str) -> dict:
    """Regex-based parser for text already extracted by pdfplumber/docx/xlsx."""
    return {
        "mmse_total":   _find_score(text, _MMSE_PATTERNS,  0, 30),
        "adl_total":    _find_score(text, _ADL_PATTERNS,   0, 100),
        "iadl_total":   _find_score(text, _IADL_PATTERNS,  0, 31),
        "raw_mentions": _collect_mentions(text),
        "ocr_used":     False,
    }


def needs_ocr(text: str, content_type: str) -> bool:
    """Return True when Claude Vision should be used."""
    if content_type in _IMAGE_TYPES:
        return True                      # images always need OCR
    if len(text) < _MIN_TEXT_LEN:
        return True                      # sparse text → likely scanned PDF
    return False


async def extract_with_claude_vision(content: bytes, content_type: str) -> dict:
    """
    Send document to Claude Vision; return {mmse_total, adl_total, iadl_total,
    raw_mentions, text, ocr_used}.
    Returns empty result (no scores) when ANTHROPIC_API_KEY is missing.
    """
    empty = {"mmse_total": None, "adl_total": None, "iadl_total": None,
             "raw_mentions": [], "text": "", "ocr_used": True}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not configured — OCR skipped")
        return empty

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)

        if _is_pdf(content_type):
            media_block = {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.b64encode(content).decode(),
                },
            }
        else:
            # image/*
            media_block = {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": content_type,
                    "data": base64.b64encode(content).decode(),
                },
            }

        response = await client.messages.create(
            model=_OCR_MODEL,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    media_block,
                    {
                        "type": "text",
                        "text": _VISION_PROMPT,
                        "cache_control": {"type": "ephemeral"},  # cache prompt across docs
                    },
                ],
            }],
        )

        raw_text = response.content[0].text.strip()
        json_match = re.search(r'\{[\s\S]*\}', raw_text)
        if not json_match:
            logger.warning("Claude Vision returned no JSON block")
            return empty

        data = json.loads(json_match.group())
        return {
            "mmse_total":   _validated_score(data.get("mmse_total"),  0, 30),
            "adl_total":    _validated_score(data.get("adl_total"),   0, 100),
            "iadl_total":   _validated_score(data.get("iadl_total"),  0, 31),
            "raw_mentions": (data.get("raw_mentions") or [])[:5],
            "text":         data.get("text", ""),
            "ocr_used":     True,
        }

    except Exception as e:
        logger.error("Claude Vision OCR failed: %s", e)
        return empty


# ── Private helpers ────────────────────────────────────────────────────────────

def _is_pdf(content_type: str, filename: str = "") -> bool:
    return content_type == "application/pdf" or filename.lower().endswith(".pdf")

def _is_docx(content_type: str, filename: str = "") -> bool:
    return (content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            or filename.lower().endswith(".docx"))

def _is_xlsx(content_type: str, filename: str = "") -> bool:
    return (content_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            or filename.lower().endswith(".xlsx"))


def _extract_pdf(content: bytes) -> str:
    import pdfplumber
    parts = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    return "\n".join(parts)


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


def _validated_score(value, min_val: int, max_val: int):
    """Return value only if it's an int within range, else None."""
    try:
        v = int(value)
        return v if min_val <= v <= max_val else None
    except (TypeError, ValueError):
        return None


# ── Regex patterns ─────────────────────────────────────────────────────────────

_MMSE_PATTERNS = [
    r"MMSE\s*[:\-=]?\s*(\d{1,2})",
    r"מיני\s*מנטל\s*[:\-=]?\s*(\d{1,2})",
    r"בדיקה\s*קוגניטיבית\s*[:\-=]?\s*(\d{1,2})",
    r"Mini\s*Mental\s*(?:State\s*)?(?:Exam(?:ination)?\s*)?[:\-=]?\s*(\d{1,2})",
    r"ניקוד\s*MMSE\s*[:\-=]?\s*(\d{1,2})",
    r"MMSE\s*score\s*[:\-=]?\s*(\d{1,2})",
]

_ADL_PATTERNS = [
    r"ברתל\s*[:\-=]?\s*(\d{1,3})",
    r"Barthel\s*(?:Index\s*)?[:\-=]?\s*(\d{1,3})",
    r"אינדקס\s*ברתל\s*[:\-=]?\s*(\d{1,3})",
    r"(?:^|\s)ADL\s*[:\-=]?\s*(\d{1,3})",
    r"ניקוד\s*ADL\s*[:\-=]?\s*(\d{1,3})",
    r"תפקוד\s*יומיומי\s*[:\-=]?\s*(\d{1,3})",
]

_IADL_PATTERNS = [
    r"IADL\s*[:\-=]?\s*(\d{1,2})",
    r"לוטון\s*[:\-=]?\s*(\d{1,2})",
    r"Lawton\s*(?:Scale\s*)?[:\-=]?\s*(\d{1,2})",
    r"ניקוד\s*IADL\s*[:\-=]?\s*(\d{1,2})",
]

_MENTION_KEYWORDS = [
    "MMSE", "ברתל", "Barthel", "ADL", "IADL", "לוטון", "Lawton",
    "מיני מנטל", "Mini Mental", "הערכה תפקודית", "תפקוד יומיומי",
    "קוגניציה", "cognitive", "functional assessment",
]


def _find_score(text: str, patterns: list, min_val: int, max_val: int):
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE | re.UNICODE)
        if m:
            val = _validated_score(m.group(1), min_val, max_val)
            if val is not None:
                return val
    return None


def _collect_mentions(text: str) -> list:
    mentions, seen = [], set()
    for kw in _MENTION_KEYWORDS:
        for m in re.finditer(re.escape(kw), text, re.IGNORECASE | re.UNICODE):
            start   = max(0, m.start() - 40)
            end     = min(len(text), m.end() + 60)
            snippet = text[start:end].replace("\n", " ").strip()
            if snippet not in seen:
                seen.add(snippet)
                mentions.append(snippet)
            if len(mentions) >= 10:
                return mentions
    return mentions
