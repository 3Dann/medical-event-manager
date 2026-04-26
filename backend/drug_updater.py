"""
מנוע עדכון מאגר תרופות.
- Seed ראשוני מ-drug_list.py (כולל שמות עבריים ומינונים)
- עדכון שבועי מ-openFDA (גילוי תרופות חדשות)
"""
import json
import logging
from datetime import datetime, timezone
import requests
from sqlalchemy.orm import Session
import models
from drug_list import DRUGS, HEBREW_NAMES

logger = logging.getLogger("drug_updater")

# ── מינונים נפוצים לתרופות נבחרות ────────────────────────────────────────────
COMMON_DOSAGES: dict[str, list[str]] = {
    # כאב
    "Acamol": ["500mg", "1000mg"], "Paracetamol": ["500mg", "1000mg"],
    "Optalgin": ["500mg"], "Dipyrone": ["500mg"],
    "Ibufen": ["200mg", "400mg", "600mg"], "Ibuprofen": ["200mg", "400mg", "600mg"],
    "Advil": ["200mg", "400mg"],
    "Voltaren": ["25mg", "50mg", "75mg", "100mg"],
    "Diclofenac": ["25mg", "50mg", "75mg", "100mg"],
    "Arcoxia": ["60mg", "90mg", "120mg"], "Etoricoxib": ["60mg", "90mg", "120mg"],
    "Celebrex": ["100mg", "200mg", "400mg"], "Celecoxib": ["100mg", "200mg", "400mg"],
    "Naproxen": ["250mg", "500mg", "550mg"],
    "Tramadol": ["50mg", "100mg"], "Tramadex": ["50mg", "100mg"],
    "Lyrica": ["25mg", "50mg", "75mg", "100mg", "150mg", "200mg", "300mg"],
    "Pregabalin": ["25mg", "50mg", "75mg", "150mg", "300mg"],
    "Neurontin": ["100mg", "300mg", "400mg", "600mg", "800mg"],
    "Gabapentin": ["100mg", "300mg", "400mg", "600mg", "800mg"],
    # לחץ דם
    "Enalapril": ["2.5mg", "5mg", "10mg", "20mg"],
    "Ramipril": ["1.25mg", "2.5mg", "5mg", "10mg"],
    "Lisinopril": ["2.5mg", "5mg", "10mg", "20mg"],
    "Perindopril": ["2mg", "4mg", "8mg"],
    "Losartan": ["25mg", "50mg", "100mg"],
    "Valsartan": ["40mg", "80mg", "160mg", "320mg"],
    "Irbesartan": ["75mg", "150mg", "300mg"],
    "Candesartan": ["4mg", "8mg", "16mg", "32mg"],
    "Concor": ["1.25mg", "2.5mg", "5mg", "7.5mg", "10mg"],
    "Bisoprolol": ["1.25mg", "2.5mg", "5mg", "10mg"],
    "Metoprolol": ["25mg", "50mg", "100mg", "200mg"],
    "Carvedilol": ["3.125mg", "6.25mg", "12.5mg", "25mg"],
    "Propranolol": ["10mg", "20mg", "40mg", "80mg"],
    "Atenolol": ["25mg", "50mg", "100mg"],
    "Norvasc": ["2.5mg", "5mg", "10mg"],
    "Amlodipine": ["2.5mg", "5mg", "10mg"],
    "Amlopin": ["5mg", "10mg"],
    "Diltiazem": ["30mg", "60mg", "90mg", "120mg"],
    "Verapamil": ["40mg", "80mg", "120mg", "240mg"],
    "Furosemide": ["20mg", "40mg", "80mg"],
    "Lasix": ["20mg", "40mg", "80mg"],
    "Spironolactone": ["25mg", "50mg", "100mg"],
    "Indapamide": ["1.5mg", "2.5mg"],
    # נוגדי קרישה
    "Aspirin": ["75mg", "100mg", "300mg"],
    "Warfarin": ["1mg", "2mg", "3mg", "5mg"],
    "Coumadin": ["1mg", "2mg", "3mg", "5mg"],
    "Xarelto": ["2.5mg", "10mg", "15mg", "20mg"],
    "Rivaroxaban": ["2.5mg", "10mg", "15mg", "20mg"],
    "Eliquis": ["2.5mg", "5mg"],
    "Apixaban": ["2.5mg", "5mg"],
    "Pradaxa": ["75mg", "110mg", "150mg"],
    "Dabigatran": ["75mg", "110mg", "150mg"],
    # כולסטרול
    "Lipitor": ["10mg", "20mg", "40mg", "80mg"],
    "Atorvastatin": ["10mg", "20mg", "40mg", "80mg"],
    "Crestor": ["5mg", "10mg", "20mg", "40mg"],
    "Rosuvastatin": ["5mg", "10mg", "20mg", "40mg"],
    "Zocor": ["10mg", "20mg", "40mg", "80mg"],
    "Simvastatin": ["10mg", "20mg", "40mg", "80mg"],
    "Ezetimibe": ["10mg"],
    "Ezetrol": ["10mg"],
    # סוכרת
    "Metformin": ["500mg", "850mg", "1000mg"],
    "Glucophage": ["500mg", "850mg", "1000mg"],
    "Januvia": ["25mg", "50mg", "100mg"],
    "Jardiance": ["10mg", "25mg"],
    "Empagliflozin": ["10mg", "25mg"],
    "Forxiga": ["5mg", "10mg"],
    "Dapagliflozin": ["5mg", "10mg"],
    "Glimepiride": ["1mg", "2mg", "3mg", "4mg"],
    "Amaryl": ["1mg", "2mg", "3mg", "4mg"],
    "Sitagliptin": ["25mg", "50mg", "100mg"],
    # בלוטת תריס
    "Levothyroxine": ["25mcg", "50mcg", "75mcg", "100mcg", "125mcg", "150mcg"],
    "Eltroxin": ["25mcg", "50mcg", "75mcg", "100mcg", "125mcg", "150mcg"],
    "Euthyrox": ["25mcg", "50mcg", "75mcg", "100mcg", "125mcg", "150mcg"],
    # אפילפסיה / נוירולוגיה
    "Carbamazepine": ["100mg", "200mg", "400mg"],
    "Tegretol": ["100mg", "200mg", "400mg"],
    "Valproic Acid": ["200mg", "300mg", "500mg"],
    "Depakine": ["200mg", "300mg", "500mg"],
    "Lamotrigine": ["25mg", "50mg", "100mg", "150mg", "200mg"],
    "Lamictal": ["25mg", "50mg", "100mg", "150mg", "200mg"],
    "Levetiracetam": ["250mg", "500mg", "750mg", "1000mg"],
    "Keppra": ["250mg", "500mg", "750mg", "1000mg"],
    "Topiramate": ["25mg", "50mg", "100mg", "200mg"],
    "Topamax": ["25mg", "50mg", "100mg", "200mg"],
    # פסיכיאטריה
    "Escitalopram": ["5mg", "10mg", "20mg"],
    "Cipralex": ["5mg", "10mg", "20mg"],
    "Sertraline": ["25mg", "50mg", "100mg"],
    "Zoloft": ["25mg", "50mg", "100mg"],
    "Fluoxetine": ["10mg", "20mg", "40mg"],
    "Prozac": ["10mg", "20mg", "40mg"],
    "Venlafaxine": ["37.5mg", "75mg", "150mg"],
    "Effexor": ["37.5mg", "75mg", "150mg"],
    "Duloxetine": ["30mg", "60mg"],
    "Cymbalta": ["30mg", "60mg"],
    "Mirtazapine": ["15mg", "30mg", "45mg"],
    "Quetiapine": ["25mg", "50mg", "100mg", "200mg", "300mg", "400mg"],
    "Seroquel": ["25mg", "50mg", "100mg", "200mg", "300mg"],
    "Risperidone": ["0.5mg", "1mg", "2mg", "3mg", "4mg", "6mg"],
    "Risperdal": ["0.5mg", "1mg", "2mg", "3mg", "4mg"],
    "Olanzapine": ["2.5mg", "5mg", "10mg", "15mg", "20mg"],
    "Clonazepam": ["0.5mg", "1mg", "2mg"],
    "Rivotril": ["0.5mg", "1mg", "2mg"],
    "Alprazolam": ["0.25mg", "0.5mg", "1mg"],
    "Xanax": ["0.25mg", "0.5mg", "1mg"],
    "Diazepam": ["2mg", "5mg", "10mg"],
    "Zolpidem": ["5mg", "10mg"],
    "Stilnox": ["5mg", "10mg"],
    # ADHD
    "Methylphenidate": ["5mg", "10mg", "20mg"],
    "Ritalin": ["5mg", "10mg", "20mg"],
    "Concerta": ["18mg", "27mg", "36mg", "54mg"],
    # ריאות
    "Montelukast": ["4mg", "5mg", "10mg"],
    "Singulair": ["4mg", "5mg", "10mg"],
    # קיבה
    "Omeprazole": ["10mg", "20mg", "40mg"],
    "Losec": ["10mg", "20mg", "40mg"],
    "Esomeprazole": ["20mg", "40mg"],
    "Nexium": ["20mg", "40mg"],
    "Pantoprazole": ["20mg", "40mg"],
    "Controloc": ["20mg", "40mg"],
    # אוסטאופורוזיס
    "Alendronate": ["5mg", "10mg", "35mg", "70mg"],
    "Fosamax": ["5mg", "10mg", "35mg", "70mg"],
    # ויטמינים
    "Vitamin D3": ["400IU", "800IU", "1000IU", "2000IU", "4000IU"],
    "Vitamin B12": ["250mcg", "500mcg", "1000mcg"],
    "Folic Acid": ["400mcg", "5mg"],
    # כולסטרול ועוד
    "Allopurinol": ["100mg", "200mg", "300mg"],
    "Colchicine": ["0.5mg", "1mg"],
    "Methotrexate": ["2.5mg", "5mg", "7.5mg", "10mg", "15mg", "20mg", "25mg"],
    "Prednisolone": ["1mg", "5mg", "10mg", "20mg", "25mg", "30mg"],
    "Prednisone": ["1mg", "5mg", "10mg", "20mg", "25mg", "50mg"],
    "Methylprednisolone": ["4mg", "8mg", "16mg", "32mg"],
    "Hydroxychloroquine": ["200mg", "400mg"],
    "Plaquenil": ["200mg"],
    "Sildenafil": ["25mg", "50mg", "100mg"],
    "Viagra": ["25mg", "50mg", "100mg"],
    "Tadalafil": ["2.5mg", "5mg", "10mg", "20mg"],
    "Cialis": ["5mg", "10mg", "20mg"],
    # אונקולוגיה נפוצה (oral)
    "Capecitabine": ["150mg", "500mg"],
    "Xeloda": ["150mg", "500mg"],
    "Temozolomide": ["5mg", "20mg", "100mg", "140mg", "180mg", "250mg"],
    "Ibrance": ["75mg", "100mg", "125mg"],
    "Palbociclib": ["75mg", "100mg", "125mg"],
    "Kisqali": ["200mg"],
    "Ribociclib": ["200mg"],
    "Lynparza": ["100mg", "150mg"],
    "Olaparib": ["100mg", "150mg"],
    "Gleevec": ["100mg", "400mg"],
    "Imatinib": ["100mg", "400mg"],
    "Tagrisso": ["40mg", "80mg"],
    "Osimertinib": ["40mg", "80mg"],
    "Tamoxifen": ["10mg", "20mg"],
    "Nolvadex": ["10mg", "20mg"],
    "Letrozole": ["2.5mg"],
    "Femara": ["2.5mg"],
    "Anastrozole": ["1mg"],
    "Arimidex": ["1mg"],
    "Zytiga": ["250mg", "500mg"],
    "Abiraterone": ["250mg", "500mg"],
    "Xtandi": ["40mg"],
    "Enzalutamide": ["40mg"],
    "Revlimid": ["2.5mg", "5mg", "10mg", "15mg", "20mg", "25mg"],
}

