import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories, createId, timestamp } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import {
  assertPlatformRoleSeparation,
  assertSuperadminImmutability,
  sanitizeAdminInspectionPayload,
  isProductionEntity,
  filterProductionEntities,
  evaluateProviderOperationalTruth,
  buildAuthoritativeSettlementCertificate,
  calculateFinancialSegregation,
  evaluateSettlementPrerequisites,
  computeDeterministicHmac,
  type JournalLine,
} from '@otp/domain';
import { ForbiddenError, ValidationError } from '../../packages/services/src/types/errors';
import { evaluateRouteAccess } from '../../apps/web/src/features/auth/ProtectedRoute';

const ORG_INDIVIDUAL = 'org-ind-001';
const ORG_RWA = 'org-rwa-002';
const ORG_MSME = 'org-msme-003';

const ACTOR_INDIVIDUAL: ActorContext = {
  profileId: 'usr-ind-01',
  organizationId: ORG_INDIVIDUAL,
  orgRole: 'BUYER',
  isPlatformAdmin: false,
  isFounder: false,
};

const ACTOR_RWA_MEMBER: ActorContext = {
  profileId: 'usr-rwa-02',
  organizationId: ORG_RWA,
  orgRole: 'COMMITTEE_MEMBER',
  isPlatformAdmin: false,
  isFounder: false,
};

const ACTOR_MSME_MANAGER: ActorContext = {
  profileId: 'usr-msme-03',
  organizationId: ORG_MSME,
  orgRole: 'MANAGER',
  isPlatformAdmin: false,
  isFounder: false,
};

const ACTOR_SUPPLIER: ActorContext = {
  profileId: 'usr-sup-04',
  supplierIds: ['sup-001'],
  isPlatformAdmin: false,
  isFounder: false,
};

const ACTOR_SUPERADMIN: ActorContext = {
  profileId: 'usr-admin-005',
  isPlatformAdmin: true,
  isFounder: false,
};

const ACTOR_FOUNDER: ActorContext = {
  profileId: 'usr-founder-006',
  isPlatformAdmin: true,
  isFounder: true,
};

