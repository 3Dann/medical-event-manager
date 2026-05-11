#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
דוח ביקורת מערכת — Orly Medical | מאי 2026
בנייה ישירה ב-ReportLab ללא המרת markdown
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from bidi.algorithm import get_display
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Fonts ─────────────────────────────────────────────────────────────────────
pdfmetrics.registerFont(TTFont("Arial",      "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))

# ── Colours ───────────────────────────────────────────────────────────────────
C = {
    'navy':      colors.HexColor("#1e3a5f"),
    'blue':      colors.HexColor("#2563eb"),
    'blue_lt':   colors.HexColor("#dbeafe"),
    'red':       colors.HexColor("#dc2626"),
    'red_lt':    colors.HexColor("#fee2e2"),
    'orange':    colors.HexColor("#ea580c"),
    'orange_lt': colors.HexColor("#ffedd5"),
    'yellow':    colors.HexColor("#d97706"),
    'yellow_lt': colors.HexColor("#fef3c7"),
    'green':     colors.HexColor("#16a34a"),
    'green_lt':  colors.HexColor("#dcfce7"),
    'slate':     colors.HexColor("#334155"),
    'slate_lt':  colors.HexColor("#f1f5f9"),
    'slate_mid': colors.HexColor("#64748b"),
    'line':      colors.HexColor("#e2e8f0"),
    'white':     colors.white,
    'black':     colors.HexColor("#0f172a"),
}

W, H = A4
MARGIN = 18 * mm
INNER = W - 2 * MARGIN

# ── RTL helper ─────────────────────────────────────────────────────────────────
def r(text):
    return get_display(str(text)) if text else ""

# ── Styles ─────────────────────────────────────────────────────────────────────
def S(name, **kw):
    base = dict(fontName="Arial", fontSize=10, leading=17,
                textColor=C['slate'], alignment=TA_RIGHT,
                rightIndent=0, leftIndent=0, spaceAfter=4)
    return ParagraphStyle(name, **{**base, **kw})

ST = {
    'title':   S("title", fontName="Arial-Bold", fontSize=26, leading=34,
                 textColor=C['white'], alignment=TA_RIGHT),
    'sub':     S("sub",   fontSize=12, leading=18, textColor=C['blue_lt'],
                 alignment=TA_RIGHT),
    'h1':      S("h1",   fontName="Arial-Bold", fontSize=16, leading=22,
                 textColor=C['navy'], spaceAfter=6, spaceBefore=14,
                 alignment=TA_RIGHT),
    'h2':      S("h2",   fontName="Arial-Bold", fontSize=13, leading=18,
                 textColor=C['white'], spaceAfter=4, alignment=TA_RIGHT),
    'h3':      S("h3",   fontName="Arial-Bold", fontSize=11, leading=16,
                 textColor=C['navy'], spaceAfter=3, spaceBefore=8,
                 alignment=TA_RIGHT),
    'body':    S("body", fontSize=10, leading=18, textColor=C['slate'],
                 spaceAfter=5, alignment=TA_RIGHT),
    'bold':    S("bold", fontName="Arial-Bold", fontSize=10, leading=17,
                 textColor=C['black'], alignment=TA_RIGHT),
    'small':   S("small", fontSize=8.5, leading=14, textColor=C['slate_mid'],
                 alignment=TA_RIGHT),
    'ref':     S("ref",  fontSize=9, leading=14, textColor=C['blue'],
                 alignment=TA_RIGHT),
    'rec':     S("rec",  fontSize=10, leading=17, textColor=C['navy'],
                 rightIndent=4, alignment=TA_RIGHT),
    'center':  S("center", fontSize=9, alignment=TA_CENTER,
                 textColor=C['slate_mid']),
    'label':   S("label", fontName="Arial-Bold", fontSize=9, leading=13,
                 textColor=C['white'], alignment=TA_CENTER),
}

# ── Page template ──────────────────────────────────────────────────────────────
TODAY = datetime.now().strftime("%d.%m.%Y")
TIME  = datetime.now().strftime("%H:%M")

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Arial", 8)
    canvas.setFillColor(C['slate_mid'])
    canvas.setStrokeColor(C['line'])
    canvas.setLineWidth(0.5)
    # header line
    canvas.line(MARGIN, H - 14*mm, W - MARGIN, H - 14*mm)
    canvas.drawRightString(W - MARGIN, H - 12*mm, r("Orly Medical — ביקורת מערכת מקיפה | מאי 2026"))
    # footer
    canvas.line(MARGIN, 13*mm, W - MARGIN, 13*mm)
    canvas.drawRightString(W - MARGIN, 9*mm, r(f"עמוד {doc.page}"))
    canvas.drawString(MARGIN, 9*mm, f"{TODAY} | {TIME}")
    canvas.restoreState()

# ── Helpers ────────────────────────────────────────────────────────────────────
def sp(h=6):
    return Spacer(1, h)

def hr(color=None, thick=0.5):
    return HRFlowable(width="100%", thickness=thick,
                      color=color or C['line'], spaceBefore=6, spaceAfter=6)

def section_header(title, color=None):
    bg = color or C['navy']
    tbl = Table([[Paragraph(r(title), ST['h2'])]],
                colWidths=[INNER])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("TOPPADDING",  (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0),(-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING",(0,0), (-1,-1), 12),
        ("ROUNDEDCORNERS", [6]),
    ]))
    return tbl

def severity_badge(text, bg, fg=None):
    fg = fg or C['white']
    return Table([[Paragraph(r(text), S("badge", fontName="Arial-Bold",
                                         fontSize=8.5, textColor=fg,
                                         alignment=TA_CENTER))]],
                 colWidths=[28*mm])

def finding_card(num, title, severity_text, severity_bg,
                 file_ref, body_lines, rec_lines=None):
    """
    כרטיס ממצא: כותרת | חומרה | קובץ | תיאור | המלצה
    """
    elems = []

    # Row 1: number + title + severity
    badge = severity_badge(severity_text, severity_bg)
    title_cell = Paragraph(r(f"{num}. {title}"), ST['h3'])
    header_row = Table(
        [[badge, title_cell]],
        colWidths=[32*mm, INNER - 32*mm],
    )
    header_row.setStyle(TableStyle([
        ("VALIGN",  (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN",   (0,0), (0,-1),  "CENTER"),
        ("ALIGN",   (1,0), (1,-1),  "RIGHT"),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",  (0,0), (-1,-1), 4),
    ]))
    elems.append(header_row)

    inner = []

    # file ref
    if file_ref:
        inner.append(Paragraph(r(f"📁  {file_ref}"), ST['ref']))
        inner.append(sp(3))

    # body
    for line in body_lines:
        inner.append(Paragraph(r(line), ST['body']))

    # recommendation
    if rec_lines:
        inner.append(sp(4))
        rec_bg = Table(
            [[Paragraph(r("המלצה"), ST['bold'])]
             ] + [[Paragraph(r(ln), ST['rec'])] for ln in rec_lines],
            colWidths=[INNER - 20*mm],
        )
        rec_bg.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), C['blue_lt']),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ]))
        inner.append(rec_bg)

    card_inner = Table(
        [[inner_item] for inner_item in inner],
        colWidths=[INNER - 8*mm],
    )
    card_inner.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING",   (0,0), (-1,-1), 2),
        ("BOTTOMPADDING",(0,0), (-1,-1), 2),
    ]))

    card = Table(
        [[elems[0]], [card_inner]],
        colWidths=[INNER],
    )
    card.setStyle(TableStyle([
        ("BOX",           (0,0), (-1,-1), 0.8, C['line']),
        ("BACKGROUND",    (0,0), (0, 0),  C['slate_lt']),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
    ]))
    return KeepTogether([card, sp(8)])