# ── Seed ──────────────────────────────────────────────────────────────────────

def seed_drugs(db: Session) -> int:
    """Seed DrugEntry from drug_list.py. Returns count added."""
    existing = {row.name for row in db.query(models.DrugEntry.name).all()}
    added = 0
    seen_in_batch = set()
    for name, generic, form in DRUGS:
        if name in existing or name in seen_in_batch:
            continue
        seen_in_batch.add(name)
        hebrew = HEBREW_NAMES.get(name, "")
        dosages = COMMON_DOSAGES.get(name, [])
        db.add(models.DrugEntry(
            name=name, generic_name=generic, dosage_form=form,
            hebrew_name=hebrew or None,
            common_dosages=json.dumps(dosages, ensure_ascii=False) if dosages else None,
            source="local",
        ))
        added += 1
    if added:
        db.commit()
        logger.info(f"Drug seed: added {added} entries")
    return added


# ── openFDA update ────────────────────────────────────────────────────────────

# Drug classes to rotate through — each weekly run picks the next slice
_OPENFDA_QUERIES = [
    "cardiovascular", "antineoplastic", "antidiabetic",
    "anticoagulant", "antihypertensive", "antidepressant",
    "antipsychotic", "antibiotic", "immunosuppressant",
    "antirheumatic", "anticonvulsant", "analgesic",
    "respiratory", "gastrointestinal", "oncology",
]