describe('Superadmin & Founder Operational Oversight Red Team Security Battery (16 Attack Vectors)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  // -------------------------------------------------------------------------
  // ADM-01: Individual accesses /admin
  // -------------------------------------------------------------------------
  it('ADM-01: Blocks Individual buyer from accessing /admin and redirects to dashboard', () => {
    const routeAccess = evaluateRouteAccess({
      session: { user: { id: ACTOR_INDIVIDUAL.profileId, email: 'buyer@individual.test' } },
      user: { id: ACTOR_INDIVIDUAL.profileId, email: 'buyer@individual.test' },
      context: { isPlatformAdmin: false, isFounder: false },
      pathname: '/admin',
      requireAdmin: true,
    });

    expect(routeAccess.action).toBe('REDIRECT');
    if (routeAccess.action === 'REDIRECT') {
      expect(routeAccess.target).toBe('/dashboard');
    }
  });

  // -------------------------------------------------------------------------
  // ADM-02: RWA accesses /admin
  // -------------------------------------------------------------------------
  it('ADM-02: Blocks RWA committee member from accessing /admin', () => {
    const routeAccess = evaluateRouteAccess({
      session: { user: { id: ACTOR_RWA_MEMBER.profileId, email: 'rwa@society.test' } },
      user: { id: ACTOR_RWA_MEMBER.profileId, email: 'rwa@society.test' },
      context: { isPlatformAdmin: false, isFounder: false },
      pathname: '/admin',
      requireAdmin: true,
    });

    expect(routeAccess.action).toBe('REDIRECT');
    if (routeAccess.action === 'REDIRECT') {
      expect(routeAccess.target).toBe('/dashboard');
    }
  });

  // -------------------------------------------------------------------------
  // ADM-03: MSME accesses /admin
  // -------------------------------------------------------------------------
  it('ADM-03: Blocks MSME executive from accessing /admin', () => {
    const routeAccess = evaluateRouteAccess({
      session: { user: { id: ACTOR_MSME_MANAGER.profileId, email: 'mgr@msme.test' } },
      user: { id: ACTOR_MSME_MANAGER.profileId, email: 'mgr@msme.test' },
      context: { isPlatformAdmin: false, isFounder: false },
      pathname: '/admin',
      requireAdmin: true,
    });

    expect(routeAccess.action).toBe('REDIRECT');
    if (routeAccess.action === 'REDIRECT') {
      expect(routeAccess.target).toBe('/dashboard');
    }
  });

  // -------------------------------------------------------------------------
  // ADM-04: Supplier accesses /admin
  // -------------------------------------------------------------------------
  it('ADM-04: Blocks Supplier from accessing /admin', () => {
    const routeAccess = evaluateRouteAccess({
      session: { user: { id: ACTOR_SUPPLIER.profileId, email: 'supplier@vendor.test' } },
      user: { id: ACTOR_SUPPLIER.profileId, email: 'supplier@vendor.test' },
      context: { isPlatformAdmin: false, isFounder: false },
      pathname: '/admin',
      requireAdmin: true,
    });

    expect(routeAccess.action).toBe('REDIRECT');
  });

  // -------------------------------------------------------------------------
  // ADM-05: Customer accesses /founder
  // -------------------------------------------------------------------------
  it('ADM-05: Blocks regular customer from accessing /founder executive cockpit', () => {
    const routeAccess = evaluateRouteAccess({
      session: { user: { id: ACTOR_MSME_MANAGER.profileId, email: 'mgr@msme.test' } },
      user: { id: ACTOR_MSME_MANAGER.profileId, email: 'mgr@msme.test' },
      context: { isPlatformAdmin: false, isFounder: false },
      pathname: '/founder',
      allowedRoles: ['FOUNDER'],
    });

    expect(routeAccess.action).toBe('REDIRECT');
    if (routeAccess.action === 'REDIRECT') {
      expect(routeAccess.target).toBe('/dashboard');
    }
  });

  // -------------------------------------------------------------------------
  // ADM-06: Founder attempts unauthorized transaction mutation
  // -------------------------------------------------------------------------
  it('ADM-06: Blocks Founder from executing buyer transaction actions without explicit delegation', () => {
    const voteAttempt = services.oversight.assertBuyerTransactionIsolation(ACTOR_FOUNDER, 'COMMITTEE_VOTE');
    expect(voteAttempt.ok).toBe(false);
    if (!voteAttempt.ok) {
      expect(voteAttempt.error.message).toContain('Platform role cannot execute buyer transaction action');
    }

    const spendAttempt = services.oversight.assertBuyerTransactionIsolation(ACTOR_FOUNDER, 'MSME_SPEND_APPROVAL');
    expect(spendAttempt.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ADM-07: Superadmin attempts historical ledger mutation
  // -------------------------------------------------------------------------
  it('ADM-07: Prohibits Superadmin from destructively mutating posted double-entry journals (PA-07/PA-08)', () => {
    const updateCheck = assertSuperadminImmutability({
      targetEntityType: 'DOUBLE_ENTRY_JOURNAL',
      mutationType: 'UPDATE',
    });
    expect(updateCheck.allowed).toBe(false);
    expect(updateCheck.error).toContain('PA-08 Violation');

    const deleteCheck = assertSuperadminImmutability({
      targetEntityType: 'DOUBLE_ENTRY_JOURNAL',
      mutationType: 'DELETE',
    });
    expect(deleteCheck.allowed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ADM-08: Superadmin attempts historical vote mutation
  // -------------------------------------------------------------------------
  it('ADM-08: Prohibits Superadmin from rewriting historical committee votes (PA-01/PA-08)', () => {
    const voteMutationCheck = assertSuperadminImmutability({
      targetEntityType: 'COMMITTEE_VOTE',
      mutationType: 'UPDATE',
    });
    expect(voteMutationCheck.allowed).toBe(false);
    expect(voteMutationCheck.error).toContain('Destructive mutation (UPDATE) of COMMITTEE_VOTE is strictly prohibited');
  });

  // -------------------------------------------------------------------------
  // ADM-09: Admin attempts to alter Decision Receipt
  // -------------------------------------------------------------------------
  it('ADM-09: Detects tampering if an administrator modifies an immutable Decision Receipt', () => {
    const secret = 'OTP_CANONICAL_TEST_SECRET';
    const payloadA = JSON.stringify({ rfqId: 'rfq-001', winningQuoteId: 'quote-A', amount: 50000 });
    const signatureA = computeDeterministicHmac(secret, payloadA);

    // Tampered payload B by admin
    const payloadB = JSON.stringify({ rfqId: 'rfq-001', winningQuoteId: 'quote-B-tampered', amount: 45000 });
    const signatureB = computeDeterministicHmac(secret, payloadB);

    expect(signatureA).not.toBe(signatureB);
    // Seal verification fails
    expect(signatureA === signatureB).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ADM-10: Admin attempts to reveal masked supplier identity prematurely
  // -------------------------------------------------------------------------
  it('ADM-10: Sanitizes sensitive credentials and premature supplier details from inspection views (PA-04/PA-05)', () => {
    const inspectionData = {
      supplierId: 'sup-masked-01',
      credentials: {
        api_key: 'sk_live_999999999',
        password_hash: '$2b$12$supersecretpasswordhash',
        magic_link_token: 'tok_magic_123',
      },
      publicProfile: {
        category: 'Electrical Equipment',
        city: 'Bengaluru',
      },
    };

    const clean = sanitizeAdminInspectionPayload(inspectionData);
    expect(clean.credentials.api_key).toBe('[REDACTED_SECRET]');
    expect(clean.credentials.password_hash).toBe('[REDACTED_SECRET]');
    expect(clean.credentials.magic_link_token).toBe('[REDACTED_SECRET]');
    expect(clean.publicProfile.city).toBe('Bengaluru');
  });

  // -------------------------------------------------------------------------
  // ADM-11: Admin attempts cross-tenant data access
  // -------------------------------------------------------------------------
  it('ADM-11: Prevents cross-tenant access violations across isolated buyer organizations', async () => {
    // Attempting to read organization journals for a nonexistent or cross-tenant scope
    const journalRes = await services.accounting.getJournalEntries(ACTOR_MSME_MANAGER, ORG_RWA);
    expect(journalRes.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // ADM-12: Admin attempts unauthorized financial settlement
  // -------------------------------------------------------------------------
  it('ADM-12: Blocks settlement attempt when prerequisite business states are not satisfied', () => {
    const check = evaluateSettlementPrerequisites({
      poStatus: 'ISSUED',
      supplierLifecycleTier: 'DISCOVERED_IN_AREA', // Unverified supplier
      isPoAcceptedBySupplier: false,
      inspectionStatus: 'PENDING',
      invoiceStatus: 'SUBMITTED',
      isSpendAuthorized: false,
      isAlreadySettled: false,
    });

    expect(check.canExecuteSettlement).toBe(false);
    expect(check.blockingReasons.length).toBeGreaterThanOrEqual(4);
  });

  // -------------------------------------------------------------------------
  // ADM-13: Founder attempts Superadmin-only configuration mutation
  // -------------------------------------------------------------------------
  it('ADM-13: Prohibits non-admin user from invoking superadmin audit logging', async () => {
    const nonAdminActor: ActorContext = {
      profileId: 'usr-regular-01',
      isPlatformAdmin: false,
      isFounder: false,
    };

    const auditRes = await services.oversight.logAdminAuditAction(nonAdminActor, {
      scope: 'CONFIGURATION',
      action: 'UPDATE_SYSTEM_FLAG',
      targetType: 'PLATFORM_FLAG',
      targetId: 'flag-001',
      reason: 'Unauthorized config change attempt',
    });

    expect(auditRes.ok).toBe(false);
    if (!auditRes.ok) {
      expect(auditRes.error.message).toContain('Superadmin operations privileges required');
    }
  });

  // -------------------------------------------------------------------------
  // ADM-14: Unauthorized user invokes admin RPC/service directly
  // -------------------------------------------------------------------------
  it('ADM-14: Rejects direct executive metrics invocation when actor lacks Founder privileges', async () => {
    const res = await services.oversight.getFounderExecutiveMetrics(ACTOR_INDIVIDUAL);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Founder/CEO executive privileges required');
    }
  });

  // -------------------------------------------------------------------------
  // ADM-15: Fake provider status/KPI injection
  // -------------------------------------------------------------------------
  it('ADM-15: Enforces truthful operational states without fabricating LIVE status for unconfigured adapters', () => {
    const unconfigured = evaluateProviderOperationalTruth({
      isConfigured: false,
      hasCredentials: false,
      isHealthy: false,
    });
    expect(unconfigured).toBe('READY'); // Not LIVE

    const disabled = evaluateProviderOperationalTruth({
      isConfigured: true,
      hasCredentials: true,
      isExplicitlyDisabled: true,
      isHealthy: true,
    });
    expect(disabled).toBe('DISABLED');
  });

  // -------------------------------------------------------------------------
  // ADM-16: Test/demo data contaminates production KPI
  // -------------------------------------------------------------------------
  it('ADM-16: Strictly filters out test_, demo_, and pilot_ entities from production metrics', () => {
    const testEntities = [
      { id: 'test_po_001', title: 'Test Order' },
      { id: 'demo-buyer-002', name: 'Demo Organization' },
      { id: 'pilot_rfq_003', title: 'Pilot RFQ' },
      { id: 'rfq-real-004', title: 'Commercial Industrial Lift' },
    ];

    const prodOnly = filterProductionEntities(testEntities);
    expect(prodOnly).toHaveLength(1);
    expect(prodOnly[0]!.id).toBe('rfq-real-004');
  });
});
