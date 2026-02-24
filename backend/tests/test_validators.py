"""Tests for input validators and rate limiter."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core.validators import (
    validate_name,
    validate_ip,
    validate_target,
    validate_asn,
    validate_description,
    SAFE_NAME,
    SAFE_IP,
    SAFE_ASN,
)
from app.core.rate_limit import RateLimiter


# ── Validator unit tests ──────────────────────────────────────────


class TestValidateName:
    def test_valid_names(self):
        for name in ["eth0", "vrf-prod", "sw_core_1", "br0.100"]:
            validate_name(name)  # should not raise

    def test_rejects_shell_metachar(self):
        for bad in ["a;rm", "a$(cmd)", "a|cat", "a`id`", "a&", "a\nid"]:
            with pytest.raises(HTTPException) as exc_info:
                validate_name(bad)
            assert exc_info.value.status_code == 400

    def test_rejects_empty(self):
        with pytest.raises(HTTPException):
            validate_name("")


class TestValidateIP:
    def test_valid_ipv4(self):
        for ip in ["10.0.0.1", "192.168.1.0/24", "0.0.0.0"]:
            validate_ip(ip)

    def test_rejects_injection(self):
        for bad in ["10.0.0.1;ls", "$(cat /etc/passwd)", "10.0.0.1|cat"]:
            with pytest.raises(HTTPException):
                validate_ip(bad)


class TestValidateASN:
    def test_valid_range(self):
        for asn in [1, 65001, 4294967295]:
            validate_asn(asn)

    def test_rejects_out_of_range(self):
        for bad in [0, -1, 4294967296]:
            with pytest.raises(HTTPException):
                validate_asn(bad)


class TestValidateDescription:
    def test_valid_descriptions(self):
        for d in ["My link", "uplink to ISP-1 (primary)", "10G port #3"]:
            validate_description(d)

    def test_rejects_long(self):
        with pytest.raises(HTTPException):
            validate_description("x" * 300)


# ── Rate limiter unit tests ──────────────────────────────────────


class TestRateLimiter:
    def test_allows_within_limit(self):
        rl = RateLimiter(max_requests=3, window_seconds=60)
        for _ in range(3):
            rl.check("user1")  # should not raise

    def test_blocks_over_limit(self):
        rl = RateLimiter(max_requests=2, window_seconds=60)
        rl.check("user1")
        rl.check("user1")
        with pytest.raises(HTTPException) as exc_info:
            rl.check("user1")
        assert exc_info.value.status_code == 429

    def test_reset_clears_count(self):
        rl = RateLimiter(max_requests=1, window_seconds=60)
        rl.check("user1")
        rl.reset("user1")
        rl.check("user1")  # should work after reset

    def test_separate_keys(self):
        rl = RateLimiter(max_requests=1, window_seconds=60)
        rl.check("user1")
        rl.check("user2")  # different key, should not raise
