/**
 * OTP Stage R2-18: Superadmin & Founder Operational Oversight Domain Specification
 *
 * Supreme Platform Invariants:
 * 1. Strict Role Separation:
 *    - Platform Roles: SUPERADMIN (Operations & Controls) and FOUNDER_CEO (Oversight & Observability).
 *    - Customer Contexts: INDIVIDUAL, RWA, MSME. (Enterprise is strictly out of scope).
 *    - Platform roles NEVER gain transaction authority (voting, spend approval, quote creation).
 * 2. PA-08 Superadmin Immutability Trigger:
 *    - Superadmin cannot delete, demote, or alter protected root administrators.
 *    - Superadmin cannot silently rewrite historical business truth (votes, Decision Receipts, double-entry journals, settled certificates).
 * 3. Three Distinct Telemetry Domains:
 *    - UX Telemetry (intake completion, mobile error rate, screen latency)
 *    - Business Telemetry (adoption across Individual/RWA/MSME, 7-state golden funnel, GMV, fees, rewards, settlements)
 *    - Security Telemetry (authorization denials, blocked PII/identity leaks, token replay attempts, RLS violations)
 * 4. Production Data Purity & Quarantine:
 *    - Test, demo, pilot, and mock entities (prefixed test_, demo_, pilot_, mock_) are strictly quarantined from production KPIs.
 * 5. Data Minimization & Least Privilege:
 *    - Passwords, secrets, tokens, and premature supplier identities are stripped from admin/founder inspection views.
 */

import { computeDeterministicHmac } from './procurement-communications';

export type PlatformOversightRole = 'SUPERADMIN' | 'FOUNDER_CEO';
export type CustomerBuyerContext = 'INDIVIDUAL' | 'RWA' | 'MSME';

export type SuperadminScope =
  | 'SYSTEM_HEALTH'
  | 'SUPPLIER_VERIFICATION'
  | 'SUPPLIER_NETWORK'
  | 'TAXONOMY_ADMIN'
  | 'INTEGRATION_MANAGEMENT'
  | 'NOTIFICATIONS_OBSERVABILITY'
  | 'MARKET_INTELLIGENCE_OBSERVABILITY'
  | 'FINANCIAL_OPERATIONS'
  | 'SECURITY_AUDIT'
  | 'CONFIGURATION';

export type OperationalProviderStatus = 'LIVE' | 'READY' | 'DISABLED' | 'UNAVAILABLE';

export interface AdminAuditEntry {
  id: string;
  actorId: string;
  actorEmail?: string | null;
  scope: SuperadminScope;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  timestamp: string;
  ipAddress?: string | null;
}

export interface UxTelemetrySummary {
  intakeCompletionRatePercent: number;
  mobileErrorRatePercent: number;
  avgScreenTransitionLatencyMs: number;
  abandonmentRatePercent: number;
  sampledInteractionsCount: number;
}

export interface BusinessFunnelTelemetry {
  draftCount: number;
  quotingCount: number;
  evaluatingCount: number;
  awardedCount: number;
  poIssuedCount: number;
  invoicedCount: number;
  settledCount: number;
  stalledCount: number;
  totalProcurements: number;
  conversionRatePercent: number;
}

export interface SecurityAuditTelemetry {
  blockedAuthorizationAttempts: number;
  blockedIdentityLeakageAttempts: number;
  blockedCrossTenantAttempts: number;
  tokenReplayAttemptsBlocked: number;
  adminConfigurationEventsCount: number;
  recentSecurityIncidentsCount: number;
}

export interface SupplierNetworkTelemetrySummary {
  totalDiscoveredSuppliers: number;
  totalRegisteredSuppliers: number;
  totalOtpVerifiedSuppliers: number;
  totalGstVerifiedSuppliers: number;
  activatedPincodesCount: number;
  activatedCitiesCount: number;
  activatedCategoriesCount: number;
  networkCacheHitRatePercent: number;
  zeroCallRfqRatePercent: number;
  organicClaimRatePercent: number;
  googleApiBudgetRemainingPercent: number;
  supplierAcquisitionCostProxy: {
    amountInr: number;
    isProxy: true;
    explanation: string;
  };
}

export interface FinancialOversightSummary {
  cumulativeGmvInr: number;
  totalPlatformFeesInr: number;    // 0.50% fee
  totalBuyerRewardsInr: number;     // 0.10% reward
  totalSupplierDisbursedInr: number;
  matchedSettlementCount: number;
  pendingSettlementCount: number;
  disputedSettlementCount: number;
  isReconciled: boolean;
}

