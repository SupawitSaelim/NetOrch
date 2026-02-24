/**
 * Shared input validation utilities for frontend forms.
 *
 * These patterns mirror the backend validators in app/core/validators.py
 * to provide instant client-side feedback before API calls.
 */

// -- Regex patterns (matching backend SAFE_* patterns) --

/** Alphanumeric + dash + underscore + dot */
const SAFE_NAME = /^[a-zA-Z0-9_.\-]+$/;

/** IPv4/IPv6 address or CIDR */
const SAFE_IP = /^[a-fA-F0-9.:/%]+$/;

/** IP + optional hostname chars */
const SAFE_TARGET = /^[a-zA-Z0-9._:\-]+$/;

/** BPF filter safe chars */
const SAFE_BPF = /^[a-zA-Z0-9 ._:\-/()!=<>&|]+$/;

/** Simple IPv4 format (not exhaustive, just basic shape check) */
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

// -- Validator functions --

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ok: ValidationResult = { valid: true };
const err = (msg: string): ValidationResult => ({ valid: false, error: msg });

/**
 * Validate an identifier name (switch, VRF, interface, etc.)
 */
export function validateName(value: string, field = 'Name'): ValidationResult {
  const v = value.trim();
  if (!v) return err(`${field} is required`);
  if (v.length > 64) return err(`${field} is too long (max 64 characters)`);
  if (!SAFE_NAME.test(v)) return err(`${field} may only contain letters, numbers, dash, underscore, and dot`);
  return ok;
}

/**
 * Validate an IP address or CIDR notation.
 */
export function validateIP(value: string, field = 'IP address'): ValidationResult {
  const v = value.trim();
  if (!v) return err(`${field} is required`);
  if (v.length > 45) return err(`${field} is too long`);
  if (!SAFE_IP.test(v)) return err(`${field} contains invalid characters`);
  return ok;
}

/**
 * Validate an IPv4 address with optional CIDR prefix.
 */
export function validateIPv4(value: string, field = 'IP address'): ValidationResult {
  const v = value.trim();
  if (!v) return err(`${field} is required`);
  if (!IPV4_PATTERN.test(v)) return err(`${field} must be a valid IPv4 address (e.g. 10.0.0.1 or 10.0.0.0/24)`);

  // Check each octet is 0-255
  const [ip, prefix] = v.split('/');
  const octets = ip.split('.').map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return err(`${field} has invalid octets (must be 0-255)`);
  if (prefix !== undefined) {
    const p = Number(prefix);
    if (p < 0 || p > 32) return err(`${field} has invalid prefix length (must be 0-32)`);
  }
  return ok;
}

/**
 * Validate a ping/traceroute target (IP or hostname).
 */
export function validateTarget(value: string, field = 'Target'): ValidationResult {
  const v = value.trim();
  if (!v) return err(`${field} is required`);
  if (v.length > 253) return err(`${field} is too long`);
  if (!SAFE_TARGET.test(v)) return err(`${field} contains invalid characters`);
  return ok;
}

/**
 * Validate an ASN (Autonomous System Number).
 */
export function validateASN(value: number | string, field = 'ASN'): ValidationResult {
  const n = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(n)) return err(`${field} must be a number`);
  if (n < 1 || n > 4294967295) return err(`${field} must be between 1 and 4,294,967,295`);
  return ok;
}

/**
 * Validate a description field.
 */
export function validateDescription(value: string, field = 'Description'): ValidationResult {
  if (!value) return ok; // descriptions are typically optional
  if (value.length > 200) return err(`${field} is too long (max 200 characters)`);
  return ok;
}

/**
 * Validate a BPF filter expression.
 */
export function validateBPF(value: string, field = 'BPF filter'): ValidationResult {
  if (!value) return ok;
  if (value.length > 500) return err(`${field} is too long`);
  if (!SAFE_BPF.test(value)) return err(`${field} contains invalid characters`);
  return ok;
}
