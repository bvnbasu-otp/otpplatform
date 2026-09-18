import { describe, expect, it } from 'vitest';
import {
  calculateInspectionScore,
  generateDigitalSignoffHash,
  isMilestoneInvoiceEligible,
  validateInspectionEvidenceAttachment,
  verifyDigitalSignoffHash,
  type InspectionItemStatus,
} from './milestone-inspection';

describe('Progressive Milestone Inspection Domain Engine', () => {
  it('calculates inspection score correctly when all items pass', () => {
    const items: Array<{ status: InspectionItemStatus; score?: number }> = [
      { status: 'PASSED', score: 95 },
      { status: 'PASSED', score: 90 },
      { status: 'PASSED', score: 85 },
      { status: 'NOT_APPLICABLE' },
    ];

    const result = calculateInspectionScore(items, 80);
    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(90);
    expect(result.passedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.passPercentage).toBe(100);
  });

  it('fails inspection if any item status is FAILED even if score is high', () => {
    const items: Array<{ status: InspectionItemStatus; score?: number }> = [
      { status: 'PASSED', score: 100 },
      { status: 'PASSED', score: 100 },
      { status: 'FAILED', score: 50 },
    ];

    const result = calculateInspectionScore(items, 70);
    expect(result.passed).toBe(false);
    expect(result.failedCount).toBe(1);
  });

  it('generates and verifies digital sign-off cryptographic hashes', () => {
    const inspectionId = 'insp-9988';
    const milestoneId = 'ms-1122';
    const inspectorId = 'usr-inspector-01';
    const score = 92.5;
    const timestamp = '2026-09-18T10:00:00Z';
    const salt = 'otp_secure_inspector_salt_key_2026';

    const hash = generateDigitalSignoffHash(inspectionId, milestoneId, inspectorId, score, timestamp, salt);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // SHA-256 hex length

    const isValid = verifyDigitalSignoffHash(hash, inspectionId, milestoneId, inspectorId, score, timestamp, salt);
    expect(isValid).toBe(true);

    const isTampered = verifyDigitalSignoffHash(hash, inspectionId, milestoneId, inspectorId, 85.0, timestamp, salt);
    expect(isTampered).toBe(false);
  });

  it('enforces progressive invoicing eligibility invariant', () => {
    expect(isMilestoneInvoiceEligible('APPROVED', true)).toBe(true);
    expect(isMilestoneInvoiceEligible('APPROVED', false)).toBe(false);
    expect(isMilestoneInvoiceEligible('SUBMITTED', true)).toBe(false);
    expect(isMilestoneInvoiceEligible('REWORK_REQUESTED', false)).toBe(false);
    expect(isMilestoneInvoiceEligible('REJECTED', false)).toBe(false);
  });

  it('validates evidence attachment mime types and file sizes', () => {
    // Valid PNG under 25MB
    const valid = validateInspectionEvidenceAttachment(5 * 1024 * 1024, 'image/png');
    expect(valid.valid).toBe(true);

    // Invalid executable / zip mime type
    const invalidMime = validateInspectionEvidenceAttachment(1024, 'application/x-msdownload');
    expect(invalidMime.valid).toBe(false);
    expect(invalidMime.error).toContain('MIME type');

    // Over 25MB limit
    const oversized = validateInspectionEvidenceAttachment(30 * 1024 * 1024, 'image/jpeg');
    expect(oversized.valid).toBe(false);
    expect(oversized.error).toContain('exceeds the maximum limit');

    // Zero byte file
    const zeroByte = validateInspectionEvidenceAttachment(0, 'image/jpeg');
    expect(zeroByte.valid).toBe(false);
  });
});
