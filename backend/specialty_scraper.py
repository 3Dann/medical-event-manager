"""
specialty_scraper.py — Medical Specialties & Sub-specialties Scraper

Primary source: www.sgu.edu/school-of-medicine
Additional sources:
  - en.wikipedia.org/wiki/Medical_specialty
  - www.abms.org/board-certification/a-guide-to-medical-specialties
  - Built-in curated list as fallback
"""

import re
import logging
import time
from typing import Optional
import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
import models

logger = logging.getLogger("specialty_scraper")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

# ── Built-in curated specialties (fallback + seed) ─────────────────────────

BUILTIN_SPECIALTIES = [
    # (name_en, name_he, description_en, parent_en or None)
    ("Internal Medicine",        "רפואה פנימית",          "Diagnosis and treatment of adult diseases", None),
    ("Cardiology",               "קרדיולוגיה",            "Heart and cardiovascular system",           "Internal Medicine"),
    ("Gastroenterology",         "גסטרואנטרולוגיה",       "Digestive system diseases",                 "Internal Medicine"),
    ("Pulmonology",              "פולמונולוגיה",           "Respiratory system diseases",               "Internal Medicine"),
    ("Nephrology",               "נפרולוגיה",             "Kidney diseases",                           "Internal Medicine"),
    ("Endocrinology",            "אנדוקרינולוגיה",        "Hormonal and metabolic disorders",          "Internal Medicine"),
    ("Rheumatology",             "ראומטולוגיה",           "Autoimmune and joint diseases",             "Internal Medicine"),
    ("Hematology",               "המטולוגיה",             "Blood diseases and disorders",              "Internal Medicine"),
    ("Infectious Disease",       "מחלות זיהומיות",        "Infections caused by microorganisms",       "Internal Medicine"),
    ("Geriatrics",               "גריאטריה",              "Medical care of elderly patients",          "Internal Medicine"),
    ("Oncology",                 "אונקולוגיה",            "Cancer diagnosis and treatment",            None),
    ("Medical Oncology",         "אונקולוגיה רפואית",     "Chemotherapy and systemic cancer treatment","Oncology"),
    ("Radiation Oncology",       "אונקולוגיה קרינתית",    "Radiation therapy for cancer",              "Oncology"),
    ("Surgical Oncology",        "אונקולוגיה כירורגית",   "Surgical removal of tumors",                "Oncology"),
    ("Surgery",                  "כירורגיה",              "Operative procedures for disease treatment",None),
    ("General Surgery",          "כירורגיה כללית",        "Broad surgical procedures of the abdomen", "Surgery"),
    ("Orthopedic Surgery",       "אורתופדיה",             "Bone, joint, and musculoskeletal surgery",  "Surgery"),
    ("Neurosurgery",             "נוירוכירורגיה",         "Surgery of the brain and spinal cord",      "Surgery"),
    ("Cardiothoracic Surgery",   "כירורגיה לב-חזה",       "Surgery of the heart and thoracic organs",  "Surgery"),
    ("Vascular Surgery",         "כירורגיה כלי דם",       "Surgery of the blood vessels",              "Surgery"),
    ("Plastic Surgery",          "כירורגיה פלסטית",       "Reconstructive and cosmetic surgery",       "Surgery"),
    ("Pediatric Surgery",        "כירורגיה ילדים",        "Surgery for children",                      "Surgery"),
    ("Urology",                  "אורולוגיה",             "Urinary tract and male reproductive system","Surgery"),
    ("Gynecology",               "גינקולוגיה",            "Female reproductive system",                None),
    ("Obstetrics",               "מיילדות",               "Pregnancy and childbirth",                   "Gynecology"),
    ("Maternal-Fetal Medicine",  "רפואת אם-עובר",         "High-risk pregnancies",                     "Gynecology"),
    ("Reproductive Endocrinology","אנדוקרינולוגיה רבייה","Fertility and hormonal reproductive issues", "Gynecology"),
    ("Pediatrics",               "רפואת ילדים",           "Medical care of infants, children, adolescents", None),
    ("Neonatology",              "נאונטולוגיה",           "Care of newborn infants",                   "Pediatrics"),
    ("Pediatric Cardiology",     "קרדיולוגיית ילדים",     "Heart conditions in children",              "Pediatrics"),
    ("Pediatric Neurology",      "נוירולוגיית ילדים",     "Neurological conditions in children",       "Pediatrics"),
    ("Neurology",                "נוירולוגיה",            "Nervous system disorders",                  None),
    ("Neurology - Stroke",       "נוירולוגיה - שבץ",      "Diagnosis and treatment of stroke",         "Neurology"),
    ("Neurology - Epilepsy",     "נוירולוגיה - אפילפסיה", "Epilepsy and seizure disorders",            "Neurology"),
    ("Neurology - Movement Disorders","נוירולוגיה - הפרעות תנועה","Parkinson's and movement disorders","Neurology"),
    ("Psychiatry",               "פסיכיאטריה",            "Mental health disorders",                   None),
    ("Child & Adolescent Psychiatry","פסיכיאטריה ילדים ונוער","Mental health in children and teens",   "Psychiatry"),
    ("Addiction Psychiatry",     "פסיכיאטריה התמכרויות",  "Substance use and addiction disorders",     "Psychiatry"),
    ("Radiology",                "רדיולוגיה",             "Medical imaging for diagnosis",             None),
    ("Interventional Radiology", "רדיולוגיה התערבותית",   "Image-guided minimally invasive procedures","Radiology"),
    ("Nuclear Medicine",         "רפואה גרעינית",         "Radioactive substances for diagnosis/treatment","Radiology"),
    ("Neuroradiology",           "נוירורדיולוגיה",        "Imaging of the brain and spinal cord",      "Radiology"),
    ("Anesthesiology",           "הרדמה",                 "Anesthesia and pain management",            None),
    ("Pain Medicine",            "רפואת כאב",             "Chronic and acute pain management",         "Anesthesiology"),
    ("Critical Care Medicine",   "רפואה נמרצת",           "Life-threatening conditions in ICU",        "Anesthesiology"),
    ("Dermatology",              "דרמטולוגיה",            "Skin, hair, and nail diseases",             None),
    ("Ophthalmology",            "רפואת עיניים",          "Eye diseases and surgery",                  None),
    ("Otolaryngology (ENT)",     "אא\"ג",                 "Ear, nose, and throat diseases",            None),
    ("Pathology",                "פתולוגיה",              "Disease diagnosis through lab specimens",   None),
    ("Emergency Medicine",       "רפואת חירום",           "Acute and emergency medical care",          None),
    ("Family Medicine",          "רפואת משפחה",           "Comprehensive primary healthcare",          None),
    ("Palliative Care",          "רפואה פליאטיבית",       "Comfort care for serious illness",          None),
    ("Sports Medicine",          "רפואת ספורט",           "Sports injuries and performance",           None),
    ("Physical Medicine & Rehabilitation","שיקום רפואי",  "Restoring function after injury/illness",   None),
    ("Preventive Medicine",      "רפואה מונעת",           "Disease prevention and public health",      None),
    ("Occupational Medicine",    "רפואה תעסוקתית",        "Work-related health conditions",            "Preventive Medicine"),
    ("Forensic Medicine",        "רפואה משפטית",          "Medical aspects of legal investigations",   None),
    ("Immunology",               "אימונולוגיה",           "Immune system disorders",                   None),
    ("Allergy & Clinical Immunology","אלרגולוגיה ואימונולוגיה","Allergies and immune disorders",      "Immunology"),
    ("Genetics",                 "גנטיקה",                "Hereditary conditions and genetic counseling",None),
    ("Pharmacology",             "פרמקולוגיה",            "Drug interactions and pharmacotherapy",     None),
    ("Diabetology",              "סוכרת",                 "Diabetes and metabolic disorders",          "Endocrinology"),
    ("Hepatology",               "הפטולוגיה",             "Liver, pancreas, and biliary diseases",     "Gastroenterology"),
    ("Coloproctology",           "קולופרוקטולוגיה",       "Colon, rectum, and anus surgery",           "Surgery"),
    ("Breast Surgery",           "כירורגיית שד",          "Breast diseases and surgery",               "Surgery"),
]


