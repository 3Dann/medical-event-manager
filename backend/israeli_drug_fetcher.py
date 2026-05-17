"""
מאגר תרופות ישראלי — Israeli Drug Database Module
מקור: מאגר תרופות משרד הבריאות (israelidrugs.health.gov.il) + סל הבריאות
עדכון אוטומטי: שבועי מ-openFDA + שנתי בעת עדכון סל הבריאות

מסלול ב׳ (scrapin israelidrugs) חסום ע"י WAF של Azure —
לכן מבוסס על נתונים סטטיים מקוריטים + openFDA לפרטים.
"""

import logging
import json
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("israeli_drugs")

# ═══════════════════════════════════════════════════════════════════════════════
# מאגר הנתונים הישראלי — sal habriut + סוג מרשם + קטגוריית הריון
# מקור: רשימת סל תרופות 2024-2025, אתר בית המרקחת, israeldrugs.health.gov.il
# פורמט: שם_תרופה → {sal, copay, rx, otc, generics, preg, atc, category_he}
# ═══════════════════════════════════════════════════════════════════════════════

# sal:     in_basket | partial | specific_indication | not_in_basket
# copay:   none | minimal | fixed | percentage
# rx:      otc | prescription | restricted | narcotic
# preg:    A | B | C | D | X | N/A

