"""
פרק 1 — כניסה ואימות
מבוסס על נוהל הבדיקה המקיף — Orly Medical

כיסוי:
  1.1 כניסה ראשונה (login + 2FA email)
  1.2 שכחתי סיסמה — Magic Link
  1.3 הרשמה חדשה
  1.4 יציאה (logout + revocation)
  C   בדיקות מועצת סוכנים (אבטחה, מתכנת בכיר, תאימות)
"""
from datetime import datetime, timedelta, timezone
import pytest
import json as _json
from tests.helpers import make_admin, make_manager, full_login, TEST_MANAGER_PASSWORD


# ═══════════════════════════════════════════════════════
# 1.1 — כניסה ראשונה
# ═══════════════════════════════════════════════════════

class TestLogin:

    def test_valid_login_returns_2fa_screen(self, client, manager_user):
        """כניסה תקינה → 2FA נדרש, אין access_token מלא."""
        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["requires_2fa"] is True
        assert d["access_token"] == ""
        assert d["temp_token"]         # קיים
        assert d["tfa_method"] == "email"

    def test_valid_login_contains_user_info(self, client, manager_user):
        """Response הכניסה מכיל פרטי משתמש בסיסיים."""
        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        d = r.json()
        assert d["full_name"] == manager_user.full_name
        assert d["role"] == "manager"
        assert d["is_admin"] is False

    def test_wrong_password_returns_401(self, client, manager_user):
        """סיסמה שגויה → 401."""
        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "WrongPass99!",
        })
        assert r.status_code == 401

    def test_nonexistent_user_returns_401(self, client, db):
        """מייל שלא קיים → 401 (לא 404, למניעת username enumeration)."""
        make_admin(db)  # לפחות משתמש אחד ב-DB
        r = client.post("/api/auth/login", data={
            "username": "ghost@nothere.com",
            "password": "Password1!",
        })
        assert r.status_code == 401

    def test_2fa_email_flow_returns_full_token(self, client, manager_user):
        """זרימת 2FA מייל מלאה → access_token תקין."""
        token = full_login(client, manager_user.email, "Manager1!")
        assert token  # לא ריק

    def test_full_token_grants_access_to_me(self, client, manager_user):
        """Token מלא → GET /api/auth/me מחזיר פרטי משתמש."""
        token = full_login(client, manager_user.email, "Manager1!")
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == manager_user.email
        assert d["role"] == "manager"


# ═══════════════════════════════════════════════════════
# 1.2 — שכחתי סיסמה / Magic Link
# ═══════════════════════════════════════════════════════

class TestForgotPassword:

    def test_forgot_password_known_email_returns_verify_step(self, client, manager_user):
        """מייל קיים → step=verify עם שאלת זיהוי."""
        r = client.post("/api/auth/forgot-password", json={"email": manager_user.email})
        assert r.status_code == 200
        d = r.json()
        assert d["step"] == "verify"
        assert "extra_field" in d

    def test_forgot_password_unknown_email_returns_verify_step(self, client, db):
        """מייל לא קיים → step=verify (לא חושף שהמייל לא רשום)."""
        make_admin(db)
        r = client.post("/api/auth/forgot-password", json={"email": "nobody@ghost.com"})
        assert r.status_code == 200
        d = r.json()
        assert d["step"] == "verify"

    def test_verify_wrong_details_returns_error_with_attempts(self, client, db, manager_user):
        """פרטי זיהוי שגויים → שגיאה עם מספר ניסיונות שנותרו."""
        client.post("/api/auth/forgot-password", json={"email": manager_user.email})
        r = client.post("/api/auth/forgot-password/verify", json={
            "email": manager_user.email,
            "id_number": "000000000",
            "extra_answer": "wrong answer",
        })
        assert r.status_code in (400, 401)
        assert "ניסיונות" in r.json()["detail"] or "שגוי" in r.json()["detail"]

    def test_reset_password_with_valid_token(self, client, db, manager_user):
        """reset-password עם token תקין → סיסמה עודכנה."""
        import secrets
        token = secrets.token_urlsafe(32)
        manager_user.reset_token = token
        manager_user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()

        r = client.post("/api/auth/reset-password", json={
            "token": token,
            "new_password": "NewPass99!",
        })
        assert r.status_code == 200
        assert "עודכנה" in r.json()["message"]

    def test_reset_token_is_single_use(self, client, db, manager_user):
        """שימוש כפול באותו reset token → נדחה."""
        import secrets
        token = secrets.token_urlsafe(32)
        manager_user.reset_token = token
        manager_user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()

        # שימוש ראשון — תקין
        client.post("/api/auth/reset-password", json={
            "token": token,
            "new_password": "NewPass99!",
        })

        # שימוש שני — נדחה (token נמחק לאחר שימוש)
        r = client.post("/api/auth/reset-password", json={
            "token": token,
            "new_password": "AnotherPass1!",
        })
        assert r.status_code == 400

    def test_expired_reset_token_rejected(self, client, db, manager_user):
        """Reset token שפג תוקפו → נדחה."""
        import secrets
        token = secrets.token_urlsafe(32)
        manager_user.reset_token = token
        manager_user.reset_token_expires = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

        r = client.post("/api/auth/reset-password", json={
            "token": token,
            "new_password": "NewPass99!",
        })
        assert r.status_code == 400

    def test_validate_reset_token_endpoint(self, client, db, manager_user):
        """GET /reset-password/validate עם token תקין → valid=True."""
        import secrets
        token = secrets.token_urlsafe(32)
        manager_user.reset_token = token
        manager_user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()

        r = client.get(f"/api/auth/reset-password/validate?token={token}")
        assert r.status_code == 200
        assert r.json()["valid"] is True


