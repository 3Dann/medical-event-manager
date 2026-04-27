"""
מנתח פוליסות ביטוח — תומך ב-Anthropic Claude, OpenAI, ו-mock לפיתוח.
הגדר בקובץ .env:
  ANTHROPIC_API_KEY=sk-ant-...   ← Claude (מומלץ)
  OPENAI_API_KEY=sk-proj-...     ← OpenAI (חלופה)
"""
import json
import re
import os
from typing import Any, Dict, Optional
from hebrew_nlp import preprocess_hebrew

# ── Settings (reads from env) ─────────────────────────────────────────────────
class _Settings:
    anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
    openai_api_key: str    = os.environ.get("OPENAI_API_KEY", "")
    ai_model: str          = os.environ.get("AI_MODEL", "claude-sonnet-4-6")
    ai_fast_model: str     = os.environ.get("AI_FAST_MODEL", "claude-sonnet-4-6")
    ai_provider: str       = os.environ.get("AI_PROVIDER", "anthropic")

settings = _Settings()

POLICY_EXTRACTION_PROMPT = """אתה מומחה לניתוח פוליסות ביטוח ישראליות. החזר JSON בלבד, ללא הסבר.

### דוגמה ###
קלט:
פוליסת ביטוח בריאות — מגדל. מס׳ פוליסה: 4521-8833. פרמיה חודשית: 412 ₪.
תחילת תוקף: 01/03/2021. כיסויים: אשפוז — עד 1,200 ₪ ליום (השתתפות עצמית 500 ₪).
ניתוח — עד 120,000 ₪ לשנה. רופא מומחה — עד 650 ₪ לביקור, עד 6 ביקורים בשנה.
תרופות מחוץ לסל — עד 5,000 ₪ לשנה. תקופת המתנה: 90 יום. חריג: מחלות קודמות.

פלט:
{"insurer":"מגדל","policy_number":"4521-8833","policy_type":"health","product_name":null,"start_date":"2021-03-01","end_date":null,"monthly_premium":412.0,"coverages":{"hospitalization":{"covered":true,"amount":"1,200 ₪ ליום","waiting_period":"90","notes":"השתתפות עצמית 500 ₪"},"surgery":{"covered":true,"amount":"120,000 ₪ לשנה","notes":""},"specialist":{"covered":true,"amount":"650 ₪ לביקור, עד 6/שנה","notes":""},"fast_diagnosis":{"covered":false,"amount":"","notes":""},"advanced_treatments":{"covered":false,"amount":"","notes":""},"medications":{"covered":true,"amount":"5,000 ₪ לשנה","notes":"מחוץ לסל"},"nursing_care":{"covered":false,"amount":"","adl_threshold":"","waiting_months":0},"death_benefit":{"covered":false,"amount":"","beneficiary":""},"disability_monthly":{"covered":false,"amount":"","percentage_of_salary":0,"waiting_days":90},"critical_illness_lumpsum":{"covered":false,"amount":"","covered_conditions":[]},"loss_of_work_capacity":{"covered":false,"scope":""}},"probationary_period_days":90,"key_exclusions":["מחלות קודמות"],"confidence":0.85}

### מיפוי מונחים — חלק מהשדות ###
- hospitalization: אשפוז, ימי אשפוז, מחלקת אשפוז, בית חולים
- surgery: ניתוח, ניתוחים, ניתוח אלקטיבי, טיפול כירורגי (לא "טיפולים אמבולטורי" — זה specialist)
- specialist: רופא מומחה, ייעוץ מומחה, ביקור מומחה — אך לא "כתב שירות" ולא "אבחון"
- fast_diagnosis: אבחון רפואי מהיר, כתב שירות, כתב שירות אבחון, Fast Track, שירות אבחון — כולל כל "כתב שירות" שאינו "כתב שירות מומחה"
- advanced_treatments: טיפולים בטכנולוגיות מתקדמות, טיפולים אמבולטורי בטכנולוגיות, טיפול רובוטי, פרוטונים, אימונותרפיה, טיפול ביולוגי
- medications: תרופות, תרופות מחוץ לסל, תרופות שלא בסל הבריאות, תרופות אונקולוגיות
- nursing_care: סיעוד, תשישות נפש, ADL, עזרה בפעולות יומיומיות — אסור: ביטוח בריאות, כיסוי רפואי כללי אינם סיעוד
- death_benefit: פטירה, מוות, שאירים, תגמולי פטירה, ריסק
- disability_monthly: אובדן כושר עבודה, נכות חודשית, קצבת נכות
- critical_illness_lumpsum: מחלות קשות, סרטן, אוטם לב, שבץ
- loss_of_work_capacity: אובדן כושר, כושר עבודה, מקצוע ספציפי

### הנחיות ###
- covered: true רק אם הכיסוי מוזכר במפורש בטקסט (כולל מונחים מהמיפוי למעלה). שמות עמודות בטבלה אינם כיסוי.
- amount: העתק את הנוסח המדויק מהטקסט (₪, %, יום, חודש, שנה). אל תכניס תאריכים (MM/YYYY) כסכום כיסוי.
- policy_number: חפש מספר רץ של 7-9 ספרות (כגון: 15639495, 4521-8833). עשוי להופיע ללא מילת מפתח לפניו, ישירות בטבלת הכיסויים.
- monthly_premium: חפש "סה"כ עלות כלל הכיסויים" — זהו הסכום הכולל. אל תרשום עלות כיסוי בודד (כמו 59.42 לכיסוי מחלות קשות).
- אם "סה"כ" לא ברור — null עדיף על שגוי
- אם שדה לא מוזכר — השתמש בברירת המחדל (false / null / 0 / "")
- החזר JSON תקני בלבד, ללא ```json

### פוליסה לניתוח ###
"""

