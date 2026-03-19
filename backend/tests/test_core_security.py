"""
Tests for core security module: password hashing, JWT tokens.
"""

import pytest
from datetime import timedelta

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_user_id_from_token,
)


class TestPasswordHashing:
    def test_hash_password_returns_string(self):
        result = hash_password("testpassword123")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_hash_password_differs_for_same_input(self):
        h1 = hash_password("samepassword")
        h2 = hash_password("samepassword")
        assert h1 != h2  # bcrypt uses random salt

    def test_verify_password_correct(self):
        hashed = hash_password("mysecret")
        assert verify_password("mysecret", hashed) is True

    def test_verify_password_incorrect(self):
        hashed = hash_password("mysecret")
        assert verify_password("wrongpassword", hashed) is False

    def test_verify_password_empty(self):
        hashed = hash_password("mysecret")
        assert verify_password("", hashed) is False

    def test_verify_password_malformed_hash(self):
        assert verify_password("anything", "not_a_valid_hash") is False


class TestJWTTokens:
    def test_create_access_token_returns_string(self):
        token = create_access_token(data={"sub": "1"})
        assert isinstance(token, str)

    def test_create_refresh_token_returns_string(self):
        token = create_refresh_token(data={"sub": "1"})
        assert isinstance(token, str)

    def test_decode_valid_token(self):
        token = create_access_token(data={"sub": "42"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "42"

    def test_decode_invalid_token(self):
        payload = decode_token("invalid.token.here")
        assert payload is None

    def test_decode_empty_token(self):
        payload = decode_token("")
        assert payload is None

    def test_access_token_has_exp(self):
        token = create_access_token(data={"sub": "1"})
        payload = decode_token(token)
        assert "exp" in payload
        assert "iat" in payload

    def test_refresh_token_has_type_refresh(self):
        token = create_refresh_token(data={"sub": "1"})
        payload = decode_token(token)
        assert payload.get("type") == "refresh"

    def test_access_token_no_type(self):
        token = create_access_token(data={"sub": "1"})
        payload = decode_token(token)
        assert "type" not in payload

    def test_custom_expiry(self):
        token = create_access_token(data={"sub": "1"}, expires_delta=timedelta(seconds=1))
        payload = decode_token(token)
        assert payload is not None

    def test_get_user_id_from_token_valid(self):
        token = create_access_token(data={"sub": "99"})
        user_id = get_user_id_from_token(token)
        assert user_id == 99

    def test_get_user_id_from_token_invalid(self):
        user_id = get_user_id_from_token("garbage")
        assert user_id is None

    def test_get_user_id_from_token_no_sub(self):
        token = create_access_token(data={"other": "value"})
        user_id = get_user_id_from_token(token)
        assert user_id is None

    def test_get_user_id_from_token_non_numeric_sub(self):
        token = create_access_token(data={"sub": "not_a_number"})
        user_id = get_user_id_from_token(token)
        assert user_id is None