# severity colours
SEV = {
    'קריטי': (C['red'],    C['red_lt']),
    'גבוה':  (C['orange'], C['orange_lt']),
    'בינוני':(C['yellow'], C['yellow_lt']),
    'נמוך':  (C['green'],  C['green_lt']),
}

def fc(num, title, sev, file_ref, body, rec=None):
    fg, bg = SEV.get(sev, (C['slate'], C['slate_lt']))
    return finding_card(num, title, sev, fg, file_ref, body, rec)

def bullet(text):
    return Paragraph(r(f"• {text}"), ST['body'])

def bold_line(text):
    return Paragraph(r(text), ST['bold'])

# ══════════════════════════════════════════════════════════════════════════════
# Story
# ══════════════════════════════════════════════════════════════════════════════
story = []

# ── COVER ──────────────────────────────────────────────────────────────────────
cover = Table(
    [
        [Paragraph(r("ביקורת מערכת מקיפה"), ST['title'])],
        [Paragraph(r("Orly Medical — מנהל אירוע רפואי"), ST['sub'])],
        [sp(8)],
        [Paragraph(r(f"מאי 2026 | {TODAY}"), ST['sub'])],
    ],
    colWidths=[INNER],
)
cover.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,-1), C['navy']),
    ("TOPPADDING",    (0,0), (-1,-1), 10),
    ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ("LEFTPADDING",   (0,0), (-1,-1), 20),
    ("RIGHTPADDING",  (0,0), (-1,-1), 20),
    ("ROUNDEDCORNERS", [8]),
]))
story += [cover, sp(16)]

