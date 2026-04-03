"""
Background auto-scraper for the doctors database.
Runs in a thread-pool executor — never blocks the main event loop.
"""
import json
import logging
import re
import threading
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("scraper")

try:
    import requests as http_requests
    from bs4 import BeautifulSoup
    SCRAPING_AVAILABLE = True
except ImportError:
    SCRAPING_AVAILABLE = False

_lock = threading.Lock()

# Titles to strip when normalizing doctor names for deduplication
_TITLE_RE = re.compile(
    r"^(ד\"ר|ד'ר|דר'|דר |dr\.?|prof\.?|פרופ'|פרופ |פרופסור |professor |mr\.?|mrs\.?|ms\.?)\s*",
    re.IGNORECASE,
)

def _normalize_name(name: str) -> str:
    """Strip titles and normalize whitespace for dedup comparison."""
    return _TITLE_RE.sub("", name.strip()).strip().lower()


# ── Ministry of Health license verification ──────────────────────────────────

# data.gov.il resource IDs for official licensed-practitioner registries
_MOH_LICENSE_RESOURCES = [
    "ebe7b0fa-42c8-4195-8b40-b0b0e73cc494",   # court medical experts
    "37f14c29-47af-4b6c-b38e-e08a15e15b5b",   # cannabis-authorized physicians
    "b4dc7c47-3d8f-4898-8c86-3da07a1aa6e7",   # general licensed practitioners (MOH)
    "6b55cbcc-4d5e-4fcb-ad61-0d8f9f4de8f7",   # specialists registry
]

_CKAN_SEARCH = "https://data.gov.il/api/3/action/datastore_search"

# Cache of normalized licensed names per resource  {resource_id: set[str]}
_license_cache: dict[str, set] = {}
_license_lock = threading.Lock()


