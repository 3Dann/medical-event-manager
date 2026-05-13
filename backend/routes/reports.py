"""
Report generation endpoints.

GET /api/patients/{id}/reports/financial-map  → generates PDF, saves as document, returns stream
GET /api/patients/{id}/reports               → list of saved report documents for patient
GET /api/reports/recent                      → recent reports across all patients (manager)
"""

import io
import os
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import models
from database import get_db
import auth as auth_utils
from routes.financial_map import _best_coverage_for_node, _application_dict

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from bidi.algorithm import get_display

router = APIRouter()

def _resolve_upload_dir():
    if os.environ.get("UPLOAD_DIR"):
        return os.environ["UPLOAD_DIR"]
    if os.path.isdir("/data"):
        return "/data/uploads"
    return os.path.join(os.path.dirname(__file__), "../../uploads")

UPLOAD_DIR = _resolve_upload_dir()

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# ── Colors ─────────────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#1e3a5f")
BLUE       = colors.HexColor("#2563eb")
BLUE_BG    = colors.HexColor("#eff6ff")
GREEN      = colors.HexColor("#059669")
GREEN_BG   = colors.HexColor("#ecfdf5")
RED        = colors.HexColor("#dc2626")
RED_BG     = colors.HexColor("#fef2f2")
AMBER      = colors.HexColor("#d97706")
SLATE_DARK = colors.HexColor("#0f172a")
SLATE_MED  = colors.HexColor("#475569")
SLATE_MUTED= colors.HexColor("#94a3b8")
SLATE_LINE = colors.HexColor("#e2e8f0")
LIGHT_BG   = colors.HexColor("#f8fafc")
WHITE      = colors.white

# ── Font registration ──────────────────────────────────────────────────────────
_fonts_ok = False

def _register_fonts():
    global _fonts_ok
    if _fonts_ok:
        return
    candidates = {
        "reg": [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        ],
        "bold": [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        ],
    }
    reg  = next((p for p in candidates["reg"]  if os.path.exists(p)), None)
    bold = next((p for p in candidates["bold"] if os.path.exists(p)), None)
    if not reg or not bold:
        raise RuntimeError(
            "No Hebrew-compatible font found. "
            "Install fonts-dejavu-core (apt) or ensure Arial is available."
        )
    pdfmetrics.registerFont(TTFont("RF",      reg))
    pdfmetrics.registerFont(TTFont("RF-Bold", bold))
    _fonts_ok = True


def _r(text) -> str:
    """Bidi-convert Hebrew text for ReportLab display."""
    if not text:
        return ""
    return get_display(str(text))


def _ils(n) -> str:
    """Format a number as ILS currency."""
    if n is None:
        return "—"
    return f"₪{int(n):,}"


def _styles() -> dict:
    _register_fonts()
    base = dict(fontName="RF", leading=16, textColor=SLATE_DARK, alignment=TA_RIGHT)

    def s(name, **kw):
        return ParagraphStyle(name, **{**base, **kw})

    return {
        "title":    s("title",    fontName="RF-Bold", fontSize=18, leading=26,
                       textColor=NAVY, spaceAfter=4),
        "subtitle": s("subtitle", fontName="RF",      fontSize=9,  leading=13,
                       textColor=SLATE_MED, spaceAfter=2),
        "h2":       s("h2",       fontName="RF-Bold", fontSize=12, leading=18,
                       textColor=NAVY, spaceBefore=14, spaceAfter=6),
        "h3":       s("h3",       fontName="RF-Bold", fontSize=10, leading=15,
                       textColor=SLATE_DARK, spaceBefore=8, spaceAfter=4,
                       backColor=LIGHT_BG, borderPadding=(3, 6, 3, 6)),
        "body":     s("body",     fontName="RF",      fontSize=9,  leading=14,
                       textColor=SLATE_MED, spaceAfter=3),
        "th":       s("th",       fontName="RF-Bold", fontSize=8.5, leading=12,
                       textColor=WHITE,      alignment=TA_RIGHT),
        "td":       s("td",       fontName="RF",      fontSize=8.5, leading=12,
                       textColor=SLATE_DARK, alignment=TA_RIGHT),
        "td_b":     s("td_b",     fontName="RF-Bold", fontSize=8.5, leading=12,
                       textColor=SLATE_DARK, alignment=TA_RIGHT),
        "td_green": s("td_green", fontName="RF-Bold", fontSize=8.5, leading=12,
                       textColor=GREEN,      alignment=TA_RIGHT),
        "td_red":   s("td_red",   fontName="RF-Bold", fontSize=8.5, leading=12,
                       textColor=RED,        alignment=TA_RIGHT),
        "td_amber": s("td_amber", fontName="RF",      fontSize=8.5, leading=12,
                       textColor=AMBER,      alignment=TA_RIGHT),
        "label":    s("label",    fontName="RF",      fontSize=7.5, leading=11,
                       textColor=SLATE_MUTED, alignment=TA_RIGHT),
        "num_big":  s("num_big",  fontName="RF-Bold", fontSize=15, leading=21,
                       textColor=SLATE_DARK,  alignment=TA_RIGHT),
        "bullet":   s("bullet",   fontName="RF",      fontSize=9,  leading=14,
                       textColor=SLATE_MED,  spaceAfter=3, alignment=TA_RIGHT,
                       rightIndent=8),
        "center":   s("center",   fontName="RF",      fontSize=7.5, leading=11,
                       textColor=SLATE_MUTED, alignment=TA_CENTER),
    }


def _header_footer(patient_name: str, generated_at: str):
    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont("RF", 8)
        canvas.setFillColor(SLATE_MUTED)
        canvas.setStrokeColor(SLATE_LINE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 14 * mm, PAGE_W - MARGIN, PAGE_H - 14 * mm)
        canvas.drawRightString(
            PAGE_W - MARGIN, PAGE_H - 12 * mm,
            _r(f"דוח מפה פיננסית — {patient_name}"),
        )
        canvas.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
        canvas.drawRightString(PAGE_W - MARGIN, 8 * mm, _r(f"עמוד {doc.page}"))
        label = _r("הופק:")
        lw = canvas.stringWidth(label, "RF", 8)
        canvas.drawString(MARGIN, 8 * mm, label)
        canvas.drawString(MARGIN + lw + 3, 8 * mm, generated_at)
        canvas.restoreState()
    return on_page


CATEGORY_LABELS = {
    "second_opinion":   "חוות דעת שנייה",
    "surgery":          "ניתוחים",
    "transplant":       "השתלות",
    "hospitalization":  "אשפוזים",
    "rehabilitation":   "שיקום / טיפולים",
    "advanced_tech":    "טכנולוגיות חדישות",
    "critical_illness": "מחלה קשה",
    "diagnostics":      "בדיקות והדמיה",
}

