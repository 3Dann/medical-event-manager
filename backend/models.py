from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator
import enum
from database import Base
import field_encrypt as _fe


class EncryptedText(TypeDecorator):
    """Transparent AES encryption for sensitive text columns.
    Requires FIELD_ENCRYPTION_KEY env var. Falls back to plaintext if key missing.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return _fe.encrypt(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return _fe.decrypt(value) if value is not None else None


class UserRole(str, enum.Enum):
    manager = "manager"
    patient = "patient"
    broker  = "broker"


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
    permissions = Column(Text, nullable=True)  # JSON: ["export_pdf","download_docs","view_financials"]
    preserve_data = Column(Boolean, default=False)
    demo_mode_allowed = Column(Boolean, default=False)
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, default=False)
    totp_method = Column(String, nullable=True, default="totp")  # "totp" | "email" | "sms"
    email_2fa_code = Column(String, nullable=True)
    email_2fa_expires = Column(DateTime(timezone=True), nullable=True)
    phone_2fa = Column(String, nullable=True)         # phone number for SMS 2FA (e.g. "+972501234567")
    phone_2fa_prefix = Column(String, nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    reset_verify_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_activity = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patients = relationship("Patient", foreign_keys="Patient.manager_id", back_populates="manager")
    webauthn_credentials = relationship("WebAuthnCredential", back_populates="user", cascade="all, delete-orphan")


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"
    id                = Column(Integer, primary_key=True, index=True)
    full_name         = Column(String, nullable=False)
    email             = Column(String, nullable=False, unique=True)
    hashed_password   = Column(String, nullable=False)
    role              = Column(String, nullable=False, default="manager")
    org_name          = Column(String, nullable=True)
    applicant_message = Column(Text, nullable=True)
    status            = Column(String, nullable=False, default="pending")
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at       = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason  = Column(Text, nullable=True)
    reviewer          = relationship("User", foreign_keys="PendingRegistration.reviewed_by_id")


class RevokedToken(Base):
    """JWT token blacklist — stores revoked token IDs until they expire."""
    __tablename__ = "revoked_tokens"
    id         = Column(Integer, primary_key=True)
    jti        = Column(String(64), unique=True, nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)


class ActiveSession(Base):
    """מעקב sessions פעילים — נוצר בהתחברות, מתעדכן בכל בקשה, מבוטל ב-logout."""
    __tablename__ = "active_sessions"
    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    jti         = Column(String(64), unique=True, nullable=False, index=True)
    login_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ip_address  = Column(String(64), nullable=True)
    user_agent  = Column(String(256), nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)
    revoked_at  = Column(DateTime(timezone=True), nullable=True)
    revoked_by  = Column(Integer, nullable=True)  # user_id of admin who revoked

    user = relationship("User", foreign_keys=[user_id])


class DocumentViewToken(Base):
    __tablename__ = "document_view_tokens"
    id         = Column(Integer, primary_key=True)
    token      = Column(String(64), unique=True, nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doc_id     = Column(Integer, ForeignKey("patient_documents.id"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used    = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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
    id_number = Column(EncryptedText, nullable=True)       # Israeli ID — encrypted
    diagnosis_status = Column(String, default=DiagnosisStatus.no)
    diagnosis_details = Column(EncryptedText, nullable=True)  # PHI — encrypted
    notes = Column(EncryptedText, nullable=True)               # PHI — encrypted
    hmo_name = Column(String, nullable=True)
    hmo_level = Column(String, nullable=True)
    condition_tags = Column(Text, nullable=True)
    medical_stage = Column(String, nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id"), index=True)
    patient_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
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
    ec_name = Column(EncryptedText, nullable=True)          # PHI — encrypted
    ec_phone_prefix = Column(String, nullable=True)
    ec_phone = Column(EncryptedText, nullable=True)         # PHI — encrypted
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
    referral_goal = Column(String, nullable=True)
    referral_source = Column(String, nullable=True)
    financial_consent_agreed = Column(Boolean, default=False)
    financial_consent_signature_path = Column(String, nullable=True)
    financial_consent_signed_at = Column(DateTime(timezone=True), nullable=True)
    signer_name = Column(String, nullable=True)
    signer_relation = Column(String, nullable=True)
    phone2_prefix = Column(String, nullable=True)
    phone2 = Column(String, nullable=True)

    # ── NSCLC / Oncology clinical fields ─────────────────────────────────────
    smoking_status   = Column(String, nullable=True)  # never | former | current
    ngs_method       = Column(String, nullable=True)  # tissue | blood | liquid
    fev1_score       = Column(Float,  nullable=True)  # % — כשירות ניתוח
    access_type      = Column(String, nullable=True)  # basket | insurance | compassion | research
    biomarker_target = Column(String, nullable=True)  # EGFR | ALK | HER2 | KRAS | RET | MET | ROS1 | BRAF | PD-L1 | none
    # Tumor Board sign-offs (lung_s7_tumor_board gate)
    tumor_board_surgeon    = Column(Boolean, default=False, nullable=False, server_default="0")
    tumor_board_oncologist = Column(Boolean, default=False, nullable=False, server_default="0")
    tumor_board_radiation  = Column(Boolean, default=False, nullable=False, server_default="0")

    manager = relationship("User", foreign_keys="Patient.manager_id", back_populates="patients")
    nodes = relationship("Node", back_populates="patient", cascade="all, delete-orphan")
    insurance_sources = relationship("InsuranceSource", back_populates="patient", cascade="all, delete-orphan")
    claims = relationship("Claim", back_populates="patient", cascade="all, delete-orphan")
    entitlements = relationship("Entitlement", back_populates="patient", cascade="all, delete-orphan")
    documents = relationship("PatientDocument", back_populates="patient", cascade="all, delete-orphan")
    patient_medications  = relationship("PatientMedication", back_populates="patient", cascade="all, delete-orphan")
    fund_applications    = relationship("PatientFundApplication",  back_populates="patient", cascade="all, delete-orphan")
    care_team            = relationship("PatientCareTeamMember",   back_populates="patient", cascade="all, delete-orphan")
    meetings             = relationship("PatientMeeting",          back_populates="patient", cascade="all, delete-orphan")
    form17_entries       = relationship("PatientForm17",           back_populates="patient", cascade="all, delete-orphan")
    red_flags            = relationship("PatientRedFlag",          back_populates="patient", cascade="all, delete-orphan")
    requests             = relationship("PatientRequest",          back_populates="patient", cascade="all, delete-orphan")
    address_record       = relationship("PatientAddress",          back_populates="patient", uselist=False, cascade="all, delete-orphan")
    emergency_contact_record = relationship("PatientEmergencyContact", back_populates="patient", uselist=False, cascade="all, delete-orphan")



class DrugEntry(Base):
    __tablename__ = "drug_entries"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)   # trade/brand name
    generic_name = Column(String, nullable=True)
    dosage_form = Column(String, nullable=True)
    hebrew_name = Column(String, nullable=True)
    common_dosages = Column(Text, nullable=True)          # JSON: ["10mg","20mg"]
    openfda_indication = Column(Text, nullable=True)      # short indication from openFDA
    openfda_dosages = Column(Text, nullable=True)         # JSON: extracted from openFDA
    openfda_interactions = Column(Text, nullable=True)    # raw interaction text from openFDA
    openfda_fetched_at = Column(DateTime(timezone=True), nullable=True)
    source = Column(String, default="local")              # local / openfda
    is_active = Column(Boolean, default=True)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # ── Oncology / logistics fields ──────────────────────────────────────────
    msl_phone      = Column(String, nullable=True)  # Medical Science Liaison phone
    access_type    = Column(String, nullable=True)  # basket | compassion | eap | research
    treatment_line = Column(String, nullable=True)  # 1st | 2nd | maintenance | any
    indication_oncology = Column(Text, nullable=True)  # JSON: ["EGFR","ALK"] — biomarker targets


class DrugUpdateLog(Base):
    __tablename__ = "drug_update_logs"
    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="running")            # running / success / failed
    drugs_added = Column(Integer, default=0)
    drugs_updated = Column(Integer, default=0)
    source = Column(String, nullable=True)
    message = Column(Text, nullable=True)


class PatientMedication(Base):
    __tablename__ = "patient_medications"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    name = Column(String, nullable=False)           # trade/brand name as entered
    generic_name = Column(String, nullable=True)    # INN from MOH registry
    dosage = Column(String, nullable=True)          # e.g. "10mg"
    frequency = Column(String, nullable=True)       # e.g. "פעמיים ביום"
    indication = Column(EncryptedText, nullable=True)   # PHI — reason for taking
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    notes = Column(EncryptedText, nullable=True)         # PHI — encrypted
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="patient_medications")


class PatientDocument(Base):
    __tablename__ = "patient_documents"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
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
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    node_type = Column(String, nullable=False)   # medical / financial / stage
    description = Column(Text, nullable=False)
    planned_date = Column(String, nullable=True)
    actual_date = Column(String, nullable=True)
    status = Column(String, default=NodeStatus.future)
    notes = Column(Text, nullable=True)
    stage_order = Column(Integer, nullable=True)  # 1-4 for journey stages
    source_template_key = Column(String, nullable=True)  # set when node is created from a journey template
    overlay_global      = Column(Boolean, default=False)  # always-visible overlay node (e.g. second opinion)
    estimated_cost      = Column(Float, nullable=True)    # typical cost in ILS
    coverage_categories = Column(Text, nullable=True)     # JSON: ["surgery","diagnostics"]
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patient = relationship("Patient", back_populates="nodes")
    sub_items = relationship("NodeSubItem", back_populates="node",
                             cascade="all, delete-orphan", order_by="NodeSubItem.sort_order")


class NodeSubItem(Base):
    __tablename__ = "node_sub_items"
    id = Column(Integer, primary_key=True, index=True)
    node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    text = Column(String, nullable=False)
    is_done = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    node = relationship("Node", back_populates="sub_items")


class InsuranceSource(Base):
    __tablename__ = "insurance_sources"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), index=True)
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
    insurance_source_id = Column(Integer, ForeignKey("insurance_sources.id", ondelete="CASCADE"))
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
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    insurance_source_id = Column(Integer, ForeignKey("insurance_sources.id", ondelete="SET NULL"), nullable=True)
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
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    entitlement_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    is_approved = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patient = relationship("Patient", back_populates="entitlements")


class PatientAddress(Base):
    """Normalised address — extracted from Patient god-object."""
    __tablename__ = "patient_addresses"
    id          = Column(Integer, primary_key=True)
    patient_id  = Column(Integer, ForeignKey("patients.id"), nullable=False, unique=True, index=True)
    city        = Column(String, nullable=True)
    city_code   = Column(String, nullable=True)
    street      = Column(String, nullable=True)
    house_number = Column(String, nullable=True)
    entrance    = Column(String, nullable=True)
    floor       = Column(String, nullable=True)
    apartment   = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    patient     = relationship("Patient", back_populates="address_record")


class PatientEmergencyContact(Base):
    """Emergency contact — extracted from Patient god-object."""
    __tablename__ = "patient_emergency_contacts"
    id          = Column(Integer, primary_key=True)
    patient_id  = Column(Integer, ForeignKey("patients.id"), nullable=False, unique=True, index=True)
    name        = Column(EncryptedText, nullable=True)
    phone_prefix = Column(String, nullable=True)
    phone       = Column(EncryptedText, nullable=True)
    relation    = Column(String, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    patient     = relationship("Patient", back_populates="emergency_contact_record")


class PatientPermission(Base):
    """Explicit access grants: admin gives manager_id access to a patient they don't own."""
    __tablename__ = "patient_permissions"
    __table_args__ = (
        Index("ix_patient_perm_unique", "patient_id", "manager_id", unique=True),
    )
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
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



