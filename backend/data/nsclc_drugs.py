# -*- coding: utf-8 -*-
"""
15 תרופות NSCLC עם פרטי גישה, MSL, קו טיפול והתוויה מולקולרית.
מבוסס על: ניהול ארוע רפואי סרטן ריאה.xlsx
"""

NSCLC_DRUGS = [
    {
        "name":                 "Tagrisso",
        "generic_name":         "Osimertinib",
        "hebrew_name":          "טאגריסו",
        "dosage_form":          "tablet",
        "common_dosages":       ["80mg", "40mg"],
        "msl_phone":            "09-7406527",
        "access_type":          "basket",
        "treatment_line":       "1st",
        "indication_oncology":  ["EGFR", "EGFR_exon19del", "EGFR_L858R"],
        "openfda_indication":   "EGFR-mutated NSCLC (Exon 19 del / L858R) — adjuvant + metastatic",
    },
    {
        "name":                 "Rybrevant",
        "generic_name":         "Amivantamab",
        "hebrew_name":          "ריברוונט",
        "dosage_form":          "injection",
        "common_dosages":       ["1050mg IV", "1400mg IV"],
        "msl_phone":            "09-9590100",
        "access_type":          "compassion",
        "treatment_line":       "1st",
        "indication_oncology":  ["EGFR", "EGFR_exon20ins"],
        "openfda_indication":   "EGFR Exon 20 insertion NSCLC",
    },
    {
        "name":                 "Zongertinib",
        "generic_name":         "Zongertinib",
        "hebrew_name":          "זונגרטיניב",
        "dosage_form":          "tablet",
        "common_dosages":       ["120mg", "240mg"],
        "msl_phone":            "09-9730500",
        "access_type":          "eap",
        "treatment_line":       "1st",
        "indication_oncology":  ["HER2"],
        "openfda_indication":   "HER2-mutated NSCLC — EAP / Named Patient",
    },
    {
        "name":                 "Enhertu",
        "generic_name":         "Trastuzumab deruxtecan",
        "hebrew_name":          "אנהרטו",
        "dosage_form":          "injection",
        "common_dosages":       ["5.4mg/kg IV q3w", "6.4mg/kg IV q3w"],
        "msl_phone":            "09-7406527",
        "access_type":          "compassion",
        "treatment_line":       "2nd",
        "indication_oncology":  ["HER2"],
        "openfda_indication":   "HER2-overexpressing NSCLC (ADC) — CT surveillance q6-8w",
    },
    {
        "name":                 "Lumakras",
        "generic_name":         "Sotorasib",
        "hebrew_name":          "לומאקראס",
        "dosage_form":          "tablet",
        "common_dosages":       ["960mg", "240mg"],
        "msl_phone":            "03-7696000",
        "access_type":          "basket",
        "treatment_line":       "2nd",
        "indication_oncology":  ["KRAS_G12C"],
        "openfda_indication":   "KRAS G12C-mutated NSCLC after prior platinum chemotherapy",
    },
    {
        "name":                 "Alecensa",
        "generic_name":         "Alectinib",
        "hebrew_name":          "אלקנסה",
        "dosage_form":          "capsule",
        "common_dosages":       ["600mg BID"],
        "msl_phone":            "09-9710111",
        "access_type":          "basket",
        "treatment_line":       "1st",
        "indication_oncology":  ["ALK"],
        "openfda_indication":   "ALK-positive NSCLC — first-line",
    },
    {
        "name":                 "Retevmo",
        "generic_name":         "Selpercatinib",
        "hebrew_name":          "רטבמו",
        "dosage_form":          "capsule",
        "common_dosages":       ["120mg BID", "160mg BID"],
        "msl_phone":            "09-9526969",
        "access_type":          "basket",
        "treatment_line":       "1st",
        "indication_oncology":  ["RET"],
        "openfda_indication":   "RET fusion-positive NSCLC — requires NGS RNA",
    },
    {
        "name":                 "Tabrecta",
        "generic_name":         "Capmatinib",
        "hebrew_name":          "טאברקטה",
        "dosage_form":          "tablet",
        "common_dosages":       ["400mg BID"],
        "msl_phone":            "",
        "access_type":          "compassion",
        "treatment_line":       "1st",
        "indication_oncology":  ["MET_exon14"],
        "openfda_indication":   "MET Exon 14 skipping NSCLC",
    },
    {
        "name":                 "Keytruda",
        "generic_name":         "Pembrolizumab",
        "hebrew_name":          "קיטרודה",
        "dosage_form":          "injection",
        "common_dosages":       ["200mg IV q3w", "400mg IV q6w"],
        "msl_phone":            "03-9395050",
        "access_type":          "basket",
        "treatment_line":       "1st",
        "indication_oncology":  ["PD-L1"],
        "openfda_indication":   "PD-L1 ≥50% NSCLC — IHC required; monotherapy or combo",
    },
    {
        "name":                 "Imfinzi",
        "generic_name":         "Durvalumab",
        "hebrew_name":          "אימפינזי",
        "dosage_form":          "injection",
        "common_dosages":       ["10mg/kg IV q2w", "1500mg IV q4w"],
        "msl_phone":            "09-7406527",
        "access_type":          "basket",
        "treatment_line":       "maintenance",
        "indication_oncology":  ["PD-L1"],
        "openfda_indication":   "Stage III unresectable NSCLC after CRT — maintenance",
    },
    {
        "name":                 "Lorbrena",
        "generic_name":         "Lorlatinib",
        "hebrew_name":          "לורברנה",
        "dosage_form":          "tablet",
        "common_dosages":       ["100mg QD"],
        "msl_phone":            "",
        "access_type":          "basket",
        "treatment_line":       "1st",
        "indication_oncology":  ["ALK"],
        "openfda_indication":   "ALK-positive NSCLC — first-line or after crizotinib/alectinib",
    },
    {
        "name":                 "Tepmetko",
        "generic_name":         "Tepotinib",
        "hebrew_name":          "טפמטקו",
        "dosage_form":          "tablet",
        "common_dosages":       ["450mg QD"],
        "msl_phone":            "",
        "access_type":          "eap",
        "treatment_line":       "1st",
        "indication_oncology":  ["MET_exon14"],
        "openfda_indication":   "MET Exon 14 skipping NSCLC (alternative to Tabrecta)",
    },
    {
        "name":                 "Gavreto",
        "generic_name":         "Pralsetinib",
        "hebrew_name":          "גברטו",
        "dosage_form":          "capsule",
        "common_dosages":       ["400mg QD"],
        "msl_phone":            "",
        "access_type":          "eap",
        "treatment_line":       "1st",
        "indication_oncology":  ["RET"],
        "openfda_indication":   "RET fusion-positive NSCLC — alternative to Retevmo",
    },
    {
        "name":                 "Zykadia",
        "generic_name":         "Ceritinib",
        "hebrew_name":          "זיקדיה",
        "dosage_form":          "capsule",
        "common_dosages":       ["450mg QD with food"],
        "msl_phone":            "",
        "access_type":          "basket",
        "treatment_line":       "2nd",
        "indication_oncology":  ["ALK"],
        "openfda_indication":   "ALK-positive NSCLC after crizotinib resistance",
    },
    {
        "name":                 "Ryvayda",
        "generic_name":         "Lazertinib",
        "hebrew_name":          "ריוויידה",
        "dosage_form":          "tablet",
        "common_dosages":       ["240mg QD"],
        "msl_phone":            "09-9590100",
        "access_type":          "eap",
        "treatment_line":       "1st",
        "indication_oncology":  ["EGFR", "EGFR_exon19del", "EGFR_L858R"],
        "openfda_indication":   "EGFR-mutated NSCLC — used in Rybrevant+Lazertinib combo",
    },
]