# ═══════════════════════════════════════════════════════
# 1.3 — הרשמה חדשה
# ═══════════════════════════════════════════════════════

class TestRegistration:

    def test_first_user_registration_creates_admin(self, client):
        """משתמש ראשון נרשם → נוצר כאדמין (לא pending)."""
        r = client.post("/api/auth/register", json={
            "full_name": "First Admin",
            "email": "first@test.com",
            "password": "Admin1!Pass",
            "role": "manager",
        })
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d   # מחובר מיד
        assert d["is_admin"] is True

    def test_second_registration_creates_pending(self, client, admin_user):
        """הרשמה נוספת (לאחר אדמין קיים) → pending=True."""
        r = client.post("/api/auth/register", json={
            "full_name": "New Manager",
            "email": "newmgr@test.com",
            "password": "Manager1!",
            "role": "manager",
        })
        assert r.status_code == 200
        d = r.json()
        assert d.get("pending") is True

    def test_duplicate_email_rejected(self, client, admin_user):
        """הרשמה עם מייל קיים → נדחה."""
        r = client.post("/api/auth/register", json={
            "full_name": "Clone",
            "email": admin_user.email,
            "password": "Clone1!Pass",
            "role": "manager",
        })
        assert r.status_code in (400, 422)

    def test_must_change_password_on_temp_login(self, client, db):
        """משתמש שנוצר עם must_change_password → מוחזר must_change_password=True."""
        admin = make_admin(db)
        import models as _models
        import auth as _auth
        user = _models.User(
            full_name="Temp User",
            email="temp@test.com",
            hashed_password=_auth.get_password_hash("Temp1!Pass"),
            role="manager",
            is_admin=False,
            must_change_password=True,
        )
        db.add(user)
        db.commit()

        # כניסה → 2FA
        r = client.post("/api/auth/login", data={"username": "temp@test.com", "password": "Temp1!Pass"})
        assert r.status_code == 200
        temp_token = r.json()["temp_token"]

        # קבל קוד מייל
        r2 = client.post("/api/auth/2fa/request-email-code", json={"temp_token": temp_token})
        code = r2.json()["code"]

        # אמת 2FA
        r3 = client.post("/api/auth/verify-2fa", json={
            "temp_token": temp_token,
            "code": code,
            "method": "email",
        })
        assert r3.status_code == 200
        assert r3.json()["must_change_password"] is True


# ═══════════════════════════════════════════════════════
# 1.4 — יציאה
# ═══════════════════════════════════════════════════════

class TestLogout:

    def test_logout_returns_ok(self, client, manager_headers):
        """Logout → 200 {ok: True}."""
        r = client.post("/api/auth/logout", headers=manager_headers)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_token_rejected_after_logout(self, client, manager_user):
        """Token שהשתמשו בו ל-logout → נדחה ב-request הבא."""
        token = full_login(client, manager_user.email, "Manager1!")
        headers = {"Authorization": f"Bearer {token}"}

        # logout
        client.post("/api/auth/logout", headers=headers)

        # ניסיון שימוש חוזר
        r = client.get("/api/auth/me", headers=headers)
        assert r.status_code == 401

    def test_logout_adds_jti_to_revoked_tokens(self, client, db, manager_user):
        """לאחר logout — ה-JTI נרשם ב-RevokedToken."""
        import auth as _auth
        token = full_login(client, manager_user.email, "Manager1!")
        payload = _auth.decode_token(token)
        jti = payload["jti"]

        client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})

        revoked = db.query(_auth.models.RevokedToken).filter_by(jti=jti).first()
        assert revoked is not None


# ═══════════════════════════════════════════════════════
# C — בדיקות מועצת סוכנים (אבטחה, מתכנת בכיר, תאימות)
# ═══════════════════════════════════════════════════════

