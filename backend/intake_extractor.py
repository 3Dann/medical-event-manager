"""
Extract text and functional assessment data from uploaded medical documents.

Tier 1 — text-based (pdfplumber / python-docx / openpyxl) + Claude text analysis.
Tier 2 — scanned / image  → Claude Vision (full OCR + analysis in one call).

Both tiers return item-level scores for ADL, IADL, MMSE in addition to totals.
"""
import os
import re
import io
import json
import base64
import logging

logger = logging.getLogger(__name__)

_MIN_TEXT_LEN = 100          # chars below → likely scanned
_OCR_MODEL    = os.getenv("OCR_MODEL",   "claude-sonnet-4-6")
_TEXT_MODEL   = os.getenv("TEXT_MODEL",  "claude-haiku-4-5-20251001")  # cheaper for text-only

_IMAGE_TYPES  = {"image/jpeg", "image/png", "image/gif", "image/webp"}

# ── ADL / IADL / MMSE schema (mirrors IntakeWizard.jsx constants) ──────────────

ADL_SCHEMA = {
    "feeding":  {"he": "אכילה",               "values": [0, 5, 10]},
    "bathing":  {"he": "רחצה",                "values": [0, 5]},
    "grooming": {"he": "טיפוח אישי",           "values": [0, 5]},
    "dressing": {"he": "הלבשה",               "values": [0, 5, 10]},
    "bowel":    {"he": "שליטה על מעיים",       "values": [0, 5, 10]},
    "bladder":  {"he": "שליטה על שלפוחית",    "values": [0, 5, 10]},
    "toilet":   {"he": "שימוש בשירותים",       "values": [0, 5, 10]},
    "transfer": {"he": "מעבר מיטה-כיסא",      "values": [0, 5, 10, 15]},
    "mobility": {"he": "ניידות",              "values": [0, 5, 10, 15]},
    "stairs":   {"he": "עליה במדרגות",         "values": [0, 5, 10]},
}

IADL_SCHEMA = {
    "phone":     {"he": "שימוש בטלפון",   "values": [1, 2, 3]},
    "shopping":  {"he": "קניות",           "values": [1, 2, 3, 4]},
    "cooking":   {"he": "הכנת אוכל",       "values": [1, 2, 3, 4]},
    "housework": {"he": "ניהול משק בית",   "values": [1, 2, 3, 4, 5]},
    "laundry":   {"he": "כביסה",           "values": [1, 2]},
    "transport": {"he": "תחבורה/ניידות",   "values": [1, 2, 3, 4, 5]},
    "meds":      {"he": "ניהול תרופות",    "values": [1, 2, 3]},
    "finance":   {"he": "ניהול כספים",     "values": [1, 2]},
}

MMSE_SCHEMA = {
    "time_orient":  {"he": "אוריינטציה לזמן",         "max": 5},
    "place_orient": {"he": "אוריינטציה למקום",         "max": 5},
    "registration": {"he": "רישום (3 מילים)",           "max": 3},
    "attention":    {"he": "קשב וחשבון",               "max": 5},
    "recall":       {"he": "היזכרות",                  "max": 3},
    "naming":       {"he": "שפה — מינוי",              "max": 2},
    "repetition":   {"he": "שפה — חזרה",               "max": 1},
    "command":      {"he": "שפה — פקודה",              "max": 3},
    "reading":      {"he": "שפה — קריאה",              "max": 1},
    "writing":      {"he": "שפה — כתיבה",              "max": 1},
    "copy":         {"he": "העתקה מרחבית",             "max": 1},
}


def _build_schema_description() -> str:
    adl = "\n".join(
        f"  - {k} ({v['he']}): ערכים חוקיים {v['values']}"
        for k, v in ADL_SCHEMA.items()
    )
    iadl = "\n".join(
        f"  - {k} ({v['he']}): ערכים חוקיים {v['values']}  (1=הכי טוב)"
        for k, v in IADL_SCHEMA.items()
    )
    mmse = "\n".join(
        f"  - {k} ({v['he']}): 0-{v['max']}"
        for k, v in MMSE_SCHEMA.items()
    )
    return f"""
=== סכמת הנתונים הנדרשת ===

ADL — אינדקס ברתל (10 פריטים, ציון גבוה = עצמאי יותר):
{adl}

IADL — סולם לוטון (8 פריטים, ציון נמוך = עצמאי יותר):
{iadl}

MMSE — מיני מנטל סטייט (11 סעיפים, ציון גבוה = תפקוד טוב יותר):
{mmse}
"""


