/**
 * OTP Platform — Privacy-Safe Funnel Analytics Client
 * Stage R2-27: Referral, Growth, Product Completeness & Fresh-Start Invariants
 */

import {
  type FunnelEventType,
  type PrivacySafeTelemetryPayload,
  sanitizeFunnelTelemetry,
} from '@otp/domain';

const SESSION_STORAGE_KEY = 'otp_anonymous_session_id';

let memorySessionId: string | null = null;

/**
 * Returns or generates a persistent anonymous session ID.
 */
export function getOrCreateAnonymousSessionId(): string {
  if (typeof window === 'undefined') {
    if (!memorySessionId) {
      memorySessionId = 'server_session_' + Math.random().toString(36).slice(2, 10);
    }
    return memorySessionId;
  }

  try {
    let sessionId = window.localStorage?.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).slice(2, 12) + '_' + Date.now().toString(36);
      window.localStorage?.setItem(SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    if (!memorySessionId) {
      memorySessionId = 'fallback_session_' + Date.now().toString(36);
    }
    return memorySessionId;
  }
}


export type FunnelEventSink = (payload: PrivacySafeTelemetryPayload) => void;

// In-memory buffer for testing and telemetry delivery
const eventBuffer: PrivacySafeTelemetryPayload[] = [];
let activeSink: FunnelEventSink | null = null;

export function setFunnelEventSink(sink: FunnelEventSink | null): void {
  activeSink = sink;
}

export function getBufferedFunnelEvents(): readonly PrivacySafeTelemetryPayload[] {
  return [...eventBuffer];
}

export function clearBufferedFunnelEvents(): void {
  eventBuffer.length = 0;
}

/**
 * Tracks a privacy-safe funnel analytics event.
 */
export function trackFunnelEvent(
  eventType: FunnelEventType,
  params?: Omit<Partial<PrivacySafeTelemetryPayload>, 'eventType' | 'anonymousSessionId'>,
): boolean {
  try {
    const rawPayload: Partial<PrivacySafeTelemetryPayload> = {
      eventType,
      anonymousSessionId: getOrCreateAnonymousSessionId(),
      timestamp: new Date().toISOString(),
      ...params,
    };

    const sanitization = sanitizeFunnelTelemetry(rawPayload);
    if (!sanitization.isValid || !sanitization.sanitizedPayload) {
      // eslint-disable-next-line no-console
      console.warn('[FunnelAnalytics] Dropped invalid telemetry payload:', sanitization.violations);
      return false;
    }

    const cleanPayload = sanitization.sanitizedPayload;
    eventBuffer.push(cleanPayload);

    // Keep buffer capped to last 100 events in memory
    if (eventBuffer.length > 100) {
      eventBuffer.shift();
    }

    if (activeSink) {
      activeSink(cleanPayload);
    }

    return true;
  } catch (err) {
    // Fail silently to never break critical user journeys
    return false;
  }
}
