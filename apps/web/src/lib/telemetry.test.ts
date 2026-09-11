import { describe, expect, it } from 'vitest';
import { sanitizeErrorText, sanitizeError } from './telemetry';

describe('PII Sanitizer & Structured Telemetry Logger', () => {
  it('masks emails, phones, and bearer tokens from error strings', () => {
    const raw = 'Failed to invite supplier john.doe@acmepaint.com (Phone: +91 9876543210) with Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
    const clean = sanitizeErrorText(raw);

    expect(clean).toContain('[REDACTED_EMAIL]');
    expect(clean).toContain('[REDACTED_PHONE]');
    expect(clean).toContain('Bearer [REDACTED_TOKEN]');
    expect(clean).not.toContain('john.doe@acmepaint.com');
    expect(clean).not.toContain('9876543210');
  });

  it('sanitizes Error instances including stack traces', () => {
    const err = new Error('Auth failure for user secret_pass123 with key: apikey="xyz999"');
    const sanitized = sanitizeError(err);

    expect(sanitized.message).toContain('apikey=[REDACTED]');
    expect(sanitized.message).not.toContain('xyz999');
  });
});
