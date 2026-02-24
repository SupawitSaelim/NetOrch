"""Shared input validation utilities to prevent command injection.

All user-supplied values that will be interpolated into SSH/shell commands
MUST be validated through these helpers before use.
"""

from __future__ import annotations

import re

from fastapi import HTTPException

# -- Compiled patterns --------------------------------------------------------

# Alphanumeric + dash + underscore + dot (names, identifiers, VLAN ifaces)
SAFE_NAME = re.compile(r"^[a-zA-Z0-9_.\-]+$")

# IPv4/IPv6 address or CIDR (e.g. 10.0.0.1, 10.0.0.0/24, ::1)
SAFE_IP = re.compile(r"^[a-fA-F0-9.:/%]+$")

# IP + optional hostname chars (for targets like hostnames)
SAFE_TARGET = re.compile(r"^[a-zA-Z0-9._:\-]+$")

# BPF filter expressions (tcpdump)
SAFE_BPF = re.compile(r"^[a-zA-Z0-9 ._:\-/()!=<>&|]+$")

# ASN: positive integer
SAFE_ASN = re.compile(r"^\d+$")

# VRF/router-id style: dotted quad or simple name
SAFE_ROUTER_ID = re.compile(r"^[a-fA-F0-9.:]+$")

# Description: printable ASCII, no shell metacharacters
SAFE_DESCRIPTION = re.compile(r'^[a-zA-Z0-9 _\-.,/()#@]+$')


# -- Validator functions ------------------------------------------------------

def validate_name(value: str, field: str = "name") -> str:
    """Validate an identifier name (alphanumeric, dash, underscore)."""
    value = value.strip()
    if not value or not SAFE_NAME.match(value):
        raise HTTPException(400, detail=f"Invalid {field}: {value!r} — only alphanumeric, dash, underscore, dot allowed")
    if len(value) > 64:
        raise HTTPException(400, detail=f"{field} too long (max 64 chars)")
    return value


def validate_ip(value: str, field: str = "IP address") -> str:
    """Validate an IP address or CIDR notation."""
    value = value.strip()
    if not value or not SAFE_IP.match(value):
        raise HTTPException(400, detail=f"Invalid {field}: {value!r}")
    if len(value) > 50:
        raise HTTPException(400, detail=f"{field} too long")
    return value


def validate_target(value: str, field: str = "target") -> str:
    """Validate a target (IP address or hostname)."""
    value = value.strip()
    if not value or not SAFE_TARGET.match(value):
        raise HTTPException(400, detail=f"Invalid {field}: {value!r}")
    if len(value) > 253:
        raise HTTPException(400, detail=f"{field} too long")
    return value


def validate_asn(value: int, field: str = "ASN") -> int:
    """Validate an Autonomous System Number."""
    if not (1 <= value <= 4294967295):
        raise HTTPException(400, detail=f"Invalid {field}: {value} — must be 1..4294967295")
    return value


def validate_description(value: str, field: str = "description") -> str:
    """Validate a description string (no shell metacharacters)."""
    value = value.strip()
    if not value:
        return value
    if not SAFE_DESCRIPTION.match(value):
        raise HTTPException(400, detail=f"Invalid {field}: contains disallowed characters")
    if len(value) > 200:
        raise HTTPException(400, detail=f"{field} too long (max 200 chars)")
    return value