STAGE_LABELS = {
    10: "גילוי ואבחון",
    20: "תכנון הטיפול",
    30: "שלב הטיפולים",
    40: "החלמה ושיקום",
    50: "מעקב ארוך טווח",
}

STATUS_LABELS = {
    "considering": "שוקלים",
    "applied":     "הוגשה",
    "approved":    "אושרה",
    "rejected":    "נדחתה",
}

FUND_TYPE_LABELS = {
    "aid_fund":           "קרן סיוע",
    "social_entitlement": "זכאות סוציאלית",
    "special_loan":       "הלוואה",
    "tax_benefit":        "הטבת מס",
}


# ── Data builders ──────────────────────────────────────────────────────────────

def _coverage_by_source(patient: models.Patient) -> list:
    results = []
    for source in patient.insurance_sources:
        if not source.is_active:
            continue
        covered = []
        for cov in source.coverages:
            if not cov.is_covered:
                continue
            label = CATEGORY_LABELS.get(cov.category, cov.category)
            if cov.coverage_amount:
                covered.append(f"{label} ({_ils(cov.coverage_amount)})")
            elif cov.coverage_percentage:
                covered.append(f"{label} ({int(cov.coverage_percentage)}%)")
            else:
                covered.append(label)
        name = source.company_name or source.hmo_name or source.source_type or "ביטוח"
        results.append({"name": name, "covered": covered})
    return results


def _financial_data(patient: models.Patient, db: Session) -> dict:
    nodes = db.query(models.Node).filter(
        models.Node.patient_id == patient.id,
        models.Node.node_type != "stage",
    ).order_by(models.Node.stage_order.nullslast()).all()

    stage_buckets: dict[int, list] = {}
    optional_nodes = []

    for node in nodes:
        cov = _best_coverage_for_node(node, patient, db)
        nd = {
            "description":   node.description or "",
            "estimated_cost": node.estimated_cost,
            "covered_amount": cov["covered_amount"],
            "gap":            cov["gap"],
            "best_source":    cov["source_name"],
            "overlay_global": node.overlay_global,
        }
        if node.overlay_global:
            optional_nodes.append(nd)
            continue
        so = node.stage_order or 99
        bucket = 10 if so < 20 else 20 if so < 30 else 30 if so < 40 else 40 if so < 50 else 50
        stage_buckets.setdefault(bucket, []).append(nd)

    by_stage = []
    for bucket in sorted(stage_buckets):
        ns = stage_buckets[bucket]
        by_stage.append({
            "stage_label":   STAGE_LABELS.get(bucket, f"שלב {bucket}"),
            "nodes":         ns,
            "total_cost":    sum(n["estimated_cost"] or 0 for n in ns),
            "total_covered": sum(n["covered_amount"] for n in ns),
            "total_gap":     sum(n["gap"] for n in ns),
        })

    all_nodes = [n for ns in stage_buckets.values() for n in ns]
    total_cost    = sum(n["estimated_cost"] or 0 for n in all_nodes)
    total_covered = sum(n["covered_amount"] for n in all_nodes)
    ins_gap       = max(0.0, total_cost - total_covered)

    applications = db.query(models.PatientFundApplication).filter(
        models.PatientFundApplication.patient_id == patient.id
    ).all()

    ext_approved = sum((a.approved_amount or 0) for a in applications if a.status == "approved")
    ext_expected = sum((a.expected_amount or 0) for a in applications if a.status == "applied")
    remaining    = max(0.0, ins_gap - ext_approved - ext_expected)

    cov_pct    = round(total_covered / total_cost * 100, 1) if total_cost > 0 else 0
    funded_pct = round((total_covered + ext_approved + ext_expected) / total_cost * 100, 1) \
                 if total_cost > 0 else 0

    action_items = []
    if ins_gap > 0 and total_cost > 0:
        pct = round(ins_gap / total_cost * 100)
        action_items.append(
            f"פער ביטוחי של {pct}% ({_ils(ins_gap)}) — בחן מקורות מימון נוספים."
        )
    if not applications:
        action_items.append("טרם הוגדרו מקורות מימון חוץ-ביטוחיים.")
    if remaining > 0:
        action_items.append(
            f"פער נותר של {_ils(remaining)} לאחר כל מקורות המימון — נדרשת תכנון פיננסי."
        )

    return {
        "total_cost":    total_cost,
        "total_covered": total_covered,
        "ins_gap":       ins_gap,
        "ext_approved":  ext_approved,
        "ext_expected":  ext_expected,
        "remaining":     remaining,
        "cov_pct":       cov_pct,
        "funded_pct":    funded_pct,
        "by_stage":      by_stage,
        "optional_nodes": optional_nodes,
        "applications":  [_application_dict(a) for a in applications],
        "action_items":  action_items,
    }


# ── PDF builder ────────────────────────────────────────────────────────────────

