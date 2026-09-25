/**
 * OTP GOLDEN RECONSTRUCTION — CANONICAL WEB AUTHORIZATION ENGINE
 *
 * Consolidates all disparate UI authorization guards into a unified,
 * deterministic presentation-layer authority resolver.
 *
 * Enforces:
 * 1. 13-Stage Authorization compliance at the UI view & action layer.
 * 2. Individual Buyer Model: organizationId = NULL, zero committee/voting overhead.
 * 3. RWA 7 Canonical Roles: Estate Manager has operational rights but ZERO voting rights (canVote = false).
 * 4. MSME Spend Governance: Primary 1-click authority, delegated spend caps, anti-self-approval (PA-09).
 * 5. Multi-Context Independence: Clean context switching with zero authority bleed.
 */

import type { RoleContext } from '@/features/roles/api/roles';
import { isFounderEmail, isSuperAdminEmail } from './user-role';

export type WebAuthorizationPersona =
  | 'INDIVIDUAL'
  | 'RWA'
  | 'MSME'
  | 'SUPPLIER'
  | 'PLATFORM_ADMIN';

export interface WebAuthorizationState {
  persona: WebAuthorizationPersona;
  isIndividualBuyer: boolean;
  isRwaContext: boolean;
  isRwaCommittee: boolean;
  isRwaEstateManager: boolean;
  isMsmeContext: boolean;
  isMsmePrimary: boolean;
  isMsmeManager: boolean;
  isMsmeMember: boolean;
  isSupplier: boolean;
  isPlatformAdmin: boolean;
  isFounder: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isManager: boolean;
  isCommittee: boolean;
  canVote: boolean;
  canApproveSpend: (amount?: number | null, creatorPersonId?: string | null) => { allowed: boolean; reason: string };
  canIssuePo: boolean;
  canReleasePayment: boolean;
  canManageMembers: boolean;
  canCreateRfq: boolean;
  activeOrgId: string | null;
  activeOrgName: string | null;
  activeOrgType: string | null;
}

/**
 * Pure authorization resolver mapping raw RoleContext to consolidated WebAuthorizationState.
 */
