from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class UserRole(str, enum.Enum):
    manager = "manager"
    patient = "patient"


class DiagnosisStatus(str, enum.Enum):
    yes = "yes"
    no = "no"
    pending = "pending"


class NodeType(str, enum.Enum):
    medical = "medical"
    financial = "financial"


class NodeStatus(str, enum.Enum):
    future = "future"
    active = "active"
    completed = "completed"


class InsuranceSourceType(str, enum.Enum):
    sal_habriut = "sal_habriut"
    kupat_holim = "kupat_holim"
    har_habitua = "har_habitua"
    private = "private"
    bituch_leumi = "bituch_leumi"


class HMOName(str, enum.Enum):
    clalit = "clalit"
    maccabi = "maccabi"
    meuhedet = "meuhedet"
    leumit = "leumit"


class HMOLevel(str, enum.Enum):
    basic = "basic"
    mushlam = "mushlam"
    premium = "premium"
    zahav = "zahav"


class CoverageCategory(str, enum.Enum):
    second_opinion = "second_opinion"
    surgery = "surgery"
    transplant = "transplant"
    hospitalization = "hospitalization"
    rehabilitation = "rehabilitation"
    advanced_tech = "advanced_tech"
    critical_illness = "critical_illness"
    diagnostics = "diagnostics"


class ClaimStatus(str, enum.Enum):
    draft = "draft"        # auto-created by workflow engine, awaiting manager approval
    pending = "pending"
    submitted = "submitted"
    approved = "approved"
    partial = "partial"
    rejected = "rejected"


class EntitlementType(str, enum.Enum):
    existing = "existing"
    potential = "potential"
    projected = "projected"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default=UserRole.manager)
    is_admin    = Column(Boolean, default=False)
    preserve_data = Column(Boolean, default=False)
    demo_mode_allowed = Column(Boolean, default=False)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, default=False)
    totp_method = Column(String, nullable=True, default="totp")  # "totp" or "email"
    email_2fa_code = Column(String, nullable=True)
    email_2fa_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patients = relationship("Patient", foreign_keys="Patient.manager_id", back_populates="manager")
    webauthn_credentials = relationship("WebAuthnCredential", back_populates="user", cascade="all, delete-orphan")


