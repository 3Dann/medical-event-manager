#!/usr/bin/env python3
"""
דוח בדיקות E2E — CareFlow
קורא את results.json של Playwright ומייצר PDF עברי בתיקיית ~/Desktop/בדיקות/
"""
import json, os, sys
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                 Table, TableStyle, HRFlowable, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from bidi.algorithm import get_display

# ── פונטים ───────────────────────────────────────────────────────────────────
pdfmetrics.registerFont(TTFont('Arial',      '/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'))

W, H = A4
MARGIN = 1.8 * cm
CW = W - 2 * MARGIN
NOW = datetime.now().strftime('%d/%m/%Y %H:%M')
DATE = datetime.now().strftime('%Y-%m-%d_%H-%M')

def r(t): return get_display(str(t)) if t else ''

def rtl(text, fn='Arial', fs=10, w=None, pad=8):
    w = w or CW
    words = str(text).split()
    lines, cur, cw = [], [], 0
    sp = stringWidth(' ', fn, fs)
    for word in words:
        ww = stringWidth(word, fn, fs)
        if cur and cw + sp + ww > w - pad:
            lines.append(' '.join(cur)); cur, cw = [word], ww
        else:
            cw += (sp if cur else 0) + ww; cur.append(word)
    if cur: lines.append(' '.join(cur))
    return '<br/>'.join(get_display(l) for l in lines)

def s(name, **kw):
    base = dict(fontName='Arial', fontSize=10, leading=15, alignment=2, spaceAfter=0)
    base.update(kw); return ParagraphStyle(name, **base)

TITLE  = s('T',  fontName='Arial-Bold', fontSize=20, leading=26, textColor=colors.HexColor('#1E3A5F'))
TITLE2 = s('T2', fontName='Arial-Bold', fontSize=12, leading=16, textColor=colors.HexColor('#374151'))
SEC    = s('S',  fontName='Arial-Bold', fontSize=12, leading=16, spaceBefore=8, spaceAfter=3,
           textColor=colors.HexColor('#1E40AF'))
SMALL  = s('Sm', fontSize=8.5, leading=12, textColor=colors.HexColor('#6B7280'))
BODY   = s('B',  fontSize=10, leading=15)

def p(txt, st): return Paragraph(r(txt), st)
def pb(txt, w=None): return Paragraph(rtl(txt, w=w), BODY)
def hr(): return HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#CBD5E1'), spaceAfter=4)

STATUS_COLORS = {'passed': '#16A34A', 'failed': '#DC2626', 'skipped': '#CA8A04', 'timedOut': '#DC2626'}
STATUS_HE     = {'passed': '✅ עבר', 'failed': '❌ נכשל', 'skipped': '⏭ דולג', 'timedOut': '⏱ timeout'}
FILE_HE = {
    '01-landing': 'דף נחיתה',
    '02-auth':    'אימות',
    '03-dashboard': 'דשבורד',
    '04-patient': 'תיק מטופל',
    '05-health':  'בריאות API',
}

def parse_results(path):
    with open(path) as f: data = json.load(f)
    suites, total, passed, failed = [], data.get('stats', {}), 0, 0
    total_count = total.get('expected', 0)
    passed = total.get('expected', 0) - total.get('unexpected', 0) - total.get('skipped', 0)
    failed = total.get('unexpected', 0)
    duration_ms = total.get('duration', 0)

    for suite in data.get('suites', []):
        for sub in suite.get('suites', []):
            file_key = None
            for k in FILE_HE:
                if k in (sub.get('file','') or sub.get('title','')):
                    file_key = k; break
            file_label = FILE_HE.get(file_key, sub.get('title',''))
            tests = []
            for spec in sub.get('specs', []):
                for res in spec.get('tests', []):
                    status = res.get('status', 'unknown')
                    dur = sum(r.get('duration', 0) for r in res.get('results', []))
                    tests.append({
                        'title':    spec.get('title', ''),
                        'status':   status,
                        'duration': dur,
                    })
            if tests:
                suites.append({'file': file_label, 'tests': tests})

    return {
        'suites':   suites,
        'total':    total_count,
        'passed':   passed,
        'failed':   failed,
        'duration': duration_ms,
    }