EVENT_COVERAGE_PROMPT = """אתה מומחה תביעות ביטוח ישראלי.
ארוע רפואי: {title}
סוג: {event_type}
תיאור: {description}

פוליסות המטופל:
{policies}

ציין אילו פוליסות וכיסויים רלוונטיים לארוע זה, והערך את התגמול הצפוי.
החזר JSON בלבד בפורמט:
{{
  "relevant_policies": [
    {{
      "policy_id": 0,
      "insurer": "",
      "coverage_key": "",
      "coverage_label": "",
      "estimated_benefit": "",
      "action_required": ""
    }}
  ],
  "total_estimated_benefit": "",
  "recommendation": "",
  "urgency": "immediate|within_week|when_possible"
}}"""


def _select_relevant_text(text: str, max_chars: int = 4000) -> str:
    """בחר את החלקים הרלוונטיים ביותר לכיסויים וסכומים מתוך הטקסט."""
    if len(text) <= max_chars:
        return text

    # מילות מפתח לכיסויים וסכומים
    coverage_keywords = [
        "כיסוי", "מכסה", "אשפוז", "ניתוח", "תרופ", "מומחה", "סיעוד",
        "נכות", "כושר עבודה", "מחלה קשה", "מחלות קשות", "פטירה", "מוות", "שאירים",
        "₪", "שקל", "אחוז", "%", "ליום", "לחודש", "לשנה",
        "000", "500,", ",000",
        "תקופת המתנה", "השתתפות עצמית", "תקרה", "מקסימום",
        "פרמיה", "קצבה", "תגמול", "פיצוי", "החזר",
        "סה\"כ", "עלות כלל", "סכום הביטוח",
        "מספר פוליסה", "תאריך תחילה", "תאריך סיום",
    ]

    lines = text.split("\n")
    scored: list = []
    for i, line in enumerate(lines):
        score = sum(1 for kw in coverage_keywords if kw in line)
        if score > 0:
            # כלול שורות לפני ואחרי להקשר — חלון רחב יותר לחיבור כיסוי+סכום
            start = max(0, i - 3)
            end = min(len(lines), i + 5)
            scored.append((score, i, "\n".join(lines[start:end])))

    if not scored:
        return text[:max_chars]

    # מיין לפי ציון, הסר כפילויות, בנה טקסט
    scored.sort(key=lambda x: -x[0])
    seen_lines: set = set()
    chunks: list = []
    total = 0
    # תמיד כלול את 500 התווים הראשונים (כותרת/פרטי פוליסה)
    header = text[:500]
    total += len(header)
    chunks.append(header)

    for _, line_idx, chunk in scored:
        if line_idx in seen_lines:
            continue
        seen_lines.add(line_idx)
        if total + len(chunk) > max_chars:
            break
        chunks.append(chunk)
        total += len(chunk)

    return "\n---\n".join(chunks)