class WebAuthnCredential(Base):
    __tablename__ = "webauthn_credentials"
    id              = Column(Integer, primary_key=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    credential_id   = Column(String, unique=True, nullable=False)   # hex
    public_key      = Column(Text, nullable=False)                  # hex
    sign_count      = Column(Integer, default=0)
    device_name     = Column(String, default="מכשיר")
    created_at      = Column(DateTime, default=func.now())
    last_used       = Column(DateTime, nullable=True)
    user = relationship("User", back_populates="webauthn_credentials")


class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    id_number = Column(String, nullable=True)
    diagnosis_status = Column(String, default=DiagnosisStatus.no)
    diagnosis_details = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    hmo_name = Column(String, nullable=True)
    hmo_level = Column(String, nullable=True)
    condition_tags = Column(Text, nullable=True)
    medical_stage = Column(String, nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id"))
    patient_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # ── Intake — Demographics ─────────────────────────────────────────────
    phone_prefix = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    gender = Column(String, nullable=True)           # male / female
    birth_date = Column(String, nullable=True)        # ISO date string
    marital_status = Column(String, nullable=True)    # single/married/divorced/widowed
    num_children = Column(Integer, nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)

    # ── Intake — Address ──────────────────────────────────────────────────
    city = Column(String, nullable=True)
    city_code = Column(String, nullable=True)
    street = Column(String, nullable=True)
    house_number = Column(String, nullable=True)
    entrance = Column(String, nullable=True)
    floor = Column(String, nullable=True)
    apartment = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)

    # ── Intake — Emergency contact ────────────────────────────────────────
    ec_name = Column(String, nullable=True)
    ec_phone_prefix = Column(String, nullable=True)
    ec_phone = Column(String, nullable=True)
    ec_relation = Column(String, nullable=True)

    # ── Intake — Medications ──────────────────────────────────────────────
    medications = Column(Text, nullable=True)         # JSON: [{name, dosage}]

    # ── Intake — Functional assessments ──────────────────────────────────
    adl_answers = Column(Text, nullable=True)         # JSON: {item_key: score}
    iadl_answers = Column(Text, nullable=True)        # JSON: {item_key: score}
    mmse_answers = Column(Text, nullable=True)        # JSON: {section_key: score}
    adl_score = Column(Integer, nullable=True)        # 0–100
    iadl_score = Column(Integer, nullable=True)       # 0–8
    mmse_score = Column(Integer, nullable=True)       # 0–30

    # ── Intake — Signatures ───────────────────────────────────────────────
    consent_agreed = Column(Boolean, default=False)
    consent_signed_at = Column(DateTime(timezone=True), nullable=True)
    consent_signature_path = Column(String, nullable=True)
    poa_agreed = Column(Boolean, default=False)
    poa_signed_at = Column(DateTime(timezone=True), nullable=True)
    poa_signature_path = Column(String, nullable=True)
    intake_completed = Column(Boolean, default=False)
    intake_completed_at = Column(DateTime(timezone=True), nullable=True)

    # ── Medical specialty (auto-suggested from diagnosis) ─────────────────────
    specialty = Column(String, nullable=True)          # e.g. "אונקולוגיה"
    sub_specialty = Column(String, nullable=True)      # e.g. "אונקולוגיה גינקולוגית"

    manager = relationship("User", foreign_keys="Patient.manager_id", back_populates="patients")
    nodes = relationship("Node", back_populates="patient", cascade="all, delete-orphan")
    insurance_sources = relationship("InsuranceSource", back_populates="patient", cascade="all, delete-orphan")
    claims = relationship("Claim", back_populates="patient", cascade="all, delete-orphan")
    entitlements = relationship("Entitlement", back_populates="patient", cascade="all, delete-orphan")
    documents = relationship("PatientDocument", back_populates="patient", cascade="all, delete-orphan")



class PatientDocument(Base):
    __tablename__ = "patient_documents"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)        # stored filename (uuid-based)
    original_name = Column(String, nullable=False)   # original upload name
    file_type = Column(String, nullable=True)        # mime type
    file_size = Column(Integer, nullable=True)       # bytes
    category = Column(String, nullable=True)         # e.g. "רפואי", "ביטוחי", "משפטי", "אחר"
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="documents")
    uploader = relationship("User", foreign_keys="PatientDocument.uploaded_by")


class Node(Base):
    __tablename__ = "nodes"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    node_type = Column(String, nullable=False)   # medical / financial / stage
    description = Column(Text, nullable=False)
    planned_date = Column(String, nullable=True)
    actual_date = Column(String, nullable=True)
    status = Column(String, default=NodeStatus.future)
    notes = Column(Text, nullable=True)
    stage_order = Column(Integer, nullable=True)  # 1-4 for journey stages
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patient = relationship("Patient", back_populates="nodes")


class InsuranceSource(Base):
    __tablename__ = "insurance_sources"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    source_type = Column(String, nullable=False)
    # קופת חולים
    hmo_name = Column(String, nullable=True)
    hmo_level = Column(String, nullable=True)
    # פרטי / הר הביטוח
    company_name = Column(String, nullable=True)
    policy_number = Column(String, nullable=True)
    policy_type = Column(String, nullable=True)  # regular / disability
    # General
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="insurance_sources")
    coverages = relationship("Coverage", back_populates="insurance_source", cascade="all, delete-orphan")


class Coverage(Base):
    __tablename__ = "coverages"
    id = Column(Integer, primary_key=True, index=True)
    insurance_source_id = Column(Integer, ForeignKey("insurance_sources.id"))
    category = Column(String, nullable=False)
    is_covered = Column(Boolean, default=True)
    coverage_amount = Column(Float, nullable=True)
    coverage_percentage = Column(Float, nullable=True)
    copay = Column(Float, nullable=True)
    annual_limit = Column(Float, nullable=True)
    conditions = Column(Text, nullable=True)
    abroad_covered = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    insurance_source = relationship("InsuranceSource", back_populates="coverages")


