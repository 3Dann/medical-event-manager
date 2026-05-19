#!/usr/bin/env python3
"""
CareFlow — Code Efficiency Report
3-agent council findings: Backend DB, Frontend Render, Code Structure
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable, KeepTogether, PageBreak)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
from pathlib import Path

pdfmetrics.registerFont(TTFont('Arial',      '/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'))

W, H = A4
MARGIN = 1.8 * cm
CW = W - 2 * MARGIN
DATE = datetime.now().strftime('%B %d, %Y')
DATE_S = datetime.now().strftime('%Y-%m-%d')

NAVY   = colors.HexColor('#1E3A5F')
NAVY2  = colors.HexColor('#1E40AF')
RED    = colors.HexColor('#DC2626')
ORANGE = colors.HexColor('#EA580C')
AMBER  = colors.HexColor('#D97706')
BLUE   = colors.HexColor('#2563EB')
GREEN  = colors.HexColor('#16A34A')
TEAL   = colors.HexColor('#0D9488')
PURPLE = colors.HexColor('#7C3AED')
GRAY   = colors.HexColor('#6B7280')
LGRAY  = colors.HexColor('#F8FAFC')
BORDER = colors.HexColor('#E2E8F0')
WHITE  = colors.white

IMP = {'HIGH': (RED, colors.HexColor('#FFF1F1')),
       'MEDIUM': (AMBER, colors.HexColor('#FEFCE8')),
       'LOW': (BLUE, colors.HexColor('#EFF6FF'))}

def s(name, **kw):
    base = dict(fontName='Arial', fontSize=10, leading=14, alignment=0,
                textColor=colors.HexColor('#1F2937'))
    base.update(kw); return ParagraphStyle(name, **base)

SEC  = s('S', fontName='Arial-Bold', fontSize=14, leading=19, spaceBefore=10, spaceAfter=4, textColor=NAVY)
SUB  = s('Sub', fontName='Arial-Bold', fontSize=10.5, leading=14, spaceBefore=6, textColor=colors.HexColor('#374151'))
BODY = s('B', fontSize=9.5, leading=14)
SMALL= s('Sm', fontSize=8.5, leading=12, textColor=GRAY)
CODE = s('C', fontName='Courier', fontSize=8, leading=11, textColor=colors.HexColor('#374151'))
LBL  = s('L', fontName='Arial-Bold', fontSize=8.5, leading=12, textColor=colors.HexColor('#374151'))

def p(t, st): return Paragraph(str(t), st)
def hr(): return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=5)
def sp(h=0.25): return Spacer(1, h * cm)

def imp_badge(impact):
    col, bg = IMP.get(impact, (GRAY, LGRAY))
    return Paragraph(f'<b>{impact}</b>', s(f'b{impact}', fontName='Arial-Bold',
                     fontSize=7.5, leading=10, textColor=col, alignment=1))

def rec_card(impact, title, location, problem, fix, effort=''):
    col, bg = IMP.get(impact, (GRAY, LGRAY))
    badge = Table([[imp_badge(impact)]], colWidths=[1.3*cm])
    badge.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), col),
        ('TOPPADDING', (0,0),(-1,-1), 4), ('BOTTOMPADDING', (0,0),(-1,-1), 4),
    ]))
    inner = Table([
        [Paragraph(f'<b>{title}</b>', s('rt', fontName='Arial-Bold', fontSize=9.5, leading=13))],
        [Paragraph(f'<font color="#6B7280"><i>{location}</i></font>', s('rl', fontSize=8, leading=11))],
        [sp(0.1)],
        [Paragraph(f'<b>Issue:</b> {problem}', s('rp', fontSize=9, leading=13))],
        [Paragraph(f'<b>Fix:</b> {fix}', s('rf', fontSize=9, leading=13))],
    ] + ([[Paragraph(f'<b>Effort:</b> {effort}', s('re', fontSize=8.5, leading=12, textColor=TEAL))]]
         if effort else []),
        colWidths=[CW - 1.4*cm])
    inner.setStyle(TableStyle([
        ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
    ]))
    card = Table([[badge, inner]], colWidths=[1.4*cm, CW-1.4*cm])
    card.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), bg),
        ('BOX',(0,0),(-1,-1), 0.5, BORDER),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LEFTPADDING',(0,1),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('ALIGN',(0,0),(0,-1),'CENTER'),('VALIGN',(0,0),(0,-1),'MIDDLE'),
    ]))
    return KeepTogether([card, sp(0.2)])

def section_header(title, subtitle, agent_label, counts):
    head = Table([[
        Paragraph(f'<b>{title}</b>', s('sh', fontName='Arial-Bold', fontSize=13,
                                        leading=17, textColor=WHITE)),
        Paragraph(agent_label, s('al', fontSize=8, leading=11,
                                  textColor=colors.HexColor('#93C5FD'), alignment=2)),
    ]], colWidths=[CW*0.75, CW*0.25])
    head.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), NAVY),
        ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]))
    badge_row = []
    for impact, n in counts.items():
        if n:
            col, bg = IMP.get(impact, (GRAY, LGRAY))
            badge_row.append(Paragraph(
                f'<b>{n}</b> {impact}',
                s(f'sr{impact}', fontName='Arial-Bold', fontSize=8.5, textColor=col)))
    badges = Table([badge_row], colWidths=[CW/len(badge_row)]*len(badge_row)) if badge_row else None
    if badges:
        badges.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1), LGRAY),
            ('BOX',(0,0),(-1,-1), 0.5, BORDER),
            ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ]))
    result = [head]
    if subtitle: result.append(p(subtitle, SMALL))
    if badges:   result.extend([sp(0.15), badges])
    result.append(sp(0.2))
    return result


# ══════════════════════════════════════════════════════════════════════════════
# DATA
# ══════════════════════════════════════════════════════════════════════════════

BACKEND_DB = [
    ('HIGH', 'Dead Code: steps_map Built But Never Used',
     'backend/routes/workflows.py : 487–492',
     'list_instances() queries and builds a steps_map dictionary on every call, '
     'then discards it completely. With 50 instances per page this loads and '
     'serialises workflow step data for no purpose.',
     'Remove lines 487–492 entirely. If step counts are needed in future, use '
     'func.count() with group_by instead of loading full step records.',
     '15 min'),

    ('HIGH', 'Insurance Gap Check Loads Entire Patient Table (N+1)',
     'backend/main.py : 180–193',
     'The daily job calls db.query(Patient).all() with no filter — every patient '
     'in the database. For each patient it then queries nodes separately, and for '
     'each node calls _best_coverage_for_node() which issues its own queries. '
     '1,000 patients × 10 nodes = 10,000+ queries per job run.',
     'Process patients in batches of 100 using limit/offset. Pre-load nodes via '
     'selectinload(). Filter to only patients with active workflow instances. '
     'Build an insurance-sources dict once, look up in O(1) inside the loop.',
     '4 hours'),

    ('MEDIUM', 'Patient List Ignores Pagination for Manager-Owned Patients',
     'backend/routes/patients.py : 272',
     'The limit and offset query params are parsed and applied to the admin branch '
     'but the manager-owned patient branch calls .all() unconditionally. A manager '
     'with 500 patients always loads all 500 regardless of the requested page size.',
     'Apply .limit(limit).offset(offset) after the manager filter: '
     'own = base_q.filter(Patient.manager_id == user.id).limit(limit).offset(offset).all(). '
     'Return total count separately.',
     '30 min'),

    ('MEDIUM', 'SLA Check Issues 3 Queries Per Breached Step',
     'backend/main.py : 135–158',
     '_daily_sla_check() calls db.get(WorkflowInstance), db.get(Patient), and '
     'db.query(Task).filter().first() inside the loop for every breached step. '
     'With 50 breached steps this produces 150+ queries in a single job run.',
     'Collect all instance_ids and step_ids first. Batch-load instances, patients, '
     'and existing tasks with IN-clause queries. Build lookup dicts for O(1) access '
     'inside the loop.',
     '2 hours'),

    ('MEDIUM', 'openFDA Drug Enrichment: Synchronous HTTP, No Timeout Fallback',
     'backend/routes/medications.py : 530–546',
     'enrich_drug() uses a synchronous httpx.Client with an 8-second timeout. '
     'If openFDA is slow or unavailable, the Uvicorn worker thread is blocked for '
     'the full 8 seconds. With 10 concurrent users, all worker threads can stall.',
     'Convert to async def with async httpx.AsyncClient(). Add a fallback: on '
     'timeout or error, return the cached DB value if present rather than failing '
     'the entire request. Log failures to Sentry.',
     '3 hours'),

    ('MEDIUM', 'Missing Compound Indexes on 4 High-Query Tables',
     'backend/models.py',
     'WorkflowStep, WorkflowInstance, PatientMedication, and Node are all queried '
     'by two-column combinations (instance_id+status, patient_id+status, '
     'patient_id+is_active, patient_id+node_type) but only single-column indexes '
     'exist. SQLite cannot use a single-column index to optimise compound WHERE clauses.',
     'Add to __table_args__: '
     'Index("ix_ws_instance_status","instance_id","status") on WorkflowStep; '
     'Index("ix_wi_patient_status","patient_id","status") on WorkflowInstance; '
     'Index("ix_pm_patient_active","patient_id","is_active") on PatientMedication; '
     'Index("ix_node_patient_type","patient_id","node_type") on Node.',
     '30 min'),

    ('LOW', 'Drug Search Loads Unused Large Text Columns',
     'backend/routes/medications.py : 64–100',
     '_search_db() fetches complete DrugEntry rows including openfda_interactions '
     '(potentially large text) and indication_oncology even when only name, '
     'generic_name, and dosages are needed for the search result.',
     'Use .with_entities() or load_only() to select only the columns needed for '
     'the search response. Defer large text fields to the detail/enrich endpoint.',
     '45 min'),
]

FRONTEND_RENDER = [
    ('HIGH', 'Patient List Renders All Cards Without Virtualisation',
     'frontend/src/pages/manager/ManagerDashboard.jsx : 156',
     'All patient cards are rendered as DOM nodes simultaneously. With 200+ patients '
     'the initial render is slow and scrolling becomes janky because the browser '
     'must paint and manage hundreds of off-screen elements.',
     'Use react-window FixedSizeList for the patient list. Alternatively, implement '
     'sentinel-based infinite scroll that loads 20 more on scroll-end. '
     'This reduces DOM nodes from O(n) to ~20 regardless of list size.',
     '2–3 hours'),

    ('MEDIUM', 'NotificationBell Polls Every 60 Seconds with No Backoff',
     'frontend/src/components/NotificationBell.jsx : 21, 60–61',
     'Polling fires every 60 seconds unconditionally — 1,440 requests per user per '
     'day. There is no backoff when the API returns empty results, no pause when '
     'the browser tab is in the background.',
     'Increase base interval to 120s. Add document.visibilityState check to skip '
     'polls when tab is hidden. Implement exponential backoff (up to 5 min) when '
     'consecutive responses have zero notifications.',
     '1 hour'),

    ('MEDIUM', 'PatientDetail Derived State Recalculated on Every Render',
     'frontend/src/pages/manager/PatientDetail.jsx : 266–270',
     'appliedTemplateKeys (Set from nodes), patientConditionTags, customNodes, '
     'completedCount, and activeCount are recalculated on every render cycle. '
     'Any unrelated state change (e.g., a modal open/close) triggers O(n) '
     'filter operations on the full node list.',
     'Wrap each in useMemo with the appropriate dependency: '
     'useMemo(() => new Set(nodes.filter(...).map(...)), [nodes]). '
     'This memoises the values until the nodes array actually changes.',
     '30 min'),

    ('MEDIUM', 'PatientMedications Interaction Check Has No Debounce',
     'frontend/src/pages/manager/PatientMedications.jsx : 56–61, 102',
     'checkInBackground() triggers fetchAll() immediately after every save. '
     'A user adding 5 medications in quick succession fires 5 full API fetches. '
     'Each fetch re-loads the medication list and re-runs the interaction check.',
     'Add a 500ms debounce to checkInBackground using useRef + setTimeout. '
     'Cancel the pending check before starting a new one. '
     'This collapses rapid saves into a single network round-trip.',
     '45 min'),

    ('MEDIUM', 'IntakeWizard (1,489 Lines) Loaded Entirely on Step 1',
     'frontend/src/pages/manager/IntakeWizard.jsx',
     'The 1,489-line wizard file includes all 7 step renderers, 3 context providers, '
     '2 large sub-components (FunctionalStep, SignaturesStep), and the ADL/IADL/MMSE '
     'constants — all loaded into memory even when the user only reaches step 1 or 2.',
     'Split into step components under intake/ subdirectory and use React.lazy() '
     'per step. FunctionalStep and SignaturesStep are natural boundaries: they are '
     'already defined as separate functions at the bottom of the file.',
     '3–4 hours'),

    ('LOW', 'DRUG_INDICATION_MAP (137 Lines) Bundled with Every Medication Form',
     'frontend/src/components/DrugFormComponents.jsx : 17–137',
     '~12 KB of static drug-to-indication mappings are included in the main bundle '
     'and loaded whenever any medication component is imported, even on pages that '
     'never show the indication dropdown.',
     'Move DRUG_INDICATION_MAP to a separate data file (drug-maps.js) and import '
     'it lazily only when MedicationCard is mounted. Alternatively, move the '
     'mapping to the backend and fetch it via /api/medications/indication-map?name=X.',
     '30 min'),

    ('LOW', 'ManagerDashboard Stats Filter Runs on Every Render',
     'frontend/src/pages/manager/ManagerDashboard.jsx : 88, 92',
     'patients.filter(p => p.diagnosis_status === "yes").length and similar '
     'expressions run on every render cycle, including renders triggered by '
     'unrelated state changes like notification count updates.',
     'Wrap in useMemo with [patients] as dependency: '
     'const withDiagnosis = useMemo(() => patients.filter(...).length, [patients])',
     '10 min'),
]

STRUCTURE = [
    ('HIGH', 'IntakeWizard.jsx Is a 1,489-Line God Object',
     'frontend/src/pages/manager/IntakeWizard.jsx : entire file',
     '7 step renderers, 3 context providers, 2 sub-components, ADL/IADL/MMSE '
     'constants, validation logic, and date utilities are all packed into one file. '
     'Adding a new wizard step requires editing this entire file. '
     'It is impossible to unit-test individual steps in isolation.',
     'Create an intake/ subdirectory with one file per step: StepPersonal, '
     'StepAddress, StepContact, StepMedical, StepMedications, FunctionalAssessment, '
     'Signatures. Extract DateInput and PhoneInput to intake/shared/. '
     'Move validation to utils/intakeValidators.js. '
     'IntakeWizard.jsx becomes ~200 lines of orchestration only.',
     '3–4 hours'),

    ('HIGH', 'AdminPage.jsx Has Duplicate PermissionEditor Logic',
     'frontend/src/pages/manager/AdminPage.jsx : 451–488 and 614–671',
     'The permission editor (PERM_PRESETS + 7 checkboxes + group labels) is '
     'implemented twice: once inside CreateUserModal and once in the inline '
     'per-user permissions editor. Any change to permissions — adding a new '
     'permission, renaming a group — must be made in both places.',
     'Extract a shared <PermissionEditor permissions={...} onChange={...} /> '
     'component. Both CreateUserModal and the user list editor import it. '
     'Reduce 120 lines of duplicated JSX to a single 60-line component.',
     '1 hour'),

    ('MEDIUM', 'admin.py Mixes 7 Unrelated Concerns in 823 Lines',
     'backend/routes/admin.py : entire file',
     'User CRUD, patient permissions, admin dashboard analytics, session management, '
     'task listing, drug database, and activity logs all live in one file. '
     'The alert-building loop (lines 346–381) is a 35-line nested function that '
     'cannot be tested without a full DB fixture.',
     'Split into an admin/ subpackage: admin/users.py, admin/permissions.py, '
     'admin/dashboard.py, admin/sessions.py. Extract _build_alerts() to a '
     'standalone function with its own test. admin.py becomes a thin router '
     'that imports and registers the sub-routers.',
     '3 hours'),

    ('MEDIUM', 'PatientDetail Has a Race Condition in fetchAll + Deep Nesting',
     'frontend/src/pages/manager/PatientDetail.jsx : 87–117, 272–773',
     'The hmo-plans fetch is triggered inside the .then() of the main Promise.all '
     'instead of being included in it. If the component unmounts between the '
     'main fetch completing and the hmo fetch starting, setHmoPlans fires on an '
     'unmounted component. '
     'Additionally, fetchAll() is called in 8+ places with no debounce.',
     'Include the hmo-plans fetch inside Promise.all by chaining conditionally. '
     'Extract data fetching to a usePatientData(patientId) custom hook. '
     'Apply a 300ms debounce to fetchAll so rapid node edits collapse into one request.',
     '2 hours'),

    ('MEDIUM', 'flow_engine.py Duplicates the Same DB Query Twice',
     'backend/flow_engine.py : 413–421 and 486–490',
     'The query to find the last step in a parallel group '
     '(db.query(WorkflowStep).filter(instance_id, parallel_group).order_by(step_order.desc()).first()) '
     'appears verbatim in two separate methods: advance_step() and skip_step().',
     'Extract _get_last_step_in_group(db, instance_id, group_name) helper. '
     'Both callers use the helper. If the query logic ever changes (e.g., '
     'filtering by status), only one place needs updating.',
     '20 min'),

    ('LOW', 'Validation Logic Scattered Across 4+ Components',
     'frontend/src/pages/manager/IntakeWizard.jsx : 595–643 + PatientDetail.jsx : 261',
     'Israeli ID validation, email format, phone length, and step-specific rules '
     'are duplicated across IntakeWizard, PatientDetail, AdminPage, and the '
     'backend. Frontend and backend can drift, accepting different inputs.',
     'Create frontend/src/utils/validators.js with pure functions: '
     'validateIsraeliId(), validateEmail(), validatePhone(), validateIntakeStep(). '
     'Import from all components. Add validators.test.js as the first frontend '
     'unit test file.',
     '1 hour'),
]

QUICK_WINS = [
    ('15 min',  'Remove unused steps_map in list_instances()',           'backend/routes/workflows.py : 487'),
    ('10 min',  'Wrap dashboard stats in useMemo',                       'frontend/src/pages/manager/ManagerDashboard.jsx : 88'),
    ('20 min',  'Extract _get_last_step_in_group() helper',              'backend/flow_engine.py : 413, 486'),
    ('30 min',  'Add 4 compound indexes to models.py',                   'backend/models.py'),
    ('30 min',  'Apply pagination to manager patient query',             'backend/routes/patients.py : 272'),
    ('30 min',  'Wrap PatientDetail derived state in useMemo',           'frontend/src/pages/manager/PatientDetail.jsx : 266'),
    ('1 hour',  'Extract shared PermissionEditor.jsx component',         'frontend/src/pages/manager/AdminPage.jsx : 451, 614'),
    ('1 hour',  'Add backoff + visibility check to NotificationBell',    'frontend/src/components/NotificationBell.jsx : 21'),
    ('1 hour',  'Create utils/validators.js and remove duplicates',      'frontend/src/utils/validators.js (new)'),
    ('2 hours', 'Batch-load SLA check queries (3 → 1 per step)',         'backend/main.py : 135'),
    ('2 hours', 'Fix PatientDetail fetchAll race condition + debounce',  'frontend/src/pages/manager/PatientDetail.jsx : 87'),
    ('3 hours', 'Split admin.py into admin/ subpackage',                 'backend/routes/admin/'),
    ('3 hours', 'Make enrich_drug async with httpx.AsyncClient',         'backend/routes/medications.py : 530'),
    ('3–4 hrs', 'Split IntakeWizard into step components',               'frontend/src/pages/manager/intake/'),
    ('4 hours', 'Fix insurance gap check N+1 with batching',             'backend/main.py : 180'),
    ('2–3 hrs', 'Add virtualisation to patient card list',               'frontend/src/pages/manager/ManagerDashboard.jsx : 156'),
]


# ══════════════════════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════════════════════

def build(out):
    doc = SimpleDocTemplate(out, pagesize=A4,
                            rightMargin=MARGIN, leftMargin=MARGIN,
                            topMargin=MARGIN, bottomMargin=MARGIN)
    story = []

    # ── COVER ──────────────────────────────────────────────────────────────
    cover = Table([[
        Paragraph('<b>CareFlow</b>', s('ch', fontName='Arial-Bold', fontSize=26,
                                        leading=32, textColor=WHITE)),
        Paragraph('Code Efficiency Report',
                  s('cs', fontSize=14, leading=18, textColor=colors.HexColor('#93C5FD'))),
        Paragraph(f'3-Agent Council  ·  {DATE}',
                  s('cd', fontSize=9, leading=13, textColor=colors.HexColor('#94A3B8'))),
    ]], colWidths=[CW])
    cover.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), NAVY),
        ('TOPPADDING',(0,0),(-1,-1),20),('BOTTOMPADDING',(0,0),(-1,-1),20),
        ('LEFTPADDING',(0,0),(-1,-1),20),('RIGHTPADDING',(0,0),(-1,-1),20),
    ]))
    story.extend([sp(0.5), cover, sp(0.5)])

    # Stats bar
    total = len(BACKEND_DB) + len(FRONTEND_RENDER) + len(STRUCTURE)
    high   = sum(1 for f in BACKEND_DB+FRONTEND_RENDER+STRUCTURE if f[0]=='HIGH')
    medium = sum(1 for f in BACKEND_DB+FRONTEND_RENDER+STRUCTURE if f[0]=='MEDIUM')
    low    = sum(1 for f in BACKEND_DB+FRONTEND_RENDER+STRUCTURE if f[0]=='LOW')

    stats = Table([[
        Paragraph(f'<b>{total}</b><br/>Total Findings', s('st', fontName='Arial-Bold',
                  fontSize=13, leading=17, alignment=1, textColor=NAVY2)),
        Paragraph(f'<b>{high}</b><br/>High Impact', s('sh', fontName='Arial-Bold',
                  fontSize=13, leading=17, alignment=1, textColor=RED)),
        Paragraph(f'<b>{medium}</b><br/>Medium Impact', s('sm', fontName='Arial-Bold',
                  fontSize=13, leading=17, alignment=1, textColor=AMBER)),
        Paragraph(f'<b>{low}</b><br/>Low Impact', s('sl', fontName='Arial-Bold',
                  fontSize=13, leading=17, alignment=1, textColor=BLUE)),
        Paragraph(f'<b>{len(QUICK_WINS)}</b><br/>Action Items', s('sa', fontName='Arial-Bold',
                  fontSize=13, leading=17, alignment=1, textColor=TEAL)),
    ]], colWidths=[CW/5]*5)
    stats.setStyle(TableStyle([
        ('BOX',(0,0),(-1,-1), 0.5, BORDER),
        ('INNERGRID',(0,0),(-1,-1), 0.3, BORDER),
        ('BACKGROUND',(0,0),(-1,-1), LGRAY),
        ('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12),
    ]))
    story.extend([stats, sp(0.35)])

    story.append(p(
        'This report was produced by a 3-agent efficiency council that independently '
        'audited CareFlow\'s backend database patterns, frontend render behaviour, '
        'and code structure. Each agent focused on a different dimension of efficiency '
        'and reported findings independently before synthesis. '
        'Findings are sorted by impact. Each item includes the affected file and line, '
        'a plain description of the problem, a concrete fix, and an estimated effort.',
        BODY))
    story.extend([sp(0.3), hr()])

    # ── PRIORITY QUICK WINS ─────────────────────────────────────────────────
    story.append(p('Priority Action Plan', SEC))
    story.append(p('Sorted by effort — easiest first. Each item is self-contained '
                   'and can be tackled independently.', SMALL))
    story.append(sp(0.2))

    qw_rows = [[p('<b>Effort</b>', LBL), p('<b>Action</b>', LBL), p('<b>Location</b>', LBL)]]
    for effort, action, loc in QUICK_WINS:
        mins = 60 if 'hour' in effort else int(effort.split()[0].split('–')[0])
        col = RED if mins >= 240 else (AMBER if mins >= 60 else GREEN)
        qw_rows.append([
            Paragraph(f'<b>{effort}</b>', s(f'e{effort}', fontName='Arial-Bold',
                      fontSize=8.5, textColor=col)),
            p(action, BODY),
            p(loc, SMALL),
        ])

    qw = Table(qw_rows, colWidths=[1.8*cm, CW*0.55, CW*0.34])
    qw.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), NAVY),
        ('TEXTCOLOR',(0,0),(-1,0), WHITE),
        ('FONTNAME',(0,0),(-1,0),'Arial-Bold'),
        ('FONTSIZE',(0,0),(-1,0),9),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, LGRAY]),
        ('GRID',(0,0),(-1,-1), 0.3, BORDER),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]))
    story.extend([qw, PageBreak()])

    # ── SECTION 1: BACKEND ──────────────────────────────────────────────────
    story.extend(section_header(
        '1. Backend — Database & API Efficiency',
        'Query patterns, missing pagination, blocking I/O, scheduler jobs, and missing indexes.',
        'Agent 1 — Backend DB & API',
        {'HIGH': sum(1 for f in BACKEND_DB if f[0]=='HIGH'),
         'MEDIUM': sum(1 for f in BACKEND_DB if f[0]=='MEDIUM'),
         'LOW': sum(1 for f in BACKEND_DB if f[0]=='LOW')}))
    for f in BACKEND_DB:
        story.append(rec_card(*f))
    story.append(PageBreak())

    # ── SECTION 2: FRONTEND ─────────────────────────────────────────────────
    story.extend(section_header(
        '2. Frontend — Render & Bundle Efficiency',
        'Missing memoisation, unnecessary re-renders, polling overhead, '
        'bundle size, and virtualisation.',
        'Agent 2 — Frontend Render & Bundle',
        {'HIGH': sum(1 for f in FRONTEND_RENDER if f[0]=='HIGH'),
         'MEDIUM': sum(1 for f in FRONTEND_RENDER if f[0]=='MEDIUM'),
         'LOW': sum(1 for f in FRONTEND_RENDER if f[0]=='LOW')}))
    for f in FRONTEND_RENDER:
        story.append(rec_card(*f))
    story.append(PageBreak())

    # ── SECTION 3: STRUCTURE ────────────────────────────────────────────────
    story.extend(section_header(
        '3. Code Structure & Maintainability',
        'Monolithic files, duplicated logic, missing abstractions, and '
        'structural patterns that slow down future development.',
        'Agent 3 — Structure & Maintainability',
        {'HIGH': sum(1 for f in STRUCTURE if f[0]=='HIGH'),
         'MEDIUM': sum(1 for f in STRUCTURE if f[0]=='MEDIUM'),
         'LOW': sum(1 for f in STRUCTURE if f[0]=='LOW')}))
    for f in STRUCTURE:
        story.append(rec_card(*f))

    # ── FOOTER ──────────────────────────────────────────────────────────────
    story.extend([sp(0.4), hr(),
                  p(f'CareFlow Code Efficiency Report  ·  {DATE}  ·  '
                    f'{total} findings across 3 domains  ·  '
                    f'Generated by 3-Agent Efficiency Council',
                    s('ft', fontSize=7.5, textColor=GRAY, alignment=1))])

    doc.build(story)
    print(f'✓ Report saved: {out}')


if __name__ == '__main__':
    out_dir = Path.home() / 'Desktop'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f'CareFlow_Efficiency_{DATE_S}.pdf'
    build(str(out_file))
