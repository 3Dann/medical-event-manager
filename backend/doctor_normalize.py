"""
doctor_normalize.py
Shared logic for cleaning and normalizing doctor records.
Called both on import (scraper) and in the DB cleanup script.
"""
import re

# ── Specialty translation: English → Hebrew ───────────────────────────────
SPECIALTY_EN_TO_HE = {
    "cardiology": "קרדיולוגיה",
    "cardiac": "קרדיולוגיה",
    "oncology": "אונקולוגיה",
    "orthopedic": "אורתופדיה",
    "orthopedics": "אורתופדיה",
    "neurology": "נוירולוגיה",
    "neurosurgery": "נוירוכירורגיה",
    "neurosurgeon": "נוירוכירורגיה",
    "gastroenterology": "גסטרואנטרולוגיה",
    "gastro": "גסטרואנטרולוגיה",
    "dermatology": "דרמטולוגיה",
    "dermatologist": "דרמטולוגיה",
    "urology": "אורולוגיה",
    "urologist": "אורולוגיה",
    "gynecology": "גינקולוגיה",
    "gynecologist": "גינקולוגיה",
    "obstetrics": "מיילדות",
    "psychiatry": "פסיכיאטריה",
    "psychiatrist": "פסיכיאטריה",
    "psychology": "פסיכולוגיה",
    "psychologist": "פסיכולוגיה",
    "ophthalmology": "עיניים",
    "ophthalmologist": "עיניים",
    "eye": "עיניים",
    "ent": "אא\"ג",
    "ear nose throat": "אא\"ג",
    "otolaryngology": "אא\"ג",
    "pediatrics": "רפואת ילדים",
    "pediatrician": "רפואת ילדים",
    "surgery": "כירורגיה",
    "surgeon": "כירורגיה",
    "hand surgeon": "כירורגיית יד",
    "plastic surgery": "כירורגיה פלסטית",
    "plastic surgeon": "כירורגיה פלסטית",
    "vascular": "כלי דם",
    "endocrinology": "אנדוקרינולוגיה",
    "endocrinologist": "אנדוקרינולוגיה",
    "rheumatology": "ראומטולוגיה",
    "rheumatologist": "ראומטולוגיה",
    "nephrology": "נפרולוגיה",
    "nephrologist": "נפרולוגיה",
    "pulmonology": "ריאות",
    "pulmonologist": "ריאות",
    "hematology": "המטולוגיה",
    "hematologist": "המטולוגיה",
    "radiology": "רדיולוגיה",
    "radiologist": "רדיולוגיה",
    "pathology": "פתולוגיה",
    "internal medicine": "רפואה פנימית",
    "geriatrics": "גריאטריה",
    "immunology": "אימונולוגיה",
    "allergy": "אלרגולוגיה",
    "allergist": "אלרגולוגיה",
    "transplant": "השתלות",
    "cornea": "קרנית",
    "aesthetic medicine": "רפואה אסתטית",
    "aesthetic": "רפואה אסתטית",
    "sports medicine": "רפואת ספורט",
    "family medicine": "רפואת משפחה",
    "general practitioner": "רפואת משפחה",
}

# Garbage patterns that indicate the record is not a real doctor name
_GARBAGE_PATTERNS = [
    r"whatsapp", r"facebook", r"messenger", r"instagram",
    r"\d{3,}",           # 3+ consecutive digits → code/number
    r"[A-Z]\d{2,}",     # code like A03, B11
    r"ליווה אותנו",
    r"הייתה קשובה",
    r"מקצועי מאוד",
    r"אנושי אדיב",
    r"הפניקס.*כלל",     # insurance company list
    r"^דר\s+[A-Z]\d",   # דר A03 style
    r"מנוסה ומרגיע",
    r"מאוד.*ניתוח",
    r"http",
]

_TITLE_PATTERN = re.compile(
    r"""^[\s]*
    (ד["״\']ר|דר['\.]?|פרופ['\.]?|פרופסור|פרופ׳|
     Dr\.?|Prof\.?|MD\.?|PhD\.?)
    [\s.]*""",
    re.VERBOSE | re.IGNORECASE,
)