class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    insurance_source_id = Column(Integer, ForeignKey("insurance_sources.id"))
    category = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    amount_requested = Column(Float, nullable=True)
    amount_approved = Column(Float, nullable=True)
    status = Column(String, default=ClaimStatus.pending)
    submission_date = Column(String, nullable=True)
    deadline = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    priority_order = Column(Integer, nullable=True)
    # Workflow engine link
    workflow_step_id = Column(Integer, ForeignKey("workflow_steps.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patient = relationship("Patient", back_populates="claims")
    insurance_source = relationship("InsuranceSource")


class Entitlement(Base):
    __tablename__ = "entitlements"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    entitlement_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    is_approved = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patient = relationship("Patient", back_populates="entitlements")


class PatientPermission(Base):
    """Explicit access grants: admin gives manager_id access to a patient they don't own."""
    __tablename__ = "patient_permissions"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    granted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ProjectFeedback(Base):
    __tablename__ = "project_feedback"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)  # 1-5
    feedback_type = Column(String, default='general')  # 'feature' | 'bug' | 'general'
    is_read = Column(Boolean, default=False)
    is_handled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ResponsivenessScore(Base):
    __tablename__ = "responsiveness_scores"
    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False, unique=True)
    company_type = Column(String, nullable=False)  # hmo / private / bituch_leumi
    response_speed = Column(Float, nullable=False)  # 1-10
    bureaucracy_level = Column(Float, nullable=False)  # 1-10 (10 = minimal bureaucracy)
    overall_score = Column(Float, nullable=False)
    is_default = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ScrapingSource(Base):
    __tablename__ = "scraping_sources"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    interval_hours = Column(Integer, default=24)
    last_scraped_at = Column(DateTime(timezone=True), nullable=True)
    last_scraped_count = Column(Integer, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Doctor(Base):
    __tablename__ = "doctors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    specialty = Column(String, nullable=True)
    sub_specialty = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    hmo_acceptance = Column(Text, nullable=True)
    gives_expert_opinion = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    source_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ── Flow Engine ───────────────────────────────────────────────────────────────

class MedicalConditionTag(Base):
    """Catalog of medical condition tags — two-level: category → specific tag."""
    __tablename__ = "medical_condition_tags"
    id           = Column(Integer, primary_key=True, index=True)
    key          = Column(String, unique=True, nullable=False)   # "breast_cancer"
    label_he     = Column(String, nullable=False)                # "סרטן שד"
    category     = Column(String, nullable=True)                 # "oncology"
    category_he  = Column(String, nullable=True)                 # "אונקולוגיה"
    is_builtin   = Column(Boolean, default=False)
    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class WorkflowTemplate(Base):
    __tablename__ = "workflow_templates"
    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False)
    description    = Column(Text, nullable=True)
    category       = Column(String, nullable=True)   # claim / appeal / treatment / hospitalization
    # Medical awareness fields
    condition_tags = Column(Text, nullable=True)     # JSON: ["cancer","surgery"]
    trigger_event  = Column(String, nullable=True)   # diagnosis|surgery|hospitalization|claim|treatment|general
    specialty      = Column(String, nullable=True)   # oncology|cardiology|neurology|orthopedics|general
    is_journey     = Column(Boolean, default=False)  # True = patient journey master template
    is_active   = Column(Boolean, default=True)
    is_builtin  = Column(Boolean, default=False)  # built-in templates cannot be deleted
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    step_templates = relationship("WorkflowStepTemplate",
                                  order_by="WorkflowStepTemplate.step_order",
                                  cascade="all, delete-orphan",
                                  back_populates="template")
    instances      = relationship("WorkflowInstance", back_populates="template")
    creator        = relationship("User", foreign_keys=[created_by])


