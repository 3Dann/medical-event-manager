"""
שירות Hebrew NLP — DictaBERT לסיווג ו-NER.

מודלים (נטענים lazily — רק בשימוש ראשון):
  dicta-il/dictabert       → סיווג סוג פוליסה
  dicta-il/dictabert-ner   → זיהוי ישויות (חברות, סכומים, תאריכים)

אם transformers לא מותקן — מחזיר None בשקט, המערכת
נופלת חזרה לניתוח rules-based ולא נשברת.

התקנה:
    pip install transformers torch   (כ-2GB הורדה)
"""
from __future__ import annotations
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── lazy singletons ──────────────────────────────────────────────────────────
_classifier = None   # DictaBERT pipeline לסיווג
_ner_pipe    = None  # DictaBERT-NER pipeline


def _load_classifier():
    global _classifier
    if _classifier is not None:
        return _classifier
    try:
        from transformers import pipeline
        logger.info("[hebrew_nlp] טוען DictaBERT classifier...")
        _classifier = pipeline(
            "text-classification",
            model="dicta-il/dictabert",
            tokenizer="dicta-il/dictabert",
            truncation=True,
            max_length=512,
        )
        logger.info("[hebrew_nlp] DictaBERT classifier מוכן")
    except Exception as e:
        logger.warning(f"[hebrew_nlp] לא ניתן לטעון DictaBERT: {e}")
        _classifier = False  # מסמן "ניסינו ונכשלנו"
    return _classifier


def _load_ner():
    global _ner_pipe
    if _ner_pipe is not None:
        return _ner_pipe
    try:
        from transformers import pipeline
        logger.info("[hebrew_nlp] טוען DictaBERT-NER...")
        _ner_pipe = pipeline(
            "ner",
            model="dicta-il/dictabert-ner",
            tokenizer="dicta-il/dictabert-ner",
            aggregation_strategy="simple",
            truncation=True,
            max_length=512,
        )
        logger.info("[hebrew_nlp] DictaBERT-NER מוכן")
    except Exception as e:
        logger.warning(f"[hebrew_nlp] לא ניתן לטעון DictaBERT-NER: {e}")
        _ner_pipe = False
    return _ner_pipe


# ── Public API ───────────────────────────────────────────────────────────────

def preprocess_hebrew(text: str, max_length: int | None = None) -> str:
    """
    נרמל טקסט עברי לפני ניתוח:
    - NFC Unicode
    - הסרת ניקוד
    - נרמול שקל
    - נרמול רווחים
    """
    import unicodedata
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    # הסר ניקוד U+0591–U+05C7
    text = re.sub(r"[\u0591-\u05c7]", "", text)
    # נרמל שקל
    text = re.sub(r"NIS|ILS|ש[\"']?ח", "₪", text)
    # נרמל פסיקי-אלפים
    for _ in range(3):
        text = re.sub(r"(\d),(\d{3})", r"\1\2", text)
    # נרמל רווחים
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    if max_length:
        text = text[:max_length]
    return text


def classify_policy_type(text: str) -> Optional[str]:
    """
    מסווג סוג פוליסה בעזרת DictaBERT.
    מחזיר: "health" | "life" | "nursing" | "disability" | "critical_illness" | None
    """
    clf = _load_classifier()
    if not clf:
        return None

    try:
        # קח 512 תווים ראשונים — מספיק לסיווג
        snippet = preprocess_hebrew(text, max_length=512)
        results = clf(snippet)
        if results:
            label = results[0]["label"].lower()
            # מיפוי label → policy_type
            return _map_label_to_type(label)
    except Exception as e:
        logger.warning(f"[hebrew_nlp] classify_policy_type נכשל: {e}")
    return None


def extract_entities(text: str) -> Dict[str, Any]:
    """
    חלץ ישויות מטקסט עברי בעזרת DictaBERT-NER.
    מחזיר:
    {
        "organizations": ["הראל", "הפניקס"],
        "dates":         ["01/01/2022"],
        "money":         ["₪350", "₪500,000"],
        "persons":       [],
        "raw":           [{"entity_group": ..., "word": ..., "score": ...}]
    }
    """
    ner = _load_ner()
    if not ner:
        return _empty_entities()

    try:
        snippet = preprocess_hebrew(text, max_length=512)
        entities = ner(snippet)
        return _group_entities(entities)
    except Exception as e:
        logger.warning(f"[hebrew_nlp] extract_entities נכשל: {e}")
    return _empty_entities()


