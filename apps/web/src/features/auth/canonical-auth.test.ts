import { describe, it, expect } from 'vitest';
import {
  evaluateWebAuthorization,
  type WebAuthorizationState,
} from './canonical-auth';
import type { RoleContext } from '@/features/roles/api/roles';

describe('Web Canonical Authorization Resolver (Presentation Layer)', () => {
  // ---------------------------------------------------------------------------
  // 1. Individual Buyer Context
  // ---------------------------------------------------------------------------
  it('correctly resolves Individual Buyer context with zero committee overhead', () => {
    const context: RoleContext = {
      signedIn: true,
      profileId: 'usr-ind-101',
      side: 'BUYER',
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: {
        code: 'OWNER',
        side: 'BUYER',
        label: 'Individual Buyer',
        description: 'Personal Account',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'AWARD'],
      },
      roles: [],
      organizations: [],
      orgRole: 'OWNER',
      organizationId: null, // No corporate organization
      organizationName: null,
      buyerType: 'INDIVIDUAL',
      committeeRfqCount: 0,
      supplierId: null,
      fullName: 'Alice Resident',
      title: 'Individual',
      avatarUrl: null,
      email: 'alice@personal.test',
      phone: null,
    };

    const auth = evaluateWebAuthorization(context);
    expect(auth.persona).toBe('INDIVIDUAL');
    expect(auth.isIndividualBuyer).toBe(true);
    expect(auth.isRwaContext).toBe(false);
    expect(auth.isMsmeContext).toBe(false);
    expect(auth.canVote).toBe(false); // Zero committee voting overhead
    expect(auth.activeOrgId).toBeNull();
    expect(auth.activeOrgName).toBe('Personal Account');

    // Individual buyer 1-click personal purchase authority
    const spendCheck = auth.canApproveSpend(25000);
    expect(spendCheck.allowed).toBe(true);
    expect(spendCheck.reason).toContain('1-click personal purchase authority');
  });

  // ---------------------------------------------------------------------------
  // 2. RWA Governance: Committee Members vs Estate Manager (Zero Voting Authority)
  // ---------------------------------------------------------------------------
  it('authorizes RWA President & Committee Members to vote', () => {
    const rwaPresidentContext: RoleContext = {
      signedIn: true,
      profileId: 'usr-pres-201',
      side: 'BUYER',
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: {
        code: 'PRESIDENT',
        side: 'BUYER',
        label: 'President',
        description: 'RWA President',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE', 'AWARD'],
      },
      roles: [],
      organizations: [],
      orgRole: 'PRESIDENT',
      organizationId: 'org-rwa-palm-grove',
      organizationName: 'Palm Grove RWA',
      buyerType: 'RWA',
      committeeRfqCount: 5,
      supplierId: null,
      fullName: 'Dr. Sharma',
      title: 'RWA President',
      avatarUrl: null,
      email: 'president@palmgrove.test',
      phone: null,
    };

    const auth = evaluateWebAuthorization(rwaPresidentContext);
    expect(auth.persona).toBe('RWA');
    expect(auth.isRwaContext).toBe(true);
    expect(auth.isRwaCommittee).toBe(true);
    expect(auth.isRwaEstateManager).toBe(false);
    expect(auth.canVote).toBe(true);
    expect(auth.canIssuePo).toBe(true);
    expect(auth.activeOrgId).toBe('org-rwa-palm-grove');
  });

  it('strictly classifies RWA Estate Manager as operational with ZERO voting rights (canVote = false)', () => {
    const estateMgrContext: RoleContext = {
      signedIn: true,
      profileId: 'usr-mgr-202',
      side: 'BUYER',
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: {
        code: 'ESTATE_MANAGER',
        side: 'BUYER',
        label: 'Estate Manager',
        description: 'Operational Estate Manager',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'],
      },
      roles: [],
      organizations: [],
      orgRole: 'ESTATE_MANAGER',
      organizationId: 'org-rwa-palm-grove',
      organizationName: 'Palm Grove RWA',
      buyerType: 'RWA',
      committeeRfqCount: 5,
      supplierId: null,
      fullName: 'Mr. Verma',
      title: 'Estate Manager',
      avatarUrl: null,
      email: 'manager@palmgrove.test',
      phone: null,
    };

    const auth = evaluateWebAuthorization(estateMgrContext);
    expect(auth.persona).toBe('RWA');
    expect(auth.isRwaContext).toBe(true);
    expect(auth.isRwaEstateManager).toBe(true);
    expect(auth.isRwaCommittee).toBe(false);
    expect(auth.canVote).toBe(false); // Operational manager has ZERO voting rights
    expect(auth.isManager).toBe(true);
    expect(auth.canIssuePo).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 3. MSME Model & Anti-Self-Approval
  // ---------------------------------------------------------------------------
  it('authorizes MSME Primary Owner for universal spend approval', () => {
    const msmeOwnerContext: RoleContext = {
      signedIn: true,
      profileId: 'usr-msme-owner-301',
      side: 'BUYER',
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: {
        code: 'PRIMARY_OWNER',
        side: 'BUYER',
        label: 'Primary MSME Owner',
        description: 'Enterprise Primary Owner',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'],
      },
      roles: [],
      organizations: [],
      orgRole: 'PRIMARY_OWNER',
      organizationId: 'org-msme-apex-tech',
      organizationName: 'Apex Technologies',
      buyerType: 'MSME',
      committeeRfqCount: 0,
      supplierId: null,
      fullName: 'Rajesh Mehta',
      title: 'Managing Director',
      avatarUrl: null,
      email: 'rajesh@apextech.test',
      phone: null,
    };

    const auth = evaluateWebAuthorization(msmeOwnerContext);
    expect(auth.persona).toBe('MSME');
    expect(auth.isMsmePrimary).toBe(true);
    expect(auth.canVote).toBe(false); // MSME uses spend signoff, not committee ballots
    expect(auth.canApproveSpend(50000000).allowed).toBe(true);
  });

  it('enforces Anti-Self-Approval rule (PA-09) on delegated MSME managers and approvers', () => {
    const msmeManagerContext: RoleContext = {
      signedIn: true,
      profileId: 'usr-mgr-302',
      side: 'BUYER',
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: {
        code: 'MANAGER',
        side: 'BUYER',
        label: 'Procurement Manager',
        description: 'Operations Manager',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE'],
      },
      roles: [],
      organizations: [],
      orgRole: 'MANAGER',
      organizationId: 'org-msme-apex-tech',
      organizationName: 'Apex Technologies',
      buyerType: 'MSME',
      committeeRfqCount: 0,
      supplierId: null,
      fullName: 'Sunita Rao',
      title: 'Procurement Manager',
      avatarUrl: null,
      email: 'sunita@apextech.test',
      phone: null,
    };

    const auth = evaluateWebAuthorization(msmeManagerContext);
    expect(auth.isMsmeManager).toBe(true);

    // Case A: Approving third-party requirement within Tier 2 limit -> ALLOWED
    const validCheck = auth.canApproveSpend(400000, 'usr-creator-other-303');
    expect(validCheck.allowed).toBe(true);

    // Case B: Approving own requirement -> BLOCKED by Anti-Self-Approval (PA-09)
    const selfCheck = auth.canApproveSpend(400000, 'usr-mgr-302');
    expect(selfCheck.allowed).toBe(false);
    expect(selfCheck.reason).toContain('Anti-Self-Approval violation (PA-09)');

    // Case C: Exceeding Tier 2 limit (10 Lakhs) -> BLOCKED
    const overLimitCheck = auth.canApproveSpend(2500000, 'usr-creator-other-303');
    expect(overLimitCheck.allowed).toBe(false);
    expect(overLimitCheck.reason).toContain('exceeds Manager Tier 2 approval threshold');
  });

  // ---------------------------------------------------------------------------
  // 4. Platform Admin / Founder
  // ---------------------------------------------------------------------------
  it('authorizes Platform Admin / Founder with global governance privileges', () => {
    const adminContext: RoleContext = {
      signedIn: true,
      profileId: 'usr-admin-001',
      side: 'BUYER',
      isPlatformAdmin: true,
      isFounder: true,
      needsOnboarding: false,
      activeRole: {
        code: 'PLATFORM_ADMIN',
        side: 'BUYER',
        label: 'Platform Admin',
        description: 'Super Admin',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE', 'AWARD'],
      },
      roles: [],
      organizations: [],
      orgRole: 'ADMIN',
      organizationId: null,
      organizationName: null,
      buyerType: null,
      committeeRfqCount: 0,
      supplierId: null,
      fullName: 'Basu Founder',
      title: 'Founder & Super Admin',
      avatarUrl: null,
      email: 'bvnbasu@gmail.com',
      phone: null,
    };

    const auth = evaluateWebAuthorization(adminContext);
    expect(auth.isAdmin).toBe(true);
    expect(auth.isFounder).toBe(true);
    expect(auth.isPlatformAdmin).toBe(true);
    expect(auth.persona).toBe('PLATFORM_ADMIN');
    expect(auth.canApproveSpend(99999999).allowed).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Retired Enterprise Persona Claims (Fail-Closed, Never Normalizes to MSME)
  // ---------------------------------------------------------------------------
  it('rejects retired Enterprise persona claims and fails closed (ENT-FIX-08)', () => {
    const enterpriseContext: RoleContext = {
      signedIn: true,
      profileId: 'usr-attacker-001',
      side: 'BUYER',
      isPlatformAdmin: false,
      isFounder: false,
      needsOnboarding: false,
      activeRole: {
        code: 'OWNER',
        side: 'BUYER',
        label: 'Enterprise Owner',
        description: 'Attempted Enterprise claim',
        permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'],
      },
      roles: [],
      organizations: [],
      orgRole: 'OWNER',
      organizationId: 'org-enterprise-fake',
      organizationName: 'Fake Enterprise Org',
      buyerType: 'ENTERPRISE',
      committeeRfqCount: 0,
      supplierId: null,
      fullName: 'Attacker Corp',
      title: 'Enterprise Owner',
      avatarUrl: null,
      email: 'attacker@enterprise.fake',
      phone: null,
    };

    const auth = evaluateWebAuthorization(enterpriseContext);
    expect(auth.isMsmeContext).toBe(false);
    expect(auth.isIndividualBuyer).toBe(false);
    expect(auth.isRwaContext).toBe(false);
    expect(auth.canCreateRfq).toBe(false);
    expect(auth.canIssuePo).toBe(false);
    expect(auth.canReleasePayment).toBe(false);
    expect(auth.canVote).toBe(false);
    expect(auth.canApproveSpend(1000).allowed).toBe(false);
    expect(auth.canApproveSpend(1000).reason).toContain('Enterprise persona is retired and unsupported');
  });
});
