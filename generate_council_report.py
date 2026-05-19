#!/usr/bin/env python3
"""
CareFlow — 7-Agent Council Full Audit Report (English)
Generates a detailed PDF covering Security, UX, Code Quality, Performance,
Compliance, Frontend Analysis, and API Integration.
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

# ── Fonts ─────────────────────────────────────────────────────────────────────
pdfmetrics.registerFont(TTFont('Arial',      '/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
pdfmetrics.registerFont(TTFont('Courier',    '/System/Library/Fonts/Supplemental/Courier New.ttf'))

W, H = A4
MARGIN = 1.8 * cm
CW = W - 2 * MARGIN
DATE_LONG = datetime.now().strftime('%B %d, %Y')
DATE_SHORT = datetime.now().strftime('%Y-%m-%d')

# ── Colour palette ─────────────────────────────────────────────────────────────
NAVY    = colors.HexColor('#1E3A5F')
NAVY2   = colors.HexColor('#1E40AF')
RED     = colors.HexColor('#DC2626')
ORANGE  = colors.HexColor('#EA580C')
AMBER   = colors.HexColor('#D97706')
BLUE    = colors.HexColor('#2563EB')
GREEN   = colors.HexColor('#16A34A')
GRAY    = colors.HexColor('#6B7280')
LGRAY   = colors.HexColor('#F8FAFC')
BORDER  = colors.HexColor('#E2E8F0')
WHITE   = colors.white

BG = {
    'CRITICAL': colors.HexColor('#FFF1F1'),
    'HIGH':     colors.HexColor('#FFF7ED'),
    'MEDIUM':   colors.HexColor('#FEFCE8'),
    'LOW':      colors.HexColor('#EFF6FF'),
    'PASS':     colors.HexColor('#F0FDF4'),
}
FG = {'CRITICAL': RED, 'HIGH': ORANGE, 'MEDIUM': AMBER, 'LOW': BLUE, 'PASS': GREEN}

# ── Styles ─────────────────────────────────────────────────────────────────────
def s(name, **kw):
    base = dict(fontName='Arial', fontSize=10, leading=14, alignment=0,
                textColor=colors.HexColor('#1F2937'))
    base.update(kw)
    return ParagraphStyle(name, **base)

COVER_TITLE = s('CT', fontName='Arial-Bold', fontSize=26, leading=32, textColor=WHITE)
COVER_SUB   = s('CS', fontSize=13, leading=18, textColor=colors.HexColor('#CBD5E1'))
TOC_HEAD    = s('TH', fontName='Arial-Bold', fontSize=12, leading=16, textColor=NAVY)
SEC_HEAD    = s('SH', fontName='Arial-Bold', fontSize=14, leading=19, spaceBefore=12,
                spaceAfter=4, textColor=NAVY)
SUB_HEAD    = s('SubH', fontName='Arial-Bold', fontSize=11, leading=15, spaceBefore=8,
                spaceAfter=3, textColor=colors.HexColor('#374151'))
BODY        = s('B', fontSize=9.5, leading=14)
BODY_SMALL  = s('BS', fontSize=8.5, leading=12, textColor=GRAY)
LABEL       = s('Lbl', fontName='Arial-Bold', fontSize=8.5, leading=12,
                textColor=colors.HexColor('#374151'))
CODE_S      = s('Cd', fontName='Courier', fontSize=8, leading=11,
                textColor=colors.HexColor('#374151'))
CAPTION     = s('Cap', fontSize=8, leading=11, textColor=GRAY, alignment=1)

def p(txt, st): return Paragraph(str(txt), st)
def hr(): return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=6)
def sp(h=0.3): return Spacer(1, h * cm)

def sev_cell(sev):
    return Paragraph(f'<b>{sev}</b>',
                     s(f'sv_{sev}', fontName='Arial-Bold', fontSize=8, leading=10,
                       textColor=FG.get(sev, GRAY), alignment=1))

# ── Finding card ───────────────────────────────────────────────────────────────
def finding_card(sev, title, location, description, recommendation):
    bg = BG.get(sev, LGRAY)
    fg = FG.get(sev, GRAY)

    title_para = Paragraph(f'<b>{title}</b>',
                           s('ftitle', fontName='Arial-Bold', fontSize=9.5, leading=13))
    loc_para   = Paragraph(f'<font color="#6B7280"><i>{location}</i></font>',
                           s('floc', fontSize=8, leading=11))
    desc_para  = Paragraph(description, s('fdesc', fontSize=9, leading=13))
    rec_label  = Paragraph('<b>Fix:</b>',
                           s('freclbl', fontName='Arial-Bold', fontSize=9,
                             leading=13, textColor=NAVY2))
    rec_para   = Paragraph(recommendation, s('frec', fontSize=9, leading=13))

    inner = Table(
        [[title_para],
         [loc_para],
         [sp(0.15)],
         [desc_para],
         [sp(0.1)],
         [rec_label],
         [rec_para]],
        colWidths=[CW - 1.4 * cm],
    )
    inner.setStyle(TableStyle([
        ('TOPPADDING',    (0,0),(-1,-1), 0),
        ('BOTTOMPADDING', (0,0),(-1,-1), 0),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
    ]))

    badge = Table([[sev_cell(sev)]], colWidths=[1.2 * cm])
    badge.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,-1), fg),
        ('TOPPADDING',    (0,0),(-1,-1), 4),
        ('BOTTOMPADDING', (0,0),(-1,-1), 4),
    ]))

    card = Table([[badge, inner]],
                 colWidths=[1.4 * cm, CW - 1.4 * cm])
    card.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,-1), bg),
        ('BOX',           (0,0),(-1,-1), 0.5, BORDER),
        ('TOPPADDING',    (0,0),(-1,-1), 8),
        ('BOTTOMPADDING', (0,0),(-1,-1), 8),
        ('LEFTPADDING',   (0,1),(-1,-1), 8),
        ('RIGHTPADDING',  (0,0),(-1,-1), 8),
        ('VALIGN',        (0,0),(-1,-1), 'TOP'),
        ('ALIGN',         (0,0),(0,-1),  'CENTER'),
        ('VALIGN',        (0,0),(0,-1),  'MIDDLE'),
    ]))
    return KeepTogether([card, sp(0.2)])


# ══════════════════════════════════════════════════════════════════════════════
# AUDIT DATA
# ══════════════════════════════════════════════════════════════════════════════

SECURITY = [
    ('CRITICAL', 'E2E Test Backdoor in Production',
     'backend/routes/auth.py : 633',
     'The /api/auth/e2e-login endpoint bypasses 2FA and JWT validation entirely. '
     'When E2E_SEED is set in Railway environment variables (which it currently is), '
     'any attacker who discovers this URL can log in as the test user without a password. '
     'Even when E2E_SEED is not set, the endpoint responds with HTTP 404 instead of being '
     'completely absent, revealing its existence to scanners.',
     'Remove this endpoint from production code entirely. Use a separate test environment '
     'or add a compile-time flag that excludes the route in production builds. '
     'Also immediately verify that E2E_SEED is not set in the production Railway environment.'),

    ('CRITICAL', 'Any Manager Can View Any Patient\'s Workflows (IDOR)',
     'backend/routes/workflows.py : 512',
     'GET /api/workflows/instances/{instance_id} fetches a workflow instance by ID '
     'without checking whether the requesting manager actually has access to that '
     'patient. A manager can enumerate instance IDs (1, 2, 3...) and read detailed '
     'clinical workflow data belonging to other managers\' patients.',
     'Add an access control check before returning the instance: verify that '
     'instance.patient.manager_id == current_user.id or that a PatientPermission '
     'record exists. Apply the same check to pause, resume, and cancel endpoints.'),

    ('CRITICAL', 'Any Manager Can Pause or Cancel Another Manager\'s Workflows (IDOR)',
     'backend/routes/workflows.py : 526',
     'The pause, resume, and cancel workflow instance endpoints perform the same '
     'missing access control check. A manager from one organisation can disrupt '
     'active clinical workflows for patients they have no legitimate access to, '
     'potentially delaying critical medical treatment decisions.',
     'Centralise the access check in a shared helper (e.g., get_instance_or_403). '
     'Call it at the start of every workflow mutation endpoint before any state change.'),

    ('CRITICAL', 'Patient Portal Does Not Verify User Owns Their Record',
     'backend/routes/patient_portal.py : 54',
     'The patient summary endpoint checks that the user role is "patient" but relies '
     'solely on .first() to return a matching record. If a data inconsistency creates '
     'two patients linked to the same user, the wrong record is returned silently. '
     'Additionally, the endpoint returns internal cost structures and coverage categories '
     'that are operational data, not intended for patient-facing views.',
     'After fetching the patient record, explicitly assert patient.patient_user_id == '
     'current_user.id and raise HTTP 403 if not. Strip internal cost fields '
     '(estimated_cost, coverage_categories) from the patient-facing serializer.'),

    ('HIGH', 'Workflow Creation Allows Cross-Patient Access',
     'backend/routes/workflows.py : 489',
     'POST /api/workflows/instances checks that the user has the manage_workflows '
     'permission, but does not verify that the target patient_id belongs to the '
     'requesting manager. A manager can create workflows for any patient in the system.',
     'Call get_patient_with_access(data.patient_id, current_user, db) before creating '
     'the instance. This helper already exists and raises 403/404 if access is denied.'),

    ('HIGH', 'Document Filename Not Validated — Path Traversal Risk',
     'backend/routes/documents.py : 165',
     'The file download endpoint constructs the disk path by joining the upload '
     'directory with the stored filename using os.path.join(). If an attacker can '
     'manipulate the filename field in the database (e.g., via a direct DB exploit or '
     'future API bypass), they could read arbitrary files on the server.',
     'Validate that doc.filename matches r\'^[a-zA-Z0-9._\\-]+$\' before use. '
     'Also use os.path.realpath() and verify the result starts with UPLOAD_DIR.'),

    ('HIGH', 'Admin Can Grant Permissions to Non-Manager Users',
     'backend/routes/admin.py : 242',
     'The endpoint that grants a manager access to a patient does not validate '
     'that the target user_id is actually a manager. An admin could accidentally '
     'or maliciously grant a patient user or a broker full case manager access.',
     'Before creating the PatientPermission record, query the User table and '
     'confirm that role == UserRole.manager. Raise HTTP 400 with a clear message '
     'if the target user is not a manager.'),

    ('MEDIUM', 'TOTP Setup Endpoint Returns Plaintext Secret',
     'backend/routes/auth.py : 849',
     'The 2FA setup endpoint decrypts the TOTP secret from the database and '
     'returns it as a plaintext string in the JSON response alongside the QR code. '
     'If API logs, Sentry breadcrumbs, or network interceptors capture this response, '
     'the secret is permanently compromised.',
     'Return only the QR code URL. Remove the "secret" field from the response. '
     'The user must scan the QR code; if they need the secret key as text, '
     'display it only once in the UI and never log it.'),

    ('MEDIUM', 'JWT Returned in Response Body and Cookie',
     'backend/routes/auth.py : 405',
     'Login sets an HttpOnly cookie and also returns the JWT in the JSON response '
     'body. The cookie alone provides CSRF protection; having the token in the body '
     'creates an additional attack surface through JavaScript access and logging.',
     'Return the JWT only in the HttpOnly cookie. Remove it from the response body. '
     'Return only {"message": "OK", "requires_2fa": bool, "must_change_password": bool}.'),

    ('MEDIUM', 'No Rate Limiting on Patient Record Retrieval',
     'backend/routes/patients.py',
     'GET /api/patients/{patient_id} has no rate limit. An authenticated attacker '
     'can enumerate all patient IDs in rapid succession, harvesting the full database '
     'of patient records. The access control check stops cross-manager access but '
     'does not prevent enumeration of a manager\'s own patients.',
     'Add @limiter.limit("120/minute") on patient read endpoints. '
     'Consider using non-sequential patient identifiers (UUIDs or opaque tokens) '
     'to make enumeration attacks impractical.'),

    ('MEDIUM', 'Full Names and IP Addresses Stored in Audit Logs',
     'backend/audit_middleware.py : 95',
     'The UserActivityLog table stores the user\'s full name and IP address in '
     'plaintext alongside every action. Under the Israeli Privacy Protection Law, '
     'audit logs themselves constitute personal data. If the audit table is breached '
     'or accidentally exposed, this PII is at risk.',
     'Store a hash of the user name (not the full name) and consider hashing '
     'the IP with a rotating salt. Implement a 90-day retention policy with '
     'automatic deletion of old audit entries. Add rate limiting on the audit export endpoint.'),

    ('MEDIUM', 'Excel Export Vulnerable to CSV/Formula Injection',
     'backend/routes/doctors.py',
     'The doctor database export endpoint writes user-supplied text fields (names, '
     'notes, addresses) directly into Excel cells. If any field starts with =, +, @, '
     'or -, spreadsheet applications may interpret it as a formula. An attacker who '
     'adds a doctor record with a crafted name could execute code on the admin\'s machine.',
     'Prefix any cell value that starts with =, +, @, or - with a single quote '
     'when writing to Excel. Use openpyxl\'s cell data_type="s" (string) to '
     'prevent formula execution.'),

    ('LOW', 'No Email Confirmation Before Irreversible Account Deletion',
     'backend/routes/admin.py : 131',
     'The delete-data endpoint permanently removes all patient records and sessions '
     'with a single API call. No secondary confirmation (email, TOTP code, or '
     'timed delay) is required. An admin with a compromised session could wipe data instantly.',
     'Require admin to enter their TOTP code or confirm via an email link before '
     'executing bulk deletion. Implement a 30-day soft-delete with an anonymisation '
     'window before permanent removal.'),

    ('LOW', 'Email 2FA Code Has Borderline Entropy',
     'backend/routes/auth.py : 609',
     'Email 2FA codes use token_hex(4) producing 8 hex characters (32-bit entropy). '
     'With the existing 5/minute rate limit and 15-minute expiry, brute-forcing is '
     'difficult but not impossible in distributed attack scenarios.',
     'Increase to token_hex(6) (12 hex chars, 48 bits) or switch to an 8-digit '
     'numeric code (NIST recommendation). Keep the existing rate limit.'),
]

UX = [
    ('CRITICAL', 'Admin Role/Privilege Buttons Have No Confirmation Dialog',
     'frontend/src/pages/manager/AdminPage.jsx : 540',
     'The buttons that toggle admin status and change user role execute immediately '
     'on click with no "are you sure?" prompt. A single accidental click can remove '
     'admin privileges from the only admin user, or promote a regular manager to admin. '
     'There is no undo mechanism.',
     'Wrap handleAdminToggle and handleRoleChange in a ConfirmDialog (the component '
     'already exists in the codebase). Use danger=true for the admin toggle. '
     'Show the exact change being made in the confirmation message.'),

    ('CRITICAL', 'Applying a Journey Template Shows No Loading Feedback',
     'frontend/src/pages/manager/PatientDetail.jsx : 189',
     'When a user clicks "Apply Journey", the button has no spinner or loading text. '
     'The server call can take 2-3 seconds. Users assume the action failed and click '
     'again, creating duplicate workflow instances. The issue appears in both the '
     'main page and the template selection modal.',
     'Set a boolean applying state to true before the API call. Disable the button '
     'and display "Applying..." text or a spinner while the request is in-flight. '
     'Reset the state and show a success/error toast on completion.'),

    ('CRITICAL', 'Medication Modal Closes Before Save is Confirmed',
     'frontend/src/pages/manager/PatientMedications.jsx : 100',
     'In handleSave(), setShowForm(false) is called before the API response is received. '
     'If the save request fails, the modal has already closed and the user sees no error. '
     'They leave the page believing the medication was saved, but it was not — silent data loss.',
     'Move setShowForm(false) to inside the success block, after the API call resolves. '
     'In the catch block, keep the modal open and display an error message so the '
     'user can correct the issue and try again.'),

    ('CRITICAL', 'Back Button Uses a Right-Pointing Arrow in an RTL Interface',
     'frontend/src/pages/manager/IntakeWizard.jsx : 1162',
     'The "חזרה" (back) button is marked with → (right arrow). In Hebrew RTL layout, '
     '"back" means moving right-to-left on screen, so the arrow should point left (←). '
     'The current arrow visually implies "forward", causing navigation confusion for '
     'first-time users on a 7-step onboarding wizard.',
     'Change the arrow to ← or use a dedicated icon (ChevronRight in RTL will render '
     'as a left-pointing arrow automatically if you apply the RTL icon flip pattern). '
     'Test all wizard navigation buttons for consistent directional semantics.'),

    ('CRITICAL', 'Language Switcher Container Hardcoded to LTR',
     'frontend/src/components/LanguageSwitcher.jsx : 35',
     'The wrapper div has dir="ltr" hardcoded. Inside an RTL page, this forces the '
     'Hebrew and English buttons into English reading order, making the switcher look '
     'visually misaligned with the rest of the navigation.',
     'Remove dir="ltr". The component should inherit the page direction. '
     'If button ordering needs to be fixed (HE on right, EN on left), use '
     'CSS order or flex-direction properties rather than the dir attribute.'),

    ('HIGH', 'Admin Tabs Not Keyboard-Navigable',
     'frontend/src/pages/manager/AdminPage.jsx : 326',
     'The admin panel tabs (Users, Sessions, Registrations, etc.) are rendered as '
     'plain div elements or buttons without role="tablist" / role="tab" ARIA attributes. '
     'Keyboard users cannot navigate between tabs using arrow keys, and screen readers '
     'do not announce the tab panel structure.',
     'Add role="tablist" to the tab container and role="tab", aria-selected, '
     'and tabIndex to each button. Implement an onKeyDown handler that moves focus '
     'between tabs on ArrowLeft/ArrowRight. This is an IS 5568 / WCAG 2.1 AA requirement.'),

    ('HIGH', 'Disabled Buttons Provide No Explanation',
     'frontend/src/pages/manager/PatientMedications.jsx : 255',
     'The "Extract from Document" button is disabled when no PDF is selected, but '
     'there is no tooltip or visible text explaining why. Users see a greyed-out button '
     'and assume the feature is broken or unavailable to them.',
     'Add a title attribute with the reason: title="Select a PDF document first". '
     'Alternatively, show a short helper text below the button only when it is '
     'in the disabled state: "Select a PDF above to enable extraction."'),

    ('HIGH', 'Create User Modal Has No Live Password Strength Feedback',
     'frontend/src/pages/manager/AdminPage.jsx : 268',
     'The admin "Create User" modal shows only "Minimum 8 characters" as a hint. '
     'The backend validates uppercase + lowercase + digit requirements, but the '
     'frontend shows no live indicators. Users submit the form, get a rejection error, '
     'and must open the modal again without knowing exactly what is missing.',
     'Add the same live validation checklist already present in ChangePasswordPage.jsx '
     '(lines 93-98): three checkmarks that turn green in real-time as the user types. '
     'Disable the submit button until all criteria are met.'),

    ('HIGH', 'Patient Timeline Has No Pagination',
     'frontend/src/pages/manager/PatientDetail.jsx : 510',
     'All timeline nodes are rendered in a single unbroken list. A patient with an '
     'active NSCLC journey can accumulate 50+ nodes. Rendering them all simultaneously '
     'degrades page performance and forces users to scroll extensively to reach older events.',
     'Show the 15 most recent nodes by default. Add a "Show older events" button '
     'that loads the next batch. Alternatively, group nodes by journey phase and '
     'collapse older phases by default.'),

    ('HIGH', 'Cancel Workflow Has No Loading State',
     'frontend/src/components/workflows/WorkflowPanel.jsx : 137',
     'After the user confirms workflow cancellation, the confirm dialog closes but '
     'nothing visual changes for 2-3 seconds while the API call processes. Users '
     'think the action failed and click cancel again, attempting a double-cancel.',
     'Set a cancelling state to true immediately after user confirms. Show a spinner '
     'or change the button text to "Cancelling..." and disable it until the API '
     'call completes or fails.'),

    ('MEDIUM', 'Registration Rejection Reason Has No Character Limit',
     'frontend/src/pages/manager/AdminPage.jsx : 845',
     'The rejection reason textarea accepts unlimited input. An admin could paste '
     'a very long text that breaks the modal layout. There is no visual feedback '
     'about length constraints.',
     'Add maxLength={256} to the textarea and a character counter: '
     '"X / 256 characters". Validate on the backend as well.'),

    ('MEDIUM', 'Date Picker Dropdown Cannot Be Closed with Escape Key',
     'frontend/src/pages/manager/IntakeWizard.jsx : 189',
     'The custom day/month/year segment dropdowns open on click but have no '
     'keyboard Escape handler to close them. Mobile users without a clear '
     '"click outside" target may become trapped in the open dropdown.',
     'Add an onKeyDown handler on the dropdown wrapper: '
     'e.key === "Escape" && setOpen(false). Also add a semi-transparent '
     'overlay behind the dropdown so mobile users can tap to close.'),

    ('LOW', 'Close Button in Admin Reset Panel Has No Accessible Name',
     'frontend/src/pages/manager/AdminPage.jsx : 495',
     'The × close button for the password reset result panel has no aria-label. '
     'Screen readers announce it as "button" with no description.',
     'Add aria-label="Close notification" to the button element.'),

    ('LOW', '"Draft Saved" Confirmation Disappears Too Quickly',
     'frontend/src/pages/manager/IntakeWizard.jsx : 1093',
     'The auto-save confirmation message is visible for only 1,500ms. On a slow '
     'network, users may not see it before it disappears, leaving them uncertain '
     'whether their progress was saved.',
     'Increase the timeout to 2,500ms. Alternatively, keep the message visible '
     'until the user starts typing again, then fade it out after a 2-second idle.'),
]

CODE = [
    ('CRITICAL', 'Patient Deletion Has No Transaction Rollback',
     'backend/routes/admin.py : 145',
     'delete_user_data() deletes patient records in a loop without a try/except '
     'around the commit. If a foreign-key constraint fails mid-loop, some patients '
     'are deleted and others are not, leaving the database in an inconsistent state '
     'with no automatic recovery.',
     'Wrap the entire deletion loop in a try block. Call db.rollback() in the '
     'except block and re-raise as HTTPException(500). Use a single db.commit() '
     'only after all deletions succeed.'),

    ('CRITICAL', 'Flow Engine Accesses Patient Object Without Null Check',
     'backend/flow_engine.py : 149',
     '_activate_step() calls db.get(models.Patient, instance.patient_id) and '
     'immediately accesses patient.insurance_sources without checking whether '
     'patient is None. If a patient is deleted while a workflow is active, '
     'this raises an AttributeError and crashes the APScheduler job.',
     'Add an explicit null check: if not patient: log the error and return. '
     'Apply the same pattern in advance_step() and anywhere else the patient '
     'object is fetched by ID inside the flow engine.'),

    ('CRITICAL', 'Intake Wizard Swallows Individual Medication Save Failures',
     'frontend/src/pages/manager/IntakeWizard.jsx : 724',
     'Medications are saved in a loop after patient creation. Each save failure '
     'triggers a toast, but execution continues regardless. If 9 of 10 medications '
     'fail, only the last toast is visible and the user has no summary of what failed. '
     'The patient record is created successfully even if most medications are lost.',
     'Use Promise.allSettled() for all medication save calls. After all settle, '
     'count the failures and show a single aggregated message: '
     '"2 of 5 medications could not be saved. Please add them manually."'),

    ('CRITICAL', 'Workflow Summary Crashes if Template Was Deleted',
     'backend/routes/workflows.py : 481',
     'list_instances() calls FlowEngine.get_summary(instance), which accesses '
     'instance.template.name without checking whether the template still exists. '
     'If a template is deleted after instances were created, this raises '
     'AttributeError and makes the entire workflow list endpoint fail.',
     'Add null-safe access: instance.template.name if instance.template else "Deleted". '
     'Apply the same pattern to specialty, estimated_cost, and all other '
     'template-derived fields in get_summary().'),

    ('HIGH', 'N+1 Database Query in Workflow Instance List',
     'backend/routes/workflows.py : 468',
     'The workflow instances endpoint loads instances with joinedload for the patient, '
     'but fetches each instance\'s steps with a separate query inside the loop. '
     'With 50 instances, this executes 51 database queries instead of 2, '
     'making the endpoint noticeably slow.',
     'Add selectinload(models.WorkflowInstance.steps) to the initial query. '
     'SQLAlchemy will batch all step fetches into a single query, reducing '
     'total queries from N+1 to 2 regardless of instance count.'),

    ('HIGH', 'Race Condition: Two Concurrent Advances Can Create Duplicate Claims',
     'backend/flow_engine.py : 221',
     '_auto_create_draft_claim() checks for an existing claim, then creates one if '
     'absent. Two concurrent step-advance requests can both pass the existence check '
     'before either has committed, creating two draft claims for the same step.',
     'Use .with_for_update() on the existence check query to acquire a row-level '
     'lock, or add a unique database constraint on (workflow_step_id) in the '
     'Claim table to enforce uniqueness at the database level.'),

    ('HIGH', 'SLA Check Job Leaves Inconsistent State on Exception',
     'backend/main.py : 134',
     'The daily SLA check marks step.sla_alerted = True before creating the '
     'associated WorkflowAction record. If an exception occurs between these two '
     'lines, the step is marked as alerted but no action record exists. '
     'The step will never be re-alerted in future runs.',
     'Reverse the order: create and add the WorkflowAction first, then set '
     'sla_alerted = True. Wrap both operations in a nested try block so that '
     'a failure rolls back the action creation and leaves the step un-alerted.'),

    ('HIGH', 'Over 20 Silent Error Catches in Frontend Pages',
     'frontend/src/pages/manager/ — multiple files',
     '.catch(() => {}) patterns throughout PatientDetail.jsx, PatientMedications.jsx, '
     'and other pages silently swallow API errors. When a request fails, the UI '
     'keeps showing stale data with no indication that anything went wrong. '
     'Users make decisions based on outdated information.',
     'Replace all .catch(() => {}) with at minimum: '
     '.catch(e => { if (!axios.isCancel(e)) showToast("Could not refresh data. Please reload.") }). '
     'Audit all 20+ instances systematically using grep -r "catch(() => {})"'),

    ('MEDIUM', 'Admin Dashboard Crashes on Orphaned Patient Record',
     'backend/routes/admin.py : 301',
     'admin_dashboard() iterates over all patients and accesses p.manager without '
     'checking if manager_id is None. A patient without a manager (orphaned after '
     'a failed user deletion) causes an AttributeError and makes the entire '
     'dashboard endpoint unavailable.',
     'Add a guard: if p.manager_id: patients_by_manager.setdefault(p.manager_id, []).append(p). '
     'Also add a database integrity check to the daily maintenance job to '
     'detect and flag orphaned records.'),

    ('MEDIUM', 'Malformed Gate Configuration Silently Bypasses Workflow Gates',
     'backend/flow_engine.py : 53',
     'evaluate_gate() catches a JSON parse exception and returns True, None, '
     'meaning a step with corrupted gate configuration always passes. '
     'A misconfigured gate could allow a workflow to advance through a clinical '
     'checkpoint that was meant to require specific patient data.',
     'On JSON parse failure, return False with the error message: '
     '"Gate configuration is corrupted. Please contact your administrator." '
     'Log the error with the step ID so it can be corrected. '
     'Never silently bypass a gate.'),

    ('MEDIUM', 'URL Tab State Can Desync from Selected Tab',
     'frontend/src/pages/manager/AdminPage.jsx : 15',
     'The admin page reads the tab from the URL on initial render but does not '
     'react to subsequent URL changes (e.g., browser back button). The displayed '
     'tab and the URL can become out of sync, causing confusion when sharing links.',
     'Add a useEffect that depends on the searchParams tab value and calls '
     'setTab() when it changes. This makes the URL the single source of truth.'),
]

FRONTEND = [
    ('CRITICAL', 'Stale Closure and Missing Cleanup in triggerSuggest',
     'frontend/src/pages/manager/IntakeWizard.jsx : 570',
     'The useCallback for triggerSuggest has an empty dependency array but uses '
     'state setter functions inside an async setTimeout callback. The timer is '
     'not cleared when the component unmounts, so if the wizard is closed while '
     'the 600ms debounce is pending, it attempts to update state on an unmounted '
     'component — a React memory leak.',
     'Add a useEffect cleanup that clears the timer on unmount: '
     'return () => clearTimeout(suggestTimer.current). '
     'Ensure the useCallback dependency array is accurate.'),

    ('CRITICAL', 'Language Change Does Not Re-trigger Landing Page Data Fetch',
     'frontend/src/pages/LandingPage.jsx : 600',
     'The useEffect that fetches landing page override content runs once on mount '
     'with an empty dependency array, but it uses i18n.language inside the callback. '
     'When the user switches language, the overrides are not re-fetched, so '
     'the page shows content in the previous language until reload.',
     'Add i18n.language to the useEffect dependency array so the fetch re-runs '
     'when the language changes. Also add a cancel flag or AbortController '
     'to avoid setting state after the component unmounts during navigation.'),

    ('HIGH', 'JSON.parse on localStorage Can Crash ChangePasswordPage',
     'frontend/src/pages/ChangePasswordPage.jsx : 44',
     'If the "user" key in localStorage contains malformed JSON (browser storage '
     'corruption, manual editing, or extension interference), JSON.parse throws '
     'an uncaught exception and crashes the component during render. '
     'This locks the user out of the forced password change flow entirely.',
     'Wrap the parse in a try/catch. On failure, set a default empty object '
     'and optionally clear the corrupted key from localStorage. '
     'This is a defensive programming pattern that should be applied wherever '
     'localStorage values are parsed.'),

    ('HIGH', 'fetchAll Function Is Recreated on Every Render',
     'frontend/src/pages/manager/PatientDetail.jsx : 87',
     'fetchAll is defined as a plain function inside the component body and '
     'referenced in a useEffect that depends only on [id]. On every parent '
     're-render, a new fetchAll function is created, but the useEffect does '
     'not re-run (because id has not changed), capturing a potentially stale closure.',
     'Wrap fetchAll in useCallback with [id] as the dependency array. '
     'Then list fetchAll as a dependency of the useEffect. This ensures the '
     'effect always has a fresh closure and runs when the patient ID changes.'),

    ('MEDIUM', 'LoginModal Escape Key Handler Has Missing Dependency',
     'frontend/src/pages/LandingPage.jsx : 51',
     'The useEffect that adds the Escape key listener to window uses onClose '
     'inside the handler but does not list it in the dependency array. '
     'If the parent re-renders with a new onClose reference (common in React), '
     'the handler silently keeps the old function reference.',
     'Add onClose to the dependency array: }, [onClose]). '
     'Wrap the onClose prop in useCallback at the call site if it is defined '
     'as an inline function to prevent unnecessary effect re-runs.'),
]

PERFORMANCE = [
    ('HIGH', 'Insurance Gap Check Loads Entire Database Into Memory',
     'backend/main.py : 170',
     'The daily insurance gap check job calls db.query(models.Patient).all() '
     'with no limit, loading every patient record. It then loops through all '
     'nodes for each patient, calling _best_coverage_for_node() which issues '
     'its own queries. With 5,000 patients, this is potentially hundreds of '
     'thousands of database operations running in a single thread.',
     'Process patients in chunks of 100 using limit()/offset() pagination. '
     'Pre-fetch nodes via selectinload() to avoid per-patient queries. '
     'Filter to only patients with active workflows using a JOIN rather than '
     'processing all patients including inactive ones.'),

    ('MEDIUM', 'Notification Polling at 60-Second Intervals Has No Backoff',
     'frontend/src/components/NotificationBell.jsx : 11',
     'The notification bell polls the API every 60 seconds unconditionally. '
     'A manager with the application open for an 8-hour shift generates 480 '
     'API calls just for notifications. There is no backoff when results are empty '
     'and no pause when the browser tab is not visible.',
     'Increase the base interval to 120 seconds. Add document.visibilityState '
     'check to skip polling when the tab is in the background. '
     'Implement exponential backoff (up to 5-minute intervals) when the '
     'server consistently returns zero notifications.'),

    ('MEDIUM', 'Medication List Endpoint Has No Pagination',
     'backend/routes/medications.py : 325',
     'GET /api/patients/{patient_id}/medications returns all medications as a '
     'flat array with no limit. For patients imported from external systems or '
     'with extensive medication histories, this can produce large JSON responses '
     'that are slow to download and render.',
     'Add optional limit and offset parameters (default limit=50). '
     'Return {"medications": [...], "total": N} so the frontend can '
     'implement lazy loading. Apply the same pattern to the interaction check '
     'to avoid O(n²) comparisons on large medication lists.'),

    ('MEDIUM', 'Drug Enrichment Makes a Synchronous Blocking HTTP Call',
     'backend/routes/medications.py : 549',
     'The enrich_drug endpoint uses httpx.Client (synchronous) inside a route handler. '
     'With an 8-second timeout, each enrichment request blocks a Uvicorn worker '
     'thread entirely. With 10 concurrent users triggering enrichment, all worker '
     'threads can be tied up waiting for openFDA.',
     'Convert the route to async def and use async with httpx.AsyncClient(). '
     'Alternatively, run enrichment as a background task (FastAPI\'s BackgroundTasks) '
     'and return 202 Accepted immediately, updating the database when the '
     'external call completes.'),

    ('MEDIUM', 'Patient List Loads All Records Without Pagination',
     'backend/routes/patients.py : 270',
     'The patient list endpoint calls .all() without any limit, returning every '
     'patient the manager has access to in a single response. A manager with '
     '500 patients generates a multi-megabyte response on every dashboard load.',
     'Implement server-side pagination: return limit=20 patients by default with '
     'offset support. Return the total count alongside items so the frontend '
     'can show "Showing 20 of 347 patients". Add a search parameter to filter '
     'before fetching.'),

    ('MEDIUM', 'Drug Name Searches Use Full Table Scan',
     'backend/models.py : 307',
     'Drug searches use ILIKE on the name, generic_name, and hebrew_name columns. '
     'SQLite does not use the UNIQUE index for ILIKE queries (which are case-insensitive). '
     'Every search scans all 1,162 drug records across three columns.',
     'Add explicit indexes: Index("ix_drug_name", "name") and '
     'Index("ix_drug_hebrew", "hebrew_name"). For future scale, consider '
     'enabling SQLite FTS5 or migrating to PostgreSQL\'s full-text search.'),

    ('LOW', 'Dashboard Recalculates Patient Statistics on Every Render',
     'frontend/src/pages/manager/ManagerDashboard.jsx : 88',
     'The dashboard uses .filter() on the full patients array on every render '
     'to compute counts. With 200+ patients, this creates unnecessary CPU work '
     'every time any state changes (including unrelated state like notification '
     'count updates).',
     'Wrap the filter calculations in useMemo with patients as the dependency. '
     'The values will only recompute when the patients list actually changes, '
     'not on every render cycle.'),
]

COMPLIANCE = [
    ('CRITICAL', 'Patient ID Numbers Stored Unencrypted',
     'backend/models.py : 137',
     'PendingRegistration.id_number is stored as plain VARCHAR in the database. '
     'Israeli ID numbers (Mispar Zehut) are classified as sensitive personal '
     'identifiers under the Privacy Protection Law. If the database file is '
     'accessed directly (backup breach, disk access), all ID numbers are exposed.',
     'Change the id_number column to EncryptedText (the field_encrypt.py '
     'infrastructure already exists). Update the duplicate-check logic to '
     'normalise and compare decrypted values. Apply the same change to the '
     'phone field in PendingRegistration.'),

    ('CRITICAL', 'Primary Phone Numbers Not Encrypted',
     'backend/models.py : 216',
     'Patient.phone, Patient.phone2, and related prefix fields are stored as '
     'plain VARCHAR while emergency contact phone (ec_phone) is encrypted. '
     'This is an inconsistency in the data protection model — primary contact '
     'numbers are arguably more sensitive than emergency contacts.',
     'Change phone and phone2 to EncryptedText. Keep prefix columns as plain '
     'integers (they carry no identifying information alone). Update all queries '
     'and serializers that currently treat phone as a plain string.'),

    ('HIGH', 'Backup Files Are Not Encrypted Before Being Stored Locally',
     'backend/backup.py : 33',
     'sqlite3.backup() creates a copy of the entire database, including all PHI. '
     'The file is gzipped but not encrypted before being saved to /data/backups/. '
     'R2 upload uses server-side encryption, but the 7 most recent backups on '
     'local disk are fully readable if the volume is accessed directly.',
     'Encrypt the gzipped backup using the existing Fernet key before writing '
     'to disk: fernet.encrypt(gzip_bytes). The decryption key (FIELD_ENCRYPTION_KEY) '
     'must be stored separately from the backup. Document a tested restore procedure.'),

    ('HIGH', 'Consent Withdrawal Cannot Be Recorded',
     'backend/models.py : 253',
     'The data model stores consent_agreed (boolean) and consent_signed_at '
     '(timestamp) but has no mechanism to record consent withdrawal. Under '
     'the Privacy Protection Law, a data subject must be able to withdraw '
     'consent and this must be traceable. There is also no audit log of who '
     'witnessed or modified consent status.',
     'Add consent_withdrawn_at column to Patient. Create a ConsentAuditLog '
     'table with fields: patient_id, action (agree/withdraw), triggered_by, '
     'timestamp, ip_address. Log every consent state change through this table.'),

    ('HIGH', 'Patient Deletion Leaves Residual Data',
     'backend/routes/patients.py : 539',
     'The patient delete endpoint removes the core patient record and cascades '
     'to related tables, but it does not delete: UserActivityLog entries '
     'referencing the patient, family share tokens, consent signature files on '
     'disk, or document view tokens. Under a right-to-erasure request, this '
     'residual data must also be removed.',
     'Create a dedicated delete_patient_completely() function that removes '
     'all residual records in the correct dependency order, then anonymises '
     'the audit trail entries rather than deleting them (required for compliance '
     'audit continuity). Log the erasure itself as an immutable audit event.'),

    ('HIGH', 'Field Encryption Key Has No Rotation Mechanism',
     'backend/field_encrypt.py : 16',
     'FIELD_ENCRYPTION_KEY is a single static Fernet key stored in Railway env '
     'variables. If this key is ever compromised, all encrypted fields in the '
     'database are exposed with no way to re-encrypt without downtime. '
     'There is no documented rotation procedure.',
     'Implement key versioning: prefix each encrypted value with a key version '
     'identifier (e.g., "v2:enc:..."). Store old keys for decryption during '
     'transition. Build a migration script that re-encrypts all fields with '
     'the new key. Document the rotation procedure and schedule it quarterly.'),

    ('MEDIUM', 'Temporary Password Sent as Plaintext in Approval Email',
     'backend/routes/admin.py : 119',
     'When an admin approves a user registration, a temporary password is '
     'generated and sent via email in plaintext. If the email account is '
     'compromised or the email is forwarded, the credential is permanently exposed.',
     'Replace the temporary password with a single-use, time-limited activation '
     'link (valid for 24 hours). The link directs the user to a page where '
     'they set their own password. This is more secure and a better user experience.'),

    ('MEDIUM', 'Medical Diagnosis Details Returned Without Role-Based Filtering',
     'backend/routes/patients.py : 167',
     'The patient_to_dict() serializer returns diagnosis_details, notes, '
     'medical_stage, biomarker_target, and other sensitive clinical fields '
     'to any authenticated manager. Under need-to-know principles, some of '
     'these fields should require specific permissions.',
     'Create two serializer levels: a summary view (name, dob, status) and '
     'a clinical detail view (diagnosis, medications, notes). Require '
     'view_financials or manage_workflows permission for the clinical detail view.'),

    ('MEDIUM', 'Calendar Feed Token Has No Revocation Mechanism',
     'backend/models.py : 1055',
     'Calendar feed tokens are included in the ICS URL (/api/calendar/user__TOKEN.ics). '
     'Once issued, the token cannot be revoked without deleting and recreating it. '
     'If a user shares their calendar URL, their data is accessible to anyone '
     'with that URL until it expires (up to 365 days).',
     'Add a revoked_at column to CalendarToken. Implement a POST endpoint '
     'to revoke and regenerate the token. Display the last-accessed date '
     'in the user profile so users know if their calendar is being accessed.'),
]

API_INTEGRATION = [
    ('PASS', 'All API Endpoints Verified — No Mismatches Found',
     'frontend/src/services/api.js + all backend routes',
     'Agent 7 cross-referenced all frontend API calls against backend route '
     'definitions across AdminPage, PatientMedications, MyDay, IntakeWizard, '
     'WorkflowsPage, and LandingPage. Every endpoint exists, all response shapes '
     'match frontend expectations, HTTP methods are correct, and pagination '
     'structures are consistent.',
     'No action required. This is a notable strength of the codebase — '
     'the API contract is well-maintained. Continue verifying integration '
     'as new endpoints are added.'),
]


# ══════════════════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════════════════

ALL_FINDINGS = SECURITY + UX + CODE + FRONTEND + PERFORMANCE + COMPLIANCE

def count_by_sev(findings):
    c = {'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0}
    for f in findings:
        c[f[0]] = c.get(f[0], 0) + 1
    return c

TOTALS = count_by_sev(ALL_FINDINGS)


# ══════════════════════════════════════════════════════════════════════════════
# REPORT BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def build(out_path):
    doc = SimpleDocTemplate(out_path, pagesize=A4,
                            rightMargin=MARGIN, leftMargin=MARGIN,
                            topMargin=MARGIN, bottomMargin=MARGIN)
    story = []

    # ── COVER PAGE ──────────────────────────────────────────────────────────
    cover_data = [[
        Paragraph('<b>CareFlow</b>', s('ch', fontName='Arial-Bold', fontSize=28,
                                       leading=34, textColor=WHITE)),
        Paragraph('Full System Audit Report', s('cs2', fontSize=15, leading=20,
                                                  textColor=colors.HexColor('#93C5FD'))),
        Paragraph(f'Generated by 7-Agent Council  ·  {DATE_LONG}',
                  s('cd', fontSize=9, leading=13,
                    textColor=colors.HexColor('#94A3B8'))),
    ]]
    cover_tbl = Table(cover_data, colWidths=[CW])
    cover_tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,-1), NAVY),
        ('TOPPADDING',    (0,0),(-1,-1), 22),
        ('BOTTOMPADDING', (0,0),(-1,-1), 22),
        ('LEFTPADDING',   (0,0),(-1,-1), 22),
        ('RIGHTPADDING',  (0,0),(-1,-1), 22),
        ('ROWBACKGROUNDS',(0,0),(-1,-1), [NAVY]),
    ]))
    story += [sp(0.5), cover_tbl, sp(0.6)]

    # Summary stats block
    stats = [
        [sev_cell('CRITICAL'), Paragraph(f'<b>{TOTALS["CRITICAL"]}</b> Critical',
                                          s('sc', fontName='Arial-Bold', fontSize=11))],
        [sev_cell('HIGH'),     Paragraph(f'<b>{TOTALS["HIGH"]}</b> High',
                                          s('sh2', fontName='Arial-Bold', fontSize=11))],
        [sev_cell('MEDIUM'),   Paragraph(f'<b>{TOTALS["MEDIUM"]}</b> Medium',
                                          s('sm2', fontName='Arial-Bold', fontSize=11))],
        [sev_cell('LOW'),      Paragraph(f'<b>{TOTALS["LOW"]}</b> Low',
                                          s('sl2', fontName='Arial-Bold', fontSize=11))],
    ]
    stat_cols = []
    for row in stats:
        badge_t = Table([row], colWidths=[1.3*cm, 4*cm])
        badge_t.setStyle(TableStyle([
            ('ALIGN',  (0,0),(0,-1), 'CENTER'),
            ('VALIGN', (0,0),(-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0),(-1,-1), 4),
            ('BOTTOMPADDING', (0,0),(-1,-1), 4),
        ]))
        stat_cols.append(badge_t)

    grid = Table([stat_cols[:2], stat_cols[2:]], colWidths=[CW/2, CW/2])
    grid.setStyle(TableStyle([
        ('BOX',           (0,0),(-1,-1), 0.5, BORDER),
        ('INNERGRID',     (0,0),(-1,-1), 0.3, BORDER),
        ('TOPPADDING',    (0,0),(-1,-1), 8),
        ('BOTTOMPADDING', (0,0),(-1,-1), 8),
        ('LEFTPADDING',   (0,0),(-1,-1), 12),
        ('RIGHTPADDING',  (0,0),(-1,-1), 12),
        ('BACKGROUND',    (0,0),(-1,-1), LGRAY),
    ]))
    story += [grid, sp(0.4)]

    total_findings = sum(TOTALS.values())
    story.append(p(
        f'This report was produced by a council of 7 specialised review agents that '
        f'independently audited CareFlow across six dimensions: security, user experience, '
        f'code correctness, frontend quality, performance, and data privacy compliance. '
        f'A seventh agent verified the API contract between frontend and backend — no '
        f'mismatches were found. The six active agents identified a combined total of '
        f'<b>{total_findings} findings</b>. Each finding includes a description of the '
        f'issue and a concrete recommended fix.',
        BODY))
    story += [sp(0.3), hr()]

    # ── AGENT OVERVIEW TABLE ────────────────────────────────────────────────
    story.append(p('Agents & Scope', SEC_HEAD))
    agent_rows = [
        [p('<b>Agent</b>', LABEL), p('<b>Focus Area</b>', LABEL),
         p('<b>Critical</b>', LABEL), p('<b>High</b>', LABEL),
         p('<b>Medium</b>', LABEL), p('<b>Low</b>', LABEL)],
        ['Security',      'OWASP Top 10, auth, IDOR, injection',       '4','3','8','2'],
        ['UX',            'User flows, loading states, RTL, keyboard',  '5','5','2','3'],
        ['Code Quality',  'Bugs, race conditions, null checks',         '4','4','3','2'],
        ['Frontend',      'React hooks, closures, optional chaining',   '2','2','1','1'],
        ['Performance',   'DB queries, pagination, async patterns',     '0','1','5','4'],
        ['Compliance',    'Privacy law, encryption, consent, erasure',  '2','3','4','0'],
        [p('<b>API Integration</b>', LABEL), 'Contract cross-check',
         p('✓ Clean', s('ok', textColor=GREEN, fontName='Arial-Bold', fontSize=9)),
         '', '', ''],
    ]
    for i in range(1, len(agent_rows) - 1):
        row = agent_rows[i]
        agent_rows[i] = [p(str(c), BODY) for c in row]

    agt = Table(agent_rows, colWidths=[2.5*cm, CW-9.8*cm, 1.5*cm, 1.5*cm, 1.5*cm, 1.5*cm])
    agt.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,0), NAVY),
        ('TEXTCOLOR',     (0,0),(-1,0), WHITE),
        ('FONTNAME',      (0,0),(-1,0), 'Arial-Bold'),
        ('FONTSIZE',      (0,0),(-1,0), 9),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, LGRAY]),
        ('GRID',          (0,0),(-1,-1), 0.3, BORDER),
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 7),
        ('RIGHTPADDING',  (0,0),(-1,-1), 7),
        ('ALIGN',         (2,0),(-1,-1), 'CENTER'),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
    ]))
    story += [agt, PageBreak()]

    # ── SECTION FUNCTION ────────────────────────────────────────────────────
    def render_section(title, subtitle, findings, icon=''):
        c = count_by_sev(findings)
        story.append(p(f'{icon}  {title}', SEC_HEAD))
        story.append(p(subtitle, BODY_SMALL))
        summary_row = []
        for sev in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
            n = c.get(sev, 0)
            if n:
                summary_row.append(
                    Paragraph(f'<b>{n}</b> {sev}',
                              s(f'sr_{sev}', fontName='Arial-Bold', fontSize=8.5,
                                textColor=FG[sev])))
        if summary_row:
            sr = Table([summary_row],
                       colWidths=[CW / len(summary_row)] * len(summary_row))
            sr.setStyle(TableStyle([
                ('TOPPADDING',    (0,0),(-1,-1), 4),
                ('BOTTOMPADDING', (0,0),(-1,-1), 4),
                ('BACKGROUND',    (0,0),(-1,-1), LGRAY),
                ('BOX',           (0,0),(-1,-1), 0.5, BORDER),
            ]))
            story.extend([sp(0.15), sr, sp(0.25)])
        else:
            story.append(sp(0.25))

        for f in findings:
            story.append(finding_card(*f))
        story.append(sp(0.3))

    # ── SECTION 1: SECURITY ─────────────────────────────────────────────────
    render_section(
        '1. Security',
        'OWASP Top 10 audit covering authentication, access control, injection, '
        'cryptographic failures, and data exposure.',
        SECURITY, '🔒')
    story.append(PageBreak())

    # ── SECTION 2: UX & ACCESSIBILITY ──────────────────────────────────────
    render_section(
        '2. User Experience & Accessibility',
        'End-user perspective audit covering confusing flows, missing feedback, '
        'RTL issues, keyboard navigation, and WCAG 2.1 / IS 5568 compliance.',
        UX, '👤')
    story.append(PageBreak())

    # ── SECTION 3: CODE QUALITY ─────────────────────────────────────────────
    render_section(
        '3. Code Quality',
        'Logic bugs, race conditions, silent error handling, null dereferences, '
        'and transaction integrity issues.',
        CODE, '⚙')
    story.append(PageBreak())

    # ── SECTION 4: FRONTEND STATIC ANALYSIS ────────────────────────────────
    render_section(
        '4. Frontend Static Analysis',
        'React Rules of Hooks, stale closures, missing dependencies, optional chaining, '
        'and memory leak patterns.',
        FRONTEND, '⚛')

    # ── SECTION 5: PERFORMANCE ──────────────────────────────────────────────
    story.append(PageBreak())
    render_section(
        '5. Performance',
        'Database query patterns, missing pagination, blocking I/O, polling overhead, '
        'and frontend render optimisation.',
        PERFORMANCE, '⚡')

    # ── SECTION 6: COMPLIANCE & DATA PRIVACY ───────────────────────────────
    story.append(PageBreak())
    render_section(
        '6. Data Privacy & Compliance',
        'Israeli Privacy Protection Law, PHI handling, encryption gaps, '
        'right to erasure, consent management, and backup security.',
        COMPLIANCE, '🔐')

    # ── SECTION 7: API INTEGRATION ──────────────────────────────────────────
    story.append(PageBreak())
    story.append(p('7. API Integration Contract', SEC_HEAD))
    story.append(p(
        'Agent 7 performed a systematic cross-reference of all frontend API calls '
        'against all backend route definitions. This covered AdminPage, '
        'PatientMedications, MyDay, IntakeWizard, WorkflowsPage, LandingPage, '
        'and the global api.js service layer.',
        BODY))
    story.append(sp(0.2))

    pass_box = Table(
        [[Paragraph('✓  ALL ENDPOINTS VERIFIED — NO MISMATCHES',
                    s('pok', fontName='Arial-Bold', fontSize=12, leading=15,
                      textColor=GREEN, alignment=1))]],
        colWidths=[CW])
    pass_box.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,-1), colors.HexColor('#F0FDF4')),
        ('BOX',           (0,0),(-1,-1), 1, GREEN),
        ('TOPPADDING',    (0,0),(-1,-1), 16),
        ('BOTTOMPADDING', (0,0),(-1,-1), 16),
    ]))
    story += [pass_box, sp(0.3)]

    story.append(p(
        'All 50+ endpoints exist and match their frontend callers. Response shapes, '
        'HTTP methods, pagination structures, and authentication header patterns are '
        'consistent throughout. This is a notable engineering strength of CareFlow. '
        'To maintain this standard as the codebase grows, consider adopting an '
        'OpenAPI schema validation step in the CI pipeline.',
        BODY))

    # ── PRIORITY ACTION PLAN ─────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(p('Priority Action Plan', SEC_HEAD))
    story.append(p(
        'The following items should be addressed before commercial launch, '
        'listed in priority order. Items marked MUST are blockers; SHOULD '
        'items are important but do not prevent a limited beta release.',
        BODY))
    story.append(sp(0.3))

    actions = [
        ('MUST', 'CRITICAL', 'Disable or remove E2E backdoor endpoint in production',
         '2 hours'),
        ('MUST', 'CRITICAL', 'Fix IDOR: add access checks to all workflow endpoints',
         '1 day'),
        ('MUST', 'CRITICAL', 'Fix patient deletion rollback transaction safety',
         '2 hours'),
        ('MUST', 'CRITICAL', 'Encrypt patient ID numbers and phone numbers',
         '1 day'),
        ('MUST', 'CRITICAL', 'Fix medication modal close timing (data loss risk)',
         '1 hour'),
        ('MUST', 'CRITICAL', 'Add null check before patient access in flow engine',
         '1 hour'),
        ('MUST', 'HIGH', 'Encrypt local backup files at rest',
         '3 hours'),
        ('MUST', 'HIGH', 'Add consent withdrawal tracking to data model',
         '4 hours'),
        ('MUST', 'HIGH', 'Fix 20+ silent catch blocks (users see stale data)',
         '1 day'),
        ('SHOULD', 'HIGH', 'Add loading states to apply-journey and cancel-workflow',
         '2 hours'),
        ('SHOULD', 'HIGH', 'Add confirmation dialogs for irreversible admin actions',
         '2 hours'),
        ('SHOULD', 'HIGH', 'Implement server-side pagination on patient and medication lists',
         '1 day'),
        ('SHOULD', 'MEDIUM', 'Replace temporary password email with activation link',
         '4 hours'),
        ('SHOULD', 'MEDIUM', 'Implement field encryption key rotation mechanism',
         '1 day'),
        ('SHOULD', 'MEDIUM', 'Add rate limiting to patient data endpoints',
         '2 hours'),
        ('SHOULD', 'MEDIUM', 'Fix RTL back-button arrow direction in IntakeWizard',
         '30 min'),
    ]

    action_rows = [[
        p('<b>Priority</b>', LABEL), p('<b>Sev</b>', LABEL),
        p('<b>Action</b>', LABEL), p('<b>Est. Effort</b>', LABEL)
    ]]
    for must, sev, action, effort in actions:
        must_col = Paragraph(
            f'<b>{must}</b>',
            s(f'ac_{must}', fontName='Arial-Bold', fontSize=8,
              textColor=RED if must == 'MUST' else AMBER, alignment=1))
        action_rows.append([
            must_col, sev_cell(sev), p(action, BODY_SMALL), p(effort, BODY_SMALL)
        ])

    at = Table(action_rows, colWidths=[1.5*cm, 1.8*cm, CW-5.7*cm, 2.4*cm])
    at.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,0), NAVY),
        ('TEXTCOLOR',     (0,0),(-1,0), WHITE),
        ('FONTNAME',      (0,0),(-1,0), 'Arial-Bold'),
        ('FONTSIZE',      (0,0),(-1,0), 9),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, LGRAY]),
        ('GRID',          (0,0),(-1,-1), 0.3, BORDER),
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 7),
        ('RIGHTPADDING',  (0,0),(-1,-1), 7),
        ('ALIGN',         (0,1),(1,-1),  'CENTER'),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
    ]))
    story += [at, sp(0.4)]

    # ── FOOTER ───────────────────────────────────────────────────────────────
    story += [
        hr(),
        p(f'CareFlow Full System Audit  ·  {DATE_LONG}  ·  '
          f'{total_findings} findings across 6 domains  ·  '
          f'Generated by 7-Agent Council',
          s('ft', fontSize=7.5, textColor=GRAY, alignment=1)),
    ]

    doc.build(story)
    print(f'✓ Report saved: {out_path}')


if __name__ == '__main__':
    out_dir = Path.home() / 'Desktop'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f'CareFlow_Council_Audit_{DATE_SHORT}.pdf'
    build(str(out_file))