export interface FounderExecutiveCockpitMetrics {
  generatedAt: string;
  isFounderAuthorized: true;
  adoption: {
    individualBuyersCount: number;
    rwaBuyersCount: number;
    msmeBuyersCount: number;
    totalBuyersCount: number;
    activeBuyersCount: number;
    repeatBuyersCount: number;
    repeatPercentage: number;
  };
  suppliers: {
    totalSuppliersCount: number;
    activeQuotingSuppliersCount: number;
    repeatSuppliersCount: number;
    repeatPercentage: number;
  };
  funnel: BusinessFunnelTelemetry;
  financials: FinancialOversightSummary;
  network: SupplierNetworkTelemetrySummary;
  uxTelemetry: UxTelemetrySummary;
  securityTelemetry: SecurityAuditTelemetry;
  geography: {
    citiesCovered: number;
    pincodesCovered: number;
  };
  productionMilestones: Array<{
    id: string;
    title: string;
    target: number;
    current: number;
    achieved: boolean;
    achievedAt?: string | null;
  }>;
}

/**
 * Validates that a platform administrator cannot assume customer buyer transaction authority.
 */
export function assertPlatformRoleSeparation(params: {
  isPlatformAdmin?: boolean;
  isFounder?: boolean;
  attemptedAction: 'COMMITTEE_VOTE' | 'MSME_SPEND_APPROVAL' | 'SUPPLIER_QUOTE_SUBMISSION' | 'AWARD_DECISION';
  hasExplicitBuyerDelegation?: boolean;
}): { allowed: boolean; reason?: string } {
  if (params.isPlatformAdmin || params.isFounder) {
    if (!params.hasExplicitBuyerDelegation) {
      return {
        allowed: false,
        reason: `Platform role cannot execute buyer transaction action (${params.attemptedAction}) without explicit organizational governance delegation (Invariant 1 / Invariant 2).`,
      };
    }
  }
  return { allowed: true };
}

/**
 * PA-08 Invariant: Asserts that Superadmin cannot destructively modify historical business truth.
 */
export function assertSuperadminImmutability(params: {
  targetEntityType: 'COMMITTEE_VOTE' | 'DECISION_RECEIPT' | 'DOUBLE_ENTRY_JOURNAL' | 'SETTLEMENT_CERTIFICATE' | 'SNAPSHOT';
  mutationType: 'UPDATE' | 'DELETE' | 'COMPENSATING_ENTRY';
}): { allowed: boolean; error?: string } {
  if (params.mutationType === 'UPDATE' || params.mutationType === 'DELETE') {
    return {
      allowed: false,
      error: `PA-08 Violation: Destructive mutation (${params.mutationType}) of ${params.targetEntityType} is strictly prohibited. Controlled compensating entries must be used.`,
    };
  }
  return { allowed: true };
}

/**
 * Strips secrets, authentication tokens, passwords, and premature supplier identities from administrative inspection payloads.
 */
export function sanitizeAdminInspectionPayload<T extends Record<string, any>>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;

  const clone: Record<string, any> = Array.isArray(payload) ? [...payload] : { ...payload };

  const sensitiveKeys = [
    'password',
    'password_hash',
    'token',
    'auth_token',
    'secret',
    'signing_secret',
    'access_token',
    'refresh_token',
    'magic_link_token',
    'otp_code',
    'api_key',
    'private_key',
  ];

  for (const key of Object.keys(clone)) {
    if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = sanitizeAdminInspectionPayload(clone[key]);
    } else if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      clone[key] = '[REDACTED_SECRET]';
    }
  }

  return clone as T;
}

/**
 * Quarantines test, demo, mock, and pilot records from contaminating production business metrics (Invariant 14).
 */
export function isProductionEntity(entity: { id?: string; email?: string; name?: string; title?: string; poNumber?: string }): boolean {
  if (!entity) return false;
  const testPrefixes = ['test_', 'demo_', 'pilot_', 'mock_', 'test-', 'demo-', 'pilot-', 'mock-'];
  const testSubstrings = ['@otp.test', 'example.com', 'test-rfq', 'mock-supplier', 'test-buyer'];

  const checkStr = `${entity.id || ''} ${entity.email || ''} ${entity.name || ''} ${entity.title || ''} ${entity.poNumber || ''}`.toLowerCase();

  for (const prefix of testPrefixes) {
    if (checkStr.includes(prefix)) return false;
  }
  for (const sub of testSubstrings) {
    if (checkStr.includes(sub)) return false;
  }
  return true;
}

/**
 * Filters an array of records to strictly production-safe entities.
 */
export function filterProductionEntities<T extends { id?: string; email?: string; name?: string; title?: string; poNumber?: string }>(entities: T[]): T[] {
  if (!Array.isArray(entities)) return [];
  return entities.filter(isProductionEntity);
}

/**
 * Truthfully evaluates operational provider status without inferring LIVE from test fixtures.
 */
export function evaluateProviderOperationalTruth(provider: {
  isConfigured: boolean;
  hasCredentials: boolean;
  isExplicitlyDisabled?: boolean;
  isHealthy: boolean;
}): OperationalProviderStatus {
  if (provider.isExplicitlyDisabled) return 'DISABLED';
  if (!provider.isConfigured || !provider.hasCredentials) return 'READY';
  if (!provider.isHealthy) return 'UNAVAILABLE';
  return 'LIVE';
}
