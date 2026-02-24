import { describe, it, expect } from 'vitest';
import {
  validateName,
  validateIP,
  validateIPv4,
  validateTarget,
  validateASN,
  validateDescription,
  validateBPF,
} from './validators';

describe('validateName', () => {
  it('accepts valid names', () => {
    expect(validateName('eth0').valid).toBe(true);
    expect(validateName('vrf-prod').valid).toBe(true);
    expect(validateName('sw_core_1').valid).toBe(true);
    expect(validateName('br0.100').valid).toBe(true);
  });

  it('rejects empty', () => {
    expect(validateName('').valid).toBe(false);
  });

  it('rejects shell metacharacters', () => {
    expect(validateName('a;rm').valid).toBe(false);
    expect(validateName('a$(cmd)').valid).toBe(false);
    expect(validateName('a|cat').valid).toBe(false);
  });

  it('rejects too long', () => {
    expect(validateName('a'.repeat(65)).valid).toBe(false);
  });
});

describe('validateIPv4', () => {
  it('accepts valid IPs', () => {
    expect(validateIPv4('10.0.0.1').valid).toBe(true);
    expect(validateIPv4('192.168.1.0/24').valid).toBe(true);
  });

  it('rejects bad octets', () => {
    expect(validateIPv4('999.0.0.1').valid).toBe(false);
  });

  it('rejects bad prefix', () => {
    expect(validateIPv4('10.0.0.0/33').valid).toBe(false);
  });
});

describe('validateASN', () => {
  it('accepts valid range', () => {
    expect(validateASN(1).valid).toBe(true);
    expect(validateASN(65001).valid).toBe(true);
    expect(validateASN(4294967295).valid).toBe(true);
  });

  it('rejects out of range', () => {
    expect(validateASN(0).valid).toBe(false);
    expect(validateASN(-1).valid).toBe(false);
  });

  it('accepts string numbers', () => {
    expect(validateASN('65001').valid).toBe(true);
  });
});

describe('validateIP', () => {
  it('accepts valid', () => {
    expect(validateIP('10.0.0.1').valid).toBe(true);
    expect(validateIP('::1').valid).toBe(true);
  });

  it('rejects injection', () => {
    expect(validateIP('10.0.0.1;ls').valid).toBe(false);
  });
});

describe('validateTarget', () => {
  it('accepts hostname', () => {
    expect(validateTarget('google.com').valid).toBe(true);
  });

  it('rejects empty', () => {
    expect(validateTarget('').valid).toBe(false);
  });
});

describe('validateDescription', () => {
  it('allows empty (optional)', () => {
    expect(validateDescription('').valid).toBe(true);
  });

  it('rejects too long', () => {
    expect(validateDescription('x'.repeat(201)).valid).toBe(false);
  });
});

describe('validateBPF', () => {
  it('allows empty', () => {
    expect(validateBPF('').valid).toBe(true);
  });

  it('accepts valid filter', () => {
    expect(validateBPF('host 10.0.0.1 and port 80').valid).toBe(true);
  });
});
