"""פונקציות עזר משותפות לכל הטסטים."""
import models
import auth as auth_utils


def make_admin(db, email="admin@test.com", password="Admin1!Admin"):
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


def make_manager(db, email="manager@test.com", password="Manager1!"):
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