# summary stats
summary_data = [
    [Paragraph(r("72"), S("n", fontName="Arial-Bold", fontSize=22, textColor=C['navy'], alignment=TA_CENTER)),
     Paragraph(r("12"), S("n", fontName="Arial-Bold", fontSize=22, textColor=C['red'],    alignment=TA_CENTER)),
     Paragraph(r("18"), S("n", fontName="Arial-Bold", fontSize=22, textColor=C['orange'], alignment=TA_CENTER)),
     Paragraph(r("30"), S("n", fontName="Arial-Bold", fontSize=22, textColor=C['yellow'], alignment=TA_CENTER)),
     Paragraph(r("12"), S("n", fontName="Arial-Bold", fontSize=22, textColor=C['green'],  alignment=TA_CENTER)),
    ],
    [Paragraph(r("סה״כ ממצאים"), ST['small']),
     Paragraph(r("קריטיים"),  ST['small']),
     Paragraph(r("גבוהים"),   ST['small']),
     Paragraph(r("בינוניים"), ST['small']),
     Paragraph(r("נמוכים"),   ST['small']),
    ],
]
col_w = INNER / 5
summary_tbl = Table(summary_data, colWidths=[col_w]*5)
summary_tbl.setStyle(TableStyle([
    ("ALIGN",         (0,0), (-1,-1), "CENTER"),
    ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ("BACKGROUND",    (0,0), (-1,-1), C['slate_lt']),
    ("BOX",           (0,0), (-1,-1), 0.5, C['line']),
    ("INNERGRID",     (0,0), (-1,-1), 0.3, C['line']),
    ("TOPPADDING",    (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
]))
story += [summary_tbl, sp(12)]

# ── EXECUTIVE SUMMARY ──────────────────────────────────────────────────────────
story.append(Paragraph(r("תקציר מנהלים"), ST['h1']))
story.append(hr(C['blue'], 1.5))
story.append(Paragraph(
    r("בוצעה ביקורת מקיפה של מערכת Orly Medical על ידי חמישה agents מקצועיים שפעלו במקביל. "
      "הביקורת כיסתה חמישה תחומים: אבטחה, UX ונגישות, ארכיטקטורת Backend, איכות Frontend ומוכנות לייצור."),
    ST['body']))
story.append(sp(4))
story.append(Paragraph(
    r("ציון כולל: 3.3 מתוך 10 — המערכת מתאימה לסביבת staging עם משתמשים בודדים. "
      "לפני פתיחה ללקוחות אמיתיים נדרשים תיקונים קריטיים בהגנת נתונים, ניטור שגיאות וגיבויים."),
    ST['bold']))
story.append(sp(12))

# score table
score_rows = [
    [Paragraph(r("תחום"), ST['h2']),        Paragraph(r("ציון"), ST['h2'])],
    [Paragraph(r("אבטחה"),                   ST['body']), Paragraph(r("5.5 / 10"), ST['bold'])],
    [Paragraph(r("UX ונגישות"),              ST['body']), Paragraph(r("6.5 / 10"), ST['bold'])],
    [Paragraph(r("ארכיטקטורת Backend"),      ST['body']), Paragraph(r("6.0 / 10"), ST['bold'])],
    [Paragraph(r("איכות Frontend"),          ST['body']), Paragraph(r("6.0 / 10"), ST['bold'])],
    [Paragraph(r("מוכנות לייצור"),           ST['body']), Paragraph(r("3.3 / 10"), ST['bold'])],
]
score_tbl = Table(score_rows, colWidths=[INNER - 40*mm, 40*mm])
score_tbl.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1, 0),  C['navy']),
    ("ROWBACKGROUNDS",(0,1), (-1,-1),  [C['white'], C['slate_lt']]),
    ("BOX",           (0,0), (-1,-1),  0.5, C['line']),
    ("INNERGRID",     (0,0), (-1,-1),  0.3, C['line']),
    ("ALIGN",         (0,0), (-1,-1),  "RIGHT"),
    ("ALIGN",         (1,0), (1,-1),   "CENTER"),
    ("VALIGN",        (0,0), (-1,-1),  "MIDDLE"),
    ("TOPPADDING",    (0,0), (-1,-1),  7),
    ("BOTTOMPADDING", (0,0), (-1,-1),  7),
    ("RIGHTPADDING",  (0,0), (-1,-1),  10),
    ("LEFTPADDING",   (0,0), (-1,-1),  10),
]))
story += [score_tbl, sp(16)]

# ══════════════════════════════════════════════════════════════════════════════
# SECTION A — SECURITY
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("פרק א — ביקורת אבטחה", C['red']))
story.append(sp(10))