def _build_pdf(patient: models.Patient, db: Session) -> bytes:
    _register_fonts()
    ST  = _styles()
    buf = io.BytesIO()
    avail = PAGE_W - 2 * MARGIN
    now   = datetime.now()
    gen   = now.strftime("%d/%m/%Y %H:%M")

    data    = _financial_data(patient, db)
    sources = _coverage_by_source(patient)

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=22 * mm,  bottomMargin=22 * mm,
        title=f"מפה פיננסית — {patient.full_name}",
    )
    story = []

    # ── Title ─────────────────────────────────────────────────────────────────
    story.append(Paragraph(_r("דוח מפה פיננסית — מימון המסע הרפואי"), ST["title"]))
    diag = patient.diagnosis_details or "—"
    story.append(Paragraph(
        _r(f"מטופל: {patient.full_name}   |   אבחנה: {diag}   |   תאריך: {gen}"),
        ST["subtitle"],
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=12))

    # ── Summary cards ─────────────────────────────────────────────────────────
    story.append(Paragraph(_r("סיכום מצב פיננסי"), ST["h2"]))

    d = data
    ext_total = d["ext_approved"] + d["ext_expected"]
    cards = [
        (_ils(d["total_cost"]),    "עלות כוללת מוערכת",              LIGHT_BG,  SLATE_LINE, SLATE_DARK),
        (_ils(d["total_covered"]), f"כיסוי ביטוחי ({d['cov_pct']}%)", GREEN_BG,  GREEN,      GREEN),
        (_ils(ext_total),          "מימון נוסף",                       BLUE_BG,   BLUE,       BLUE),
        (_ils(d["remaining"]),     "פער נותר",
         RED_BG if d["remaining"] > 0 else GREEN_BG,
         RED    if d["remaining"] > 0 else GREEN,
         RED    if d["remaining"] > 0 else GREEN),
    ]
    # Cards are displayed RTL → reverse order in the table (left column = last card)
    col_w = avail / 4
    card_rows = [
        [Paragraph(_r(c[1]), ST["label"])  for c in reversed(cards)],
        [Paragraph(_r(c[0]), ParagraphStyle(
            f"nb{i}", fontName="RF-Bold", fontSize=14, leading=20,
            textColor=c[4], alignment=TA_RIGHT,
        )) for i, c in enumerate(reversed(cards))],
    ]
    card_tbl = Table(card_rows, colWidths=[col_w] * 4, rowHeights=[14, 28])
    cstyle = [
        ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("BOX",           (0, 0), (-1, -1), 1, SLATE_LINE),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, SLATE_LINE),
    ]
    for i, c in enumerate(reversed(cards)):
        cstyle += [
            ("BACKGROUND", (i, 0), (i, -1), c[2]),
            ("LINEBELOW",  (i, 0), (i, -1), 2.5, c[3]),
        ]
    card_tbl.setStyle(TableStyle(cstyle))
    story.append(card_tbl)
    story.append(Spacer(1, 6))

    # ── Progress bar ──────────────────────────────────────────────────────────
    if d["total_cost"] > 0:
        ins_w  = avail * min(1.0, d["cov_pct"] / 100)
        ext_w  = avail * min(1.0 - d["cov_pct"] / 100,
                             ext_total / d["total_cost"]) if d["total_cost"] else 0
        gap_w  = max(0.0, avail - ins_w - ext_w)

        segs = []
        if ins_w > 1:  segs.append((ins_w, GREEN,  "כיסוי ביטוחי"))
        if ext_w > 1:  segs.append((ext_w, BLUE,   "מימון נוסף"))
        if gap_w > 1:  segs.append((gap_w, RED,    "פער"))

        if segs:
            bar_row = [[""] * len(segs)]
            bar_tbl = Table(bar_row, colWidths=[s[0] for s in segs], rowHeights=[10])
            bstyle  = [
                ("TOPPADDING",    (0,0), (-1,-1), 0),
                ("BOTTOMPADDING", (0,0), (-1,-1), 0),
                ("LEFTPADDING",   (0,0), (-1,-1), 0),
                ("RIGHTPADDING",  (0,0), (-1,-1), 0),
            ]
            for i, seg in enumerate(segs):
                bstyle.append(("BACKGROUND", (i, 0), (i, 0), seg[1]))
            bar_tbl.setStyle(TableStyle(bstyle))
            story.append(bar_tbl)

            legend_cells = [[
                Paragraph(
                    _r(f"● {seg[2]}"),
                    ParagraphStyle(f"lg{i}", fontName="RF", fontSize=7.5,
                                   textColor=seg[1], alignment=TA_RIGHT),
                )
                for seg in reversed(segs)
            ]]
            legend = Table(legend_cells,
                           colWidths=[avail / len(segs)] * len(segs),
                           rowHeights=[14])
            legend.setStyle(TableStyle([
                ("ALIGN", (0,0), (-1,-1), "RIGHT"),
                ("TOPPADDING", (0,0), (-1,-1), 2),
            ]))
            story.append(legend)

    story.append(Spacer(1, 8))

    # ── Coverage by insurance source ──────────────────────────────────────────
    if sources:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("כיסויים לפי מקור ביטוח"), ST["h2"]))

        # Columns RTL order: מקור (right) | קטגוריות מכוסות (left)
        # In code (reversed): [קטגוריות, מקור]
        rows = [[
            Paragraph(_r("קטגוריות וסכומים מכוסים"), ST["th"]),
            Paragraph(_r("מקור ביטוח"), ST["th"]),
        ]]
        for src in sources:
            cats = " | ".join(src["covered"]) if src["covered"] else "—"
            rows.append([
                Paragraph(_r(cats),        ST["td"]),
                Paragraph(_r(src["name"]), ST["td_b"]),
            ])

        tbl = Table(rows, colWidths=[avail * 0.68, avail * 0.32], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 8))

    # ── Cost breakdown by stage ───────────────────────────────────────────────
    if d["by_stage"]:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("פירוט עלויות לפי שלב מסע"), ST["h2"]))

        for stage in d["by_stage"]:
            hdr = (
                f"{stage['stage_label']}  —  "
                f"עלות: {_ils(stage['total_cost'])}  |  "
                f"כיסוי: {_ils(stage['total_covered'])}  |  "
                f"פער: {_ils(stage['total_gap'])}"
            )
            story.append(KeepTogether([Paragraph(_r(hdr), ST["h3"])]))

            if not stage["nodes"]:
                continue

            # Columns RTL: פריט (right) | עלות | כיסוי | מכוסה ע"י | פער (left)
            # In code reversed: [פער, מכוסה ע"י, כיסוי, עלות, פריט]
            nrows = [[
                Paragraph(_r("פער"),           ST["th"]),
                Paragraph(_r('מכוסה ע"י'),     ST["th"]),
                Paragraph(_r("כיסוי"),         ST["th"]),
                Paragraph(_r("עלות מוערכת"),   ST["th"]),
                Paragraph(_r("פריט"),          ST["th"]),
            ]]
            for node in stage["nodes"]:
                cost    = node["estimated_cost"]
                covered = node["covered_amount"]
                gap     = node["gap"]
                source  = node["best_source"] or "—"
                nrows.append([
                    Paragraph(_r(_ils(gap) if gap else "—"),
                               ST["td_red"] if gap else ST["td"]),
                    Paragraph(_r(source),        ST["td"]),
                    Paragraph(_r(_ils(covered) if covered else "—"),
                               ST["td_green"] if covered else ST["td"]),
                    Paragraph(_r(_ils(cost) if cost else "—"), ST["td_b"]),
                    Paragraph(_r(node["description"]),         ST["td"]),
                ])

            # Totals row
            nrows.append([
                Paragraph(_r(_ils(stage["total_gap"])),     ST["td_red"]),
                Paragraph(_r('סה"כ שלב'),
                           ParagraphStyle("tot", fontName="RF-Bold", fontSize=8.5,
                                          textColor=SLATE_DARK, alignment=TA_RIGHT)),
                Paragraph(_r(_ils(stage["total_covered"])), ST["td_green"]),
                Paragraph(_r(_ils(stage["total_cost"])),    ST["td_b"]),
                Paragraph(_r(""), ST["td"]),
            ])

            cws = [avail*0.12, avail*0.22, avail*0.13, avail*0.15, avail*0.38]
            ntbl = Table(nrows, colWidths=cws, repeatRows=1)
            ntbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,  0), (-1,  0), NAVY),
                ("BACKGROUND",    (0, -1), (-1, -1), LIGHT_BG),
                ("ROWBACKGROUNDS",(0,  1), (-1, -2), [WHITE, LIGHT_BG]),
                ("GRID",          (0,  0), (-1, -1), 0.4, SLATE_LINE),
                ("ALIGN",         (0,  0), (-1, -1), "RIGHT"),
                ("VALIGN",        (0,  0), (-1, -1), "TOP"),
                ("TOPPADDING",    (0,  0), (-1, -1), 4),
                ("BOTTOMPADDING", (0,  0), (-1, -1), 4),
                ("RIGHTPADDING",  (0,  0), (-1, -1), 6),
                ("LEFTPADDING",   (0,  0), (-1, -1), 6),
                ("LINEABOVE",     (0, -1), (-1, -1), 0.8, SLATE_MED),
            ]))
            story.append(ntbl)
            story.append(Spacer(1, 6))

    # ── External funding ──────────────────────────────────────────────────────
    if d["applications"]:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("מקורות מימון נוספים"), ST["h2"]))

        # Columns RTL: שם (right) | סוג | סטטוס | סכום | הערות (left)
        # Reversed: [הערות, סכום, סטטוס, סוג, שם]
        frows = [[
            Paragraph(_r("הערות"),    ST["th"]),
            Paragraph(_r("סכום"),     ST["th"]),
            Paragraph(_r("סטטוס"),    ST["th"]),
            Paragraph(_r("סוג"),      ST["th"]),
            Paragraph(_r("שם הקרן"), ST["th"]),
        ]]
        for app in d["applications"]:
            status = app["status"]
            amt    = app.get("approved_amount") if status == "approved" \
                     else app.get("expected_amount")
            amt_st = ST["td_green"] if status == "approved" \
                     else (ST["td_amber"] if status == "applied" else ST["td"])
            frows.append([
                Paragraph(_r(app.get("notes") or ""),           ST["td"]),
                Paragraph(_r(_ils(amt)),                         amt_st),
                Paragraph(_r(STATUS_LABELS.get(status, status)), ST["td"]),
                Paragraph(_r(app.get("fund_type_label") or ""),  ST["td"]),
                Paragraph(_r(app.get("display_name") or ""),     ST["td_b"]),
            ])

        ext_sum = d["ext_approved"] + d["ext_expected"]
        frows.append([
            Paragraph(_r(""), ST["td"]),
            Paragraph(_r(_ils(ext_sum)),
                       ST["td_green"] if ext_sum > 0 else ST["td"]),
            Paragraph(_r('סה"כ'),
                       ParagraphStyle("tot2", fontName="RF-Bold", fontSize=8.5,
                                      textColor=SLATE_DARK, alignment=TA_RIGHT)),
            Paragraph(_r(""), ST["td"]),
            Paragraph(_r(""), ST["td"]),
        ])

        fcws = [avail*0.22, avail*0.14, avail*0.12, avail*0.14, avail*0.38]
        ftbl = Table(frows, colWidths=fcws, repeatRows=1)
        ftbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,  0), (-1,  0), NAVY),
            ("BACKGROUND",    (0, -1), (-1, -1), LIGHT_BG),
            ("ROWBACKGROUNDS",(0,  1), (-1, -2), [WHITE, LIGHT_BG]),
            ("GRID",          (0,  0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0,  0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0,  0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0,  0), (-1, -1), 4),
            ("BOTTOMPADDING", (0,  0), (-1, -1), 4),
            ("RIGHTPADDING",  (0,  0), (-1, -1), 6),
            ("LEFTPADDING",   (0,  0), (-1, -1), 6),
            ("LINEABOVE",     (0, -1), (-1, -1), 0.8, SLATE_MED),
        ]))
        story.append(ftbl)
        story.append(Spacer(1, 6))

    # ── Optional cost nodes ───────────────────────────────────────────────────
    if d["optional_nodes"]:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("עלויות אופציונליות (זמינות בכל שלב)"), ST["h2"]))
        orows = [[
            Paragraph(_r("עלות מוערכת"), ST["th"]),
            Paragraph(_r("פריט"),        ST["th"]),
        ]]
        for node in d["optional_nodes"]:
            orows.append([
                Paragraph(_r(_ils(node["estimated_cost"])), ST["td_b"]),
                Paragraph(_r(node["description"]),          ST["td"]),
            ])
        otbl = Table(orows, colWidths=[avail * 0.25, avail * 0.75], repeatRows=1)
        otbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ]))
        story.append(otbl)
        story.append(Spacer(1, 6))

    # ── Action items ──────────────────────────────────────────────────────────
    if d["action_items"]:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("צעדים מומלצים"), ST["h2"]))
        for item in d["action_items"]:
            story.append(Paragraph("⚡ " + _r(item), ST["bullet"]))
        story.append(Spacer(1, 6))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
    story.append(Paragraph(
        _r(f'דוח זה הופק אוטומטית ע"י מנהל האירוע הרפואי — Orly Medical | {gen}'),
        ST["center"],
    ))
    story.append(Paragraph(
        _r("הנתונים מבוססים על המידע המוזן במערכת. אין לראות בדוח זה ייעוץ רפואי, ביטוחי או משפטי."),
        ST["center"],
    ))

    on_page = _header_footer(patient.full_name, gen)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    buf.seek(0)
    return buf.read()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/api/patients/{patient_id}/reports/financial-map")