_ANALYSIS_PROMPT_TEMPLATE = """{schema}

=== הנחיות ===
אתה מנתח מסמך רפואי בעברית ומחלץ ממנו נתוני הערכה תפקודית.

{extra}

חוקים קריטיים:
1. מלא רק ערכים שמופיעים **מפורשות** במסמך — אל תשער.
2. כל ערך חייב להיות מהרשימה החוקית שמופיעה בסכמה. אם הסכמה אומרת [0,5,10], אל תחזיר 8.
3. עבור ערך שלא נמצא — השתמש ב-null.
4. IADL: ערך נמוך = טוב יותר. אם כתוב "עצמאי לחלוטין בטלפון" → phone=1.
5. ADL: ערך גבוה = טוב יותר. אם כתוב "עצמאי באכילה" → feeding=10.

החזר **אך ורק** JSON תקין בפורמט הבא (ללא טקסט לפניו ואחריו):

{{
  "adl_answers":  {{"feeding": 10, "bathing": null, ...כל 10 המפתחות...}},
  "iadl_answers": {{"phone": 1, "shopping": null, ...כל 8 המפתחות...}},
  "mmse_answers": {{"time_orient": 5, "attention": null, ...כל 11 המפתחות...}},
  "adl_total":  75,
  "iadl_total": 5,
  "mmse_total": 24,
  "raw_mentions": ["קטע קצר רלוונטי 1", "קטע 2"]
}}

- כל 29 המפתחות חייבים להופיע (אפשר עם null).
- raw_mentions: עד 5 קטעים, כל אחד עד 100 תווים.
- אם לא נמצא שום נתון תפקודי — החזר null בכל שדה."""


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


def needs_ocr(text: str, content_type: str) -> bool:
    """Return True when Claude Vision should be used instead of text analysis."""
    if content_type in _IMAGE_TYPES:
        return True
    if len(text) < _MIN_TEXT_LEN:
        return True  # sparse text → likely scanned PDF
    return False


async def extract_with_claude_vision(content: bytes, content_type: str) -> dict:
    """
    Send document/image to Claude Vision.
    Returns full functional dict: adl_answers, iadl_answers, mmse_answers + totals.
    """
    empty = _empty_result(ocr_used=True)
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
                "source": {"type": "base64", "media_type": "application/pdf",
                           "data": base64.b64encode(content).decode()},
            }
            extra = "תמלל את כל הטקסט שאתה רואה ואז חלץ את נתוני התפקוד."
        else:
            media_block = {
                "type": "image",
                "source": {"type": "base64", "media_type": content_type,
                           "data": base64.b64encode(content).decode()},
            }
            extra = "קרא את הטקסט בתמונה ואז חלץ את נתוני התפקוד."

        prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
            schema=_build_schema_description(),
            extra=extra,
        )

        response = await client.messages.create(
            model=_OCR_MODEL,
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    media_block,
                    {"type": "text", "text": prompt,
                     "cache_control": {"type": "ephemeral"}},
                ],
            }],
        )

        return _parse_claude_response(response.content[0].text, ocr_used=True)

    except Exception as e:
        logger.error("Claude Vision OCR failed: %s", e)
        return empty


async def extract_items_from_text(text: str) -> dict:
    """
    Send already-extracted text to Claude (cheaper, no Vision) for item-level parsing.
    Used for text-based PDFs, Word, Excel.
    """
    empty = _empty_result(ocr_used=False)
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _regex_fallback(text)

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)

        prompt = _ANALYSIS_PROMPT_TEMPLATE.format(
            schema=_build_schema_description(),
            extra="הטקסט הבא נלקח ממסמך רפואי:",
        )

        response = await client.messages.create(
            model=_TEXT_MODEL,
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt + f"\n\n=== טקסט המסמך ===\n{text[:8000]}",
                     "cache_control": {"type": "ephemeral"}},
                ],
            }],
        )

        return _parse_claude_response(response.content[0].text, ocr_used=False)

    except Exception as e:
        logger.error("Claude text analysis failed: %s — falling back to regex", e)
        return _regex_fallback(text)


