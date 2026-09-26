import { describe, it, expect } from 'vitest';
import {
  CANONICAL_FUNNEL_EVENT_TYPES,
  SUBSCRIPTION_LIFECYCLE_STATES,
  sanitizeFunnelTelemetry,
  transitionSubscriptionLifecycleState,
} from './funnel-analytics';

describe('Subscription Lifecycle & Funnel Analytics Domain Engine (Stage R2-27)', () => {
  describe('Funnel Events & States Invariants', () => {
    it('defines exactly 17 canonical privacy-safe funnel events', () => {
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toHaveLength(17);
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('landing_view');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('pricing_view');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('signup_started');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('signup_completed');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('subscription_started');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('subscription_success');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('subscription_failed');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('rfq_started');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('rfq_created');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('rfq_completed');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('renewal_started');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('renewal_success');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('subscription_expired');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('reactivation_started');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('reactivation_success');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('referral_attributed');
      expect(CANONICAL_FUNNEL_EVENT_TYPES).toContain('referral_reward_earned');
    });

    it('contains all canonical subscription lifecycle states', () => {
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('VISITOR');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('REGISTERED');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('SUBSCRIBED');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('ENTITLEMENT_ACTIVE');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('GRACE_PERIOD');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('EXPIRED');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('RENEWED');
      expect(SUBSCRIPTION_LIFECYCLE_STATES).toContain('REACTIVATED');
    });
  });

  describe('Privacy-Safe Telemetry Sanitization', () => {
    it('approves clean, non-PII telemetry events', () => {
      const res = sanitizeFunnelTelemetry({
        eventType: 'landing_view',
        anonymousSessionId: 'sess_12345',
        persona: 'INDIVIDUAL',
        pinCodePrefix: '560048',
      });

      expect(res.isValid).toBe(true);
      expect(res.sanitizedPayload?.eventType).toBe('landing_view');
      expect(res.sanitizedPayload?.pinCodePrefix).toBe('560'); // coarse prefix only
    });

    it('rejects invalid or uncanonical event types', () => {
      const res = sanitizeFunnelTelemetry({
        // @ts-expect-error test invalid event
        eventType: 'untracked_random_event',
        anonymousSessionId: 'sess_12345',
      });

      expect(res.isValid).toBe(false);
      expect(res.violations[0]).toContain('Invalid or uncanonical event type');
    });

    it('rejects missing anonymousSessionId', () => {
      const res = sanitizeFunnelTelemetry({
        eventType: 'pricing_view',
        anonymousSessionId: '',
      });

      expect(res.isValid).toBe(false);
      expect(res.violations[0]).toContain('Missing required anonymousSessionId');
    });

    it('detects and blocks raw email PII in metadata', () => {
      const res = sanitizeFunnelTelemetry({
        eventType: 'signup_started',
        anonymousSessionId: 'sess_999',
        metadata: {
          emailAttempted: 'user@example.com',
        },
      });

      expect(res.isValid).toBe(false);
      expect(res.violations[0]).toContain('Raw PII pattern detected');
    });

    it('detects and blocks raw Indian phone number in metadata', () => {
      const res = sanitizeFunnelTelemetry({
        eventType: 'signup_started',
        anonymousSessionId: 'sess_999',
        metadata: {
          contact: '9876543210',
        },
      });

      expect(res.isValid).toBe(false);
      expect(res.violations[0]).toContain('Raw PII pattern detected');
    });
  });

  describe('Subscription Lifecycle State Machine Transitions', () => {
    it('transitions Visitor -> Registered on sign up', () => {
      const t = transitionSubscriptionLifecycleState({
        currentState: 'VISITOR',
        action: 'SIGN_UP',
      });
      expect(t.valid).toBe(true);
      expect(t.nextState).toBe('REGISTERED');
    });

    it('transitions Registered -> Subscribed on subscription payment', () => {
      const t = transitionSubscriptionLifecycleState({
        currentState: 'REGISTERED',
        action: 'PAY_SUBSCRIPTION',
      });
      expect(t.valid).toBe(true);
      expect(t.nextState).toBe('SUBSCRIBED');
    });

    it('transitions Subscribed -> Entitlement Active', () => {
      const t = transitionSubscriptionLifecycleState({
        currentState: 'SUBSCRIBED',
        action: 'ACTIVATE_ENTITLEMENT',
      });
      expect(t.valid).toBe(true);
      expect(t.nextState).toBe('ENTITLEMENT_ACTIVE');
    });

    it('transitions Entitlement Active -> Expired or Grace Period', () => {
      const tGrace = transitionSubscriptionLifecycleState({
        currentState: 'ENTITLEMENT_ACTIVE',
        action: 'ENTER_GRACE',
      });
      expect(tGrace.valid).toBe(true);
      expect(tGrace.nextState).toBe('GRACE_PERIOD');

      const tExp = transitionSubscriptionLifecycleState({
        currentState: 'ENTITLEMENT_ACTIVE',
        action: 'EXPIRE',
      });
      expect(tExp.valid).toBe(true);
      expect(tExp.nextState).toBe('EXPIRED');
    });

    it('transitions Expired -> Reactivated on payment', () => {
      const t = transitionSubscriptionLifecycleState({
        currentState: 'EXPIRED',
        action: 'REACTIVATE',
      });
      expect(t.valid).toBe(true);
      expect(t.nextState).toBe('REACTIVATED');
    });

    it('rejects invalid transitions gracefully', () => {
      const t = transitionSubscriptionLifecycleState({
        currentState: 'VISITOR',
        action: 'RENEW',
      });
      expect(t.valid).toBe(false);
      expect(t.error).toContain('Invalid subscription transition');
    });
  });
});