def generate_financial_map_report(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)

    try:
        pdf_bytes = _build_pdf(patient, db)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    # Save as document in the system
    now = datetime.now()
    doc_filename = f"report_financial_map_{patient_id}_{now.strftime('%Y%m%d_%H%M%S')}.pdf"
    patient_dir  = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)

    with open(os.path.join(patient_dir, doc_filename), "wb") as fh:
        fh.write(pdf_bytes)

    doc_record = models.PatientDocument(
        patient_id   = patient_id,
        uploaded_by  = current_user.id,
        filename     = doc_filename,
        original_name= f"מפה פיננסית — {patient.full_name} — {now.strftime('%d.%m.%Y')}.pdf",
        file_type    = "application/pdf",
        file_size    = len(pdf_bytes),
        category     = "דוח",
        notes        = f"דוח מפה פיננסית — הופק {now.strftime('%d/%m/%Y %H:%M')}",
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    safe_name = f"financial-map-{patient_id}-{now.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


def _header_footer_generic(title: str, patient_name: str, generated_at: str):
    """Generic header/footer for non-financial reports."""
    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont("RF", 8)
        canvas.setFillColor(SLATE_MUTED)
        canvas.setStrokeColor(SLATE_LINE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 14 * mm, PAGE_W - MARGIN, PAGE_H - 14 * mm)
        canvas.drawRightString(
            PAGE_W - MARGIN, PAGE_H - 12 * mm,
            _r(f"{title} — {patient_name}"),
        )
        canvas.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
        canvas.drawRightString(PAGE_W - MARGIN, 8 * mm, _r(f"עמוד {doc.page}"))
        label = _r("הופק:")
        lw = canvas.stringWidth(label, "RF", 8)
        canvas.drawString(MARGIN, 8 * mm, label)
        canvas.drawString(MARGIN + lw + 3, 8 * mm, generated_at)
        canvas.restoreState()
    return on_page


def _footer_disclaimer(story, ST, gen):
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
    story.append(Paragraph(
        _r(f'דוח זה הופק אוטומטית ע"י מנהל האירוע הרפואי — Orly Medical | {gen}'),
        ST["center"],
    ))
    story.append(Paragraph(
        _r("הנתונים מבוססים על המידע המוזן במערכת. אין לראות בדוח זה ייעוץ רפואי, ביטוחי או משפטי."),
        ST["center"],
    ))


# ── Intake Summary PDF ──────────────────────────────────────────────────────────

def _build_intake_pdf(patient: models.Patient, db: Session) -> bytes:
    _register_fonts()
    ST  = _styles()
    buf = io.BytesIO()
    avail = PAGE_W - 2 * MARGIN
    now   = datetime.now()
    gen   = now.strftime("%d/%m/%Y %H:%M")

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=22 * mm, bottomMargin=22 * mm,
        title=f"סיכום קליטה — {patient.full_name}",
    )
    story = []

    # Title
    story.append(Paragraph(_r("סיכום קליטה"), ST["title"]))
    story.append(Paragraph(
        _r(f"מטופל: {patient.full_name}   |   תאריך הפקה: {gen}"),
        ST["subtitle"],
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=12))

    # Demographics
    story.append(Paragraph(_r("פרטים אישיים"), ST["h2"]))

    gender_map = {"male": "זכר", "female": "נקבה"}
    marital_map = {
        "single": "רווק/ה", "married": "נשוי/אה",
        "divorced": "גרוש/ה", "widowed": "אלמן/ה",
    }
    hmo_map = {"clalit": "כללית", "maccabi": "מכבי", "meuhedet": "מאוחדת", "leumit": "לאומית"}
    hmo_level_map = {"basic": "בסיס", "mushlam": "משלים", "premium": "פרמיום", "zahav": "זהב"}

    demo_rows = [
        [Paragraph(_r("פרטי זיהוי"), ST["td_b"]),
         Paragraph(_r("ערך"), ST["td_b"])],
    ]
    # Helper: add row if value exists
    def _row(label, value):
        if value:
            demo_rows.append([
                Paragraph(_r(label), ST["td_b"]),
                Paragraph(_r(str(value)), ST["td"]),
            ])

    _row("שם מלא", patient.full_name)
    _row("מגדר", gender_map.get(patient.gender or "", patient.gender or ""))
    _row("תאריך לידה", patient.birth_date)
    _row("מצב משפחתי", marital_map.get(patient.marital_status or "", patient.marital_status or ""))
    _row("מספר ילדים", patient.num_children)
    if patient.hmo_name:
        hmo_str = hmo_map.get(patient.hmo_name, patient.hmo_name)
        if patient.hmo_level:
            hmo_str += f" — {hmo_level_map.get(patient.hmo_level, patient.hmo_level)}"
        _row("קופת חולים", hmo_str)

    if len(demo_rows) > 1:
        demo_tbl = Table(demo_rows, colWidths=[avail * 0.35, avail * 0.65], repeatRows=1)
        demo_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ]))
        story.append(demo_tbl)
        story.append(Spacer(1, 8))

    # Address
    addr_parts = [
        patient.street, patient.house_number, patient.city, patient.postal_code
    ]
    addr_str = " ".join(filter(None, addr_parts))
    if addr_str:
        story.append(Paragraph(_r("כתובת"), ST["h2"]))
        story.append(Paragraph(_r(addr_str), ST["body"]))
        story.append(Spacer(1, 6))

    # Emergency contact
    if patient.ec_name or patient.ec_phone:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("איש קשר לחירום"), ST["h2"]))
        ec_parts = []
        if patient.ec_name:
            ec_parts.append(f"שם: {patient.ec_name}")
        if patient.ec_relation:
            ec_parts.append(f"קרבה: {patient.ec_relation}")
        if patient.ec_phone:
            phone_prefix = patient.ec_phone_prefix or ""
            ec_parts.append(f"טלפון: {phone_prefix}-{patient.ec_phone}")
        story.append(Paragraph(_r("   |   ".join(ec_parts)), ST["body"]))
        story.append(Spacer(1, 6))

    # Medical info
    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
    story.append(Paragraph(_r("מידע רפואי"), ST["h2"]))
    if patient.diagnosis_details:
        story.append(Paragraph(_r(f"אבחנה: {patient.diagnosis_details}"), ST["body"]))
    if patient.specialty:
        story.append(Paragraph(_r(f"מומחיות: {patient.specialty}"), ST["body"]))
    if patient.referral_goal:
        story.append(Paragraph(_r(f"מטרת הפניה: {patient.referral_goal}"), ST["body"]))
    if patient.referral_source:
        story.append(Paragraph(_r(f"גורם מפנה: {patient.referral_source}"), ST["body"]))
    story.append(Spacer(1, 6))

    # Condition tags
    try:
        import json
        condition_tags = json.loads(patient.condition_tags) if patient.condition_tags else []
    except Exception:
        condition_tags = []
    if condition_tags:
        story.append(Paragraph(_r("תגיות מצב רפואי"), ST["h3"]))
        tags_str = "   •   ".join(condition_tags)
        story.append(Paragraph(_r(tags_str), ST["body"]))
        story.append(Spacer(1, 6))

    # Functional assessments
    if patient.adl_score is not None or patient.iadl_score is not None or patient.mmse_score is not None:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("הערכות תפקודיות"), ST["h2"]))
        scores = []
        if patient.adl_score is not None:
            scores.append(f"ADL: {patient.adl_score}/100")
        if patient.iadl_score is not None:
            scores.append(f"IADL: {patient.iadl_score}/8")
        if patient.mmse_score is not None:
            scores.append(f"MMSE: {patient.mmse_score}/30")
        story.append(Paragraph(_r("   |   ".join(scores)), ST["body"]))
        story.append(Spacer(1, 6))

    # Insurance sources
    active_sources = [s for s in patient.insurance_sources if s.is_active]
    if active_sources:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("מקורות ביטוח"), ST["h2"]))
        for src in active_sources:
            src_name = src.company_name or src.hmo_name or src.source_type or "ביטוח"
            story.append(Paragraph("• " + _r(src_name), ST["bullet"]))
        story.append(Spacer(1, 6))

    # Consent status
    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
    story.append(Paragraph(_r("סטטוס חתימות"), ST["h2"]))
    consent_str = "✓ הסכמה לטיפול" if patient.consent_agreed else "✗ הסכמה לטיפול — טרם נחתמה"
    poa_str     = "✓ ייפוי כוח"    if patient.poa_agreed    else "✗ ייפוי כוח — טרם נחתם"
    story.append(Paragraph(_r(consent_str), ST["body"]))
    story.append(Paragraph(_r(poa_str),     ST["body"]))
    story.append(Spacer(1, 6))

    _footer_disclaimer(story, ST, gen)

    on_page = _header_footer_generic("סיכום קליטה", patient.full_name, gen)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    buf.seek(0)
    return buf.read()


