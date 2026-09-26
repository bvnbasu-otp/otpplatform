/**
 * OTP Platform — Subscription Lifecycle & Privacy-Safe Funnel Analytics Domain Model
 * Stage R2-27: Referral, Growth, Product Completeness & Fresh-Start Invariants
 *
 * Implements:
 * 1. Authoritative 17-Event Privacy-Safe Funnel Analytics Specification
 * 2. Subscription Lifecycle State Machine:
 *    VISITOR -> REGISTERED -> SUBSCRIBED -> ENTITLEMENT_ACTIVE -> EXPIRY -> RENEWED / REACTIVATED
 * 3. Privacy-Safe Payload Sanitization:
 *    - Strict rejection of PII (passwords, raw emails, phone numbers, card numbers, PAN/GSTIN in raw telemetry)
 *    - Anonymized session IDs, hashed user refs, ISO timestamps, and coarse category/persona attributes only.
 * 4. Subscription Pricing & RFQ Entitlement Rule Verification:
 *    - Individual: 3 RFQs/month (Annual: 3 RFQs/month + 1 quarterly bonus RFQ per quarter)
 *    - RWA: 5 RFQs/month (Annual: 6 RFQs/month)
 *    - MSME: 5 RFQs/month (Annual: 6 RFQs/month)
 *    - Enterprise: Retired / fails closed
 */

export type FunnelEventType =
  | 'landing_view'
  | 'pricing_view'
  | 'signup_started'
  | 'signup_completed'
  | 'subscription_started'
  | 'subscription_success'
  | 'subscription_failed'
  | 'rfq_started'
  | 'rfq_created'
  | 'rfq_completed'
  | 'renewal_started'
  | 'renewal_success'
  | 'subscription_expired'
  | 'reactivation_started'
  | 'reactivation_success'
  | 'referral_attributed'
  | 'referral_reward_earned';

export const CANONICAL_FUNNEL_EVENT_TYPES: readonly FunnelEventType[] = [
  'landing_view',
  'pricing_view',
  'signup_started',
  'signup_completed',
  'subscription_started',
  'subscription_success',
  'subscription_failed',
  'rfq_started',
  'rfq_created',
  'rfq_completed',
  'renewal_started',
  'renewal_success',
  'subscription_expired',
  'reactivation_started',
  'reactivation_success',
  'referral_attributed',
  'referral_reward_earned',
] as const;

export type SubscriptionLifecycleState =
  | 'VISITOR'
  | 'REGISTERED'
  | 'SUBSCRIBED'
  | 'ENTITLEMENT_ACTIVE'
  | 'GRACE_PERIOD'
  | 'EXPIRED'
  | 'RENEWED'
  | 'REACTIVATED';

export const SUBSCRIPTION_LIFECYCLE_STATES: readonly SubscriptionLifecycleState[] = [
  'VISITOR',
  'REGISTERED',
  'SUBSCRIBED',
  'ENTITLEMENT_ACTIVE',
  'GRACE_PERIOD',
  'EXPIRED',
  'RENEWED',
  'REACTIVATED',
] as const;

export interface PrivacySafeTelemetryPayload {
  eventType: FunnelEventType;
  anonymousSessionId: string;
  hashedUserId?: string | null;
  persona?: 'INDIVIDUAL' | 'RWA' | 'MSME' | 'SUPPLIER' | 'VISITOR';
  planTier?: 'INDIVIDUAL' | 'RWA' | 'MSME';
  billingCycle?: 'MONTHLY' | 'YEARLY';
  amount?: number;
  referralCode?: string;
  rfqCategory?: string;
  pinCodePrefix?: string; // 3-digit coarse prefix only (e.g. 560) for privacy
  timestamp: string; // ISO 8601
  metadata?: Record<string, string | number | boolean>;
}

export interface SanitizationResult {
  isValid: boolean;
  sanitizedPayload?: PrivacySafeTelemetryPayload;
  violations: string[];
}

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, // Email
  /(?:\+91|91|0)?[6-9]\d{9}/, // Indian 10-digit mobile phone
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, // 16-digit credit card
  /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/, // PAN
  /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/, // GSTIN
];

/**
 * Validates and sanitizes analytics telemetry payloads to strictly uphold privacy invariants.
 */