ISRAELI_DRUG_DATA: dict[str, dict] = {

    # ── כאב / חום / NSAID ────────────────────────────────────────────────────
    "Acamol":           {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"N02BE01","cat":"כאב/חום"},
    "Paracetamol":      {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"N02BE01","cat":"כאב/חום"},
    "Optalgin":         {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"N02BB02","cat":"כאב/חום"},
    "Dipyrone":         {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"N02BB02","cat":"כאב/חום"},
    "Metamizole":       {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"N02BB02","cat":"כאב/חום"},
    "Ibufen":           {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"M01AE01","cat":"NSAID"},
    "Ibuprofen":        {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"M01AE01","cat":"NSAID"},
    "Advil":            {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"M01AE01","cat":"NSAID"},
    "Voltaren":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M01AB05","cat":"NSAID"},
    "Diclofenac":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M01AB05","cat":"NSAID"},
    "Arcoxia":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"M01AH05","cat":"NSAID"},
    "Etoricoxib":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M01AH05","cat":"NSAID"},
    "Celebrex":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M01AH01","cat":"NSAID"},
    "Celecoxib":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M01AH01","cat":"NSAID"},
    "Naproxen":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M01AE02","cat":"NSAID"},
    "Aspirin":          {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"D","atc":"B01AC06","cat":"כאב/אנטי-קואגולנט"},
    "Tramadol":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N02AX02","cat":"אופיאט קל"},
    "Tramadex":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N02AX02","cat":"אופיאט קל"},

    # ── אופיאטים חזקים ──────────────────────────────────────────────────────
    "Morphine":         {"sal":"in_basket","copay":"fixed","rx":"narcotic","otc":False,"gen":True,"preg":"C","atc":"N02AA01","cat":"אופיאט"},
    "Oxycontin":        {"sal":"in_basket","copay":"percentage","rx":"narcotic","otc":False,"gen":True,"preg":"B","atc":"N02AA05","cat":"אופיאט"},
    "Oxycodone":        {"sal":"in_basket","copay":"percentage","rx":"narcotic","otc":False,"gen":True,"preg":"B","atc":"N02AA05","cat":"אופיאט"},
    "Fentanyl":         {"sal":"in_basket","copay":"percentage","rx":"narcotic","otc":False,"gen":True,"preg":"C","atc":"N02AB03","cat":"אופיאט"},
    "Durogesic":        {"sal":"in_basket","copay":"percentage","rx":"narcotic","otc":False,"gen":True,"preg":"C","atc":"N02AB03","cat":"אופיאט"},
    "Buprenorphine":    {"sal":"in_basket","copay":"percentage","rx":"narcotic","otc":False,"gen":True,"preg":"C","atc":"N02AE01","cat":"אופיאט"},
    "Pregabalin":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N03AX16","cat":"עצבי/כאב"},
    "Lyrica":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N03AX16","cat":"עצבי/כאב"},
    "Gabapentin":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N03AX12","cat":"עצבי/כאב"},
    "Neurontin":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N03AX12","cat":"עצבי/כאב"},

    # ── לחץ דם — ACE / ARB ──────────────────────────────────────────────────
    "Enalapril":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09AA02","cat":"לחץ דם ACE"},
    "Ramipril":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09AA05","cat":"לחץ דם ACE"},
    "Tritace":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09AA05","cat":"לחץ דם ACE"},
    "Lisinopril":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09AA03","cat":"לחץ דם ACE"},
    "Perindopril":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09AA04","cat":"לחץ דם ACE"},
    "Captopril":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09AA01","cat":"לחץ דם ACE"},
    "Losartan":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09CA01","cat":"לחץ דם ARB"},
    "Cozaar":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09CA01","cat":"לחץ דם ARB"},
    "Valsartan":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09CA03","cat":"לחץ דם ARB"},
    "Irbesartan":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09CA04","cat":"לחץ דם ARB"},
    "Candesartan":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09CA06","cat":"לחץ דם ARB"},
    "Olmesartan":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C09CA08","cat":"לחץ דם ARB"},

    # ── לחץ דם — חוסמי בטא ──────────────────────────────────────────────────
    "Bisoprolol":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AB07","cat":"לחץ דם Beta"},
    "Concor":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AB07","cat":"לחץ דם Beta"},
    "Metoprolol":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AB02","cat":"לחץ דם Beta"},
    "Betaloc":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AB02","cat":"לחץ דם Beta"},
    "Atenolol":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C07AB03","cat":"לחץ דם Beta"},
    "Carvedilol":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AG02","cat":"לחץ דם Beta"},
    "Propranolol":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AA05","cat":"לחץ דם Beta"},
    "Nebivolol":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C07AB12","cat":"לחץ דם Beta"},

    # ── לחץ דם — חוסמי סידן ─────────────────────────────────────────────────
    "Amlodipine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08CA01","cat":"לחץ דם CCB"},
    "Norvasc":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08CA01","cat":"לחץ דם CCB"},
    "Amlopin":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08CA01","cat":"לחץ דם CCB"},
    "Nifedipine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08CA05","cat":"לחץ דם CCB"},
    "Diltiazem":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08DB01","cat":"לחץ דם CCB"},
    "Verapamil":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08DA01","cat":"לחץ דם CCB"},
    "Felodipine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C08CA02","cat":"לחץ דם CCB"},

    # ── משתנים ──────────────────────────────────────────────────────────────
    "Furosemide":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C03CA01","cat":"משתן"},
    "Lasix":            {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C03CA01","cat":"משתן"},
    "Hydrochlorothiazide":{"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"C03AA03","cat":"משתן"},
    "Spironolactone":   {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C03DA01","cat":"משתן"},
    "Aldactone":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C03DA01","cat":"משתן"},
    "Indapamide":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"C03BA11","cat":"משתן"},

    # ── כולסטרול — סטטינים ──────────────────────────────────────────────────
    "Atorvastatin":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA05","cat":"סטטין"},
    "Lipitor":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA05","cat":"סטטין"},
    "Simvastatin":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA01","cat":"סטטין"},
    "Zocor":            {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA01","cat":"סטטין"},
    "Rosuvastatin":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA07","cat":"סטטין"},
    "Crestor":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA07","cat":"סטטין"},
    "Pravastatin":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA03","cat":"סטטין"},
    "Fluvastatin":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"C10AA04","cat":"סטטין"},
    "Ezetimibe":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C10AX09","cat":"כולסטרול"},
    "Ezetrol":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C10AX09","cat":"כולסטרול"},
    "Fenofibrate":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C10AB05","cat":"כולסטרול"},

    # ── קרישת דם / אנטי-קואגולנטים ─────────────────────────────────────────
    "Warfarin":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"B01AA03","cat":"אנטי-קואגולנט"},
    "Coumadin":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"B01AA03","cat":"אנטי-קואגולנט"},
    "Clexane":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"B01AB05","cat":"אנטי-קואגולנט"},
    "Enoxaparin":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"B01AB05","cat":"אנטי-קואגולנט"},
    "Xarelto":          {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"B01AF01","cat":"אנטי-קואגולנט NOAC"},
    "Rivaroxaban":      {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"B01AF01","cat":"אנטי-קואגולנט NOAC"},
    "Eliquis":          {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"B01AF02","cat":"אנטי-קואגולנט NOAC"},
    "Apixaban":         {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"B01AF02","cat":"אנטי-קואגולנט NOAC"},
    "Pradaxa":          {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"B01AE07","cat":"אנטי-קואגולנט NOAC"},
    "Dabigatran":       {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"B01AE07","cat":"אנטי-קואגולנט NOAC"},
    "Clopidogrel":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"B01AC04","cat":"אנטי-טסיות"},
    "Plavix":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"B01AC04","cat":"אנטי-טסיות"},
    "Ticagrelor":       {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"B01AC24","cat":"אנטי-טסיות"},
    "Brilinta":         {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"B01AC24","cat":"אנטי-טסיות"},

    # ── סוכרת ───────────────────────────────────────────────────────────────
    "Metformin":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10BA02","cat":"סוכרת"},
    "Glucophage":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10BA02","cat":"סוכרת"},
    "Glibenclamide":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BB01","cat":"סוכרת"},
    "Glicazide":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BB09","cat":"סוכרת"},
    "Glucotrol":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BB07","cat":"סוכרת"},
    "Glipizide":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BB07","cat":"סוכרת"},
    "Sitagliptin":      {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10BH01","cat":"סוכרת DPP4"},
    "Januvia":          {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10BH01","cat":"סוכרת DPP4"},
    "Saxagliptin":      {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10BH03","cat":"סוכרת DPP4"},
    "Empagliflozin":    {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BK03","cat":"סוכרת SGLT2"},
    "Jardiance":        {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BK03","cat":"סוכרת SGLT2"},
    "Dapagliflozin":    {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BK01","cat":"סוכרת SGLT2"},
    "Forxiga":          {"sal":"partial","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10BK01","cat":"סוכרת SGLT2"},
    "Semaglutide":      {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"A10BJ06","cat":"סוכרת GLP1"},
    "Ozempic":          {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"A10BJ06","cat":"סוכרת GLP1"},
    "Liraglutide":      {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"A10BJ02","cat":"סוכרת GLP1"},
    "Victoza":          {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"A10BJ02","cat":"סוכרת GLP1"},
    "Insulin":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":False,"preg":"B","atc":"A10AB01","cat":"אינסולין"},
    "Lantus":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A10AE04","cat":"אינסולין"},
    "Tresiba":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":False,"preg":"C","atc":"A10AE06","cat":"אינסולין"},
    "Novorapid":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10AB05","cat":"אינסולין"},
    "Humalog":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A10AB04","cat":"אינסולין"},

    # ── קיבה / עיכול ────────────────────────────────────────────────────────
    "Omeprazole":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A02BC01","cat":"PPI"},
    "Losec":            {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A02BC01","cat":"PPI"},
    "Esomeprazole":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A02BC05","cat":"PPI"},
    "Nexium":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A02BC05","cat":"PPI"},
    "Pantoprazole":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A02BC02","cat":"PPI"},
    "Controloc":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A02BC02","cat":"PPI"},
    "Lansoprazole":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A02BC03","cat":"PPI"},
    "Rabeprazole":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A02BC04","cat":"PPI"},
    "Ranitidine":       {"sal":"not_in_basket","copay":"none","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"A02BA02","cat":"H2 Blocker"},
    "Famotidine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A02BA03","cat":"H2 Blocker"},
    "Domperidone":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A03FA03","cat":"קיבה"},
    "Motilium":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A03FA03","cat":"קיבה"},
    "Ondansetron":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A04AA01","cat":"אנטי-בחילה"},
    "Zofran":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A04AA01","cat":"אנטי-בחילה"},
    "Buscopan":         {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"A03BB01","cat":"התכווצויות"},
    "Hyoscine":         {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"A03BB01","cat":"התכווצויות"},

    # ── אנטיביוטיקה ─────────────────────────────────────────────────────────
    "Amoxicillin":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01CA04","cat":"אנטיביוטיקה"},
    "Augmentin":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01CR02","cat":"אנטיביוטיקה"},
    "Amoxicillin-Clavulanate":{"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01CR02","cat":"אנטיביוטיקה"},
    "Azithromycin":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01FA10","cat":"אנטיביוטיקה"},
    "Zithromax":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01FA10","cat":"אנטיביוטיקה"},
    "Clarithromycin":   {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01FA09","cat":"אנטיביוטיקה"},
    "Klacid":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01FA09","cat":"אנטיביוטיקה"},
    "Doxycycline":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"J01AA02","cat":"אנטיביוטיקה"},
    "Ciprofloxacin":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01MA02","cat":"אנטיביוטיקה"},
    "Cipro":            {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01MA02","cat":"אנטיביוטיקה"},
    "Levofloxacin":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01MA12","cat":"אנטיביוטיקה"},
    "Trimethoprim-Sulfamethoxazole":{"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01EE01","cat":"אנטיביוטיקה"},
    "Bactrim":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J01EE01","cat":"אנטיביוטיקה"},
    "Cephalexin":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01DB01","cat":"אנטיביוטיקה"},
    "Cefalexin":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01DB01","cat":"אנטיביוטיקה"},
    "Cefaclor":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01DC04","cat":"אנטיביוטיקה"},
    "Nitrofurantoin":   {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01XE01","cat":"אנטיביוטיקה UTI"},
    "Macrobid":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01XE01","cat":"אנטיביוטיקה UTI"},
    "Metronidazole":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01XD01","cat":"אנטיביוטיקה"},
    "Flagyl":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01XD01","cat":"אנטיביוטיקה"},
    "Penicillin":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"J01CE02","cat":"אנטיביוטיקה"},

    # ── אנטי-פטרייתי ────────────────────────────────────────────────────────
    "Fluconazole":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"J02AC01","cat":"אנטי-פטריית"},
    "Diflucan":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"J02AC01","cat":"אנטי-פטריית"},
    "Nystatin":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A07AA02","cat":"אנטי-פטריית"},
    "Itraconazole":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"J02AC02","cat":"אנטי-פטריית"},

    # ── נשימה / אסתמה / ריאות ───────────────────────────────────────────────
    "Salbutamol":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03AC02","cat":"אסתמה SABA"},
    "Ventolin":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03AC02","cat":"אסתמה SABA"},
    "Bricanyl":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"R03AC03","cat":"אסתמה SABA"},
    "Terbutaline":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"R03AC03","cat":"אסתמה SABA"},
    "Salmeterol":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03AC12","cat":"אסתמה LABA"},
    "Formoterol":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03AC13","cat":"אסתמה LABA"},
    "Budesonide":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"R03BA02","cat":"אסתמה ICS"},
    "Pulmicort":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"R03BA02","cat":"אסתמה ICS"},
    "Fluticasone":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03BA05","cat":"אסתמה ICS"},
    "Flixotide":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03BA05","cat":"אסתמה ICS"},
    "Seretide":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03AK06","cat":"אסתמה ICS+LABA"},
    "Symbicort":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03AK07","cat":"אסתמה ICS+LABA"},
    "Montelukast":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"R03DC03","cat":"אסתמה LTRA"},
    "Singulair":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"R03DC03","cat":"אסתמה LTRA"},
    "Tiotropium":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03BB04","cat":"COPD LAMA"},
    "Spiriva":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03BB04","cat":"COPD LAMA"},
    "Theophylline":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"R03DA04","cat":"אסתמה/COPD"},

    # ── אנטי-היסטמין / אלרגיה ───────────────────────────────────────────────
    "Cetirizine":       {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"R06AE07","cat":"אנטיהיסטמין"},
    "Zyrtec":           {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"R06AE07","cat":"אנטיהיסטמין"},
    "Loratadine":       {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"R06AX13","cat":"אנטיהיסטמין"},
    "Claritine":        {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"R06AX13","cat":"אנטיהיסטמין"},
    "Fexofenadine":     {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"R06AX26","cat":"אנטיהיסטמין"},
    "Telfast":          {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"R06AX26","cat":"אנטיהיסטמין"},
    "Desloratadine":    {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"R06AX27","cat":"אנטיהיסטמין"},
    "Aerius":           {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"R06AX27","cat":"אנטיהיסטמין"},

    # ── פסיכיאטריה / נוירולוגיה ──────────────────────────────────────────────
    "Escitalopram":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AB10","cat":"SSRI"},
    "Cipralex":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AB10","cat":"SSRI"},
    "Sertraline":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AB06","cat":"SSRI"},
    "Zoloft":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AB06","cat":"SSRI"},
    "Fluoxetine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AB03","cat":"SSRI"},
    "Prozac":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AB03","cat":"SSRI"},
    "Paroxetine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N06AB05","cat":"SSRI"},
    "Venlafaxine":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AX16","cat":"SNRI"},
    "Effexor":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AX16","cat":"SNRI"},
    "Duloxetine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AX21","cat":"SNRI"},
    "Cymbalta":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AX21","cat":"SNRI"},
    "Mirtazapine":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AX11","cat":"נוגד דיכאון"},
    "Amitriptyline":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06AA09","cat":"TCA"},
    "Clonazepam":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N03AE01","cat":"בנזודיאזפין"},
    "Rivotril":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N03AE01","cat":"בנזודיאזפין"},
    "Alprazolam":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N05BA12","cat":"בנזודיאזפין"},
    "Diazepam":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N05BA01","cat":"בנזודיאזפין"},
    "Valium":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N05BA01","cat":"בנזודיאזפין"},
    "Zolpidem":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N05CF02","cat":"שינה"},
    "Stilnox":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N05CF02","cat":"שינה"},
    "Risperidone":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N05AX08","cat":"אנטיפסיכוטי"},
    "Olanzapine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N05AH03","cat":"אנטיפסיכוטי"},
    "Quetiapine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N05AH04","cat":"אנטיפסיכוטי"},
    "Seroquel":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N05AH04","cat":"אנטיפסיכוטי"},
    "Lithium":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N05AN01","cat":"מאנייה"},
    "Valproate":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"N03AG01","cat":"אפילפסיה"},
    "Depakine":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"X","atc":"N03AG01","cat":"אפילפסיה"},
    "Carbamazepine":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N03AF01","cat":"אפילפסיה"},
    "Tegretol":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"N03AF01","cat":"אפילפסיה"},
    "Levetiracetam":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N03AX14","cat":"אפילפסיה"},
    "Keppra":           {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N03AX14","cat":"אפילפסיה"},
    "Methylphenidate":  {"sal":"in_basket","copay":"fixed","rx":"restricted","otc":False,"gen":True,"preg":"C","atc":"N06BA04","cat":"ADHD"},
    "Ritalin":          {"sal":"in_basket","copay":"fixed","rx":"restricted","otc":False,"gen":True,"preg":"C","atc":"N06BA04","cat":"ADHD"},
    "Concerta":         {"sal":"in_basket","copay":"fixed","rx":"restricted","otc":False,"gen":True,"preg":"C","atc":"N06BA04","cat":"ADHD"},
    "Donepezil":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06DA02","cat":"אלצהיימר"},
    "Aricept":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"N06DA02","cat":"אלצהיימר"},
    "Memantine":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"N06DX01","cat":"אלצהיימר"},

    # ── בלוטת התריס ──────────────────────────────────────────────────────────
    "Levothyroxine":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"A","atc":"H03AA01","cat":"בלוטת התריס"},
    "Eltroxin":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"A","atc":"H03AA01","cat":"בלוטת התריס"},
    "Methimazole":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"H03BB02","cat":"בלוטת התריס"},
    "Propylthiouracil": {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"H03BA02","cat":"בלוטת התריס"},

    # ── עצמות / אוסטאופורוזיס ───────────────────────────────────────────────
    "Alendronate":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M05BA04","cat":"אוסטאופורוזיס"},
    "Fosamax":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M05BA04","cat":"אוסטאופורוזיס"},
    "Risedronate":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M05BA07","cat":"אוסטאופורוזיס"},
    "Zoledronic acid":  {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"M05BA08","cat":"אוסטאופורוזיס"},
    "Calcium":          {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"C","atc":"A12AA20","cat":"ויטמין"},
    "Vitamin D":        {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"A","atc":"A11CC05","cat":"ויטמין"},
    "Cholecalciferol":  {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"A","atc":"A11CC05","cat":"ויטמין"},

    # ── גסטרו / IBD / כבד ────────────────────────────────────────────────────
    "Mesalazine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A07EC02","cat":"IBD"},
    "Pentasa":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"A07EC02","cat":"IBD"},
    "Azathioprine":     {"sal":"in_basket","copay":"fixed","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L04AX01","cat":"אימוני IBD"},
    "Infliximab":       {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"B","atc":"L04AB02","cat":"Biologic IBD"},
    "Remicade":         {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"B","atc":"L04AB02","cat":"Biologic IBD"},
    "Adalimumab":       {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"B","atc":"L04AB04","cat":"Biologic IBD"},
    "Humira":           {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"B","atc":"L04AB04","cat":"Biologic IBD"},
    "Ursodiol":         {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"B","atc":"A05AA02","cat":"כבד"},
    "Lactulose":        {"sal":"in_basket","copay":"minimal","rx":"otc","otc":True,"gen":True,"preg":"B","atc":"A06AD11","cat":"עצירות"},

    # ── אונקולוגיה — טיפולים ממוקדים / אימונותרפיה ──────────────────────────
    "Keytruda":         {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"D","atc":"L01FF02","cat":"אימונותרפיה"},
    "Pembrolizumab":    {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"D","atc":"L01FF02","cat":"אימונותרפיה"},
    "Opdivo":           {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"D","atc":"L01FF01","cat":"אימונותרפיה"},
    "Nivolumab":        {"sal":"specific_indication","copay":"percentage","rx":"prescription","otc":False,"gen":False,"preg":"D","atc":"L01FF01","cat":"אימונותרפיה"},
    "Tagrisso":         {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EB04","cat":"EGFR NSCLC"},
    "Osimertinib":      {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EB04","cat":"EGFR NSCLC"},
    "Iressa":           {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01EB01","cat":"EGFR NSCLC"},
    "Gefitinib":        {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01EB01","cat":"EGFR NSCLC"},
    "Tarceva":          {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01EB02","cat":"EGFR NSCLC"},
    "Erlotinib":        {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01EB02","cat":"EGFR NSCLC"},
    "Xalkori":          {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EX03","cat":"ALK NSCLC"},
    "Crizotinib":       {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EX03","cat":"ALK NSCLC"},
    "Alecensa":         {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EX09","cat":"ALK NSCLC"},
    "Alectinib":        {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EX09","cat":"ALK NSCLC"},
    "Herceptin":        {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01FD01","cat":"HER2"},
    "Trastuzumab":      {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01FD01","cat":"HER2"},
    "Perjeta":          {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01FD03","cat":"HER2"},
    "Pertuzumab":       {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01FD03","cat":"HER2"},
    "Avastin":          {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01FG01","cat":"אנגיוגנזה"},
    "Bevacizumab":      {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01FG01","cat":"אנגיוגנזה"},
    "Ibrutinib":        {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EL01","cat":"CLL/לימפומה"},
    "Imbruvica":        {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":False,"preg":"D","atc":"L01EL01","cat":"CLL/לימפומה"},

    # ── כימותרפיה קלאסית ────────────────────────────────────────────────────
    "Carboplatin":      {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01XA02","cat":"כימותרפיה"},
    "Cisplatin":        {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01XA01","cat":"כימותרפיה"},
    "Paclitaxel":       {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01CD01","cat":"כימותרפיה"},
    "Taxol":            {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01CD01","cat":"כימותרפיה"},
    "Docetaxel":        {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01CD02","cat":"כימותרפיה"},
    "Gemcitabine":      {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01BC05","cat":"כימותרפיה"},
    "Pemetrexed":       {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01BA04","cat":"כימותרפיה"},
    "Cyclophosphamide": {"sal":"specific_indication","copay":"none","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01AA01","cat":"כימותרפיה"},
    "Capecitabine":     {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01BC06","cat":"כימותרפיה"},
    "Xeloda":           {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"D","atc":"L01BC06","cat":"כימותרפיה"},

    # ── אחר / שונות ──────────────────────────────────────────────────────────
    "Prednisone":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"H02AB07","cat":"קורטיקוסטרואיד"},
    "Prednisolone":     {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"H02AB06","cat":"קורטיקוסטרואיד"},
    "Dexamethasone":    {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"H02AB02","cat":"קורטיקוסטרואיד"},
    "Methylprednisolone":{"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"H02AB04","cat":"קורטיקוסטרואיד"},
    "Allopurinol":      {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M04AA01","cat":"גאוט"},
    "Colchicine":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"M04AC01","cat":"גאוט"},
    "Digoxin":          {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C01AA05","cat":"לב"},
    "Amiodarone":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C01BD01","cat":"אריתמיה"},
    "Cordarone":        {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"D","atc":"C01BD01","cat":"אריתמיה"},
    "Nitroglycerin":    {"sal":"in_basket","copay":"minimal","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C01DA02","cat":"אנגינה"},
    "Isosorbide":       {"sal":"in_basket","copay":"fixed","rx":"prescription","otc":False,"gen":True,"preg":"C","atc":"C01DA08","cat":"אנגינה"},
    "Iron":             {"sal":"in_basket","copay":"minimal","rx":"prescription","otc":False,"gen":True,"preg":"A","atc":"B03AA07","cat":"ברזל"},
    "Ferrous sulfate":  {"sal":"in_basket","copay":"minimal","rx":"prescription","otc":False,"gen":True,"preg":"A","atc":"B03AA07","cat":"ברזל"},
    "Folic acid":       {"sal":"in_basket","copay":"none","rx":"otc","otc":True,"gen":True,"preg":"A","atc":"B03BB01","cat":"ויטמין"},
    "B12":              {"sal":"in_basket","copay":"minimal","rx":"prescription","otc":False,"gen":True,"preg":"A","atc":"B03BA01","cat":"ויטמין"},
    "Hydroxocobalamin": {"sal":"in_basket","copay":"minimal","rx":"prescription","otc":False,"gen":True,"preg":"A","atc":"B03BA03","cat":"ויטמין"},
    "Erythropoietin":   {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"C","atc":"B03XA01","cat":"אנמיה"},
    "Cyclosporine":     {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"C","atc":"L04AD01","cat":"אימוני"},
    "Tacrolimus":       {"sal":"specific_indication","copay":"percentage","rx":"restricted","otc":False,"gen":True,"preg":"C","atc":"L04AD02","cat":"אימוני"},
}


# ═══════════════════════════════════════════════════════════════════════════════
# פונקציות עזר
# ═══════════════════════════════════════════════════════════════════════════════

def _normalize(name: str) -> str:
    """נרמול שם תרופה לצורך זיהוי כפילויות."""
    import re
    return re.sub(r'[\s\-_/]+', '', name.lower().strip())


def _names_are_duplicate(a: str, b: str) -> bool:
    """האם שני שמות הם כנראה אותה תרופה (כפילות)."""
    na, nb = _normalize(a), _normalize(b)
    if na == nb:
        return True
    # prefix match ≥ 6 תווים
    min_len = min(len(na), len(nb))
    if min_len >= 6 and (na.startswith(nb[:6]) or nb.startswith(na[:6])):
        return True
    return False


# ═══════════════════════════════════════════════════════════════════════════════
# עדכון מסד הנתונים מהמאגר הישראלי
# ═══════════════════════════════════════════════════════════════════════════════

def update_israeli_drug_data(db, force: bool = False) -> dict:
    """
    מעדכן DrugEntry בנתוני סל הבריאות הישראלי.
    מסנן כפילויות לפי שם מנורמל.
    force=True — מעדכן את כל השדות ללא תנאי is None.
    מחזיר סטטיסטיקה: {updated, skipped, not_found}
    """
    import models

    stats = {"updated": 0, "skipped": 0, "not_found": 0}
    seen_normalized: set[str] = set()

    for drug_name, data in ISRAELI_DRUG_DATA.items():
        norm = _normalize(drug_name)

        # סינון כפילויות — אם כבר עדכנו תרופה עם שם דומה, דלג
        if any(_names_are_duplicate(drug_name, s) for s in seen_normalized):
            stats["skipped"] += 1
            seen_normalized.add(norm)
            continue

        drug = db.query(models.DrugEntry).filter(
            models.DrugEntry.name.ilike(drug_name)
        ).first()

        if not drug:
            # חיפוש לפי generic_name
            drug = db.query(models.DrugEntry).filter(
                models.DrugEntry.generic_name.ilike(drug_name)
            ).first()

        if not drug:
            stats["not_found"] += 1
            seen_normalized.add(norm)
            continue

        # עדכון שדות ישראליים — רק אם אין ערך קיים (לא מחליף נתון ידני), אלא אם force=True
        if force or drug.sal_habriut_status is None:
            drug.sal_habriut_status = data.get("sal")
        if force or drug.sal_habriut_copay is None:
            drug.sal_habriut_copay = data.get("copay")
        if force or drug.prescription_type is None:
            drug.prescription_type = data.get("rx")
        if force or drug.is_otc is None:
            drug.is_otc = data.get("otc")
        if force or drug.generics_available is None:
            drug.generics_available = data.get("gen")
        if force or drug.pregnancy_category is None:
            drug.pregnancy_category = data.get("preg")
        if force or drug.atc_code is None:
            drug.atc_code = data.get("atc")
        if force or drug.drug_category is None:
            drug.drug_category = data.get("cat")

        seen_normalized.add(norm)
        stats["updated"] += 1

    db.commit()
    return stats


def get_drug_israeli_info(drug_name: str) -> Optional[dict]:
    """מחזיר נתוני סל ומרשם עבור תרופה לפי שם."""
    # חיפוש ישיר
    if drug_name in ISRAELI_DRUG_DATA:
        return ISRAELI_DRUG_DATA[drug_name]
    # חיפוש case-insensitive
    for name, data in ISRAELI_DRUG_DATA.items():
        if name.lower() == drug_name.lower():
            return data
    return None


def get_sal_habriut_label(status: str) -> str:
    """תרגום סטטוס סל לעברית."""
    return {
        "in_basket":            "בסל הבריאות",
        "partial":              "כיסוי חלקי",
        "specific_indication":  "אינדיקציה ספציפית",
        "not_in_basket":        "לא בסל",
    }.get(status or "", status or "לא ידוע")


def get_prescription_label(rx_type: str) -> str:
    """תרגום סוג מרשם לעברית."""
    return {
        "otc":          "ללא מרשם (OTC)",
        "prescription": "מרשם רופא",
        "restricted":   "מרשם מיוחד",
        "narcotic":     "סם מפקח",
    }.get(rx_type or "", rx_type or "לא ידוע")


# ═══════════════════════════════════════════════════════════════════════════════
# מסלול ב׳ — israeldrugs.health.gov.il (חסום ע"י WAF)
# ═══════════════════════════════════════════════════════════════════════════════
# ה-API מחזיר HTML שגיאה לכל גישה ישירה, גם עם cookies ו-browser headers.
# הסיבה: Azure Application Gateway / WAF חוסם גישה שאינה דפדפן אמיתי.
# פתרון עתידי: Playwright/Selenium אם נדרש.

APPROACH_B_STATUS = "blocked_by_waf"