# ── Monthly Status PDF ──────────────────────────────────────────────────────────

def _build_monthly_pdf(patient: models.Patient, db: Session) -> bytes:
    _register_fonts()
    ST  = _styles()
    buf = io.BytesIO()
    avail = PAGE_W - 2 * MARGIN
    now   = datetime.now()
    gen   = now.strftime("%d/%m/%Y %H:%M")
    from datetime import timedelta
    thirty_days_ago = now - timedelta(days=30)

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=22 * mm, bottomMargin=22 * mm,
        title=f"דוח חודשי — {patient.full_name}",
    )
    story = []

    # Title
    story.append(Paragraph(_r("דוח חודשי"), ST["title"]))
    story.append(Paragraph(
        _r(f"מטופל: {patient.full_name}   |   אבחנה: {patient.diagnosis_details or '—'}   |   תאריך: {gen}"),
        ST["subtitle"],
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=12))

    # Claims status
    claims = db.query(models.Claim).filter(
        models.Claim.patient_id == patient.id,
    ).all()

    if claims:
        story.append(Paragraph(_r("סטטוס תביעות"), ST["h2"]))
        status_counts = {}
        for c in claims:
            status_counts[c.status] = status_counts.get(c.status, 0) + 1

        status_label_map = {
            "draft": "טיוטה", "pending": "ממתינה", "submitted": "הוגשה",
            "approved": "אושרה", "partial": "אושרה חלקית", "rejected": "נדחתה",
        }
        col_w = avail / max(len(status_counts), 1)
        card_rows = [
            [Paragraph(_r(status_label_map.get(s, s)), ST["label"]) for s in status_counts],
            [Paragraph(_r(str(cnt)), ParagraphStyle(
                f"sc{i}", fontName="RF-Bold", fontSize=18, leading=24,
                textColor=GREEN if s == "approved" else RED if s == "rejected" else BLUE,
                alignment=0x02,  # TA_RIGHT
            )) for i, (s, cnt) in enumerate(status_counts.items())],
        ]
        ctbl = Table(card_rows, colWidths=[col_w] * len(status_counts), rowHeights=[14, 28])
        ctbl.setStyle(TableStyle([
            ("ALIGN",     (0, 0), (-1, -1), "RIGHT"),
            ("VALIGN",    (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",(0, 0), (-1, -1), 6),
            ("BOTTOMPADDING",(0, 0),(-1,-1), 6),
            ("RIGHTPADDING",(0, 0),(-1,-1), 10),
            ("LEFTPADDING", (0, 0),(-1,-1), 10),
            ("BOX",       (0, 0), (-1, -1), 1, SLATE_LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, SLATE_LINE),
            ("BACKGROUND",(0, 0), (-1, -1), LIGHT_BG),
        ]))
        story.append(ctbl)
        story.append(Spacer(1, 8))

        # Active claims table
        active_claims = [c for c in claims if c.status not in ("approved", "rejected")]
        if active_claims:
            story.append(Paragraph(_r("תביעות פעילות"), ST["h3"]))
            crows = [[
                Paragraph(_r("סטטוס"),   ST["th"]),
                Paragraph(_r("סכום"),    ST["th"]),
                Paragraph(_r("תביעה"),   ST["th"]),
            ]]
            for c in active_claims[:15]:
                status_lbl = status_label_map.get(c.status, c.status)
                amount_str = _ils(c.amount_requested) if c.amount_requested else "—"
                crows.append([
                    Paragraph(_r(status_lbl), ST["td_amber"]),
                    Paragraph(_r(amount_str),  ST["td"]),
                    Paragraph(_r(c.title or "—"), ST["td"]),
                ])
            ctbl2 = Table(crows, colWidths=[avail*0.18, avail*0.17, avail*0.65], repeatRows=1)
            ctbl2.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
                ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
                ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
                ("TOPPADDING",    (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
                ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ]))
            story.append(ctbl2)
            story.append(Spacer(1, 8))

    # Active workflow instances
    instances = db.query(models.WorkflowInstance).filter(
        models.WorkflowInstance.patient_id == patient.id,
        models.WorkflowInstance.status == "active",
    ).all()
    if instances:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("זרימות עבודה פעילות"), ST["h2"]))
        wrows = [[
            Paragraph(_r("שלב נוכחי"), ST["th"]),
            Paragraph(_r("זרימה"),     ST["th"]),
        ]]
        for inst in instances[:10]:
            current = inst.current_step_key or "—"
            wrows.append([
                Paragraph(_r(str(current)), ST["td"]),
                Paragraph(_r(inst.title or "—"), ST["td"]),
            ])
        wtbl = Table(wrows, colWidths=[avail*0.3, avail*0.7], repeatRows=1)
        wtbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ]))
        story.append(wtbl)
        story.append(Spacer(1, 8))

    # Recent meetings (last 30 days)
    thirty_days_str = thirty_days_ago.strftime("%Y-%m-%d")
    recent_meetings = db.query(models.PatientMeeting).filter(
        models.PatientMeeting.patient_id == patient.id,
        models.PatientMeeting.meeting_date >= thirty_days_str,
    ).order_by(models.PatientMeeting.meeting_date.desc()).all()

    if recent_meetings:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("פגישות בחודש האחרון"), ST["h2"]))
        mrows = [[
            Paragraph(_r("הערות"),    ST["th"]),
            Paragraph(_r("נושא"),     ST["th"]),
            Paragraph(_r("תאריך"),    ST["th"]),
        ]]
        for m in recent_meetings:
            date_str = m.meeting_date if m.meeting_date else "—"
            mrows.append([
                Paragraph(_r((m.caregiver_notes or m.status_summary or "")[:80]), ST["td"]),
                Paragraph(_r(m.professional_name or m.meeting_type or "—"), ST["td"]),
                Paragraph(_r(date_str), ST["td"]),
            ])
        mtbl = Table(mrows, colWidths=[avail*0.45, avail*0.3, avail*0.25], repeatRows=1)
        mtbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ]))
        story.append(mtbl)
        story.append(Spacer(1, 8))

    # SLA breaches
    sla_breaches = db.query(models.WorkflowStep).join(
        models.WorkflowInstance,
        models.WorkflowStep.instance_id == models.WorkflowInstance.id,
    ).filter(
        models.WorkflowInstance.patient_id == patient.id,
        models.WorkflowStep.sla_alerted == True,
        models.WorkflowStep.status == "active",
    ).all()

    if sla_breaches:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("חריגות SLA"), ST["h2"]))
        for step in sla_breaches:
            deadline_str = step.sla_deadline.strftime("%d/%m/%Y") if step.sla_deadline else "—"
            story.append(Paragraph(
                "⚠ " + _r(f"{step.name} — מועד יעד: {deadline_str}"),
                ST["bullet"],
            ))
        story.append(Spacer(1, 6))

    _footer_disclaimer(story, ST, gen)

    on_page = _header_footer_generic("דוח חודשי", patient.full_name, gen)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    buf.seek(0)
    return buf.read()