class Doctor(Base):
    __tablename__ = "doctors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    specialty = Column(String, nullable=True)
    sub_specialty = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    phone2 = Column(String, nullable=True)       # מזכירה / קליניקה
    whatsapp = Column(String, nullable=True)
    email = Column(String, nullable=True)
    city = Column(String, nullable=True)
    location = Column(String, nullable=True)
    private_price = Column(Integer, nullable=True)  # מחיר ביקור פרטי בש"ח
    license_number = Column(String, nullable=True)   # מספר רישיון משרד הבריאות
    title          = Column(String, nullable=True)   # ד"ר / פרופ' / ד"ר פרופ'
    hmo_acceptance = Column(Text, nullable=True)
    gives_expert_opinion = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    extra_data = Column(Text, nullable=True)   # JSON: custom fields from import or manual edit
    source_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    # Doctor enrichment fields
    working_hours         = Column(Text, nullable=True)     # JSON: {"sun":"08:00-13:00","mon":"16:00-20:00",...}
    accessibility         = Column(Boolean, default=False)  # נגישות לנכים
    waiting_days          = Column(Integer, nullable=True)  # ממוצע ימי המתנה לתור
    is_accepting_patients = Column(Boolean, default=True)   # מקבל מטופלים חדשים
    last_verified         = Column(DateTime(timezone=True), nullable=True)  # תאריך אחרון שבו הפרטים אומתו
    active_contact        = Column(Boolean, default=False)  # כוכבית: יש לנו קשר פעיל עם הרופא


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
    # ── Parallel & gate fields ───────────────────────────────────────────────
    parallel_group      = Column(String, nullable=True)  # steps with same group activate together
    sla_days            = Column(Integer, nullable=True) # days before SLA alert fires
    gate_condition      = Column(Text, nullable=True)    # JSON — blocking condition expression
    gate_error_msg      = Column(String, nullable=True)  # message shown when gate blocks
    is_exploration_gate = Column(Boolean, default=False) # True = Exploration Gate before hospice

    template       = relationship("WorkflowTemplate", back_populates="step_templates")
    task_templates = relationship("WorkflowStepTaskTemplate",
                                  order_by="WorkflowStepTaskTemplate.task_order",
                                  back_populates="step_template",
                                  cascade="all, delete-orphan")


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"
    id               = Column(Integer, primary_key=True, index=True)
    template_id      = Column(Integer, ForeignKey("workflow_templates.id"))
    patient_id       = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"))
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
    instance_id = Column(Integer, ForeignKey("workflow_instances.id", ondelete="CASCADE"), index=True)
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
    # ── Parallel & SLA (runtime) ─────────────────────────────────────────────
    parallel_group        = Column(String, nullable=True)  # copied from template
    sla_deadline          = Column(DateTime(timezone=True), nullable=True)  # computed on activation
    sla_alerted           = Column(Boolean, default=False)  # True once alert was sent
    gate_fields           = Column(Text, nullable=True)    # JSON — clinical data for gate eval

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
    __table_args__ = (
        Index("ix_step_coverage_unique", "step_id", "insurance_source_id", unique=True),
    )
    id                  = Column(Integer, primary_key=True, index=True)
    step_id             = Column(Integer, ForeignKey("workflow_steps.id"), nullable=False, index=True)
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


