"""
Background auto-scraper for the doctors database.
Runs in a thread-pool executor — never blocks the main event loop.
"""
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("scraper")

try:
    import requests as http_requests
    from bs4 import BeautifulSoup
    SCRAPING_AVAILABLE = True
except ImportError:
    SCRAPING_AVAILABLE = False

_lock = threading.Lock()


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


CKAN_BASE = "https://data.gov.il/api/3/action/datastore_search"

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


def scrape_url(url: str) -> list[dict]:
    """
    Fetch a URL and extract doctor records.
    Supports data.gov.il CKAN API and HTML tables.
    """
    if not SCRAPING_AVAILABLE:
        return []

    resource_id = _is_ckan_url(url)
    if resource_id:
        return scrape_ckan(resource_id, url)

    try:
        resp = http_requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except Exception as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}")

    soup = BeautifulSoup(resp.text, "html.parser")
    records = []

    field_aliases = {
        "name":                ["שם", "שם רופא", "name", "doctor"],
        "specialty":           ["מומחיות", "specialty", "התמחות"],
        "sub_specialty":       ["תת התמחות", "תת-התמחות", "sub_specialty"],
        "phone":               ["טלפון", "phone", "נייד"],
        "location":            ["מיקום", "כתובת", "location", "היכן מקבל", "קליניקה"],
        "hmo_acceptance":      ["קופות חולים", "קופה", "hmo"],
        "gives_expert_opinion":["חוות דעת", "ועדות", "expert_opinion"],
        "notes":               ["הערות", "notes"],
    }

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

        for row in rows[1:]:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if not cells:
                continue

            def get(field):
                idx = col_map.get(field)
                return cells[idx] if idx is not None and idx < len(cells) else None

            name = get("name") or (cells[0] if cells else None)
            if not name:
                continue

            hmo_raw = get("hmo_acceptance")
            records.append({
                "name":                 name,
                "specialty":            get("specialty"),
                "sub_specialty":        get("sub_specialty"),
                "phone":                get("phone"),
                "location":             get("location"),
                "hmo_acceptance":       json.dumps(_parse_hmo_string(hmo_raw) if hmo_raw else [], ensure_ascii=False),
                "gives_expert_opinion": _bool_from_value(get("gives_expert_opinion")),
                "notes":                get("notes"),
                "source_url":           url,
            })

    return records


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
                d.name.strip().lower()
                for d in db.query(models.Doctor.name).all()
            }
            for rec in records:
                if rec["name"].strip().lower() in existing_names:
                    continue
                doc = models.Doctor(**rec)
                db.add(doc)
                existing_names.add(rec["name"].strip().lower())
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
