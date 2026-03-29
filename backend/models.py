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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    patients = relationship("Patient", foreign_keys="Patient.manager_id", back_populates="manager")


class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    id_number = Column(String, nullable=True)
    diagnosis_status = Column(String, default=DiagnosisStatus.no)
    diagnosis_details = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    hmo_name = Column(String, nullable=True)   # clalit / maccabi / meuhedet / leumit
    hmo_level = Column(String, nullable=True)  # basic / mushlam / premium / zahav
    manager_id = Column(Integer, ForeignKey("users.id"))
    patient_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    manager = relationship("User", foreign_keys="Patient.manager_id", back_populates="patients")
    nodes = relationship("Node", back_populates="patient", cascade="all, delete-orphan")
    insurance_sources = relationship("InsuranceSource", back_populates="patient", cascade="all, delete-orphan")
    claims = relationship("Claim", back_populates="patient", cascade="all, delete-orphan")
    entitlements = relationship("Entitlement", back_populates="patient", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "nodes"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    node_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    planned_date = Column(String, nullable=True)
    actual_date = Column(String, nullable=True)
    status = Column(String, default=NodeStatus.future)
    notes = Column(Text, nullable=True)
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