def _get_html(url: str, timeout: int = 15) -> Optional[str]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
    return None


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ── Source 1: SGU ──────────────────────────────────────────────────────────

def _scrape_sgu() -> list[dict]:
    """Scrape specialties from www.sgu.edu/school-of-medicine"""
    results = []
    urls_to_try = [
        "https://www.sgu.edu/school-of-medicine/residency/specialty-resources/",
        "https://www.sgu.edu/blog/medical/ultimate-list-of-medical-specialties/",
    ]
    for url in urls_to_try:
        html = _get_html(url)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")

        # Look for heading-based specialty lists
        for tag in ["h2", "h3", "h4"]:
            for heading in soup.find_all(tag):
                text = _clean_text(heading.get_text())
                if len(text) < 3 or len(text) > 80:
                    continue
                # Skip navigation/generic headings
                skip = {"home", "menu", "search", "contact", "about", "blog", "sgu", "school"}
                if text.lower() in skip or any(s in text.lower() for s in ["©", "privacy", "cookie"]):
                    continue
                # Collect description from next sibling paragraph
                desc = ""
                sib = heading.find_next_sibling()
                if sib and sib.name == "p":
                    desc = _clean_text(sib.get_text())[:500]

                results.append({
                    "name_en": text,
                    "description_en": desc or None,
                    "source_url": url,
                })
        if results:
            logger.info("SGU: scraped %d entries from %s", len(results), url)
            break

    return results