def build(results_json: str, out_path: str):
    data = parse_results(results_json)
    doc = SimpleDocTemplate(out_path, pagesize=A4,
                            rightMargin=MARGIN, leftMargin=MARGIN,
                            topMargin=MARGIN, bottomMargin=MARGIN)
    story = []

    # ── שער ──────────────────────────────────────────────────────────────────
    all_pass = data['failed'] == 0
    status_color = '#16A34A' if all_pass else '#DC2626'
    status_text  = '✅ כל הבדיקות עברו' if all_pass else f'❌ {data["failed"]} בדיקות נכשלו'

    story += [
        Spacer(1, 0.8*cm),
        p('דוח בדיקות E2E', TITLE),
        p('CareFlow — Smoke Tests vs Production', TITLE2),
        Spacer(1, 0.2*cm), hr(), Spacer(1, 0.15*cm),
        p(f'הופק: {NOW}  |  סביבה: Production', SMALL),
        Spacer(1, 0.3*cm),
    ]

    # כרטיס סיכום
    dur_s = round(data['duration'] / 1000, 1)
    summary_data = [[
        Paragraph(r(status_text), s('ss', fontName='Arial-Bold', fontSize=14, alignment=1,
                                    textColor=colors.HexColor(status_color))),
        Paragraph(r(f'{data["passed"]}/{data["total"]}'), s('st', fontName='Arial-Bold', fontSize=22,
                                                             alignment=1, textColor=colors.HexColor('#1E40AF'))),
        Paragraph(r(f'{dur_s} שנ׳'), s('sd', fontName='Arial-Bold', fontSize=18,
                                         alignment=1, textColor=colors.HexColor('#374151'))),
    ]]
    st = Table(summary_data, colWidths=[CW*0.5, CW*0.25, CW*0.25])
    st.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX',           (0,0),(-1,-1), 1, colors.HexColor('#E2E8F0')),
        ('INNERGRID',     (0,0),(-1,-1), 0.3, colors.HexColor('#E2E8F0')),
        ('ALIGN',         (0,0),(-1,-1), 'CENTER'),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING',    (0,0),(-1,-1), 12),
        ('BOTTOMPADDING', (0,0),(-1,-1), 12),
    ]))
    story += [st, Spacer(1, 0.4*cm)]

    # ── פירוט לפי קובץ ────────────────────────────────────────────────────────
    story.append(p('פירוט לפי קטגוריה', SEC))

    for suite in data['suites']:
        story.append(Spacer(1, 0.15*cm))
        story.append(p(f'◆  {suite["file"]}', s('sf', fontName='Arial-Bold', fontSize=10,
                                                   leading=14, alignment=2,
                                                   textColor=colors.HexColor('#374151'))))

        rows = []
        for t in suite['tests']:
            st_key  = t['status']
            st_col  = STATUS_COLORS.get(st_key, '#6B7280')
            st_lbl  = STATUS_HE.get(st_key, st_key)
            dur_lbl = f'{round(t["duration"]/1000,1)}s'
            rows.append([
                Paragraph(r(st_lbl), s(f'sl{st_key}', fontSize=9, alignment=1,
                                        textColor=colors.HexColor(st_col), fontName='Arial-Bold')),
                Paragraph(rtl(t['title'], fs=9, w=CW*0.68), s('td', fontSize=9, leading=13, alignment=2)),
                Paragraph(r(dur_lbl), s('dd', fontSize=9, alignment=1,
                                         textColor=colors.HexColor('#6B7280'))),
            ])

        if rows:
            t_tbl = Table(rows, colWidths=[CW*0.15, CW*0.7, CW*0.15])
            t_tbl.setStyle(TableStyle([
                ('ROWBACKGROUNDS',(0,0),(-1,-1), [colors.white, colors.HexColor('#F8FAFC')]),
                ('GRID',          (0,0),(-1,-1), 0.3, colors.HexColor('#E2E8F0')),
                ('ALIGN',         (0,0),(-1,-1), 'RIGHT'),
                ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
                ('TOPPADDING',    (0,0),(-1,-1), 4),
                ('BOTTOMPADDING', (0,0),(-1,-1), 4),
                ('LEFTPADDING',   (0,0),(-1,-1), 6),
                ('RIGHTPADDING',  (0,0),(-1,-1), 6),
            ]))
            story.append(t_tbl)

    story += [Spacer(1, 0.4*cm), hr(),
              p(f'CareFlow E2E  |  {NOW}  |  15 בדיקות', SMALL)]

    doc.build(story)
    print(f'✅ PDF נוצר: {out_path}')


if __name__ == '__main__':
    results_json = Path(__file__).parent / 'test-results' / 'results.json'
    if not results_json.exists():
        print('❌ results.json לא נמצא — הרץ תחילה: npx playwright test')
        sys.exit(1)

    out_dir = Path.home() / 'Desktop' / 'בדיקות'
    out_dir.mkdir(parents=True, exist_ok=True)

    out_file = out_dir / f'e2e_{DATE}.pdf'
    build(str(results_json), str(out_file))