story.append(fc(1, "ערך ברירת מחדל ל-JWT Secret",
    "קריטי", "backend/auth.py — שורה 12",
    ["ה-SECRET_KEY מוגדר בקוד עצמו כ-fallback. כל מי שרואה את ה-repository "
     "יכול לזייף JWT tokens ולהתחזות לכל משתמש, כולל אדמין."],
    ["הטל RuntimeError אם SECRET_KEY לא מוגדר כמשתנה סביבה בעת הפעלה.",
     "המפתח הנוכחי ב-Railway תקין — יש לוודא שלא תוחלף ל-default בשום מקרה."]))

story.append(fc(2, "קודי 2FA ואיפוס סיסמה — קצרים מדי",
    "קריטי", "backend/routes/auth.py — שורות 164, 190",
    ["הקוד משתמש ב-token_hex(3) — רק 16 מיליון אפשרויות. "
     "תקיפת brute-force בקצב נמוך יכולה לנחש קוד תוך שעות."],
    ["עדכן ל-token_urlsafe(32) — 2 בחזקת 256 אפשרויות.",
     "הוסף rate limiting של 3 ניסיונות בלבד לכל 5 דקות על verify-2fa."]))

story.append(fc(3, "אין Account Lockout",
    "גבוה", "backend/routes/auth.py — שורות 92–106",
    ["אין נעילת חשבון לאחר ניסיונות התחברות כושלים. "
     "Rate limiting לפי IP בלבד — ניתן לעקוף עם רשתות proxy."],
    ["נעל חשבון 15 דקות לאחר 5 ניסיונות כושלים.",
     "שלח הודעת דוא״ל למשתמש על כל ניסיון חריג."]))

story.append(fc(4, "View Tokens בזיכרון בלבד",
    "גבוה", "backend/routes/documents.py — שורה 14",
    ["_VIEW_TOKENS הוא dict בזיכרון התהליך. הולך לאיבוד בכל restart של השרת. "
     "לא ניתן לביקורת, לא עמיד לקריסות."],
    ["מגרט ל-DB table: DocumentViewToken עם שדות token, expires_at, is_used, created_by."]))

story.append(fc(5, "Family Share — אין לוג ביטול",
    "גבוה", "backend/routes/family_share.py — שורות 43–70",
    ["כשמבטלים קישור לבן משפחה אין רישום של מי ביטל ומתי.",
     "אין שדות revoked_at ו-revoked_by ב-FamilyShareToken."],
    ["הוסף שדות ביטול ל-FamilyShareToken.",
     "רשום את פעולת הביטול ב-audit log."]))

story.append(fc(6, "CORS — שיטות HTTP פתוחות",
    "גבוה", "backend/main.py — שורה 106",
    ["allow_methods ו-allow_headers מוגדרים כ-wildcard. "
     "כל שיטת HTTP וכל header מתקבלים ממקורות מורשים."],
    ["הגדר רשימה מפורשת: GET, POST, PUT, DELETE בלבד.",
     "הגדר headers מפורשים: Content-Type, Authorization בלבד."]))

story.append(fc(7, "Audit Log — לא מכסה endpoints של 2FA",
    "בינוני", "backend/audit_middleware.py — שורה 14",
    ["הנתיבים verify-2fa, forgot-password ו-reset-password אינם מתועדים. "
     "ניסיונות תקיפה לא יירשמו בלוג הביקורת."]))

story.append(fc(8, "File Upload — MIME bypass אפשרי",
    "בינוני", "backend/routes/documents.py — שורה 109",
    ["אם content_type הוא None, בדיקת MIME מדולגת. "
     "Magic bytes נבדקים תמיד — אך עדיף לדחות קבצים ללא content-type מפורש."]))