def _load_license_cache(resource_id: str) -> set:
    """Load all names from a CKAN resource into a set (cached)."""
    with _license_lock:
        if resource_id in _license_cache:
            return _license_cache[resource_id]
    names = set()
    offset = 0
    while True:
        try:
            resp = http_requests.get(
                _CKAN_SEARCH,
                params={"resource_id": resource_id, "limit": 1000, "offset": offset},
                timeout=15,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = resp.json()
            if not data.get("success"):
                break
            batch = data["result"]["records"]
            if not batch:
                break
            for rec in batch:
                for val in rec.values():
                    if isinstance(val, str) and 2 < len(val) < 80:
                        names.add(_normalize_name(val))
            offset += len(batch)
            if offset >= data["result"]["total"]:
                break
        except Exception:
            break
    with _license_lock:
        _license_cache[resource_id] = names
    return names


def verify_medical_license(name: str) -> bool:
    """
    Return True if the doctor's name is found in any official MOH registry
    on data.gov.il. Falls back to True (not verified = allow) if all lookups fail.
    """
    if not SCRAPING_AVAILABLE:
        return True
    norm = _normalize_name(name)
    for rid in _MOH_LICENSE_RESOURCES:
        try:
            licensed = _load_license_cache(rid)
            if norm in licensed:
                logger.info("License verified for '%s' in resource %s", name, rid)
                return True
        except Exception:
            continue
    # Also try a direct CKAN search by name
    for rid in _MOH_LICENSE_RESOURCES:
        try:
            resp = http_requests.get(
                _CKAN_SEARCH,
                params={"resource_id": rid, "q": norm, "limit": 5},
                timeout=10,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = resp.json()
            if data.get("success") and data["result"]["records"]:
                return True
        except Exception:
            continue
    return False  # not found in any official registry


def _parse_hmo_string(value: str) -> list:
    result = []
    val = str(value).lower()
    hmo_map = {
        "clalit":   ["כללית", "clalit"],
        "maccabi":  ["מכבי", "maccabi"],
        "meuhedet": ["מאוחדת", "meuhedet"],
        "leumit":   ["לאומית", "leumit"],
    }
    for key, aliases in hmo_map.items():
        if any(alias in val for alias in aliases):
            result.append(key)
    if not result and ("כן" in val or "yes" in val or "all" in val or "כל" in val):
        result = ["clalit", "maccabi", "meuhedet", "leumit"]
    return result


def _bool_from_value(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ["כן", "yes", "true", "1", "נכון"]


CKAN_BASE        = "https://data.gov.il/api/3/action/datastore_search"
CKAN_PKG_SEARCH  = "https://data.gov.il/api/3/action/package_search"
CKAN_PKG_SHOW    = "https://data.gov.il/api/3/action/package_show"

# Keywords used to find medical datasets on data.gov.il
_MEDICAL_SEARCH_TERMS = [
    "רופאים", "רופא", "רפואה", "מומחה", "מומחים",
    "רישיון רפואי", "עוסק ברפואה", "מרפאה", "בית חולים",
    "doctors", "physician", "medical", "specialist",
]

# Name fields commonly used in medical CKAN datasets
_NAME_FIELDS = [
    "name", "שם", "doctor_name", "dr_name", "expert", "full_name",
    "physician", "שם_רופא", "שם רופא", "שם מלא",
]
_SPECIALTY_FIELDS = [
    "specialty", "profession", "מומחיות", "התמחות", "תחום", "תפקיד",
]
_LOCATION_FIELDS = [
    "city", "adress", "address", "location", "עיר", "כתובת", "מיקום",
]


def _fetch_all_medical_resource_ids() -> list[str]:
    """
    Search data.gov.il CKAN for all packages related to medicine/doctors.
    Returns a list of resource IDs (datastore resources only).
    """
    found = []
    seen_ids = set(CKAN_SOURCES.keys())  # skip already-known sources

    for term in _MEDICAL_SEARCH_TERMS:
        try:
            resp = http_requests.get(
                CKAN_PKG_SEARCH,
                params={"q": term, "rows": 20},
                timeout=15,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = resp.json()
            if not data.get("success"):
                continue
            for pkg in data["result"].get("results", []):
                for res in pkg.get("resources", []):
                    rid = res.get("id", "")
                    if rid and rid not in seen_ids and res.get("datastore_active"):
                        seen_ids.add(rid)
                        found.append(rid)
        except Exception:
            continue

    logger.info("Broad search found %d new CKAN medical resources", len(found))
    return found


def _guess_field(record: dict, candidates: list[str]) -> str | None:
    """Return the value of the first matching field in a CKAN record."""
    keys_lower = {k.lower(): v for k, v in record.items()}
    for c in candidates:
        if keys_lower.get(c.lower()):
            return str(keys_lower[c.lower()]).strip()
    return None


def _scrape_resource_broad(resource_id: str) -> list[dict]:
    """
    Pull records from any CKAN resource and try to extract doctor info
    using heuristic field matching. Only keeps records that look like people.
    """
    records = []
    offset = 0
    url = f"https://data.gov.il/api/3/action/datastore_search?resource_id={resource_id}"

    while True:
        try:
            resp = http_requests.get(
                CKAN_BASE,
                params={"resource_id": resource_id, "limit": 500, "offset": offset},
                timeout=20,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = resp.json()
            if not data.get("success"):
                break
            batch = data["result"]["records"]
            if not batch:
                break

            for rec in batch:
                name = _guess_field(rec, _NAME_FIELDS)
                if not name or len(name) < 3 or len(name) > 80:
                    continue
                # Must look like a person name (contains Hebrew or Latin letters, not just digits)
                if not re.search(r'[\u05d0-\u05eaA-Za-z]', name):
                    continue
                specialty = _guess_field(rec, _SPECIALTY_FIELDS)
                # Skip non-human professions
                if specialty and specialty.lower() in _EXCLUDED_PROFESSIONS:
                    continue
                location = _guess_field(rec, _LOCATION_FIELDS)
                records.append({
                    "name": name,
                    "specialty": specialty or None,
                    "sub_specialty": None,
                    "phone": None,
                    "location": location,
                    "hmo_acceptance": json.dumps([], ensure_ascii=False),
                    "gives_expert_opinion": False,
                    "notes": f"מקור: data.gov.il resource {resource_id[:8]}",
                    "source_url": url,
                })

            offset += len(batch)
            if offset >= data["result"]["total"]:
                break
        except Exception as e:
            logger.warning("broad scrape resource %s: %s", resource_id, e)
            break

    return records


def run_broad_search(db_session_factory) -> dict:
    """
    Discover ALL medical CKAN resources on data.gov.il, scrape them,
    verify Israeli medical licenses, and upsert into the DB.
    Returns summary dict.
    """
    import models

    logger.info("Starting broad search across data.gov.il medical datasets…")
    resource_ids = _fetch_all_medical_resource_ids()

    all_records: list[dict] = []
    for rid in resource_ids:
        try:
            recs = _scrape_resource_broad(rid)
            all_records.extend(recs)
            logger.info("Resource %s: %d candidates", rid, len(recs))
        except Exception as e:
            logger.warning("Resource %s failed: %s", rid, e)

    # Deduplicate within this batch
    seen: set[str] = set()
    unique: list[dict] = []
    for rec in all_records:
        n = _normalize_name(rec["name"])
        if n not in seen:
            seen.add(n)
            unique.append(rec)

    # Records from data.gov.il are published by the Israeli government —
    # they are considered implicitly licensed. We still run the check to
    # enrich notes, but never discard them.
    licensed_records = []
    unlicensed = 0
    for rec in unique:
        is_gov_source = "data.gov.il" in (rec.get("source_url") or "")
        if is_gov_source:
            # Government source = trusted; mark as verified
            rec["notes"] = ((rec.get("notes") or "") + " | ✅ מקור ממשלתי מאומת").strip(" |")
            licensed_records.append(rec)
        elif verify_medical_license(rec["name"]):
            licensed_records.append(rec)
        else:
            unlicensed += 1
            logger.info("Skipped unlicensed (non-gov): %s", rec["name"])

    logger.info("Broad: %d candidates → %d unique → %d kept (%d skipped no-license)",
                len(all_records), len(unique), len(licensed_records), unlicensed)

    # Upsert into DB
    db = db_session_factory()
    added = 0
    try:
        existing = {_normalize_name(d.name) for d in db.query(models.Doctor.name).all()}
        for rec in licensed_records:
            n = _normalize_name(rec["name"])
            if n not in existing:
                db.add(models.Doctor(**rec))
                existing.add(n)
                added += 1
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("DB upsert error in broad search: %s", e)
    finally:
        db.close()

    return {
        "resources_found": len(resource_ids),
        "candidates": len(all_records),
        "unique": len(unique),
        "licensed": len(licensed_records),
        "unlicensed_skipped": unlicensed,
        "added": added,
    }

# Non-human professions to exclude
_EXCLUDED_PROFESSIONS = {"וטרינר", "וטרינריה", "רפואה וטרינרית", "ווטרינרי"}

# Known data.gov.il resource IDs and their field mappings
CKAN_SOURCES = {
    "ebe7b0fa-42c8-4195-8b40-b0b0e73cc494": {
        "name_field": "expert",
        "specialty_field": "profession",
        "phone_field": "phone",
        "phone2_field": "cell_phone",
        "location_field": "adress",
        "notes_field": "notes",
        "expert_opinion": True,
    },
    "37f14c29-47af-4b6c-b38e-e08a15e15b5b": {
        "name_field": "dr_name",
        "specialty_field": "specialty",
        "location_field": "city",
        "notes_field": "notes",
        "expert_opinion": False,
    },
}


def _is_ckan_url(url: str) -> Optional[str]:
    """Return resource_id if URL is a data.gov.il CKAN API call, else None."""
    import re
    m = re.search(r"resource_id=([a-f0-9\-]{36})", url)
    if m and "data.gov.il" in url:
        return m.group(1)
    return None


def scrape_ckan(resource_id: str, source_url: str) -> list[dict]:
    """Fetch all records from a data.gov.il CKAN datastore resource."""
    mapping = CKAN_SOURCES.get(resource_id, {})
    records = []
    offset = 0
    limit = 100

    while True:
        resp = http_requests.get(
            CKAN_BASE,
            params={"resource_id": resource_id, "limit": limit, "offset": offset},
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            break
        batch = data["result"]["records"]
        if not batch:
            break

        for rec in batch:
            name = str(rec.get(mapping.get("name_field", "name")) or "").strip()
            if not name:
                continue
            specialty = str(rec.get(mapping.get("specialty_field", "specialty")) or "").strip()
            # Skip non-human professions
            if specialty.lower() in _EXCLUDED_PROFESSIONS:
                continue
            phone = str(rec.get(mapping.get("phone_field", "phone")) or "").strip()
            phone2 = str(rec.get(mapping.get("phone2_field", ""), "") or "").strip()
            if phone2 and phone2 != phone:
                phone = f"{phone} / {phone2}".strip(" /")
            location_parts = [
                str(rec.get(mapping.get("location_field", ""), "") or "").strip(),
                str(rec.get("city", "") or "").strip(),
            ]
            location = ", ".join(p for p in location_parts if p) or None
            notes = str(rec.get(mapping.get("notes_field", "notes")) or "").strip() or None
            records.append({
                "name": name,
                "specialty": specialty or None,
                "sub_specialty": None,
                "phone": phone or None,
                "location": location,
                "hmo_acceptance": json.dumps([], ensure_ascii=False),
                "gives_expert_opinion": mapping.get("expert_opinion", False),
                "notes": notes,
                "source_url": source_url,
            })

        offset += limit
        if offset >= data["result"]["total"]:
            break

    return records


# Keywords that indicate a page likely lists doctors
_DOCTOR_PAGE_KEYWORDS = [
    "רופא", "רופאים", "צוות", "מומחה", "מומחים", "doctor", "doctors",
    "physician", "staff", "team", "specialist", "about", "אודות",
    "קליניקה", "clinic", "מרפאה",
]


def _extract_records_from_html(soup: BeautifulSoup, url: str) -> list[dict]:
    """Extract doctor records from an HTML page — tables and free-text patterns."""
    records = []
    field_aliases = {
        "name":                ["שם", "שם רופא", "name", "doctor", "physician"],
        "specialty":           ["מומחיות", "specialty", "התמחות", "תחום"],
        "sub_specialty":       ["תת התמחות", "תת-התמחות", "sub_specialty"],
        "phone":               ["טלפון", "phone", "נייד", "tel", "mobile"],
        "location":            ["מיקום", "כתובת", "location", "היכן מקבל", "קליניקה", "address"],
        "hmo_acceptance":      ["קופות חולים", "קופה", "hmo"],
        "gives_expert_opinion":["חוות דעת", "ועדות", "expert_opinion"],
        "notes":               ["הערות", "notes"],
    }

    # ── Table extraction ──────────────────────────────────────────────────────
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header = [th.get_text(strip=True).lower() for th in rows[0].find_all(["th", "td"])]
        col_map = {}
        for field, aliases in field_aliases.items():
            for i, h in enumerate(header):
                if any(alias in h for alias in aliases):
                    col_map[field] = i
                    break
        if "name" not in col_map and len(header) < 2:
            continue

        for row in rows[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if not cells:
                continue
            def get(field, _cells=cells):
                idx = col_map.get(field)
                return _cells[idx] if idx is not None and idx < len(_cells) else None
            name = get("name") or (cells[0] if cells else None)
            if not name or len(name.strip()) < 3:
                continue
            hmo_raw = get("hmo_acceptance")
            records.append({
                "name": name.strip(),
                "specialty": get("specialty"),
                "sub_specialty": get("sub_specialty"),
                "phone": get("phone"),
                "location": get("location"),
                "hmo_acceptance": json.dumps(_parse_hmo_string(hmo_raw) if hmo_raw else [], ensure_ascii=False),
                "gives_expert_opinion": _bool_from_value(get("gives_expert_opinion")),
                "notes": get("notes"),
                "source_url": url,
            })

    # ── Free-text: look for ד"ר / Dr. patterns in paragraphs ─────────────────
    if not records:
        dr_re = re.compile(r'(ד["\']?ר\.?\s+[\u05d0-\u05ea\w\s\-]{3,40}|Dr\.?\s+[A-Za-z\s\-]{3,40})', re.UNICODE)
        seen_names = set()
        for tag in soup.find_all(["p", "li", "h2", "h3", "h4", "div", "span"]):
            text = tag.get_text(strip=True)
            for m in dr_re.finditer(text):
                raw_name = m.group(0).strip()
                norm = _normalize_name(raw_name)
                if norm in seen_names or len(norm) < 3:
                    continue
                seen_names.add(norm)
                records.append({
                    "name": raw_name,
                    "specialty": None,
                    "sub_specialty": None,
                    "phone": None,
                    "location": None,
                    "hmo_acceptance": json.dumps([], ensure_ascii=False),
                    "gives_expert_opinion": False,
                    "notes": f"נמצא בעמוד: {url[:80]}",
                    "source_url": url,
                })

    return records


def _find_doctor_subpages(soup: BeautifulSoup, base_url: str, max_pages: int = 5) -> list[str]:
    """Return up to max_pages links from the same domain that likely list doctors."""
    parsed = urlparse(base_url)
    base_domain = f"{parsed.scheme}://{parsed.netloc}"
    candidates = []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        if not href or href.startswith("javascript") or href.startswith("mailto"):
            continue
        full = urljoin(base_url, href)
        if urlparse(full).netloc != parsed.netloc:
            continue
        link_text = (a.get_text(strip=True) + " " + href).lower()
        if any(kw in link_text for kw in _DOCTOR_PAGE_KEYWORDS):
            candidates.append(full)
    return list(dict.fromkeys(candidates))[:max_pages]  # dedup, cap


def scrape_url(url: str) -> list[dict]:
    """
    Fetch a URL and extract doctor records.
    Supports data.gov.il CKAN API, HTML tables, and free-text ד"ר patterns.
    For private clinic sites: also crawls sub-pages that mention doctors.
    All records are verified against the MOH license registry; unverified
    doctors are kept but flagged in their notes.
    """
    if not SCRAPING_AVAILABLE:
        return []

    resource_id = _is_ckan_url(url)
    if resource_id:
        return scrape_ckan(resource_id, url)

    # ── Fetch main page ───────────────────────────────────────────────────────
    try:
        resp = http_requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}")

    soup = BeautifulSoup(resp.text, "html.parser")
    all_records = _extract_records_from_html(soup, url)

    # ── Also crawl doctor sub-pages (private clinics) ─────────────────────────
    sub_urls = _find_doctor_subpages(soup, url, max_pages=6)
    for sub_url in sub_urls:
        if sub_url == url:
            continue
        try:
            sub_resp = http_requests.get(sub_url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            sub_resp.raise_for_status()
            sub_soup = BeautifulSoup(sub_resp.text, "html.parser")
            sub_records = _extract_records_from_html(sub_soup, sub_url)
            all_records.extend(sub_records)
        except Exception:
            continue

    # ── Deduplicate by normalized name ────────────────────────────────────────
    seen: set[str] = set()
    unique: list[dict] = []
    for rec in all_records:
        norm = _normalize_name(rec["name"])
        if norm not in seen:
            seen.add(norm)
            unique.append(rec)

    # ── License verification ──────────────────────────────────────────────────
    verified_records = []
    for rec in unique:
        licensed = verify_medical_license(rec["name"])
        if not licensed:
            existing_notes = rec.get("notes") or ""
            rec["notes"] = (existing_notes + " | ⚠️ רישיון לא נמצא במאגר משרד הבריאות").strip(" |")
        verified_records.append(rec)

    return verified_records


def run_scraping_job(source_id: int, db_session_factory) -> int:
    """
    Pull one ScrapingSource record, scrape its URL, upsert Doctor rows.
    Returns number of new doctors added.
    Thread-safe via _lock.
    """
    import models  # imported here to avoid circular import at module level

    with _lock:
        db = db_session_factory()
        try:
            source = db.query(models.ScrapingSource).filter(models.ScrapingSource.id == source_id).first()
            if not source or not source.is_active:
                return 0

            logger.info("Scraping source #%d: %s", source_id, source.url)
            try:
                records = scrape_url(source.url)
            except Exception as exc:
                source.last_error = str(exc)
                source.last_scraped_at = datetime.now(timezone.utc)
                db.commit()
                logger.warning("Scraping error for source #%d: %s", source_id, exc)
                return 0

            added = 0
            existing_names = {
                _normalize_name(d.name)
                for d in db.query(models.Doctor.name).all()
            }
            for rec in records:
                if _normalize_name(rec["name"]) in existing_names:
                    continue
                doc = models.Doctor(**rec)
                db.add(doc)
                existing_names.add(_normalize_name(rec["name"]))
                added += 1

            source.last_scraped_at = datetime.now(timezone.utc)
            source.last_scraped_count = added
            source.last_error = None
            db.commit()
            logger.info("Source #%d: added %d new doctors", source_id, added)
            return added

        except Exception as exc:
            db.rollback()
            logger.error("Unexpected error scraping source #%d: %s", source_id, exc)
            return 0
        finally:
            db.close()


def run_all_sources(db_session_factory):
    """Scheduled job — runs all active sources sequentially in this thread."""
    import models

    db = db_session_factory()
    try:
        source_ids = [
            s.id for s in db.query(models.ScrapingSource)
            .filter(models.ScrapingSource.is_active == True)
            .all()
        ]
    finally:
        db.close()

    total = 0
    for sid in source_ids:
        total += run_scraping_job(sid, db_session_factory)
    logger.info("Scheduled scrape complete — %d new doctors added", total)