class WorkflowStepTemplate(Base):
    __tablename__ = "workflow_step_templates"
    id                  = Column(Integer, primary_key=True, index=True)
    template_id         = Column(Integer, ForeignKey("workflow_templates.id"))
    step_key            = Column(String, nullable=False)
    name                = Column(String, nullable=False)
    description         = Column(Text, nullable=True)
    step_order          = Column(Integer, nullable=False)
    assignee_role       = Column(String, nullable=True, default="manager")  # manager / patient / admin
    duration_days       = Column(Integer, nullable=True)
    is_optional         = Column(Boolean, default=False)
    instructions        = Column(Text, nullable=True)
    # Coverage-aware fields
    coverage_categories = Column(Text, nullable=True)    # JSON: ["surgery","hospitalization"]
    step_type           = Column(String, nullable=True, default="administrative")  # medical|financial|administrative
    estimated_cost      = Column(Float, nullable=True)   # typical cost in ILS
    required_documents  = Column(Text, nullable=True)    # JSON: ["discharge_summary","referral"]

    template       = relationship("WorkflowTemplate", back_populates="step_templates")
    task_templates = relationship("WorkflowStepTaskTemplate",
                                  order_by="WorkflowStepTaskTemplate.task_order",
                                  back_populates="step_template",
                                  cascade="all, delete-orphan")


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"
    id               = Column(Integer, primary_key=True, index=True)
    template_id      = Column(Integer, ForeignKey("workflow_templates.id"))
    patient_id       = Column(Integer, ForeignKey("patients.id"))
    created_by       = Column(Integer, ForeignKey("users.id"))
    title            = Column(String, nullable=True)
    status           = Column(String, default="active")  # active / completed / cancelled / paused
    current_step_key = Column(String, nullable=True)
    linked_claim_id  = Column(Integer, ForeignKey("claims.id"), nullable=True)
    linked_node_id   = Column(Integer, ForeignKey("nodes.id"), nullable=True)
    context_data     = Column(Text, nullable=True)   # JSON free-form
    started_at       = Column(DateTime(timezone=True), server_default=func.now())
    completed_at     = Column(DateTime(timezone=True), nullable=True)
    due_date         = Column(DateTime(timezone=True), nullable=True)

    template     = relationship("WorkflowTemplate", back_populates="instances")
    patient      = relationship("Patient")
    creator      = relationship("User", foreign_keys=[created_by])
    linked_claim = relationship("Claim", foreign_keys=[linked_claim_id])
    steps        = relationship("WorkflowStep",
                                order_by="WorkflowStep.step_order",
                                back_populates="instance",
                                cascade="all, delete-orphan")


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"
    id                    = Column(Integer, primary_key=True, index=True)
    instance_id           = Column(Integer, ForeignKey("workflow_instances.id"))
    step_key              = Column(String, nullable=False)
    name                  = Column(String, nullable=False)
    step_order            = Column(Integer, nullable=False)
    status                = Column(String, default="pending")  # pending / active / completed / skipped
    assignee_id           = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date              = Column(DateTime(timezone=True), nullable=True)
    started_at            = Column(DateTime(timezone=True), nullable=True)
    completed_at          = Column(DateTime(timezone=True), nullable=True)
    notes                 = Column(Text, nullable=True)
    result_data           = Column(Text, nullable=True)  # JSON
    is_optional           = Column(Boolean, default=False)
    instructions          = Column(Text, nullable=True)
    # Coverage-aware fields (per-instance overrides)
    coverage_categories   = Column(Text, nullable=True)   # JSON — inherited from template, overridable
    step_type             = Column(String, nullable=True)
    estimated_cost        = Column(Float, nullable=True)  # overrides template value if set
    required_documents    = Column(Text, nullable=True)   # JSON

    instance        = relationship("WorkflowInstance", back_populates="steps")
    assignee        = relationship("User", foreign_keys=[assignee_id])
    actions         = relationship("WorkflowAction",
                                   order_by="WorkflowAction.created_at",
                                   back_populates="step",
                                   cascade="all, delete-orphan")
    coverage_items  = relationship("WorkflowStepCoverage",
                                   back_populates="step",
                                   cascade="all, delete-orphan")
    tasks           = relationship("WorkflowStepTask",
                                   order_by="WorkflowStepTask.task_order",
                                   back_populates="step",
                                   cascade="all, delete-orphan")


class WorkflowAction(Base):
    __tablename__ = "workflow_actions"
    id          = Column(Integer, primary_key=True, index=True)
    step_id     = Column(Integer, ForeignKey("workflow_steps.id"))
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    data        = Column(Text, nullable=True)  # JSON
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    step = relationship("WorkflowStep", back_populates="actions")
    user = relationship("User", foreign_keys=[user_id])