_OPENFDA_BASE = "https://api.fda.gov/drug/label.json"


def _fetch_openfda_batch(query: str, limit: int = 100) -> list[dict]:
    """Fetch drug labels from openFDA for a category query."""
    try:
        resp = requests.get(
            _OPENFDA_BASE,
            params={"search": f"indications_and_usage:{query}", "limit": limit},
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("results", [])
    except Exception as e:
        logger.warning(f"openFDA fetch failed for '{query}': {e}")
        return []


def _parse_openfda_result(result: dict) -> dict | None:
    """Extract useful fields from an openFDA drug label."""
    openfda = result.get("openfda", {})
    brand_names = openfda.get("brand_name", [])
    generic_names = openfda.get("generic_name", [])
    dosage_forms = openfda.get("dosage_form", [])
    if not brand_names and not generic_names:
        return None
    name = brand_names[0].title() if brand_names else generic_names[0].title()
    generic = generic_names[0].title() if generic_names else None
    form = dosage_forms[0].title() if dosage_forms else None
    return {"name": name, "generic_name": generic, "dosage_form": form}


def run_drug_update(db: Session) -> dict:
    """
    Weekly update job: fetch new drugs from openFDA and upsert into DrugEntry.
    Returns summary dict.
    """
    log = models.DrugUpdateLog(status="running", source="openFDA")
    db.add(log)
    db.commit()
    db.refresh(log)

    added = 0
    updated = 0
    try:
        existing_names = {row.name.lower() for row in db.query(models.DrugEntry.name).all()}

        # Rotate through categories — use current week index
        week_num = datetime.now(timezone.utc).isocalendar()[1]
        query = _OPENFDA_QUERIES[week_num % len(_OPENFDA_QUERIES)]
        logger.info(f"Drug update: openFDA category = '{query}'")

        results = _fetch_openfda_batch(query, limit=200)
        for r in results:
            parsed = _parse_openfda_result(r)
            if not parsed or not parsed["name"]:
                continue
            name = parsed["name"]
            if name.lower() in existing_names:
                continue
            # Skip very long names (usually compound descriptions, not drug names)
            if len(name) > 60:
                continue
            hebrew = HEBREW_NAMES.get(name, None)
            dosages = COMMON_DOSAGES.get(name, [])
            db.add(models.DrugEntry(
                name=name,
                generic_name=parsed.get("generic_name"),
                dosage_form=parsed.get("dosage_form"),
                hebrew_name=hebrew,
                common_dosages=json.dumps(dosages, ensure_ascii=False) if dosages else None,
                source="openfda",
            ))
            existing_names.add(name.lower())
            added += 1

        db.commit()
        log.status = "success"
        log.drugs_added = added
        log.drugs_updated = updated
        log.completed_at = datetime.now(timezone.utc)
        log.message = f"Fetched category '{query}': {added} new, {updated} updated"
        db.commit()
        logger.info(f"Drug update complete: +{added} new drugs")
        return {"status": "success", "added": added, "updated": updated, "category": query}
    except Exception as e:
        log.status = "failed"
        log.message = str(e)
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.error(f"Drug update failed: {e}")
        return {"status": "failed", "error": str(e)}