# ── Discharge PDF ───────────────────────────────────────────────────────────────

def _build_discharge_pdf(patient: models.Patient, db: Session) -> bytes:
    _register_fonts()
    ST  = _styles()
    buf = io.BytesIO()
    avail = PAGE_W - 2 * MARGIN
    now   = datetime.now()
    gen   = now.strftime("%d/%m/%Y %H:%M")

    data = _financial_data(patient, db)

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=22 * mm, bottomMargin=22 * mm,
        title=f"דוח סיום התקשרות — {patient.full_name}",
    )
    story = []

    # Title
    story.append(Paragraph(_r("דוח סיום התקשרות"), ST["title"]))
    story.append(Paragraph(
        _r(f"מטופל: {patient.full_name}   |   אבחנה: {patient.diagnosis_details or '—'}   |   תאריך: {gen}"),
        ST["subtitle"],
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=NAVY, spaceAfter=12))

    # Timeline: intake to discharge
    intake_date = patient.intake_completed_at or patient.created_at
    story.append(Paragraph(_r("ציר זמן — מאינטייק לסיום"), ST["h2"]))
    tl_rows = []
    if intake_date:
        tl_rows.append([
            Paragraph(_r(intake_date.strftime("%d/%m/%Y")), ST["td"]),
            Paragraph(_r("תאריך קליטה"), ST["td_b"]),
        ])
    tl_rows.append([
        Paragraph(_r(now.strftime("%d/%m/%Y")), ST["td"]),
        Paragraph(_r("תאריך סיום"), ST["td_b"]),
    ])
    if intake_date:
        days = (now.date() - intake_date.date()).days
        tl_rows.append([
            Paragraph(_r(f"{days} ימים"), ST["td"]),
            Paragraph(_r("משך ליווי כולל"), ST["td_b"]),
        ])

    if tl_rows:
        tl_tbl = Table(tl_rows, colWidths=[avail * 0.3, avail * 0.7])
        tl_tbl.setStyle(TableStyle([
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ]))
        story.append(tl_tbl)
        story.append(Spacer(1, 8))

    # Financial map summary (reuse cards pattern)
    d = data
    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
    story.append(Paragraph(_r("סיכום מפה פיננסית"), ST["h2"]))
    ext_total = d["ext_approved"] + d["ext_expected"]
    sum_rows = [
        ("עלות כוללת מוערכת",  _ils(d["total_cost"]),    SLATE_DARK),
        ("כיסוי ביטוחי",        _ils(d["total_covered"]), GREEN),
        ("מימון נוסף",           _ils(ext_total),         BLUE),
        ("פער נותר",             _ils(d["remaining"]),
         RED if d["remaining"] > 0 else GREEN),
    ]
    col_w = avail / 4
    fcard_rows = [
        [Paragraph(_r(r[0]), ST["label"])  for r in reversed(sum_rows)],
        [Paragraph(_r(r[1]), ParagraphStyle(
            f"dc{i}", fontName="RF-Bold", fontSize=14, leading=20,
            textColor=r[2], alignment=0x02,
        )) for i, r in enumerate(reversed(sum_rows))],
    ]
    fcard_tbl = Table(fcard_rows, colWidths=[col_w] * 4, rowHeights=[14, 28])
    fcard_tbl.setStyle(TableStyle([
        ("ALIGN",        (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("BOX",          (0, 0), (-1, -1), 1, SLATE_LINE),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, SLATE_LINE),
        ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_BG),
    ]))
    story.append(fcard_tbl)
    story.append(Spacer(1, 8))

    # Full claims history
    all_claims = db.query(models.Claim).filter(
        models.Claim.patient_id == patient.id,
    ).order_by(models.Claim.created_at.asc()).all()

    if all_claims:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r("היסטוריית תביעות"), ST["h2"]))

        total_requested = sum(c.amount_requested or 0 for c in all_claims)
        total_approved  = sum(c.amount_approved  or 0 for c in all_claims if c.status == "approved")
        story.append(Paragraph(
            _r(f'סה"כ מבוקש: {_ils(total_requested)}   |   סה"כ אושר: {_ils(total_approved)}'),
            ST["body"],
        ))
        story.append(Spacer(1, 4))

        status_label_map = {
            "draft": "טיוטה", "pending": "ממתינה", "submitted": "הוגשה",
            "approved": "אושרה", "partial": "אושרה חלקית", "rejected": "נדחתה",
        }
        cr_rows = [[
            Paragraph(_r("אושר"),  ST["th"]),
            Paragraph(_r("סטטוס"), ST["th"]),
            Paragraph(_r("מבוקש"), ST["th"]),
            Paragraph(_r("תאריך"), ST["th"]),
            Paragraph(_r("תביעה"), ST["th"]),
        ]]
        for c in all_claims:
            date_str = c.created_at.strftime("%d/%m/%Y") if c.created_at else "—"
            status   = status_label_map.get(c.status, c.status)
            st_style = ST["td_green"] if c.status == "approved" else (
                ST["td_red"] if c.status == "rejected" else ST["td_amber"]
            )
            cr_rows.append([
                Paragraph(_r(_ils(c.amount_approved) if c.amount_approved else "—"), ST["td_green"]),
                Paragraph(_r(status), st_style),
                Paragraph(_r(_ils(c.amount_requested) if c.amount_requested else "—"), ST["td"]),
                Paragraph(_r(date_str), ST["td"]),
                Paragraph(_r(c.title or "—"), ST["td"]),
            ])

        # Totals row
        cr_rows.append([
            Paragraph(_r(_ils(total_approved)), ST["td_green"]),
            Paragraph(_r('סה"כ'), ParagraphStyle("tot3", fontName="RF-Bold", fontSize=8.5,
                                                  textColor=SLATE_DARK, alignment=0x02)),
            Paragraph(_r(_ils(total_requested)), ST["td_b"]),
            Paragraph(_r(""), ST["td"]),
            Paragraph(_r(""), ST["td"]),
        ])

        cr_cws = [avail*0.14, avail*0.14, avail*0.14, avail*0.13, avail*0.45]
        cr_tbl = Table(cr_rows, colWidths=cr_cws, repeatRows=1)
        cr_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0,  0), (-1,  0), NAVY),
            ("BACKGROUND",    (0, -1), (-1, -1), LIGHT_BG),
            ("ROWBACKGROUNDS",(0,  1), (-1, -2), [WHITE, LIGHT_BG]),
            ("GRID",          (0,  0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0,  0), (-1, -1), "RIGHT"),
            ("VALIGN",        (0,  0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0,  0), (-1, -1), 4),
            ("BOTTOMPADDING", (0,  0), (-1, -1), 4),
            ("RIGHTPADDING",  (0,  0), (-1, -1), 6),
            ("LEFTPADDING",   (0,  0), (-1, -1), 6),
            ("LINEABOVE",     (0, -1), (-1, -1), 0.8, SLATE_MED),
        ]))
        story.append(cr_tbl)
        story.append(Spacer(1, 8))

    # Meetings summary
    all_meetings = db.query(models.PatientMeeting).filter(
        models.PatientMeeting.patient_id == patient.id,
    ).order_by(models.PatientMeeting.meeting_date.asc()).all()

    if all_meetings:
        story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_LINE))
        story.append(Paragraph(_r(f"סיכום פגישות ({len(all_meetings)})"), ST["h2"]))
        mr_rows = [[
            Paragraph(_r("הערות"),    ST["th"]),
            Paragraph(_r("נושא"),     ST["th"]),
            Paragraph(_r("תאריך"),    ST["th"]),
        ]]
        for m in all_meetings:
            date_str = m.meeting_date if m.meeting_date else "—"
            mr_rows.append([
                Paragraph(_r((m.caregiver_notes or m.status_summary or "")[:60]), ST["td"]),
                Paragraph(_r(m.professional_name or m.meeting_type or "—"), ST["td"]),
                Paragraph(_r(date_str), ST["td"]),
            ])
        mr_tbl = Table(mr_rows, colWidths=[avail*0.45, avail*0.3, avail*0.25], repeatRows=1)
        mr_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
            ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
            ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ]))
        story.append(mr_tbl)
        story.append(Spacer(1, 6))

    _footer_disclaimer(story, ST, gen)

    on_page = _header_footer_generic("דוח סיום התקשרות", patient.full_name, gen)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    buf.seek(0)
    return buf.read()