class TestCouncilSecurity:

    # 🔒 אבטחה — נעילת חשבון
    def test_locked_account_returns_429(self, client, db, manager_user):
        """חשבון נעול → כניסה נדחית עם HTTP 429."""
        manager_user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()

        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        assert r.status_code == 429
        assert "נעול" in r.json()["detail"]

    def test_5_failed_attempts_set_locked_until(self, client, db, manager_user):
        """5 ניסיונות כושלים → locked_until מוגדר ב-DB."""
        for _ in range(5):
            client.post("/api/auth/login", data={
                "username": manager_user.email,
                "password": "WrongPassword99!",
            })

        db.refresh(manager_user)
        assert manager_user.locked_until is not None
        # SQLite מחזיר naive datetime — מנרמלים לפני השוואה
        lu = manager_user.locked_until
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        assert lu > datetime.now(timezone.utc)

    def test_correct_password_during_lockout_still_rejected(self, client, db, manager_user):
        """סיסמה נכונה בזמן נעילה → עדיין 429."""
        manager_user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()

        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",  # סיסמה נכונה
        })
        assert r.status_code == 429

    # 🧑‍💻 מתכנת בכיר — ולידציית סיסמה
    def test_password_too_short_rejected(self, client, admin_user):
        """סיסמה קצרה מ-8 תווים → HTTP 400."""
        r = client.post("/api/auth/register", json={
            "full_name": "Short Pass",
            "email": "shortpass@test.com",
            "password": "Ab1!",   # 4 תווים
            "role": "manager",
        })
        assert r.status_code == 400
        assert "8" in r.json()["detail"] or "תווים" in r.json()["detail"]

    def test_password_no_uppercase_rejected(self, client, admin_user):
        """סיסמה ללא אות גדולה → HTTP 400."""
        r = client.post("/api/auth/register", json={
            "full_name": "No Upper",
            "email": "noupper@test.com",
            "password": "password1!",   # אין אות גדולה
            "role": "manager",
        })
        assert r.status_code == 400

    def test_password_no_digit_rejected(self, client, admin_user):
        """סיסמה ללא ספרה → HTTP 400."""
        r = client.post("/api/auth/register", json={
            "full_name": "No Digit",
            "email": "nodigit@test.com",
            "password": "Password!!",   # אין ספרה
            "role": "manager",
        })
        assert r.status_code == 400

    # 🔒 אבטחה — temp_token scope
    def test_temp_token_cannot_access_protected_endpoints(self, client, manager_user):
        """temp_token (לפני 2FA) → נדחה בנתיבים מוגנים."""
        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        temp_token = r.json()["temp_token"]

        # ניסיון שימוש ב-temp_token לגישה למטופלים
        r2 = client.get("/api/patients", headers={"Authorization": f"Bearer {temp_token}"})
        assert r2.status_code == 401

    def test_temp_token_cannot_access_me(self, client, manager_user):
        """temp_token → /api/auth/me נדחה (2fa_pending=True אינו token מלא)."""
        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        temp_token = r.json()["temp_token"]

        r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {temp_token}"})
        assert r2.status_code == 401

    # 📋 תאימות — שדות רגישים לא נחשפים
    def test_login_response_has_no_sensitive_fields(self, client, manager_user):
        """Response של login לא מכיל hashed_password / totp_secret."""
        r = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        d = r.json()
        assert "hashed_password" not in d
        assert "totp_secret" not in d
        assert "password" not in d

    def test_verify_2fa_response_has_no_sensitive_fields(self, client, manager_user):
        """Response של verify-2fa לא מכיל שדות רגישים."""
        r1 = client.post("/api/auth/login", data={
            "username": manager_user.email,
            "password": "Manager1!",
        })
        temp_token = r1.json()["temp_token"]

        r2 = client.post("/api/auth/2fa/request-email-code", json={"temp_token": temp_token})
        code = r2.json()["code"]

        r3 = client.post("/api/auth/verify-2fa", json={
            "temp_token": temp_token,
            "code": code,
            "method": "email",
        })
        d = r3.json()
        assert "hashed_password" not in d
        assert "totp_secret" not in d
        assert "password" not in d

    # 📋 תאימות — token revocation מלא
    def test_revoked_token_rejected_on_subsequent_request(self, client, manager_user):
        """JTI שנרשם כ-revoked → בקשה עם אותו token → 401."""
        token = full_login(client, manager_user.email, "Manager1!")
        headers = {"Authorization": f"Bearer {token}"}

        # וודא שה-token עובד לפני logout
        r_before = client.get("/api/auth/me", headers=headers)
        assert r_before.status_code == 200

        # logout
        client.post("/api/auth/logout", headers=headers)

        # וודא שה-token לא עובד אחרי logout
        r_after = client.get("/api/auth/me", headers=headers)
        assert r_after.status_code == 401

    # 🧑‍💻 מתכנת בכיר — שינוי סיסמה חובה
    def test_change_required_password_removes_flag(self, client, db, manager_user):
        """שינוי סיסמה נדרש → must_change_password מאופס."""
        manager_user.must_change_password = True
        db.commit()

        token = full_login(client, manager_user.email, "Manager1!")

        r = client.post("/api/auth/change-required-password",
                        json={"new_password": "NewPass99!"},
                        headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

        db.refresh(manager_user)
        assert manager_user.must_change_password is False

    def test_change_required_password_not_needed_returns_400(self, client, manager_headers):
        """change-required-password כשלא נדרש → 400."""
        r = client.post("/api/auth/change-required-password",
                        json={"new_password": "NewPass99!"},
                        headers=manager_headers)
        assert r.status_code == 400
