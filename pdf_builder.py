#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shared PDF builder — Hebrew RTL support via python-bidi.
Usage: from pdf_builder import build_pdf
"""

import re
from datetime import datetime
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_RIGHT, TA_LEFT

# ── Fonts ─────────────────────────────────────────────────────────────────────
_FONT_DIR = "/System/Library/Fonts/Supplemental"
_LIB_FONT = "/Library/Fonts"
_registered = False

def _register_fonts():
    global _registered
    if _registered:
        return
    pdfmetrics.registerFont(TTFont("Arial",       f"{_FONT_DIR}/Arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold",  f"{_FONT_DIR}/Arial Bold.ttf"))
    pdfmetrics.registerFont(TTFont("ArialUni",    f"{_LIB_FONT}/Arial Unicode.ttf"))
    _registered = True

# ── Colours ───────────────────────────────────────────────────────────────────
BLUE_DARK   = colors.HexColor("#1e40af")
BLUE_MED    = colors.HexColor("#3b82f6")
SLATE_DARK  = colors.HexColor("#0f172a")
SLATE_MED   = colors.HexColor("#1e293b")
SLATE_LIGHT = colors.HexColor("#f8fafc")
SLATE_LINE  = colors.HexColor("#e2e8f0")
SLATE_MUTED = colors.HexColor("#94a3b8")
HEADER_BG   = colors.HexColor("#f1f5f9")
CODE_BG     = colors.HexColor("#0f172a")
CODE_FG     = colors.HexColor("#e2e8f0")
WHITE       = colors.white

PAGE_W, PAGE_H = A4


# ── bidi helper ───────────────────────────────────────────────────────────────
def rtl(text: str) -> str:
    """Convert Hebrew logical string to visual display order."""
    if not text:
        return text
    return get_display(text)


def rtl_markup(text: str) -> str:
    """
    Apply bidi fix to text that may contain ReportLab XML tags.
    Splits on tags, fixes only plain-text segments, reassembles.
    """
    if not text:
        return text
    parts = re.split(r'(<[^>]+>)', text)
    result = []
    for part in parts:
        if part.startswith('<'):
            result.append(part)
        else:
            result.append(get_display(part) if part.strip() else part)
    return ''.join(result)


# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    _register_fonts()
    base = dict(fontName="Arial", leading=16, textColor=SLATE_MED,
                rightIndent=0, leftIndent=0)

    def s(name, **kw):
        return ParagraphStyle(name, **{**base, **kw})

    return {
        "h1":    s("h1",  fontName="Arial-Bold", fontSize=22, leading=30,
                   textColor=SLATE_DARK, spaceAfter=8, alignment=TA_RIGHT),
        "h2":    s("h2",  fontName="Arial-Bold", fontSize=14, leading=20,
                   textColor=BLUE_DARK, spaceAfter=6, spaceBefore=18,
                   alignment=TA_RIGHT),
        "h3":    s("h3",  fontName="Arial-Bold", fontSize=11, leading=16,
                   textColor=SLATE_DARK, spaceAfter=5, spaceBefore=10,
                   backColor=HEADER_BG, borderPadding=(4, 8, 4, 8),
                   alignment=TA_RIGHT),
        "h4":    s("h4",  fontName="Arial-Bold", fontSize=10, leading=15,
                   textColor=SLATE_MED, spaceAfter=4, spaceBefore=8,
                   alignment=TA_RIGHT),
        "body":  s("body", fontSize=10, leading=17, spaceAfter=4,
                   alignment=TA_RIGHT),
        "bullet":s("bullet", fontSize=10, leading=16, spaceAfter=3,
                   rightIndent=10, alignment=TA_RIGHT),
        "code":  s("code", fontName="ArialUni", fontSize=8, leading=13,
                   textColor=CODE_FG, backColor=CODE_BG,
                   borderPadding=(8, 10, 8, 10), alignment=TA_LEFT,
                   spaceAfter=8, spaceBefore=4),
        "th":    s("th",  fontName="Arial-Bold", fontSize=9, leading=13,
                   textColor=WHITE, alignment=TA_RIGHT),
        "td":    s("td",  fontSize=9, leading=13, textColor=SLATE_MED,
                   alignment=TA_RIGHT),
        "meta":  s("meta", fontSize=9, textColor=SLATE_MUTED,
                   spaceAfter=2, alignment=TA_RIGHT),
    }


def make_header_footer(header_text: str, generated_at: str = ""):
    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont("Arial", 8)
        canvas.setFillColor(SLATE_MUTED)
        canvas.setStrokeColor(SLATE_LINE)
        canvas.setLineWidth(0.5)
        canvas.line(18*mm, PAGE_H - 14*mm, PAGE_W - 18*mm, PAGE_H - 14*mm)
        canvas.drawRightString(PAGE_W - 18*mm, PAGE_H - 12*mm, rtl(header_text))
        canvas.line(18*mm, 13*mm, PAGE_W - 18*mm, 13*mm)
        canvas.drawRightString(PAGE_W - 18*mm, 8*mm, rtl(f"עמוד {doc.page}"))
        footer_date = generated_at or datetime.now().strftime("%d/%m/%Y %H:%M")
        canvas.drawString(18*mm, 8*mm, rtl(f"הופק: {footer_date}"))
        canvas.restoreState()
    return on_page


# ── Inline markup parser ──────────────────────────────────────────────────────
def parse_inline(text: str) -> str:
    """Escape HTML, apply bidi, then inject ReportLab bold/code markup."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # apply bidi to the whole string first (before adding tags)
    text = get_display(text)
    # now add markup (these are ASCII tags, safe after bidi)
    text = re.sub(r'`([^`]+)`',
                  lambda m: f'<font name="ArialUni" color="#be185d">{m.group(1)}</font>',
                  text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*([^*]+)\*',    r'<i>\1</i>', text)
    return text


# ── Markdown → Flowables ──────────────────────────────────────────────────────
def md_to_flowables(md_text: str, ST: dict) -> list:
    story = []
    lines = md_text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # Headings
        if line.startswith("#### "):
            story.append(Paragraph(parse_inline(line[5:]), ST["h4"]))
            i += 1; continue
        if line.startswith("### "):
            story.append(KeepTogether([Paragraph(parse_inline(line[4:]), ST["h3"])]))
            i += 1; continue
        if line.startswith("## "):
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=SLATE_LINE, spaceAfter=2))
            story.append(KeepTogether([Paragraph(parse_inline(line[3:]), ST["h2"])]))
            i += 1; continue
        if line.startswith("# "):
            story.append(Paragraph(parse_inline(line[2:]), ST["h1"]))
            story.append(HRFlowable(width="100%", thickness=2,
                                    color=BLUE_MED, spaceAfter=6))
            i += 1; continue

        # HR
        if re.match(r'^-{3,}$', line):
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=SLATE_LINE, spaceBefore=8, spaceAfter=8))
            i += 1; continue

        # Code block
        if line.startswith("```"):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            raw = "\n".join(code_lines)
            raw = raw.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(raw.replace("\n", "<br/>"), ST["code"]))
            i += 1; continue

        # Table
        if "|" in line and line.strip().startswith("|"):
            table_lines = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip().startswith("|"):
                table_lines.append(lines[i])
                i += 1
            rows = [r for r in table_lines
                    if not re.match(r'^\|[\s\-:|]+\|', r)]
            if rows:
                data = []
                for idx, row in enumerate(rows):
                    cells = [c.strip() for c in row.strip().strip("|").split("|")]
                    sty = ST["th"] if idx == 0 else ST["td"]
                    data.append([Paragraph(parse_inline(c), sty) for c in cells])
                col_count = max(len(r) for r in data)
                avail = PAGE_W - 36*mm
                tbl = Table(data, colWidths=[avail / col_count] * col_count,
                            repeatRows=1)
                tbl.setStyle(TableStyle([
                    ("BACKGROUND",    (0, 0), (-1, 0),  BLUE_DARK),
                    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, SLATE_LIGHT]),
                    ("GRID",          (0, 0), (-1, -1), 0.4, SLATE_LINE),
                    ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
                    ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING",    (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 8),
                ]))
                story.append(tbl)
                story.append(Spacer(1, 6))
            continue

        # Bullet
        if re.match(r'^[-*] ', line):
            text = line[2:]
            text = re.sub(r'^\[x\] ', '✅ ', text)
            text = re.sub(r'^\[ \] ', '☐ ', text)
            story.append(Paragraph("• " + parse_inline(text), ST["bullet"]))
            i += 1; continue

        # Numbered list
        if re.match(r'^\d+\. ', line):
            text = re.sub(r'^\d+\. ', '', line)
            story.append(Paragraph("◦ " + parse_inline(text), ST["bullet"]))
            i += 1; continue

        # Empty line
        if not line.strip():
            story.append(Spacer(1, 4))
            i += 1; continue

        # Plain paragraph
        story.append(Paragraph(parse_inline(line), ST["body"]))
        i += 1

    return story


def build_pdf(md_path: str, pdf_path: str, header_text: str,
              title: str = "", subject: str = "", inject_date: bool = False):
    _register_fonts()
    ST = make_styles()

    with open(md_path, "r", encoding="utf-8") as f:
        md = f.read()

    # Replace {{GENERATED_AT}} placeholder with current Hebrew datetime
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    hebrew_date = datetime.now().strftime("%d.%m.%Y | %H:%M")
    md = md.replace("{{GENERATED_AT}}", hebrew_date)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        rightMargin=18*mm, leftMargin=18*mm,
        topMargin=22*mm,   bottomMargin=22*mm,
        title=title, subject=subject,
    )
    story = md_to_flowables(md, ST)
    on_page = make_header_footer(header_text, generated_at)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✅  {pdf_path} נוצר בהצלחה! ({generated_at})")