# ── New Report Routes ───────────────────────────────────────────────────────────

@router.get("/api/patients/{patient_id}/reports/intake")
def generate_intake_report(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)
    try:
        pdf_bytes = _build_intake_pdf(patient, db)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    now = datetime.now()
    doc_filename = f"report_intake_{patient_id}_{now.strftime('%Y%m%d_%H%M%S')}.pdf"
    patient_dir  = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)
    with open(os.path.join(patient_dir, doc_filename), "wb") as fh:
        fh.write(pdf_bytes)

    doc_record = models.PatientDocument(
        patient_id   = patient_id,
        uploaded_by  = current_user.id,
        filename     = doc_filename,
        original_name= f"סיכום קליטה — {patient.full_name} — {now.strftime('%d.%m.%Y')}.pdf",
        file_type    = "application/pdf",
        file_size    = len(pdf_bytes),
        category     = "דוח",
        notes        = f"דוח סיכום קליטה — הופק {now.strftime('%d/%m/%Y %H:%M')}",
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    safe_name = f"intake-summary-{patient_id}-{now.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/api/patients/{patient_id}/reports/monthly")
def generate_monthly_report(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)
    try:
        pdf_bytes = _build_monthly_pdf(patient, db)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    now = datetime.now()
    doc_filename = f"report_monthly_{patient_id}_{now.strftime('%Y%m%d_%H%M%S')}.pdf"
    patient_dir  = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)
    with open(os.path.join(patient_dir, doc_filename), "wb") as fh:
        fh.write(pdf_bytes)

    doc_record = models.PatientDocument(
        patient_id   = patient_id,
        uploaded_by  = current_user.id,
        filename     = doc_filename,
        original_name= f"דוח חודשי — {patient.full_name} — {now.strftime('%d.%m.%Y')}.pdf",
        file_type    = "application/pdf",
        file_size    = len(pdf_bytes),
        category     = "דוח",
        notes        = f"דוח חודשי — הופק {now.strftime('%d/%m/%Y %H:%M')}",
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    safe_name = f"monthly-{patient_id}-{now.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/api/patients/{patient_id}/reports/discharge")
def generate_discharge_report(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)
    try:
        pdf_bytes = _build_discharge_pdf(patient, db)
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))

    now = datetime.now()
    doc_filename = f"report_discharge_{patient_id}_{now.strftime('%Y%m%d_%H%M%S')}.pdf"
    patient_dir  = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)
    with open(os.path.join(patient_dir, doc_filename), "wb") as fh:
        fh.write(pdf_bytes)

    doc_record = models.PatientDocument(
        patient_id   = patient_id,
        uploaded_by  = current_user.id,
        filename     = doc_filename,
        original_name= f"דוח סיום התקשרות — {patient.full_name} — {now.strftime('%d.%m.%Y')}.pdf",
        file_type    = "application/pdf",
        file_size    = len(pdf_bytes),
        category     = "דוח",
        notes        = f"דוח סיום התקשרות — הופק {now.strftime('%d/%m/%Y %H:%M')}",
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    safe_name = f"discharge-{patient_id}-{now.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/api/patients/{patient_id}/reports")
def list_patient_reports(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    docs = (
        db.query(models.PatientDocument)
        .filter(
            models.PatientDocument.patient_id == patient_id,
            models.PatientDocument.category   == "דוח",
        )
        .order_by(models.PatientDocument.created_at.desc())
        .all()
    )
    return [
        {
            "id":            d.id,
            "original_name": d.original_name,
            "file_size":     d.file_size,
            "notes":         d.notes,
            "created_at":    d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.get("/api/reports/recent")
def list_recent_reports(
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    docs = (
        db.query(models.PatientDocument, models.Patient)
        .join(models.Patient, models.PatientDocument.patient_id == models.Patient.id)
        .filter(models.PatientDocument.category == "דוח")
        .order_by(models.PatientDocument.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id":            d.id,
            "original_name": d.original_name,
            "patient_id":    d.patient_id,
            "patient_name":  p.full_name,
            "file_size":     d.file_size,
            "notes":         d.notes,
            "created_at":    d.created_at.isoformat() if d.created_at else None,
        }
        for d, p in docs
    ]