def parse_functional_data(text: str) -> dict:
    """Regex-only parser — used as last-resort fallback."""
    return _regex_fallback(text)


# ── Internal helpers ────────────────────────────────────────────────────────────

def _empty_result(ocr_used: bool) -> dict:
    return {
        "adl_answers":  {k: None for k in ADL_SCHEMA},
        "iadl_answers": {k: None for k in IADL_SCHEMA},
        "mmse_answers": {k: None for k in MMSE_SCHEMA},
        "adl_total":    None,
        "iadl_total":   None,
        "mmse_total":   None,
        "raw_mentions": [],
        "ocr_used":     ocr_used,
    }


def _parse_claude_response(raw_text: str, ocr_used: bool) -> dict:
    result = _empty_result(ocr_used)
    json_match = re.search(r'\{[\s\S]*\}', raw_text)
    if not json_match:
        logger.warning("Claude returned no JSON block")
        return result
    try:
        data = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        logger.warning("Claude JSON parse error: %s", e)
        return result

    # Validate and copy adl_answers
    raw_adl = data.get("adl_answers") or {}
    for k, schema in ADL_SCHEMA.items():
        v = raw_adl.get(k)
        result["adl_answers"][k] = v if v in schema["values"] else None

    # Validate and copy iadl_answers
    raw_iadl = data.get("iadl_answers") or {}
    for k, schema in IADL_SCHEMA.items():
        v = raw_iadl.get(k)
        result["iadl_answers"][k] = v if v in schema["values"] else None

    # Validate and copy mmse_answers
    raw_mmse = data.get("mmse_answers") or {}
    for k, schema in MMSE_SCHEMA.items():
        v = raw_mmse.get(k)
        result["mmse_answers"][k] = _validated_score(v, 0, schema["max"])

    result["adl_total"]    = _validated_score(data.get("adl_total"),   0, 100)
    result["iadl_total"]   = _validated_score(data.get("iadl_total"),  0, 31)
    result["mmse_total"]   = _validated_score(data.get("mmse_total"),  0, 30)
    result["raw_mentions"] = (data.get("raw_mentions") or [])[:5]
    result["ocr_used"]     = ocr_used
    return result


def _regex_fallback(text: str) -> dict:
    result = _empty_result(ocr_used=False)
    result["adl_total"]    = _find_score(text, _ADL_PATTERNS,   0, 100)
    result["iadl_total"]   = _find_score(text, _IADL_PATTERNS,  0, 31)
    result["mmse_total"]   = _find_score(text, _MMSE_PATTERNS,  0, 30)
    result["raw_mentions"] = _collect_mentions(text)
    return result


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
    try:
        v = int(value)
        return v if min_val <= v <= max_val else None
    except (TypeError, ValueError):
        return None


_MMSE_PATTERNS = [
    r"MMSE\s*[:\-=]?\s*(\d{1,2})",
    r"מיני\s*מנטל\s*[:\-=]?\s*(\d{1,2})",
    r"Mini\s*Mental\s*(?:State\s*)?(?:Exam(?:ination)?\s*)?[:\-=]?\s*(\d{1,2})",
    r"ניקוד\s*MMSE\s*[:\-=]?\s*(\d{1,2})",
]
_ADL_PATTERNS = [
    r"ברתל\s*[:\-=]?\s*(\d{1,3})",
    r"Barthel\s*(?:Index\s*)?[:\-=]?\s*(\d{1,3})",
    r"(?:^|\s)ADL\s*[:\-=]?\s*(\d{1,3})",
    r"ניקוד\s*ADL\s*[:\-=]?\s*(\d{1,3})",
]
_IADL_PATTERNS = [
    r"IADL\s*[:\-=]?\s*(\d{1,2})",
    r"לוטון\s*[:\-=]?\s*(\d{1,2})",
    r"Lawton\s*(?:Scale\s*)?[:\-=]?\s*(\d{1,2})",
]
_MENTION_KEYWORDS = [
    "MMSE", "ברתל", "Barthel", "ADL", "IADL", "לוטון", "Lawton",
    "מיני מנטל", "הערכה תפקודית", "תפקוד יומיומי",
]


def _find_score(text: str, patterns: list, min_val: int, max_val: int):
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE | re.UNICODE)
        if m:
            v = _validated_score(m.group(1), min_val, max_val)
            if v is not None:
                return v
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
