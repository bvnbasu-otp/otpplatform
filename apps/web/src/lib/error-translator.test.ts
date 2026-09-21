import { describe, expect, it } from 'vitest';
import {
  translateError,
  translateErrorDetails,
  extractErrorCode,
} from './error-translator';

describe('OTP Error Translator Layer (POL-03)', () => {
  it('translates PO settlement guard errors cleanly without internal codes', () => {
    const raw = 'PO-5C2-NOT-SETTLED: Purchase order cannot be marked COMPLETED until all invoices are PAID and financial obligations are settled (outstanding: ₹0.00)';
    const result = translateError(raw);

    expect(result).not.toContain('PO-5C2-NOT-SETTLED');
    expect(result).not.toContain('outstanding: ₹0.00');
    expect(result).toContain('cannot be marked completed until all invoices are approved, fully paid');

    const details = translateErrorDetails(raw);
    expect(details.code).toBe('PO-5C2-NOT-SETTLED');
    expect(details.actionHint).toContain('Settlement tab');
  });

  it('translates over-invoicing errors into clear business guidance', () => {
    const raw = 'Over-invoicing violation: Cumulative invoice total (₹120000.00) exceeds PO authorized amount (₹100000.00) (INV-5A-OVERINVOICE)';
    const result = translateError(raw);

    expect(result).not.toContain('INV-5A-OVERINVOICE');
    expect(result).toContain('cannot exceed the total authorized commitment value');

    const details = translateErrorDetails(raw);
    expect(details.code).toBe('INV-5A-OVERINVOICE');
    expect(details.actionHint).toContain('remaining order balance');
  });

  it('translates advance allocation errors', () => {
    const raw = 'Allocation amount (₹50000.00) exceeds invoice balance due (₹20000.00) (ADV-5C2-INV-OVERALLOC)';
    const result = translateError(raw);

    expect(result).toContain('allocation amount exceeds the remaining balance due');
    expect(result).not.toContain('ADV-5C2-INV-OVERALLOC');

    const details = translateErrorDetails(raw);
    expect(details.code).toBe('ADV-5C2-INV-OVERALLOC');
  });

  it('translates payment non-payable errors', () => {
    const raw = 'Invoice inv-123 status is SUBMITTED, but must be APPROVED or PARTIALLY_PAID before payment (PAY-5C-INV-NOT-PAYABLE)';
    const result = translateError(raw);

    expect(result).toContain('invoice must be Approved before receiving payments');
    expect(result).not.toContain('PAY-5C-INV-NOT-PAYABLE');
  });

  it('translates PostgreSQL unique constraint violations (23505)', () => {
    const raw = 'duplicate key value violates unique constraint "idx_payment_allocations_idempotency" (SQLSTATE 23505)';
    const result = translateError(raw);

    expect(result).toContain('A record with these details already exists');
    expect(result).not.toContain('SQLSTATE 23505');
  });

  it('translates permission / RLS access denied errors (42501)', () => {
    const raw = 'new row violates row-level security policy for table "payments" (SQLSTATE 42501)';
    const result = translateError(raw);

    expect(result).toContain('Access denied');
    expect(result).not.toContain('SQLSTATE 42501');
  });

  it('extracts error codes accurately from complex strings and objects', () => {
    expect(extractErrorCode('Error: PAY-5C-UNAUTHORIZED occurred during execution')).toBe('PAY-5C-UNAUTHORIZED');
    expect(extractErrorCode('Code 23505 in postgres')).toBe('23505');
    expect(extractErrorCode({ message: 'Failed: CDN-5C3-EXCEEDS-BALANCE' })).toBe('CDN-5C3-EXCEEDS-BALANCE');
    expect(extractErrorCode('Normal generic error')).toBe(null);
  });

  it('handles null, undefined, and plain Error objects gracefully', () => {
    expect(translateError(null)).toBe('An unexpected error occurred.');
    expect(translateError(new Error('Network Error'))).toContain('Unable to connect to the server');
    expect(translateError('Not authenticated')).toContain('Your session has expired');
  });
});