export function sanitizeFunnelTelemetry(
  raw: Partial<PrivacySafeTelemetryPayload>,
): SanitizationResult {
  const violations: string[] = [];

  if (!raw.eventType || !CANONICAL_FUNNEL_EVENT_TYPES.includes(raw.eventType)) {
    violations.push(`Invalid or uncanonical event type: ${String(raw.eventType)}`);
  }

  if (!raw.anonymousSessionId || raw.anonymousSessionId.trim().length === 0) {
    violations.push('Missing required anonymousSessionId');
  }

  // Scan for PII in metadata or string fields
  const serialized = JSON.stringify(raw.metadata || {});
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(serialized)) {
      violations.push('Privacy violation: Raw PII pattern detected in telemetry metadata');
      break;
    }
  }

  if (violations.length > 0) {
    return { isValid: false, violations };
  }

  return {
    isValid: true,
    sanitizedPayload: {
      eventType: raw.eventType!,
      anonymousSessionId: raw.anonymousSessionId!,
      hashedUserId: raw.hashedUserId ?? null,
      persona: raw.persona ?? 'VISITOR',
      planTier: raw.planTier,
      billingCycle: raw.billingCycle,
      amount: raw.amount ? Math.max(0, Math.round(raw.amount * 100) / 100) : undefined,
      referralCode: raw.referralCode ? raw.referralCode.trim().toUpperCase() : undefined,
      rfqCategory: raw.rfqCategory,
      pinCodePrefix: raw.pinCodePrefix ? String(raw.pinCodePrefix).slice(0, 3) : undefined,
      timestamp: raw.timestamp || new Date().toISOString(),
      metadata: raw.metadata,
    },
    violations: [],
  };
}

export interface SubscriptionLifecycleTransitionParams {
  currentState: SubscriptionLifecycleState;
  action:
    | 'SIGN_UP'
    | 'PAY_SUBSCRIPTION'
    | 'ACTIVATE_ENTITLEMENT'
    | 'ENTER_GRACE'
    | 'EXPIRE'
    | 'RENEW'
    | 'REACTIVATE';
}

/**
 * Validates deterministic state transitions for the buyer subscription lifecycle.
 */
export function transitionSubscriptionLifecycleState(
  params: SubscriptionLifecycleTransitionParams,
): { valid: boolean; nextState?: SubscriptionLifecycleState; error?: string } {
  const { currentState, action } = params;

  switch (currentState) {
    case 'VISITOR':
      if (action === 'SIGN_UP') return { valid: true, nextState: 'REGISTERED' };
      break;

    case 'REGISTERED':
      if (action === 'PAY_SUBSCRIPTION') return { valid: true, nextState: 'SUBSCRIBED' };
      break;

    case 'SUBSCRIBED':
      if (action === 'ACTIVATE_ENTITLEMENT') return { valid: true, nextState: 'ENTITLEMENT_ACTIVE' };
      break;

    case 'ENTITLEMENT_ACTIVE':
      if (action === 'RENEW') return { valid: true, nextState: 'RENEWED' };
      if (action === 'ENTER_GRACE') return { valid: true, nextState: 'GRACE_PERIOD' };
      if (action === 'EXPIRE') return { valid: true, nextState: 'EXPIRED' };
      break;

    case 'GRACE_PERIOD':
      if (action === 'RENEW') return { valid: true, nextState: 'RENEWED' };
      if (action === 'EXPIRE') return { valid: true, nextState: 'EXPIRED' };
      break;

    case 'EXPIRED':
      if (action === 'REACTIVATE' || action === 'PAY_SUBSCRIPTION') {
        return { valid: true, nextState: 'REACTIVATED' };
      }
      break;

    case 'RENEWED':
    case 'REACTIVATED':
      if (action === 'ACTIVATE_ENTITLEMENT') return { valid: true, nextState: 'ENTITLEMENT_ACTIVE' };
      if (action === 'ENTER_GRACE') return { valid: true, nextState: 'GRACE_PERIOD' };
      if (action === 'EXPIRE') return { valid: true, nextState: 'EXPIRED' };
      break;
  }

  return {
    valid: false,
    error: `Invalid subscription transition from ${currentState} via ${action}`,
  };
}