story.append(fc(9, "User-Agent — חיתוך ב-200 תווים",
    "נמוך", "backend/audit_middleware.py — שורה 90",
    ["User-Agent מודרני יכול להיות ארוך מ-200 תווים — המידע נקטע.",
     "שנה ל-500 תווים."]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# SECTION B — UX
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("פרק ב — ביקורת UX ונגישות", C['blue']))
story.append(sp(6))
story.append(Paragraph(r("ציון WCAG AA: 6.5/10   |   ציון IS 5568 (נגישות ישראלי): 5/10"), ST['bold']))
story.append(sp(10))

story.append(fc(10, "ניגודיות — צבעי טקסט בהירים על רקע לבן",
    "גבוה", "PatientSummary.jsx — שורות 244, 298–300",
    ["text-slate-500 ו-text-slate-400 על רקע לבן — contrast ratio נמוך מ-4.5:1.",
     "תאריכים, קטגוריות ומידע קריטי אינם קריאים דיים לאנשים עם ראייה מוגבלת.",
     "תקן WCAG AA דורש יחס ניגודיות של 4.5:1 לפחות לטקסט רגיל."],
    ["החלף text-slate-500/400 ב-text-slate-700 בכל תוכן קריטי."]))

story.append(fc(11, "כפתורים — גובה לא עקבי",
    "גבוה", "PatientSummary.jsx — שורה 81",
    ["כפתור 'חזרה לדף הבית' מוגדר עם py-1 בלבד — גובה ~24px.",
     "תקן WCAG דורש שטח לחיצה מינימלי של 44px לכל ממד."],
    ["הוסף min-h-[44px] על כל כפתורים אינטראקטיביים בפורטל המטופל."]))

story.append(fc(12, "טקסט קטן בניווט תחתון",
    "גבוה", "PatientSummary.jsx — שורה 859",
    ["תוויות הניווט התחתון מוגדרות עם text-xs — קטן מדי לאנשים מבוגרים.",
     "מינימום מומלץ לתוכן ניווט: text-sm."],
    ["שנה ל-text-sm בניווט התחתון של פורטל המטופל."]))

story.append(fc(13, "RTL חסר בחלק מהמודלים",
    "גבוה", "ManagerLayout.jsx ורכיבים נוספים",
    ["חלק מהמודלים והדרייברים לא מגדירים dir=rtl בשורש שלהם.",
     "רכיבים מקבלים כיוון LTR מברירת מחדל של הדפדפן."],
    ["כל modal root וכל drawer חייבים dir=rtl מפורש."]))

story.append(fc(14, "Loading States — לא עקביים",
    "בינוני", "ManagerDashboard.jsx, PatientDetail.jsx, MyDay.jsx",
    ["חלק מהדפים מציגים 'טוען...' כטקסט פשוט, חלקם spinner, חלקם ריק לחלוטין.",
     "חוסר עקביות ויזואלית פוגע באמון המשתמש."],
    ["צור Skeleton.jsx מרכזי עם animation ו-Tailwind.",
     "השתמש בו בכל מקומות הטעינה באחידות."]))

story.append(fc(15, "aria-label חסר — תקן IS 5568",
    "בינוני", "IntakeWizard.jsx, PatientDetail.jsx",
    ["תקן IS 5568 דורש aria-label על כל שדה מורכב.",
     "Screen reader testing לא בוצע על אף רכיב במערכת.",
     "שדות תאריך מורכבים (DateSegment) אינם נגישים לקוראי מסך."],
    ["הוסף aria-label לכל שדה קלט מורכב.",
     "בצע בדיקת screen reader לפחות על פורטל המטופל."]))

story.append(fc(16, "נקודות חיוביות בפורטל המטופל",
    "נמוך", "PatientSummary.jsx",
    ["leading-[1.8] מוגדר — מרווח שורות מיטבי לעברית.",
     "כפתור עזרה '?' קבוע בפינה — פעיל ומתאים לדף.",
     "כפתור קריאה קולית (Web Speech API) — ייחודי ונגיש.",
     "BottomNav לניווט מובייל — נכון ונוח.",
     "מצב פשוט (SimpleContext) — מפחית עומס קוגניטיבי."]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# SECTION C — BACKEND
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("פרק ג — ביקורת ארכיטקטורת Backend", C['slate']))
story.append(sp(10))

story.append(fc(17, "SQLite ללא WAL Mode",
    "קריטי", "backend/database.py — שורות 6–12",
    ["SQLite בהגדרות ברירת מחדל חוסם קריאות בזמן כתיבה.",
     "ב-production עם מספר workers — כל כתיבה גורמת ל-timeout לכל שאר הבקשות.",
     "בשרת Railway שמריץ מספר threads — זה מתרחש בכל פעולת שמירה."],
    ["הוסף PRAGMA journal_mode=WAL ב-connect event.",
     "לטווח בינוני: הגר ל-PostgreSQL managed שמציע Railway."]))

story.append(fc(18, "N+1 Queries בסינכרון משימות",
    "קריטי", "backend/routes/tasks.py — שורות 51–76",
    ["_sync_tasks_for_manager() שולחת query נפרד לכל מטופל לכל סוג נתון.",
     "עם 50 מטופלים: 200+ queries לכל בקשה לדף 'היום שלי'.",
     "בזמן peak usage — המערכת תאט משמעותית."],
    ["שימוש ב-joinedload() ו-selectinload() מ-SQLAlchemy.",
     "אפשרות חלופית: batch load כל הנתונים בשאילתה אחת עם IN clause."]))

story.append(fc(19, "flow_engine — שגיאות נבלעות בשקט",
    "גבוה", "backend/flow_engine.py — שורות 46, 52, 91",
    ["שלושה בלוקי except Exception: pass בחישוב כיסוי ביטוחי.",
     "שגיאות קריטיות בחישוב לא מוצגות ולא נרשמות.",
     "המנהל לא יודע שחישוב הכיסוי נכשל."],
    ["החלף כל except: pass ב-logger.exception().",
     "הוסף הודעת שגיאה ב-response כשחישוב נכשל."]))

story.append(fc(20, "APScheduler — אין מגבלת ריצות מקבילות",
    "גבוה", "backend/main.py — שורה 60",
    ["weekly drug update מוגדר ללא max_instances=1.",
     "אם job קודם עדיין רץ, יתחיל עוד אחד במקביל.",
     "גורם ל-duplicate drugs ול-race conditions ב-DB."],
    ["הוסף max_instances=1 לכל job ב-APScheduler."]))

story.append(fc(21, "Cascade Delete חסר בתביעות",
    "גבוה", "backend/models.py — שורה 358",
    ["Claim.insurance_source_id ללא cascade.",
     "מחיקת InsuranceSource משאיר תביעות ייתומות ב-DB."],
    ["הוסף cascade=all, delete לכל relationship קריטי."]))

story.append(fc(22, "Drug Search — טוען הכל לזיכרון",
    "בינוני", "backend/routes/medications.py — שורות 64–89",
    ["_search_db() טוענת את כל 1,162 התרופות לזיכרון בכל בקשת חיפוש.",
     "יעילות ירודה; עם גידול מאגר — יגרום ל-memory pressure."],
    ["שנה ל-DB LIKE query עם LIMIT 20."]))

story.append(fc(23, "מודל User — חסרים שדות ביקורת",
    "בינוני", "backend/models.py",
    ["אין last_login ו-last_activity ב-User model.",
     "קשה לזהות חשבונות לא פעילים ולתחקר כניסות."],
    ["הוסף last_login: DateTime ו-last_activity: DateTime.",
     "עדכן בכל login ובכל API request מאומת."]))

story.append(fc(24, "View Token TTL — 90 שניות קצר מדי",
    "נמוך", "backend/routes/documents.py — שורה 180",
    ["אם PDF reader פותח לאט, ה-token פג לפני שהקובץ נפתח.",
     "גורם ל-UX שגוי — המשתמש רואה שגיאת 401."],
    ["הגדל ל-300 שניות (5 דקות)."]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# SECTION D — FRONTEND
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("פרק ד — ביקורת איכות Frontend", C['blue']))
story.append(sp(10))

story.append(fc(25, "אין Error Boundary",
    "קריטי", "frontend/src/App.jsx",
    ["אם רכיב React כלשהו זורק exception — הכל קורס.",
     "אין fallback UI. המשתמש רואה דף לבן ריק.",
     "React דורש Class Component עם componentDidCatch לטיפול בשגיאות."],
    ["צור ErrorBoundary component ועטוף כל ProtectedRoute."]))

story.append(fc(26, "אין 401 Interceptor — Token Expiry שקט",
    "קריטי", "frontend/src/main.jsx",
    ["כשה-JWT פג, בקשות API נכשלות בשקט.",
     "המשתמש אינו מנותק, אינו מקבל הודעה, הנתונים לא מתעדכנים.",
     "המשתמש יכול לחשוב שהמערכת עובדת בעוד כל הפעולות נכשלות."],
    ["הוסף axios interceptor שמטפל ב-401: מנקה localStorage ומפנה לדף הכניסה."]))

story.append(fc(27, "שגיאות API נבלעות בשקט — 38 מקומות",
    "גבוה", "ManagerDashboard.jsx, AdminPage.jsx, DoctorsDatabase.jsx ועוד",
    ["38 מקומות בקוד משתמשים ב-catch שמדפיס ל-console בלבד.",
     "המשתמש לא יודע שפעולה נכשלה — אין הודעת שגיאה."],
    ["החלף כל catch { console.error } ב-showToast עם הודעה בעברית."]))

story.append(fc(28, "IntakeWizard — שמירת תרופות שקטה",
    "גבוה", "frontend/src/pages/manager/IntakeWizard.jsx — שורה 662",
    ["אם שמירת תרופה ב-API נכשלת, אין הודעה למשתמש.",
     "המשתמש עלול לחשוב שהתרופה נשמרה בעוד לא נשמרה."],
    ["הוסף toast עם הודעת שגיאה ברורה בכישלון שמירת תרופה."]))

story.append(fc(29, "fmtDate — כפילות בשלושה קבצים",
    "בינוני", "PatientSummary.jsx, MyDay.jsx, DemoPatientPortal.jsx",
    ["פונקציית fmtDate מוגדרת ומועתקת בשלושה קבצים שונים.",
     "שינוי בפורמט תאריך ידרוש עדכון בכל שלושת המקומות."],
    ["צור frontend/src/utils/formatters.js ויצא משם."]))

story.append(fc(30, "פורטלי דמו — תקינים ומוכנים להצגה",
    "נמוך", "pages/demo/DemoPatientPortal.jsx, DemoBrokerPortal.jsx",
    ["DemoPatientPortal — נתוני דמו מציאותיים, כל הניווט פעיל.",
     "DemoBrokerPortal — סטטיסטיקות, רשימת מטופלים, פעילות אחרונה.",
     "Demo Launcher — נגיש למנהל-על בלבד, banner סגול ברור.",
     "מוכנים לשימוש בהצגות ובדמואים."]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# SECTION E — PRODUCTION
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("פרק ה — מוכנות לייצור", C['red']))
story.append(sp(6))
story.append(Paragraph(r("ציון מוכנות: 3.3 מתוך 10"), ST['bold']))
story.append(sp(10))

story.append(fc(31, "אין גיבוי — סיכון אובדן נתונים מוחלט",
    "קריטי", "Railway Volume / data/medical_event_manager.db",
    ["אין backup strategy כלשהי.",
     "אם Railway Volume נפגע — כל נתוני המטופלים, תביעות, מסמכים וביטוחים אבודים לצמיתות.",
     "אין recovery path. אין snapshot. אין export אוטומטי."],
    ["יישם daily backup job שמעביר DB ל-S3 או Cloudflare R2.",
     "הוסף endpoint אדמין ידני לטריגר backup מיידי.",
     "בדוק תקינות backup אחת לשבוע."]))

story.append(fc(32, "SQLite — לא מתאים לריבוי instances",
    "קריטי", "backend/database.py",
    ["SQLite לא תוכנן לריבוי processes שכותבים בו זמנית.",
     "Railway יכול להוסיף instances בעומס — זה יגרום ל-write locks ו-data corruption.",
     "אין WAL mode — כל כתיבה חוסמת את כל הקריאות."],
    ["הגר ל-PostgreSQL managed — Railway מציע זאת בחינם עד גבול.",
     "לטווח קצר: הפעל WAL mode וודא single-instance."]))

story.append(fc(33, "אין ניטור שגיאות",
    "קריטי", "כל המערכת",
    ["אין Sentry, Rollbar או כל כלי ניטור.",
     "כשהשרת קורס — אין התראה. Logs ב-Railway נשמרים רק 3 ימים.",
     "Debug בייצור מצריך גישה ל-Railway CLI בזמן אמת."],
    ["התקן sentry-sdk והגדר DSN כמשתנה סביבה.",
     "עלות: חינם עד 5,000 events לחודש.",
     "זמן הטמעה: 4 שעות."]))

story.append(fc(34, "Railway Volume — לא מוגדר כ-persistent",
    "קריטי", "Railway config",
    ["אין railway.toml המגדיר את Volume כ-persistent.",
     "deploy יכול להחליף container ולאבד את כל ה-/data.",
     "כל railway up — סיכון אובדן נתונים."],
    ["הוסף railway.toml עם הגדרת Volume מפורשת.",
     "בדוק שהגדרת Volume מוצגת ב-Railway Dashboard."]))

story.append(fc(35, "CORS לא מוגדר לדומיין ייצור",
    "גבוה", "backend/main.py — שורות 97–100",
    ["FRONTEND_ORIGIN מוגדר ב-Railway אך לא ב-CORS כברירת מחדל.",
     "אם frontend עובר ל-Cloudflare / CDN — כל בקשות API ייחסמו."],
    ["הוסף FRONTEND_ORIGIN לרשימת allowed origins.",
     "בדוק CORS עובד מדומיין ormed.co.il."]))

story.append(fc(36, "Migrations — אין rollback",
    "גבוה", "backend/main.py — שורות 129–265",
    ["run_migrations() עם Raw SQL ללא version tracking.",
     "Migration שנכשל חצי דרך משאיר schema שבור.",
     "אין מנגנון rollback או history של שינויים."],
    ["לטווח ארוך: הגר ל-Alembic.",
     "לטווח קצר: הוסף version tracking ו-logger.error בכל כישלון."]))

story.append(fc(37, "Health Check לא בודק DB",
    "בינוני", "backend/main.py — endpoint /api/health",
    ["endpoint /api/health מחזיר 200 גם אם SQLite קרס.",
     "Railway לא ידע שהשרת אינו מתפקד."],
    ["הוסף SELECT 1 ל-DB בבדיקת health.",
     "החזר status 503 אם DB לא מגיב."]))

story.append(fc(38, "Rate Limiting — לא מכסה כל endpoints",
    "בינוני", "backend/routes/documents.py, routes/admin.py",
    ["העלאת מסמכים, חיפוש תרופות וייצוא נתונים — ללא rate limit.",
     "מאפשר שימוש לרעה ו-DoS על endpoints כבדים."],
    ["הגדר rate limit על כל endpoint שעושה עבודה כבדה."]))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════
# ACTION PLAN
# ══════════════════════════════════════════════════════════════════════════════
story.append(Paragraph(r("תוכנית פעולה"), ST['h1']))
story.append(hr(C['blue'], 1.5))
story.append(sp(8))

months = [
    ("חודש 1 — ייצוב והגנת נתונים", C['red'], [
        ("שבוע ראשון", [
            "הגדר Sentry לניטור שגיאות (4 שעות)",
            "יישם daily backup ל-S3 (8 שעות)",
            "הוסף railway.toml עם הגדרת Volume",
            "הגדר WAL mode ל-SQLite",
        ]),
        ("שבוע שני–שלישי", [
            "הגר ל-PostgreSQL managed ב-Railway",
            "הוסף 401 interceptor ב-frontend",
            "הוסף Error Boundary לכל ProtectedRoute",
            "החלף console.error ב-showToast",
        ]),
        ("שבוע רביעי", [
            "תיקון N+1 queries בסינכרון משימות",
            "הוסף max_instances לAPScheduler jobs",
            "הוסף account lockout לאחר 5 ניסיונות",
        ]),
    ]),
    ("חודש 2 — שיפורי UX ומשתמשים", C['blue'], [
        ("שבוע חמישי–שישי", [
            "דשבורד ניהולי — סקירת כל המלווים ועומס תיקים",
            "מערכת התראות — דדליינים וחידוש ביטוחים",
        ]),
        ("שבוע שביעי–שמיני", [
            "ניהול sessions — מי מחובר כרגע",
            "הרשאות הורדה גרנולריות",
            "Rate limiting על כל endpoints כבדים",
        ]),
    ]),
    ("חודש 3 — פיצ'רים ונגישות", C['slate'], [
        ("שבוע תשיעי–עשירי", [
            "עורך תבניות Workflow",
            "תיקוני IS 5568 — aria-label וboundary testing",
            "Skeleton loaders אחיד בכל המערכת",
        ]),
        ("שבוע אחד-עשר–שנים-עשר", [
            "התראות חכמות — זיהוי פערי ביטוח אוטומטי",
            "בדיקת ביצועים וייעול",
            "בדיקה עם משתמשים מעל גיל 65",
        ]),
    ]),
]

for month_title, month_color, weeks in months:
    story.append(Paragraph(r(month_title), ST['h3']))
    story.append(sp(4))
    for week_title, tasks in weeks:
        story.append(Paragraph(r(week_title), ST['bold']))
        for task in tasks:
            story.append(bullet(task))
        story.append(sp(4))
    story.append(sp(6))

story.append(hr())

# ── POSITIVE SUMMARY ───────────────────────────────────────────────────────────
story.append(Paragraph(r("מה עובד טוב"), ST['h1']))
story.append(hr(C['green'], 1.5))
story.append(sp(6))

positives = [
    "JWT עם 2FA מלא — TOTP, דוא״ל ו-WebAuthn מוגדרים ופעילים",
    "bcrypt להצפנת סיסמאות ו-SQLAlchemy עם parameterized queries — אין SQL injection",
    "Audit middleware מיירט 17 סוגי פעולות ורושם לוג מלא",
    "Rate limiting מוגדר על endpoints קריטיים עם Railway-aware IP detection",
    "Security headers — X-Frame-Options, HSTS, Referrer-Policy פעילים",
    "Magic bytes validation לקבצים מועלים — מעבר לבדיקת MIME בלבד",
    "View tokens חד-פעמיים עם TTL לצפייה במסמכים",
    "פורטל מטופל עם leading-1.8, כפתור עזרה, קריאה קולית ומצב פשוט",
    "פורטלי דמו (מטופל וברוקר) עם נתוני דמו מציאותיים — מוכנים להצגה",
    "ICS calendar feed לפי RFC 5545 עם tasks, פגישות ו-workflow deadlines",
    "מערכת תרופות עם 1,162 תרופות, 842 שמות עבריים וחיפוש חכם",
    "CLAUDE.md תיעוד מקיף — שומר context בין מכונות ושיחות",
]
for p in positives:
    story.append(bullet(p))

story.append(sp(16))
story.append(Paragraph(r("— סיום הדוח —"), S("end", fontSize=9,
    textColor=C['slate_mid'], alignment=TA_CENTER)))

# ══════════════════════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════════════════════
OUT = os.path.join(os.path.dirname(__file__), "audit_report_2026_05.pdf")
doc = SimpleDocTemplate(
    OUT,
    pagesize=A4,
    rightMargin=MARGIN, leftMargin=MARGIN,
    topMargin=20*mm, bottomMargin=20*mm,
    title="ביקורת מערכת מקיפה — Orly Medical",
    subject="דוח ביקורת אבטחה, UX, Backend, Frontend ומוכנות לייצור",
    author="Orly Medical — System Audit",
)
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"✅  {OUT} נוצר בהצלחה!")