class WorkflowStepTaskTemplate(Base):
    """Checklist tasks defined in a step template — copied to WorkflowStepTask on instance creation."""
    __tablename__ = "workflow_step_task_templates"
    id               = Column(Integer, primary_key=True, index=True)
    step_template_id = Column(Integer, ForeignKey("workflow_step_templates.id"), nullable=False)
    title            = Column(String, nullable=False)
    task_order       = Column(Integer, default=0)

    step_template = relationship("WorkflowStepTemplate", back_populates="task_templates")


class WorkflowStepTask(Base):
    """Checklist task instance — one per step per patient workflow."""
    __tablename__ = "workflow_step_tasks"
    id           = Column(Integer, primary_key=True, index=True)
    step_id      = Column(Integer, ForeignKey("workflow_steps.id"), nullable=False)
    title        = Column(String, nullable=False)
    task_order   = Column(Integer, default=0)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    step      = relationship("WorkflowStep", back_populates="tasks")
    completer = relationship("User", foreign_keys=[completed_by])


class WorkflowStepCoverage(Base):
    """Auto-computed coverage analysis for each active workflow step."""
    __tablename__ = "workflow_step_coverages"
    id                  = Column(Integer, primary_key=True, index=True)
    step_id             = Column(Integer, ForeignKey("workflow_steps.id"), nullable=False)
    insurance_source_id = Column(Integer, ForeignKey("insurance_sources.id"), nullable=False)
    coverage_id         = Column(Integer, ForeignKey("coverages.id"), nullable=True)
    coverage_category   = Column(String, nullable=True)   # which CoverageCategory was matched
    is_covered          = Column(Boolean, default=False)
    covered_amount      = Column(Float, nullable=True)    # ILS
    coverage_percentage = Column(Float, nullable=True)
    gap_amount          = Column(Float, nullable=True)    # estimated_cost - covered_amount
    responsiveness_score= Column(Float, nullable=True)   # from ResponsivenessScore table
    priority_rank       = Column(Integer, nullable=True) # 1 = best option
    recommendation      = Column(Text, nullable=True)    # Hebrew text shown to manager
    claim_suggested     = Column(Boolean, default=False)
    computed_at         = Column(DateTime(timezone=True), server_default=func.now())

    step             = relationship("WorkflowStep", back_populates="coverage_items")
    insurance_source = relationship("InsuranceSource")
    coverage         = relationship("Coverage")


# ── Medical Specialties ──────────────────────────────────────────────────────

class MedicalSpecialty(Base):
    __tablename__ = "medical_specialties"

    id              = Column(Integer, primary_key=True, index=True)
    name_en         = Column(String, nullable=False, index=True)
    name_he         = Column(String, nullable=True)
    description_en  = Column(Text, nullable=True)
    description_he  = Column(Text, nullable=True)
    parent_id       = Column(Integer, ForeignKey("medical_specialties.id"), nullable=True)
    source_url      = Column(String, nullable=True)
    # Learning fields
    confidence_score = Column(Float, default=1.0)   # 0-1, raised/lowered by manager feedback
    feedback_count   = Column(Integer, default=0)   # how many times feedback was given
    is_verified      = Column(Boolean, default=False)
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())

    parent       = relationship("MedicalSpecialty", remote_side=[id], backref="sub_specialties")


class MedicalSpecialtyFeedback(Base):
    """Learning: manager corrections/confirmations on specialty records."""
    __tablename__ = "medical_specialty_feedback"

    id           = Column(Integer, primary_key=True, index=True)
    specialty_id = Column(Integer, ForeignKey("medical_specialties.id"), nullable=False)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    action       = Column(String, nullable=False)   # "confirm" | "correct" | "flag" | "merge"
    note         = Column(Text, nullable=True)
    correction   = Column(Text, nullable=True)      # JSON: what was corrected
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    specialty = relationship("MedicalSpecialty")
    user      = relationship("User")


class SiteSetting(Base):
    """Global key-value store for site settings (e.g. landing page content)."""
    __tablename__ = "site_settings"

    id         = Column(Integer, primary_key=True, index=True)
    key        = Column(String, unique=True, nullable=False, index=True)
    value      = Column(Text, nullable=True)   # JSON or plain string
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