class FinancialFund(Base):
    """Global registry of aid funds, social entitlements, loans and tax benefits."""
    __tablename__ = "financial_funds"

    id                  = Column(Integer, primary_key=True, index=True)
    name                = Column(String, nullable=False)
    fund_type           = Column(String, nullable=False)   # aid_fund | social_entitlement | special_loan | tax_benefit
    organization        = Column(String, nullable=True)
    description         = Column(Text, nullable=True)
    max_amount          = Column(Float, nullable=True)
    eligible_conditions = Column(Text, nullable=True)      # JSON list of condition_tags
    eligible_ages_min   = Column(Integer, nullable=True)
    eligible_ages_max   = Column(Integer, nullable=True)
    application_url     = Column(String, nullable=True)
    contact_phone       = Column(String, nullable=True)
    notes               = Column(Text, nullable=True)
    is_active           = Column(Boolean, default=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    applications = relationship("PatientFundApplication", back_populates="fund")


class PatientFundApplication(Base):
    """A financial fund or custom source assigned to a specific patient."""
    __tablename__ = "patient_fund_applications"

    id              = Column(Integer, primary_key=True, index=True)
    patient_id      = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    fund_id         = Column(Integer, ForeignKey("financial_funds.id"), nullable=True)
    custom_name     = Column(String, nullable=True)        # free-text if not from registry
    status          = Column(String, default="considering") # considering|applied|approved|rejected
    expected_amount = Column(Float, nullable=True)
    approved_amount = Column(Float, nullable=True)
    notes           = Column(Text, nullable=True)
    applied_at      = Column(DateTime(timezone=True), nullable=True)
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    patient = relationship("Patient", back_populates="fund_applications")
    fund    = relationship("FinancialFund", back_populates="applications")


class PatientCareTeamMember(Base):
    """צוות מטפלים — רשימת אנשי מקצוע המשויכים למטופל ספציפי."""
    __tablename__ = "patient_care_team"

    id           = Column(Integer, primary_key=True, index=True)
    patient_id   = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    role         = Column(String, nullable=False)   # oncologist|navigator|pain_doctor|nutritionist|psycho_oncologist|rights_advisor|other
    name         = Column(String, nullable=False)
    phone        = Column(String, nullable=True)
    email        = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    notes        = Column(Text,   nullable=True)
    is_primary   = Column(Boolean, default=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="care_team")


class PatientMeeting(Base):
    """דף מעקב פגישה — תיעוד כל פגישה עם גורם רפואי/ביטוחי."""
    __tablename__ = "patient_meetings"

    id                        = Column(Integer, primary_key=True, index=True)
    patient_id                = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    meeting_type              = Column(String, nullable=False)   # oncologist|insurance_agent|social_worker|other
    meeting_date              = Column(String, nullable=True)    # YYYY-MM-DD
    professional_name         = Column(String, nullable=True)
    status_summary            = Column(Text,   nullable=True)    # ב-2 משפטים
    action_items              = Column(Text,   nullable=True)    # JSON: [{task, responsible, done}]
    # מסמכים שיש לבקש
    has_visit_summary         = Column(Boolean, default=False)
    has_referrals             = Column(Boolean, default=False)
    has_prescriptions         = Column(Boolean, default=False)
    has_lab_results           = Column(Boolean, default=False)
    has_insurance_approval    = Column(Boolean, default=False)
    # מעקב כספי
    meeting_cost              = Column(Float,   nullable=True)
    reimbursement_entity      = Column(String, nullable=True)   # kupat_holim|private|both
    receipt_received          = Column(Boolean, default=False)
    reimbursement_submitted   = Column(Boolean, default=False)
    # הערות מטפל
    caregiver_notes           = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    patient = relationship("Patient", back_populates="meetings")


class PatientForm17(Base):
    """מעקב טופס 17 — התחייבויות קופה לפי בדיקה/טיפול."""
    __tablename__ = "patient_form17"

    id                  = Column(Integer, primary_key=True, index=True)
    patient_id          = Column(Integer, ForeignKey("patients.id"), nullable=False)
    procedure_name      = Column(String, nullable=False)
    insurance_source_id = Column(Integer, ForeignKey("insurance_sources.id"), nullable=True)
    status              = Column(String, default="pending")   # pending|requested|approved|denied
    requested_date      = Column(String, nullable=True)
    approved_date       = Column(String, nullable=True)
    amount_approved     = Column(Float,  nullable=True)
    notes               = Column(Text,   nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient          = relationship("Patient", back_populates="form17_entries")
    insurance_source = relationship("InsuranceSource")


class PatientRedFlag(Base):
    """נורות אדומות — התראות רפואיות, פיננסיות ושחיקת מטפל."""
    __tablename__ = "patient_red_flags"

    id          = Column(Integer, primary_key=True, index=True)
    patient_id  = Column(Integer, ForeignKey("patients.id"), nullable=False)
    flag_type   = Column(String, nullable=False)    # medical|financial|caregiver
    severity    = Column(String, default="warning") # warning|critical
    title       = Column(String, nullable=False)
    description = Column(Text,   nullable=True)
    is_active   = Column(Boolean, default=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="red_flags")


class UserActivityLog(Base):
    """Audit log — one row per meaningful user action."""
    __tablename__ = "user_activity_logs"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, nullable=True, index=True)
    user_name     = Column(String, nullable=True)     # denormalized — survives user deletion
    action_type   = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=True)     # patient / document / claim / ...
    resource_id   = Column(String, nullable=True)
    ip_address    = Column(String, nullable=True)
    user_agent    = Column(String, nullable=True)
    status_code   = Column(Integer, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class PatientRequest(Base):
    """בקשות שהמטופל שולח למנהל האירוע."""
    __tablename__ = "patient_requests"

    id          = Column(Integer, primary_key=True, index=True)
    patient_id  = Column(Integer, ForeignKey("patients.id"), nullable=False)
    category    = Column(String, default="general")  # general|document|meeting|question|financial
    message     = Column(Text, nullable=False)
    status      = Column(String, default="pending")  # pending|read|resolved
    manager_note= Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    patient = relationship("Patient", back_populates="requests")


class FamilyShareToken(Base):
    """טוקן לשיתוף תצוגה בלבד עם בן משפחה — תוקף 7 ימים."""
    __tablename__ = "family_share_tokens"

    id          = Column(Integer, primary_key=True, index=True)
    patient_id  = Column(Integer, ForeignKey("patients.id"), nullable=False)
    token       = Column(String(64), unique=True, nullable=False, index=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    expires_at  = Column(DateTime(timezone=True), nullable=False)
    is_active   = Column(Boolean, default=True)
    revoked_at  = Column(DateTime(timezone=True), nullable=True)
    revoked_by  = Column(Integer, ForeignKey("users.id"), nullable=True)

    patient = relationship("Patient")


class Task(Base):
    """משימה — מאגדת פעולות מכל המקורות ומשימות ידניות."""
    __tablename__ = "tasks"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # שיוך
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_by  = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id  = Column(Integer, ForeignKey("patients.id"), nullable=True, index=True)

    # מקור
    source_type = Column(String, default="manual")  # manual|meeting_action|workflow_step|patient_request|red_flag
    source_id   = Column(Integer, nullable=True)     # id ברשומה המקורית
    source_meta = Column(Text, nullable=True)         # JSON — פרטים מהמקור

    # זמן ועדיפות
    due_date    = Column(DateTime(timezone=True), nullable=True)
    priority    = Column(String, default="normal")   # low|normal|high|urgent

    # סטטוס
    status       = Column(String, default="pending")  # pending|in_progress|done
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_new       = Column(Boolean, default=False)     # הוטל ע"י אדמין, טרם נצפה

    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    assigned_user = relationship("User", foreign_keys=[assigned_to])
    creator       = relationship("User", foreign_keys=[created_by])
    patient       = relationship("Patient")


class CalendarToken(Base):
    """טוקן ICS אישי — לכל משתמש כתובת ייחודית ליומן חי."""
    __tablename__ = "calendar_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    token      = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)  # None = ללא תפוגה
    is_active  = Column(Boolean, default=True)

    user = relationship("User")