def enhance_local_analysis(text: str, analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    שפר ניתוח rules-based עם תוצאות DictaBERT.
    קורא לשני המודלים ומשלב עם הניתוח הקיים.
    מחזיר ניתוח משופר — לא מחליף ערכים שכבר קיימים בביטחון גבוה.
    """
    preprocessed = preprocess_hebrew(text, max_length=4096)

    # סיווג סוג פוליסה
    if not analysis.get("policy_type") or analysis.get("policy_type") == "health":
        bert_type = classify_policy_type(preprocessed)
        if bert_type and bert_type != analysis.get("policy_type"):
            analysis["policy_type"] = bert_type
            analysis["_bert_type"] = bert_type

    # NER — חילוץ חברות ביטוח
    entities = extract_entities(preprocessed)
    if entities["organizations"] and not analysis.get("insurer"):
        # השתמש בארגון הראשון שנמצא
        org = entities["organizations"][0]
        from scripts.preprocess_hebrew import normalize_insurer_name
        try:
            normalized = normalize_insurer_name(org)
            analysis["insurer"] = normalized
            analysis["_bert_insurer"] = org
        except Exception:
            analysis["insurer"] = org

    # NER — חילוץ סכומי כסף
    if entities["money"] and not analysis.get("monthly_premium"):
        amounts = _parse_amounts(entities["money"])
        if amounts:
            # הנח שהסכום הקטן ביותר הוא הפרמיה
            analysis["_bert_amounts"] = amounts

    analysis["_nlp_enhanced"] = True
    return analysis


# ── Helpers ───────────────────────────────────────────────────────────────────

def _map_label_to_type(label: str) -> str:
    """ממפה label של DictaBERT לסוג פוליסה."""
    mapping = {
        "nursing":          "nursing",
        "סיעוד":            "nursing",
        "life":             "life",
        "חיים":             "life",
        "health":           "health",
        "בריאות":           "health",
        "disability":       "disability",
        "נכות":             "disability",
        "critical":         "critical_illness",
        "מחלות קשות":       "critical_illness",
    }
    for key, val in mapping.items():
        if key in label:
            return val
    return "health"  # ברירת מחדל


def _group_entities(entities: List[Dict]) -> Dict[str, Any]:
    orgs, dates, money, persons = [], [], [], []
    for ent in entities:
        group = ent.get("entity_group", "").upper()
        word  = ent.get("word", "").strip()
        score = ent.get("score", 0)
        if score < 0.6 or not word:
            continue
        if group == "ORG":
            orgs.append(word)
        elif group in ("DATE", "TIME"):
            dates.append(word)
        elif group in ("MONEY", "NUM"):
            money.append(word)
        elif group == "PER":
            persons.append(word)
    return {
        "organizations": list(dict.fromkeys(orgs)),   # dedupe
        "dates":         list(dict.fromkeys(dates)),
        "money":         list(dict.fromkeys(money)),
        "persons":       list(dict.fromkeys(persons)),
        "raw":           entities,
    }


def _empty_entities() -> Dict[str, Any]:
    return {"organizations": [], "dates": [], "money": [], "persons": [], "raw": []}


def _parse_amounts(money_strs: List[str]) -> List[float]:
    amounts = []
    for s in money_strs:
        nums = re.findall(r"[\d,]+", s)
        for n in nums:
            try:
                amounts.append(float(n.replace(",", "")))
            except ValueError:
                pass
    return sorted(amounts)


# ── Health check ─────────────────────────────────────────────────────────────

def nlp_status() -> Dict[str, Any]:
    """סטטוס זמינות מודלי NLP."""
    try:
        import transformers
        tf_version = transformers.__version__
    except ImportError:
        return {
            "available": False,
            "reason": "transformers לא מותקן — הרץ: pip install transformers torch",
            "classifier": False,
            "ner": False,
        }
    try:
        import torch
        torch_available = True
        device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    except ImportError:
        torch_available = False
        device = "unavailable"

    return {
        "available": torch_available,
        "transformers_version": tf_version,
        "device": device,
        "classifier_loaded": _classifier is not None and _classifier is not False,
        "ner_loaded": _ner_pipe is not None and _ner_pipe is not False,
    }
