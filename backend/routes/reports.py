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

UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.join(os.path.dirname(__file__), "../../uploads"),
)

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