export function evaluateWebAuthorization(context: RoleContext): WebAuthorizationState {
  const userEmail = context.email?.trim().toLowerCase();
  const isFounder = Boolean(context.isFounder || isFounderEmail(userEmail));
  const isPlatformAdmin = Boolean(isFounder || context.isPlatformAdmin || isSuperAdminEmail(userEmail));
  const isAdmin = isPlatformAdmin;

  // Resolve Persona
  let persona: WebAuthorizationPersona = 'INDIVIDUAL';
  const orgTypeUpper = (context.buyerType || '').toUpperCase().trim();
  const sideUpper = (context.side || '').toUpperCase().trim();
  const roleCode = (context.activeRole?.code || context.orgRole || '').toUpperCase().trim();

  const isEnterprise =
    orgTypeUpper.includes('ENTERPRISE') ||
    roleCode.includes('ENTERPRISE');

  if (isEnterprise) {
    // Fail closed: Retired enterprise persona claims are rejected and NEVER converted into MSME
    persona = 'INDIVIDUAL';
  } else if (isAdmin && !context.organizationId) {
    persona = 'PLATFORM_ADMIN';
  } else if (sideUpper === 'SUPPLIER') {
    persona = 'SUPPLIER';
  } else if (['RWA', 'COMMUNITY', 'RESIDENTIAL_RWA', 'HOUSING_SOCIETY', 'SOCIETY'].includes(orgTypeUpper)) {
    persona = 'RWA';
  } else if (['MSME', 'BUSINESS', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PVT_LTD'].includes(orgTypeUpper)) {
    persona = 'MSME';
  } else if (!context.organizationId || orgTypeUpper === 'INDIVIDUAL' || orgTypeUpper === 'PERSONAL' || orgTypeUpper === 'SOLO') {
    persona = 'INDIVIDUAL';
  } else {
    persona = 'INDIVIDUAL';
  }

  const isIndividualBuyer = persona === 'INDIVIDUAL' && !isEnterprise && (!context.organizationId || orgTypeUpper === 'INDIVIDUAL' || orgTypeUpper === 'PERSONAL' || orgTypeUpper === 'SOLO');
  const isRwaContext = persona === 'RWA' && !isEnterprise;
  const isMsmeContext = persona === 'MSME' && !isEnterprise;
  const isSupplier = persona === 'SUPPLIER' && !isEnterprise;

  const isOwner = roleCode === 'OWNER' || roleCode === 'PRIMARY_OWNER' || roleCode === 'PRESIDENT' || isFounder || isAdmin;
  const isManager = roleCode === 'MANAGER' || roleCode === 'ESTATE_MANAGER' || roleCode === 'VICE_PRESIDENT' || roleCode === 'SECRETARY';
  const isEstateManager = roleCode === 'ESTATE_MANAGER';

  // RWA Committee Roles (7 Canonical RWA Roles)
  const isRwaCommittee = isRwaContext && [
    'PRESIDENT',
    'VICE_PRESIDENT',
    'SECRETARY',
    'JOINT_SECRETARY',
    'TREASURER',
    'COMMITTEE_MEMBER',
    'OWNER',
  ].includes(roleCode);

  const isCommittee = isRwaCommittee;
  const isRwaEstateManager = isRwaContext && isEstateManager;

  // MSME Roles
  const isMsmePrimary = isMsmeContext && (roleCode === 'PRIMARY_OWNER' || roleCode === 'OWNER' || isOwner);
  const isMsmeManager = isMsmeContext && (roleCode === 'MANAGER' || isManager);
  const isMsmeMember = isMsmeContext && (roleCode === 'MEMBER' || roleCode === 'BUYER');

  // Voting Rights:
  // - RWA Committee members: TRUE
  // - RWA Estate Manager: FALSE (operational only)
  // - RWA Resident Owner (without committee): FALSE
  // - Individual Buyer: FALSE (zero committee overhead)
  // - MSME / Supplier: FALSE (procurement approvals use spend approval, not ballots)
  const canVote = isRwaContext ? (isRwaCommittee && !isRwaEstateManager) : false;

  // PO & Payment Authority
  const canIssuePo = !isEnterprise && (isOwner || isManager || isIndividualBuyer || (context.activeRole?.permissions?.includes('AWARD') ?? false));
  const canReleasePayment = !isEnterprise && (isOwner || roleCode === 'TREASURER' || isIndividualBuyer);
  const canManageMembers = !isEnterprise && (isOwner || isManager || isAdmin);
  const canCreateRfq = !isEnterprise; // All authenticated canonical buyer personas can initiate intake/RFQ

  // Spend Approval Checker with Anti-Self-Approval and Spend Cap
  const canApproveSpend = (amount?: number | null, creatorPersonId?: string | null): { allowed: boolean; reason: string } => {
    if (isEnterprise) {
      return { allowed: false, reason: 'Enterprise persona is retired and unsupported (FAIL_CLOSED).' };
    }

    if (isAdmin) {
      return { allowed: true, reason: 'Platform Admin override.' };
    }

    if (isIndividualBuyer) {
      return { allowed: true, reason: 'Individual buyer holds 1-click personal purchase authority.' };
    }

    if (isMsmePrimary) {
      return { allowed: true, reason: 'MSME Primary Owner has universal 1-click spend approval authority.' };
    }

    // Anti-self-approval rule (PA-09)
    if (creatorPersonId && context.profileId && creatorPersonId === context.profileId) {
      return {
        allowed: false,
        reason: 'Anti-Self-Approval violation (PA-09): The creator of a requirement/RFQ cannot approve their own spend.',
      };
    }

    if (isMsmeManager) {
      // Tier 2 manager limit: ₹10,00,000 default
      if (amount != null && amount > 1000000) {
        return {
          allowed: false,
          reason: `Spend amount (₹${amount.toLocaleString('en-IN')}) exceeds Manager Tier 2 approval threshold (₹10,00,000). Route to Primary Owner.`,
        };
      }
      return { allowed: true, reason: 'Authorized under Manager spend approval tier.' };
    }

    if (roleCode === 'APPROVER' || roleCode === 'DELEGATE') {
      if (amount != null && amount > 500000) {
        return {
          allowed: false,
          reason: `Spend amount (₹${amount.toLocaleString('en-IN')}) exceeds delegated spend cap (₹5,00,000). Route to Manager/Owner.`,
        };
      }
      return { allowed: true, reason: 'Authorized under Delegated spend approval proxy.' };
    }

    return {
      allowed: false,
      reason: `Role '${roleCode}' does not possess spend approval authority in this organization.`,
    };
  };

  return {
    persona,
    isIndividualBuyer,
    isRwaContext,
    isRwaCommittee,
    isRwaEstateManager,
    isMsmeContext,
    isMsmePrimary,
    isMsmeManager,
    isMsmeMember,
    isSupplier,
    isPlatformAdmin,
    isFounder,
    isAdmin,
    isOwner,
    isManager,
    isCommittee,
    canVote,
    canApproveSpend,
    canIssuePo,
    canReleasePayment,
    canManageMembers,
    canCreateRfq,
    activeOrgId: isIndividualBuyer ? null : context.organizationId,
    activeOrgName: isIndividualBuyer ? 'Personal Account' : context.organizationName,
    activeOrgType: isIndividualBuyer ? 'INDIVIDUAL' : context.buyerType,
  };
}