def seed_nsclc_drugs(db) -> int:
    """
    Upsert the 15 NSCLC drugs into DrugEntry.
    Updates msl_phone, access_type, treatment_line, indication_oncology
    on existing entries.  Returns count of new drugs added.
    """
    import json
    import models

    existing = {row.name: row for row in db.query(models.DrugEntry).filter(
        models.DrugEntry.name.in_([d["name"] for d in NSCLC_DRUGS])
    ).all()}

    added = 0
    for drug in NSCLC_DRUGS:
        ind_json = json.dumps(drug["indication_oncology"], ensure_ascii=False)
        dosages_json = json.dumps(drug["common_dosages"], ensure_ascii=False)

        if drug["name"] in existing:
            entry = existing[drug["name"]]
            entry.msl_phone           = drug["msl_phone"] or None
            entry.access_type         = drug["access_type"]
            entry.treatment_line      = drug["treatment_line"]
            entry.indication_oncology = ind_json
            entry.openfda_indication  = drug.get("openfda_indication")
        else:
            db.add(models.DrugEntry(
                name=drug["name"],
                generic_name=drug["generic_name"],
                hebrew_name=drug["hebrew_name"],
                dosage_form=drug["dosage_form"],
                common_dosages=dosages_json,
                msl_phone=drug["msl_phone"] or None,
                access_type=drug["access_type"],
                treatment_line=drug["treatment_line"],
                indication_oncology=ind_json,
                openfda_indication=drug.get("openfda_indication"),
                source="nsclc_seed",
                is_active=True,
            ))
            added += 1

    if added or existing:
        db.commit()

    return added
