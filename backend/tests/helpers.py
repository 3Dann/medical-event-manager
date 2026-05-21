"""פונקציות עזר משותפות לכל הטסטים."""
import models
import auth as auth_utils

# קבועים — שינוי פה ישפיע על כל הטסטים
TEST_ADMIN_PASSWORD = "Admin1!Admin"
TEST_MANAGER_PASSWORD = "Manager1!"

PATIENT_PAYLOAD = {
    "full_name": "ישראל ישראלי",
    "diagnosis_status": "no",
}

INSURANCE_SOURCE_PAYLOAD = {
    "source_type": "private",
    "company_name": "מגדל",
    "policy_number": "POL-001",
}


def make_patient(db, manager_id: int, full_name: str = "ישראל ישראלי") -> models.Patient:
    """יוצר מטופל בDB ישירות — לשימוש ב-fixtures."""
    patient = models.Patient(
        full_name=full_name,
        manager_id=manager_id,
        diagnosis_status="no",
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def make_insurance_source(
    db,
    patient_id: int,
    source_type: str = "private",
) -> models.InsuranceSource:
    """יוצר מקור ביטוח בDB ישירות — לשימוש ב-fixtures."""
    source = models.InsuranceSource(
        patient_id=patient_id,
        source_type=source_type,
        company_name="מגדל",
        policy_number="POL-001",
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def make_admin(db, email="admin@test.com", password=TEST_ADMIN_PASSWORD):
    user = models.User(
        full_name="Admin Test",
        email=email,
        hashed_password=auth_utils.get_password_hash(password),
        role="manager",
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_manager(db, email="manager@test.com", password=TEST_MANAGER_PASSWORD):
    user = models.User(
        full_name="Test Manager",
        email=email,
        hashed_password=auth_utils.get_password_hash(password),
        role="manager",
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def full_login(client, email, password):
    """זרימת כניסה מלאה עם 2FA מייל. מחזיר access_token."""
    r = client.post("/api/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, f"login נכשל: {r.text}"
    d = r.json()
    assert d.get("requires_2fa") is True
    temp_token = d["temp_token"]

    r2 = client.post("/api/auth/2fa/request-email-code", json={"temp_token": temp_token})
    assert r2.status_code == 200, f"request-email-code נכשל: {r2.text}"
    code = r2.json().get("code")
    assert code, "קוד לא הוחזר — בדוק שמייל לא מוגדר בסביבת הטסט"

    r3 = client.post("/api/auth/verify-2fa", json={
        "temp_token": temp_token,
        "code": code,
        "method": "email",
    })
    assert r3.status_code == 200, f"verify-2fa נכשל: {r3.text}"
    token = r3.json().get("access_token")
    assert token
    return token