# ── Source 2: Wikipedia ────────────────────────────────────────────────────

def _scrape_wikipedia() -> list[dict]:
    """Scrape from Wikipedia Medical specialty article."""
    url = "https://en.wikipedia.org/wiki/Medical_specialty"
    html = _get_html(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []
    current_parent = None

    content = soup.find("div", {"id": "mw-content-text"})
    if not content:
        return []

    def _strip_edit(tag):
        """Remove Wikipedia edit-section spans before reading text."""
        for span in tag.find_all("span", class_="mw-editsection"):
            span.decompose()
        return _clean_text(tag.get_text())

    SKIP_SECTIONS = {"References", "External links", "See also", "Notes", "Contents",
                     "Further reading", "History", "Branches"}

    for elem in content.find_all(["h2", "h3", "li"]):
        if elem.name == "h2":
            text = _strip_edit(elem)
            if text and len(text) < 80 and text not in SKIP_SECTIONS:
                current_parent = text
        elif elem.name == "h3":
            text = _strip_edit(elem)
            if text and len(text) < 80:
                # sub-specialty under current_parent
                desc_elem = elem.find_next_sibling("p")
                desc = _clean_text(desc_elem.get_text())[:400] if desc_elem else None
                results.append({
                    "name_en": text,
                    "description_en": desc,
                    "parent_name": current_parent,
                    "source_url": url,
                })
        elif elem.name == "li" and current_parent:
            a = elem.find("a")
            if a:
                text = _clean_text(a.get_text())
                if 3 < len(text) < 80:
                    results.append({
                        "name_en": text,
                        "description_en": None,
                        "parent_name": current_parent,
                        "source_url": url,
                    })

    logger.info("Wikipedia: scraped %d entries", len(results))
    return results


# ── Source 3: ABMS ─────────────────────────────────────────────────────────

def _scrape_abms() -> list[dict]:
    """Scrape board-certified specialties from ABMS."""
    url = "https://www.abms.org/board-certification/a-guide-to-medical-specialties/"
    html = _get_html(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    results = []

    for heading in soup.find_all(["h2", "h3", "h4"]):
        text = _clean_text(heading.get_text())
        if len(text) < 3 or len(text) > 100:
            continue
        skip_words = {"abms", "about", "home", "search", "menu", "contact", "board", "certification"}
        if any(w in text.lower() for w in skip_words):
            continue
        desc_elem = heading.find_next_sibling("p")
        desc = _clean_text(desc_elem.get_text())[:400] if desc_elem else None
        results.append({
            "name_en": text,
            "description_en": desc,
            "source_url": url,
        })

    logger.info("ABMS: scraped %d entries", len(results))
    return results


# ── Hebrew translations lookup ─────────────────────────────────────────────

def _lookup_hebrew(name_en: str) -> Optional[str]:
    """Return Hebrew name for known specialties."""
    lookup = {r[0].lower(): r[1] for r in BUILTIN_SPECIALTIES}
    return lookup.get(name_en.lower())


# ── Normalize & deduplicate ────────────────────────────────────────────────

def _normalize_name(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def _merge_results(scraped: list[dict], builtin: list[dict]) -> list[dict]:
    """Merge scraped + builtin; deduplicate by normalized name_en."""
    seen: dict[str, dict] = {}

    for item in builtin + scraped:
        key = _normalize_name(item.get("name_en", ""))
        if not key:
            continue
        if key not in seen:
            seen[key] = item
        else:
            # enrich existing entry
            existing = seen[key]
            if not existing.get("description_en") and item.get("description_en"):
                existing["description_en"] = item["description_en"]
            if not existing.get("name_he") and item.get("name_he"):
                existing["name_he"] = item["name_he"]

    return list(seen.values())


# ── Main scrape function ───────────────────────────────────────────────────

def scrape_all_specialties() -> list[dict]:
    """Scrape from all sources and return merged, deduplicated list."""
    logger.info("Starting medical specialties scrape…")

    # Builtin seed (always included)
    builtin = [
        {
            "name_en": r[0],
            "name_he": r[1],
            "description_en": r[2],
            "parent_name": r[3],
            "source_url": "builtin",
        }
        for r in BUILTIN_SPECIALTIES
    ]

    scraped = []

    # SGU
    try:
        sgu = _scrape_sgu()
        scraped.extend(sgu)
        time.sleep(1)
    except Exception as e:
        logger.warning("SGU scrape error: %s", e)

    # Wikipedia
    try:
        wiki = _scrape_wikipedia()
        scraped.extend(wiki)
        time.sleep(1)
    except Exception as e:
        logger.warning("Wikipedia scrape error: %s", e)

    # ABMS
    try:
        abms = _scrape_abms()
        scraped.extend(abms)
    except Exception as e:
        logger.warning("ABMS scrape error: %s", e)

    # Enrich scraped items with Hebrew if known
    for item in scraped:
        if not item.get("name_he"):
            item["name_he"] = _lookup_hebrew(item["name_en"])

    merged = _merge_results(scraped, builtin)
    logger.info("Total merged specialties: %d", len(merged))
    return merged


# ── DB upsert ──────────────────────────────────────────────────────────────

def _upsert_records(db: Session, records: list[dict]) -> dict:
    """Core upsert logic shared by seed_from_builtin and upsert_specialties."""
    name_to_id: dict[str, int] = {}
    existing = {
        _normalize_name(s.name_en): s
        for s in db.query(models.MedicalSpecialty).all()
    }
    added = 0
    updated = 0

    for pass_num in range(2):
        for rec in records:
            parent_name = rec.get("parent_name")
            if pass_num == 0 and parent_name:
                continue
            if pass_num == 1 and not parent_name:
                continue

            key = _normalize_name(rec.get("name_en", ""))
            if not key:
                continue

            parent_id = None
            if parent_name:
                parent_id = name_to_id.get(_normalize_name(parent_name))

            if key in existing:
                sp = existing[key]
                changed = False
                if not sp.name_he and rec.get("name_he"):
                    sp.name_he = rec["name_he"]
                    changed = True
                if not sp.description_en and rec.get("description_en"):
                    sp.description_en = rec["description_en"]
                    changed = True
                if parent_id and not sp.parent_id:
                    sp.parent_id = parent_id
                    changed = True
                if changed:
                    updated += 1
                name_to_id[key] = sp.id
            else:
                sp = models.MedicalSpecialty(
                    name_en=rec["name_en"],
                    name_he=rec.get("name_he"),
                    description_en=rec.get("description_en"),
                    description_he=rec.get("description_he"),
                    parent_id=parent_id,
                    source_url=rec.get("source_url"),
                    confidence_score=1.0 if rec.get("source_url") == "builtin" else 0.8,
                    is_verified=rec.get("source_url") == "builtin",
                    is_active=True,
                )
                db.add(sp)
                db.flush()
                existing[key] = sp
                name_to_id[key] = sp.id
                added += 1

    db.commit()
    total = db.query(models.MedicalSpecialty).count()
    return {"added": added, "updated": updated, "total": total}


def seed_from_builtin(db: Session) -> dict:
    """
    Fast seed using only the built-in curated list — no network calls.
    Used at startup to avoid blocking Railway with external HTTP requests.
    """
    records = [
        {
            "name_en": r[0],
            "name_he": r[1],
            "description_en": r[2],
            "parent_name": r[3],
            "source_url": "builtin",
        }
        for r in BUILTIN_SPECIALTIES
    ]
    result = _upsert_records(db, records)
    logger.info("Builtin specialties seeded: %s", result)
    return result


def upsert_specialties(db: Session) -> dict:
    """
    Scrape all external sources + builtin, then upsert into DB.
    Returns summary: {"added": N, "updated": N, "total": N}
    """
    records = scrape_all_specialties()
    result = _upsert_records(db, records)
    logger.info("Specialties upsert complete: %s", result)
    return result