async def analyze_policy(text: str, provider: str = "") -> Dict[str, Any]:
    # נרמל טקסט עברי לפני כל ניתוח
    text = preprocess_hebrew(text)

    provider = provider or settings.ai_provider
    if provider == "anthropic":
        return await _claude(text)
    elif provider == "openai":
        return await _openai(text)
    return await _claude(text)  # ברירת מחדל


async def analyze_event_coverage(event, policies) -> Dict[str, Any]:
    provider = settings.ai_provider
    if provider == "openai":
        return await _openai_event(event, policies)
    return await _claude_event(event, policies)  # ברירת מחדל


# ── Anthropic Claude ──────────────────────────────────────────────────────────

async def _claude(text: str) -> Dict[str, Any]:
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        model = settings.ai_fast_model or settings.ai_model
        selected_text = _select_relevant_text(text, 6000)
        msg = await client.messages.create(
            model=model,
            max_tokens=1500,
            temperature=0,
            system=[{
                "type": "text",
                "text": (
                    "אתה מומחה לניתוח פוליסות ביטוח ישראליות. "
                    "החזר JSON בלבד — ללא הסבר, ללא markdown, ללא ```json. "
                    "הפלט חייב להתחיל ב-{ ולהסתיים ב-}."
                ),
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[
                {"role": "user", "content": POLICY_EXTRACTION_PROMPT + selected_text},
            ],
        )
        raw = msg.content[0].text
        result = _parse_json(raw)
        result = _fix_ocr_result(text, result)
        result["_model"] = model
        return result
    except Exception as e:
        err = str(e)
        # Fallback: קרדיטים אזלו → נסה OpenAI
        if any(k in err for k in ("credit", "balance", "quota", "rate_limit", "529", "overloaded")):
            if settings.openai_api_key:
                try:
                    result = await _openai(text)
                    if not result.get("error"):
                        result["_claude_fallback"] = "openai"
                        return result
                except Exception:
                    pass
        return {"error": err, "_provider": "anthropic"}


async def _claude_event(event, policies) -> Dict[str, Any]:
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        prompt = _build_event_prompt(event, policies)
        msg = await client.messages.create(
            model=settings.ai_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json(msg.content[0].text)
    except Exception as e:
        return {"error": str(e), "_provider": "anthropic"}


# ── OpenAI ────────────────────────────────────────────────────────────────────

async def _openai(text: str) -> Dict[str, Any]:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        resp = await client.chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            temperature=0,
            messages=[
                {"role": "system", "content": "אתה מומחה ניתוח פוליסות ביטוח ישראלי. החזר JSON בלבד."},
                {"role": "user", "content": POLICY_EXTRACTION_PROMPT + _select_relevant_text(text, 6000)},
            ],
            max_tokens=2048,
        )
        result = _parse_json(resp.choices[0].message.content)
        result = _fix_ocr_result(text, result)
        return result
    except Exception as e:
        return {"error": str(e), "_provider": "openai"}


async def _openai_event(event, policies) -> Dict[str, Any]:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        prompt = _build_event_prompt(event, policies)
        resp = await client.chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "אתה מומחה תביעות ביטוח ישראלי. החזר JSON בלבד."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=1024,
        )
        return _parse_json(resp.choices[0].message.content)
    except Exception as e:
        return {"error": str(e), "_provider": "openai"}


def _fix_ocr_result(text: str, result: Dict[str, Any]) -> Dict[str, Any]:
    """
    תיקון שגיאות נפוצות בניתוח OCR ו-LLM קטן.
    הלוגיקה כאן כללית — לא ספציפית לחברה או לפורמט טבלה.
    """
    from datetime import date as _date
    coverages = result.get("coverages") or {}
    policy_digits = re.sub(r"[^\d]", "", result.get("policy_number") or "")

    # ── נרמול שם חברת ביטוח לשם קנוני קצר ──
    raw_insurer = result.get("insurer") or ""
    insurer_matched = False
    for pattern, canonical in _INSURER_PATTERNS:
        if re.search(pattern, raw_insurer, re.IGNORECASE):
            result["insurer"] = canonical
            insurer_matched = True
            break
    # Fallback: חיפוש ב-1000 תווים ראשונים של המסמך — רק אם AI לא זיהה חברה
    if not insurer_matched:
        for pattern, canonical in _INSURER_PATTERNS:
            if re.search(pattern, text[:1000], re.IGNORECASE):
                result["insurer"] = canonical
                break

    # ── תאריכים ──
    current_year = _date.today().year

    # שלב 1: חלץ תאריכים מלאים DD/MM/YYYY ו-DD/MM/YY מהטקסט
    full_dates = []
    for d, m, y in re.findall(r"\b([0-3]?\d)/([0-1]?\d)/(20\d{2}|\d{2})\b", text):
        try:
            year = int(y) + 2000 if len(y) == 2 else int(y)
            full_dates.append(_date(year, int(m), int(d)))
        except Exception:
            pass

    # שלב 2: תאריכי MM/YYYY (ללא יום) — כגון "2/2026"
    month_year_dates = re.findall(r"\b(1[0-2]?|[1-9])/(20[2-9]\d)\b", text)
    approx_dates = []
    for mo, yr in month_year_dates:
        try:
            approx_dates.append(_date(int(yr), int(mo), 1))
        except Exception:
            pass

    # שלב 3: אם Claude מצא תאריך מלא תקין — כבד אותו; אחרת השתמש ב-MM/YYYY
    claude_start = result.get("start_date")
    claude_end   = result.get("end_date")

    def _is_full_date(d_str):
        """האם הערך שנמצא הוא תאריך מלא (לא רק MM/YYYY)?"""
        if not d_str: return False
        try:
            parsed = _date.fromisoformat(str(d_str)[:10])
            return parsed.day != 1  # יום 1 = כנראה MM/YYYY; יום אחר = תאריך מלא
        except Exception:
            return False

    # תאריך התחלה: אם Claude מצא תאריך מלא (יום ≠ 1) — שמור; אחרת חפש בטקסט
    if not _is_full_date(claude_start):
        near_full = [d for d in full_dates if abs(d.year - current_year) <= 2]
        if near_full:
            result["start_date"] = min(near_full, key=lambda d: abs((d - _date.today()).days)).isoformat()
        elif approx_dates:
            near_approx = [d for d in approx_dates if abs(d.year - current_year) <= 3]
            if near_approx:
                result["start_date"] = near_approx[0].isoformat()

    # תאריך סיום: חפש תאריך רחוק בעתיד
    if not result.get("end_date") or _date.fromisoformat(str(result["end_date"])[:10]).year < current_year + 3:
        far_full = [d for d in full_dates if d.year >= current_year + 3]
        if far_full:
            result["end_date"] = max(far_full).isoformat()
        elif approx_dates:
            far_approx = [d for d in approx_dates if d.year >= current_year + 5]
            if far_approx:
                result["end_date"] = max(far_approx).isoformat()

    # ── שם מוצר: חלץ אם חסר ──
    if not result.get("product_name"):
        # נסה לחלץ מ-"פוליסה לביטוח X"
        pname = re.search(
            r"פוליסה\s+ל(?:ביטוח\s+)?([^\n\r]{3,50})",
            text, re.IGNORECASE
        )
        if pname:
            name = pname.group(1).strip()[:50]
            name = re.sub(r"ביטוח(בריאות|חיים|סיעוד|נכות|מנהלים)", r"ביטוח \1", name)
            result["product_name"] = name.strip()

    # אם עדיין חסר — אסוף שמות מוצרים מהטבלה (שורות לפני | מספר פוליסה)
    if not result.get("product_name"):
        product_rows = re.findall(
            r"^([^\|]{4,50})\s*\|\s*[^\|]+\s*\|\s*\d{7,9}",
            text, re.MULTILINE
        )
        if product_rows:
            # קח את השם הראשון (המוצר הראשי)
            name = product_rows[0].strip()
            name = re.sub(r"\s{2,}", " ", name)
            result["product_name"] = name[:60]

    def _is_valid_lumpsum(amt_str: str, min_amount: int = 50000) -> bool:
        """סכום חד-פעמי הגיוני: מספר ≥min, עגול לאלפים, לא מספר פוליסה."""
        try:
            n = int(re.sub(r"[^\d]", "", str(amt_str).split(".")[0]))
            digits = re.sub(r"[^\d]", "", str(amt_str))
            return (
                n >= min_amount
                and n % 1000 == 0
                and not (policy_digits and digits == policy_digits)
            )
        except Exception:
            return False

    def _find_lumpsum_near(pattern: str, min_amount: int = 50000) -> Optional[str]:
        """מצא את הסכום החד-פעמי הגדול ביותר בחלון ±300 תווים סביב המונח."""
        m = re.search(pattern, text, re.IGNORECASE)
        if not m:
            return None
        snippet = text[max(0, m.start() - 300): m.start() + 300]
        candidates = re.findall(r"\b\d{4,}(?:\.\d{1,2})?\b", snippet)
        valid = [c for c in candidates if _is_valid_lumpsum(c, min_amount)]
        if not valid:
            return None
        best = max(valid, key=lambda x: int(re.sub(r"[^\d]", "", x.split(".")[0])))
        n = int(re.sub(r"[^\d]", "", best.split(".")[0]))
        return f"{n:,} ₪"

    # ── כיסויי Lumpsum: מחלות קשות ──
    if re.search(r"מחלות\s*קשות|מחלה\s*קשה", text, re.IGNORECASE):
        ci = coverages.get("critical_illness_lumpsum", {})
        ci["covered"] = True
        if not _is_valid_lumpsum(ci.get("amount") or ""):
            found = _find_lumpsum_near(r"מחלות\s*קשות|מחלה\s*קשה")
            if found:
                ci["amount"] = found
        coverages["critical_illness_lumpsum"] = ci

    # ── כיסויי Lumpsum: ביטוח חיים / פטירה ──
    if re.search(r"ביטוח\s*חיים|ריסק|סכום\s*פטירה|הון\s*פטירה", text, re.IGNORECASE):
        db = coverages.get("death_benefit", {})
        if not _is_valid_lumpsum(db.get("amount") or ""):
            found = _find_lumpsum_near(r"ביטוח\s*חיים|ריסק|סכום\s*פטירה|הון\s*פטירה")
            if found:
                db["covered"] = True
                db["amount"] = found
                coverages["death_benefit"] = db

    # ── ניקוי כללי: amount = מספר פוליסה → נקה ──
    for cov in coverages.values():
        if isinstance(cov, dict):
            amt_digits = re.sub(r"[^\d]", "", str(cov.get("amount") or ""))
            if policy_digits and amt_digits == policy_digits:
                cov["amount"] = ""

    # ── ניקוי סכומים שגויים בכיסויים לא-lumpsum ──
    LUMPSUM_KEYS = {"critical_illness_lumpsum", "death_benefit"}
    _DATE_PATTERN = re.compile(r"^\d{1,2}/\d{4}$|^\d{1,2}/\d{1,2}/\d{4}$")
    for key, cov in coverages.items():
        if key in LUMPSUM_KEYS or not isinstance(cov, dict):
            continue
        amt_str = str(cov.get("amount") or "").strip()
        if not amt_str:
            continue
        # תאריכים כ-amount (כגון "2/2026") — נקה
        if _DATE_PATTERN.match(amt_str):
            cov["amount"] = ""
            continue
        try:
            n = float(re.sub(r"[^\d.]", "", amt_str.split()[0]))
            # סכום ≤ 5,000 ₪ ולא מכיל "ל" (ליום/לחודש/לשנה) — חשוד כטבלת תמחור
            if n <= 5000 and not any(suf in amt_str for suf in ["ליום", "לחודש", "לשנה", "/"]):
                cov["amount"] = ""
        except Exception:
            pass

    # ── תיקון #1: hospitalization=true בלי עדות ברורה בטקסט ──
    hosp = coverages.get("hospitalization", {})
    if hosp.get("covered") and not hosp.get("amount"):
        has_hosp_evidence = bool(re.search(
            r"ימי\s*אשפוז|עלות\s*אשפוז|[₪\d]\s*ליום|השתתפות\s*עצמית.*אשפוז",
            text, re.IGNORECASE
        ))
        if not has_hosp_evidence:
            hosp["covered"] = False
            coverages["hospitalization"] = hosp

    # ── תיקון #2: nursing_care=true בלי עדות סיעוד ברורה — ביטול ──
    # "בריאות" / "כיסוי" לבד אינם ראיה לסיעוד
    nursing = coverages.get("nursing_care", {})
    if isinstance(nursing, dict) and nursing.get("covered"):
        has_nursing_evidence = bool(re.search(
            r"סיעוד|תשישות\s*נפש|ADL|עזרה\s*ב(?:פעולות|פע')\s*יומיומיות|כסף\s*ליום|קצבת\s*סיעוד",
            text, re.IGNORECASE
        ))
        if not has_nursing_evidence:
            nursing["covered"] = False
            coverages["nursing_care"] = nursing

    # ── כיסוי #3: fast_diagnosis — force-detect אם הביטוי מופיע בטקסט ──
    if re.search(r"אבחון\s*רפואי\s*מהיר|כתב\s*שירות(?!\s*מומחה)|Fast\s*Track|שירות\s*אבחון", text, re.IGNORECASE):
        fd = coverages.get("fast_diagnosis", {})
        if not isinstance(fd, dict):
            fd = {}
        fd["covered"] = True
        # נסה לחלץ סכום אם חסר
        if not fd.get("amount"):
            _m = re.search(r"אבחון\s*רפואי\s*מהיר|כתב\s*שירות(?!\s*מומחה)|Fast\s*Track", text, re.IGNORECASE)
            if _m:
                snippet = text[max(0, _m.start() - 200): _m.start() + 200]
                amt_m = re.search(r"(\d{2,4}(?:,\d{3})?)\s*₪", snippet)
                if amt_m:
                    fd["amount"] = f"{amt_m.group(1)} ₪"
        coverages["fast_diagnosis"] = fd

    # ── כיסוי #4: advanced_treatments — force-detect ──
    # תומך גם ב-OCR רועש: "טיפולים" + "טכנולוג/מתקד" באותה שורה, או תשריף+טיפולים
    _at_exact = re.search(r"טיפולים?\s*(?:ב|אמבולטורי\s*ב)?טכנולוגיות\s*מתקדמות|אמבולטורי\s*בטכנולוגיות", text, re.IGNORECASE)
    _at_noisy = re.search(r"(?:תשרי?ף|תשר)\s*\d{3}[^.\n]{0,60}טיפולים|טיפולים[^\n]{0,50}(?:טכנולוגי|מתקד|אמבולטורי)", text, re.IGNORECASE)
    if _at_exact or _at_noisy:
        at = coverages.get("advanced_treatments", {})
        if not isinstance(at, dict):
            at = {}
        at["covered"] = True
        coverages["advanced_treatments"] = at

    # ── הסר מ-key_exclusions שמות כיסויים שנכנסו בטעות ──
    _COVERAGE_TERMS = [
        "מחלות קשות", "מחלה קשה", "טיפולים", "טיפול", "אשפוז", "ניתוח",
        "תרופות", "אבחון", "סיעוד", "פטירה", "נכות", "כושר עבודה",
        "אמבולטורי", "טכנולוגי", "בריאות",
    ]

    # ── תיקון #2: סנן OCR garbage מחריגים ──
    # garbage: מכיל אותיות לטיניות גדולות/תווים ממוזגים, קצר מדי, ללא עברית
    def _is_valid_exclusion(e: str) -> bool:
        if len(e.strip()) < 4:
            return False
        # מכיל אותיות לטיניות גדולות (OCR artifact כגון "בETO", "en =")
        if re.search(r"[A-Z]{2,}", e):
            return False
        # יחס עברית נמוך מדי (פחות מ-30% עברית) — כנראה OCR garbage
        hebrew_chars = len(re.findall(r"[\u05D0-\u05EA]", e))
        if len(e) > 3 and hebrew_chars / len(e) < 0.3:
            return False
        return True

    result["key_exclusions"] = [
        e for e in (result.get("key_exclusions") or [])
        if _is_valid_exclusion(e)
        and not any(t in e for t in _COVERAGE_TERMS)
    ]

    # ── פרמיה חודשית: חפש "סה"כ עלות" / "פרמיה חודשית" — ולא עלות כיסוי בודד ──
    total_match = re.search(
        r'(?:סה["\u05F4]?כ\s*עלות|עלות\s*כלל|פרמיה\s*חודשית|דמי\s*ביטוח\s*חודש)[^\d]{0,30}(\d{2,6}(?:[,\.]\d{1,2})?)',
        text,
    )
    if total_match:
        try:
            result["monthly_premium"] = float(total_match.group(1).replace(",", ""))
        except Exception:
            pass
    elif isinstance(result.get("monthly_premium"), (int, float)):
        if result["monthly_premium"] < 20:
            result["monthly_premium"] = None

    result["coverages"] = coverages

    # ── חישוב confidence — מדד דיוק זיהוי ──
    # עיקרון: שדות ריקים בטקסט לא מענישים. קנס רק כשמשהו *יש* בטקסט ולא זוהה.
    score = 0.0

    # --- א. מזהי ליבה (45 נק') ---
    insurer_val = result.get("insurer") or ""
    pnum_digits = re.sub(r"[^\d]", "", result.get("policy_number") or "")
    start_val   = result.get("start_date") or ""

    if insurer_val and insurer_val not in ("לא זוהה", "מנתח...", ""):
        score += 25   # חברת ביטוח זוהתה
    if 7 <= len(pnum_digits) <= 10:
        score += 20   # מספר פוליסה תקין
    elif 5 <= len(pnum_digits) <= 11:
        score += 10   # מספר גבולי
    if start_val and start_val not in ("", "2000-01-01"):
        score += 10   # תאריך תחילה

    # --- ב. דיוק זיהוי כיסויים (45 נק') ---
    # לכל כיסוי: אם הביטוי קיים בטקסט — בדוק אם זוהה; אם לא זוהה — קנס
    _COVERAGE_SIGNALS = {
        "hospitalization":          r"ימי\s*אשפוז|עלות\s*אשפוז|[₪\d]\s*ליום.*אשפוז",
        "surgery":                  r"ניתוח(?!\s*רובוטי)|ניתוחים",
        "specialist":               r"רופא\s*מומחה|ביקור\s*מומחה|ייעוץ\s*מומחה",
        "fast_diagnosis":           r"אבחון\s*רפואי|כתב\s*שירות(?!\s*מומחה)|Fast\s*Track",
        "advanced_treatments":      r"טיפולים.*טכנולוגי|טכנולוגיות\s*מתקדמות|אמבולטורי.*טכנולוגי",
        "medications":              r"תרופות\s*(?:שלא|מחוץ)\s*(?:בסל|לסל)",
        "nursing_care":             r"סיעוד|תשישות\s*נפש|ADL",
        "critical_illness_lumpsum": r"מחלות\s*קשות|מחלה\s*קשה",
        "disability_monthly":       r"אובדן\s*כושר\s*עבודה|נכות\s*חודשית|קצבת\s*נכות",
        "death_benefit":            r"ביטוח\s*חיים|ריסק|סכום\s*פטירה|הון\s*פטירה",
    }

    detected_ok = 0    # יש בטקסט + זוהה
    missed       = 0   # יש בטקסט + לא זוהה

    for key, signal in _COVERAGE_SIGNALS.items():
        in_text  = bool(re.search(signal, text, re.IGNORECASE))
        detected = bool((coverages.get(key) or {}).get("covered"))
        if in_text:
            if detected:
                detected_ok += 1
            else:
                missed += 1

    total_signals = detected_ok + missed
    if total_signals > 0:
        accuracy = detected_ok / total_signals
        score += accuracy * 40                         # עד 40 נק' על דיוק
        if detected_ok >= 2:
            score += 5                                 # בונוס: ≥2 כיסויים זוהו
    elif any((coverages.get(k) or {}).get("covered") for k in _COVERAGE_SIGNALS):
        score += 15                                    # זיהה כיסויים אפילו בלי אותות ברורים

    # --- ג. קנס על missed בלבד ---
    score -= missed * 5                                # -5 לכל כיסוי שבטקסט אך לא זוהה

    result["confidence"] = round(max(0.0, min(score / 100, 1.0)), 2)

    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_event_prompt(event, policies) -> str:
    policies_text = "\n".join([
        f"- ID:{p.id} | {p.insurer} | {p.policy_type} | {json.dumps(p.coverages, ensure_ascii=False)}"
        for p in policies
    ])
    return EVENT_COVERAGE_PROMPT.format(
        title=event.title,
        event_type=event.event_type or "לא צוין",
        description=event.description or "לא צוין",
        policies=policies_text,
    )


def _parse_json(raw: str) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {"error": "לא ניתן לפרסר JSON", "raw": raw[:500]}


# ── חברות ביטוח ישראליות — לנרמול שם ──────────────────────────────────────
_INSURER_PATTERNS = [
    (r"מגדל",                        "מגדל"),
    (r"הראל",                        "הראל"),
    (r"הפניקס|פניקס",               "הפניקס"),
    (r"כלל\s*ביטוח|כלל\s*ב",        "כלל ביטוח"),
    (r"מנורה\s*מבטחים?",             "מנורה מבטחים"),
    (r"איילון|אילון|אילן\s*חברה|AYALON", "איילון"),
    (r"הכשרה",                       "הכשרה"),
    (r"AIG|א\.?י\.?ג",              "AIG ישראל"),
    (r"שירביט",                      "שירביט"),
    (r"ביטוח\s*ישיר",               "ביטוח ישיר"),
    (r"הדר",                         "הדר"),
    (r"אריה",                        "אריה"),
    (r"מיטב\s*דש|מיטב",             "מיטב דש"),
    (r"ביט\b",                       "ביט"),
]
