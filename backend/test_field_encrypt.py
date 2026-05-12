"""Unit tests for field-level encryption."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

# Set a test key before importing the module
from cryptography.fernet import Fernet
TEST_KEY = Fernet.generate_key().decode()
os.environ["FIELD_ENCRYPTION_KEY"] = TEST_KEY

import importlib
import field_encrypt
importlib.reload(field_encrypt)

import field_encrypt as fe


def test_encrypt_decrypt_roundtrip():
    secret = "JBSWY3DPEHPK3PXP"
    encrypted = fe.encrypt(secret)
    assert encrypted != secret
    assert encrypted.startswith("enc:")
    assert fe.decrypt(encrypted) == secret


def test_encrypt_none_returns_none():
    assert fe.encrypt(None) is None


def test_decrypt_plaintext_legacy():
    """Old plaintext values without 'enc:' prefix should pass through."""
    assert fe.decrypt("LEGACY_SECRET") == "LEGACY_SECRET"


def test_decrypt_empty_string():
    assert fe.decrypt("") == ""


def test_encrypt_empty_string():
    assert fe.encrypt("") == ""


if __name__ == "__main__":
    test_encrypt_decrypt_roundtrip()
    test_encrypt_none_returns_none()
    test_decrypt_plaintext_legacy()
    test_decrypt_empty_string()
    test_encrypt_empty_string()
    print("✅ All field_encrypt tests passed")
