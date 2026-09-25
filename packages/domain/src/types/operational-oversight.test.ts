import { describe, expect, it } from 'vitest';
import {
  assertPlatformRoleSeparation,
  assertSuperadminImmutability,
  sanitizeAdminInspectionPayload,
  isProductionEntity,
  filterProductionEntities,
  evaluateProviderOperationalTruth,
} from './operational-oversight';

describe('OTP Stage R2-18: Superadmin & Founder Operational Oversight Domain Specification', () => {
  describe('Role Separation Invariant (Platform Roles != Buyer Transaction Authority)', () => {
    it('prohibits platform admin from casting RWA committee votes without organizational delegation', () => {
      const check = assertPlatformRoleSeparation({
        isPlatformAdmin: true,
        attemptedAction: 'COMMITTEE_VOTE',
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Platform role cannot execute buyer transaction action');
    });

    it('prohibits Founder from approving MSME spend without explicit delegation', () => {
      const check = assertPlatformRoleSeparation({
        isFounder: true,
        attemptedAction: 'MSME_SPEND_APPROVAL',
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('MSME_SPEND_APPROVAL');
    });

    it('allows action when user possesses legitimate buyer delegation', () => {
      const check = assertPlatformRoleSeparation({
        isPlatformAdmin: true,
        attemptedAction: 'COMMITTEE_VOTE',
        hasExplicitBuyerDelegation: true,
      });
      expect(check.allowed).toBe(true);
    });
  });

  describe('PA-08 Superadmin Immutability Guard', () => {
    it('blocks destructive UPDATE on historical business truth', () => {
      const voteCheck = assertSuperadminImmutability({
        targetEntityType: 'COMMITTEE_VOTE',
        mutationType: 'UPDATE',
      });
      expect(voteCheck.allowed).toBe(false);
      expect(voteCheck.error).toContain('PA-08 Violation');

      const receiptCheck = assertSuperadminImmutability({
        targetEntityType: 'DECISION_RECEIPT',
        mutationType: 'DELETE',
      });
      expect(receiptCheck.allowed).toBe(false);
      expect(receiptCheck.error).toContain('PA-08 Violation');
    });

    it('permits non-destructive compensating entries', () => {
      const journalCheck = assertSuperadminImmutability({
        targetEntityType: 'DOUBLE_ENTRY_JOURNAL',
        mutationType: 'COMPENSATING_ENTRY',
      });
      expect(journalCheck.allowed).toBe(true);
    });
  });

  describe('Data Minimization & Sanitization', () => {
    it('strips secrets, password hashes, auth tokens, and api keys from inspection views', () => {
      const dirtyPayload = {
        organizationId: 'org-123',
        buyerEmail: 'buyer@example.com',
        credentials: {
          password_hash: '$2a$12$abcdefg123456',
          access_token: 'jwt-access-token-999',
          signing_secret: 'secret-xyz',
        },
        metadata: {
          api_key: 'sk_live_123456',
          publicName: 'Clean Name',
        },
      };

      const clean = sanitizeAdminInspectionPayload(dirtyPayload);
      expect(clean.organizationId).toBe('org-123');
      expect(clean.credentials.password_hash).toBe('[REDACTED_SECRET]');
      expect(clean.credentials.access_token).toBe('[REDACTED_SECRET]');
      expect(clean.credentials.signing_secret).toBe('[REDACTED_SECRET]');
      expect(clean.metadata.api_key).toBe('[REDACTED_SECRET]');
      expect(clean.metadata.publicName).toBe('Clean Name');
    });
  });

  describe('Production Data Purity & Quarantine (Invariant 14)', () => {
    it('correctly identifies and quarantines test, demo, and pilot entities', () => {
      expect(isProductionEntity({ id: 'test_rfq_001', title: 'Test Order' })).toBe(false);
      expect(isProductionEntity({ id: 'demo-buyer-001', email: 'demo@example.com' })).toBe(false);
      expect(isProductionEntity({ id: 'pilot_supplier_99', name: 'Pilot Supplier' })).toBe(false);
      expect(isProductionEntity({ id: 'po-101', email: 'user@otp.test' })).toBe(false);

      // True production entity
      expect(isProductionEntity({ id: 'rfq-2026-bengaluru-transformer', title: 'Commercial Transformer' })).toBe(true);
    });

    it('filters collections to include only legitimate production items', () => {
      const mixed = [
        { id: 'rfq-prod-001', title: '11kV Substation' },
        { id: 'test-rfq-002', title: 'Automated Benchmark Test' },
        { id: 'demo-rfq-003', title: 'Demo Elevator Repair' },
        { id: 'rfq-prod-004', title: 'Diesel Generator Maintenance' },
      ];

      const filtered = filterProductionEntities(mixed);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((f) => f.id)).toEqual(['rfq-prod-001', 'rfq-prod-004']);
    });
  });

  describe('Provider Truthfulness State Evaluation', () => {
    it('evaluates provider operational states without fake LIVE assertions', () => {
      expect(evaluateProviderOperationalTruth({
        isConfigured: false,
        hasCredentials: false,
        isHealthy: false,
      })).toBe('READY');

      expect(evaluateProviderOperationalTruth({
        isConfigured: true,
        hasCredentials: true,
        isExplicitlyDisabled: true,
        isHealthy: true,
      })).toBe('DISABLED');

      expect(evaluateProviderOperationalTruth({
        isConfigured: true,
        hasCredentials: true,
        isHealthy: false,
      })).toBe('UNAVAILABLE');

      expect(evaluateProviderOperationalTruth({
        isConfigured: true,
        hasCredentials: true,
        isHealthy: true,
      })).toBe('LIVE');
    });
  });
});
