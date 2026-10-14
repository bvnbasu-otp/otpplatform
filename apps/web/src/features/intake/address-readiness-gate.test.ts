import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAddressValid } from '@otp/domain';

describe('Address Readiness Gate & PIN Code Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Indian PIN Code Validations (110001–999999)', () => {
    function validatePin(pin: string): { valid: boolean; error?: string } {
      const clean = pin.trim();
      const num = parseInt(clean, 10);
      if (!clean || !/^[0-9]{6}$/.test(clean) || isNaN(num) || num < 110001 || num > 999999) {
        return {
          valid: false,
          error: 'Postal PIN code must be a valid 6-digit number (110001–999999).',
        };
      }
      return { valid: true };
    }

    it('accepts valid 6-digit PIN codes across India', () => {
      // Delhi (110001), Mumbai (400001), Bengaluru (560001), Chennai (600001), Kolkata (700001)
      expect(validatePin('110001').valid).toBe(true);
      expect(validatePin('400001').valid).toBe(true);
      expect(validatePin('560001').valid).toBe(true);
      expect(validatePin('600001').valid).toBe(true);
      expect(validatePin('700001').valid).toBe(true);
      expect(validatePin('999999').valid).toBe(true);
    });

    it('rejects invalid PIN codes outside valid range or invalid format', () => {
      expect(validatePin('000000').valid).toBe(false);
      expect(validatePin('109999').valid).toBe(false);
      expect(validatePin('12345').valid).toBe(false);
      expect(validatePin('1234567').valid).toBe(false);
      expect(validatePin('abcdef').valid).toBe(false);
      expect(validatePin('560 01').valid).toBe(false);
      expect(validatePin('').valid).toBe(false);
    });
  });

  describe('2. Address Readiness Integrity Check', () => {
    it('validates comprehensive buyer address objects via domain validation engine', () => {
      const validAddress = {
        line1: 'Plot 42, Electronic City Phase 1',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
      };
      const result = isAddressValid(validAddress);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      const invalidAddress = {
        line1: '',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '56010', // 5 digits
      };
      const invalidResult = isAddressValid(invalidAddress);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);

    });
  });
});