_JUNK_SUFFIX = re.compile(
    r"(Whatsapp|Facebook|Messenger|Instagram|Twitter|שתף|שיתוף|"
    r"[|\-–—]\s*(מרפאת|קליניקת|DC\b).*|"
    r"\bCor\b.*)",
    re.IGNORECASE,
)


def _translate_specialty(text: str) -> str | None:
    """Try to translate an English specialty string to Hebrew."""
    lower = text.lower().strip()
    # Longest match first
    for en, he in sorted(SPECIALTY_EN_TO_HE.items(), key=lambda x: -len(x[0])):
        if en in lower:
            return he
    return None


def is_garbage(name: str) -> bool:
    """Return True if the name string is clearly not a real doctor name."""
    if not name or len(name.strip()) < 3:
        return True
    lower = name.lower()
    for pat in _GARBAGE_PATTERNS:
        if re.search(pat, lower, re.IGNORECASE):
            return True
    # More than 6 Hebrew words → likely review text, not a name
    hebrew_words = re.findall(r'[\u05d0-\u05ea]+', name)
    if len(hebrew_words) > 6:
        return True
    return False


def normalize_name(name: str) -> str:
    """Strip titles and junk suffixes from a doctor name."""
    name = name.strip()
    # Remove junk suffix (WhatsApp etc.)
    name = _JUNK_SUFFIX.sub("", name).strip()
    # Remove leading title
    name = _TITLE_PATTERN.sub("", name).strip()
    # Remove trailing title (e.g. "בתיה שפי ד"ר")
    name = re.sub(
        r"""[\s]+(ד["״\']ר|דר['\.]?|פרופ['\.]?|Dr\.?|Prof\.?)[\s.]*$""",
        "", name, flags=re.IGNORECASE,
    ).strip()
    # Collapse multiple spaces
    name = re.sub(r"\s{2,}", " ", name)
    return name


def extract_specialty_from_name(name: str) -> tuple[str, str | None]:
    """
    If English specialty words are embedded in the name, extract them.
    Returns (clean_name, specialty_he_or_None).
    """
    # English words in name → try to split into name + specialty
    english_parts = re.findall(r"[A-Za-z][a-z\s]+", name)
    if not english_parts:
        return name, None

    specialty_he = None
    for part in english_parts:
        translated = _translate_specialty(part.strip())
        if translated:
            specialty_he = translated
            # Remove the English part from the name
            name = name.replace(part, "").strip()

    # Clean leftover separators
    name = re.sub(r"[\-–—|/]+\s*$", "", name).strip()
    name = re.sub(r"\s{2,}", " ", name)
    return name, specialty_he


def normalize_record(record: dict) -> dict | None:
    """
    Normalize a single doctor record dict.
    Returns None if the record should be discarded (garbage).
    Modifies in place and returns the record.
    """
    name = record.get("name", "").strip()

    if is_garbage(name):
        return None

    # Strip title
    name = normalize_name(name)

    # Re-check after stripping
    if is_garbage(name) or len(name) < 3:
        return None

    # Extract specialty embedded in name (e.g. English description)
    name, extracted_spec = extract_specialty_from_name(name)

    if not name or len(name) < 3:
        return None

    record["name"] = name

    # Fill specialty if missing and we extracted one
    if extracted_spec and not record.get("specialty"):
        record["specialty"] = extracted_spec

    # Translate English specialty field
    if record.get("specialty"):
        spec = record["specialty"]
        if re.search(r"[A-Za-z]", spec):
            translated = _translate_specialty(spec)
            if translated:
                record["specialty"] = translated

    # Translate English sub_specialty field
    if record.get("sub_specialty"):
        sub = record["sub_specialty"]
        if re.search(r"[A-Za-z]", sub):
            translated = _translate_specialty(sub)
            if translated:
                record["sub_specialty"] = translated

    return record
