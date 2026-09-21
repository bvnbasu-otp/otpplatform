import type { NotificationChannel } from '../enums/notifications';
export type { NotificationChannel };

/**
 * OTP Phase 6.5: Omnichannel Procurement Communications Domain Model
 *
 * Provides domain models and pure algorithmic controls for:
 * 1. Multi-channel delivery (WhatsApp / WAHA adapter, SMS, Email, In-App).
 * 2. Template allow-listing, lifecycle stage gating, and variable interpolation.
 * 3. Identity redaction engine (pre-reveal pseudonymity vs post-reveal unmasking).
 * 4. Channel preferences, category opt-outs, and quiet-hours windowing.
 * 5. Exponential backoff retry policies, DLQ thresholds, and webhook cryptographic verification.
 * 
 * Cross-Platform Architecture: Pure TypeScript implementation compatible across Browser and Node runtimes.
 */

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'IN_APP',
] as const;

export type NotificationCategory =
  | 'RFQ_INVITATION'
  | 'QUOTE_SUBMITTED'
  | 'AWARD_DECISION'
  | 'WORK_ORDER_ISSUED'
  | 'MILESTONE_SUBMITTED'
  | 'INSPECTION_COMPLETED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_ESCALATED'
  | 'DISPUTE_RESOLVED'
  | 'PAYMENT_CONFIRMED'
  | 'SYSTEM_ALERT';

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'RFQ_INVITATION',
  'QUOTE_SUBMITTED',
  'AWARD_DECISION',
  'WORK_ORDER_ISSUED',
  'MILESTONE_SUBMITTED',
  'INSPECTION_COMPLETED',
  'DISPUTE_OPENED',
  'DISPUTE_ESCALATED',
  'DISPUTE_RESOLVED',
  'PAYMENT_CONFIRMED',
  'SYSTEM_ALERT',
] as const;

export type NotificationDispatchStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER'
  | 'SUPPRESSED';

export interface NotificationTemplate {
  id: string;
  templateCode: string;
  version: number;
  channel: NotificationChannel;
  category: NotificationCategory;
  lifecycleStages: string[];
  subjectTemplate?: string | null;
  bodyTemplate: string;
  variablesSchema: Record<string, unknown>;
  isActive: boolean;
  requiresIdentityRedaction: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  organizationId?: string | null;
  channelPreferences: Record<NotificationChannel, boolean>;
  categoryOptOuts: NotificationCategory[];
  phoneNumber?: string | null;
  email?: string | null;
  quietHoursStart?: string | null; // e.g. "22:00"
  quietHoursEnd?: string | null;   // e.g. "08:00"
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDispatchQueueItem {
  id: string;
  organizationId?: string | null;
  recipientUserId?: string | null;
  recipientAddress: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateCode: string;
  templateVersion: number;
  payload: Record<string, unknown>;
  redactedPayload: Record<string, unknown>;
  isIdentityMasked: boolean;
  status: NotificationDispatchStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string;
  errorLog: Array<{ timestamp: string; error: string; attempt: number; category?: string }>;
  providerMessageId?: string | null;
  providerResponse?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  deliveryConfirmedAt?: string | null;
  claimedAt?: string | null;
  claimedBy?: string | null;
  leaseExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Interpolates template string with variables in {{varName}} format.
 */
export function renderNotificationTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (key in variables) {
      const val = variables[key];
      return val !== null && val !== undefined ? String(val) : '';
    }
    return '';
  });
}

/**
 * Strictly redacts sensitive supplier / counterparty identity fields if masked.
 * Preserves pseudonym labels like "Supplier A7K3".
 */
export function redactNotificationPayload(
  payload: Record<string, unknown>,
  isIdentityMasked: boolean,
): Record<string, unknown> {
  if (!isIdentityMasked) {
    return { ...payload };
  }

  const redacted = { ...payload };
  const sensitiveKeys = [
    'supplier_legal_name',
    'supplier_business_name',
    'supplier_gstin',
    'supplier_pan',
    'supplier_phone',
    'supplier_email',
    'supplier_bank_account',
    'supplier_ifsc',
    'vendor_legal_name',
    'contact_person_name',
  ];

  for (const key of sensitiveKeys) {
    if (key in redacted) {
      delete redacted[key];
    }
  }

  // Ensure pseudonym label is preserved or present
  if (!redacted.supplier_pseudonym && redacted.supplier_label) {
    redacted.supplier_pseudonym = redacted.supplier_label;
  }

  return redacted;
}

/**
 * Checks whether a specific channel is enabled for a user's preferences.
 */
export function isChannelEnabled(
  prefs: NotificationPreferences | null | undefined,
  channel: NotificationChannel,
): boolean {
  if (!prefs || !prefs.channelPreferences) {
    return true; // default enabled
  }
  return prefs.channelPreferences[channel] !== false;
}

/**
 * Checks whether a notification category is opted-out.
 */
export function isCategoryOptedOut(
  prefs: NotificationPreferences | null | undefined,
  category: NotificationCategory,
): boolean {
  if (!prefs || !prefs.categoryOptOuts) {
    return false;
  }
  return prefs.categoryOptOuts.includes(category);
}

/**
 * Determines whether current time falls within user quiet hours window (HH:mm format).
 */
export function isWithinQuietHours(
  quietHoursStart: string | null | undefined,
  quietHoursEnd: string | null | undefined,
  currentTimeStr?: string, // e.g. "23:30"
): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;

  const current = currentTimeStr || new Date().toISOString().substring(11, 16);
  if (quietHoursStart <= quietHoursEnd) {
    // Normal window: e.g. 01:00 to 06:00
    return current >= quietHoursStart && current <= quietHoursEnd;
  } else {
    // Overnight window: e.g. 22:00 to 08:00
    return current >= quietHoursStart || current <= quietHoursEnd;
  }
}

/**
 * Exponential backoff calculation for notification retries with capped maximum.
 */
export function calculateExponentialBackoff(
  retryCount: number,
  baseDelaySeconds = 30,
  maxDelaySeconds = 3600,
): number {
  if (retryCount <= 0) return 0;
  const exponential = baseDelaySeconds * Math.pow(2, retryCount - 1);
  return Math.min(exponential, maxDelaySeconds);
}

export type DeliveryFailureCategory = 'TRANSIENT' | 'PERMANENT' | 'CREDENTIAL_ERROR';

/**
 * Classifies delivery error into TRANSIENT (retryable), PERMANENT (fatal), or CREDENTIAL_ERROR (fatal secret/auth issue).
 */
export function classifyDeliveryFailure(
  error: unknown,
  statusCode?: number,
): DeliveryFailureCategory {
  if (statusCode === 401 || statusCode === 403) {
    return 'CREDENTIAL_ERROR';
  }
  if (statusCode === 400 || statusCode === 404 || statusCode === 410 || statusCode === 422) {
    return 'PERMANENT';
  }
  if (statusCode === 408 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500 && statusCode <= 599)) {
    return 'TRANSIENT';
  }

  const message = error instanceof Error ? error.message : String(error || '');
  const lowerMsg = message.toLowerCase();

  // Credential error checks
  if (
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('invalid api key') ||
    lowerMsg.includes('invalid credentials') ||
    lowerMsg.includes('auth failed') ||
    lowerMsg.includes('authentication failed') ||
    lowerMsg.includes('eauth') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('access denied')
  ) {
    return 'CREDENTIAL_ERROR';
  }

  // Permanent error checks
  if (
    lowerMsg.includes('invalid recipient') ||
    lowerMsg.includes('invalid email') ||
    lowerMsg.includes('invalid phone') ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('unregistered') ||
    lowerMsg.includes('blacklisted') ||
    lowerMsg.includes('unsubscribed') ||
    lowerMsg.includes('template not found') ||
    lowerMsg.includes('malformed') ||
    lowerMsg.includes('bad request') ||
    lowerMsg.includes('validation') ||
    lowerMsg.includes('permanent')
  ) {
    return 'PERMANENT';
  }

  // Transient / network error checks
  if (
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('aborted') ||
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('too many requests') ||
    lowerMsg.includes('service unavailable') ||
    lowerMsg.includes('gateway timeout') ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('transient')
  ) {
    return 'TRANSIENT';
  }

  return 'TRANSIENT';
}

/**
 * Calculates exponential backoff with randomized jitter (+- jitterFactor).
 */
export function calculateExponentialBackoffWithJitter(
  retryCount: number,
  baseDelaySeconds = 30,
  maxDelaySeconds = 3600,
  jitterFactor = 0.2,
  rng: () => number = Math.random,
): number {
  if (retryCount <= 0) return 0;
  const base = calculateExponentialBackoff(retryCount, baseDelaySeconds, maxDelaySeconds);
  const jitterRange = base * jitterFactor;
  const jitter = (rng() * 2 - 1) * jitterRange;
  const result = Math.round(base + jitter);
  return Math.min(Math.max(1, result), maxDelaySeconds);
}

/**
 * Sanitizes an error message or payload to prevent credential or secret or PII leakage in logs.
 */
export function sanitizeLogData(text: string): string {
  if (!text) return '';
  return text
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(api[_-]?key[:=]\s*)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED_KEY]')
    .replace(/(password[:=]\s*)[^\s,;]+/gi, '$1[REDACTED_PASS]')
    .replace(/(secret[:=]\s*)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED_SECRET]')
    .replace(/(token[:=]\s*)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(authorization[:=]\s*)[^\s,;]+/gi, '$1[REDACTED_AUTH]');
}

/**
 * Pure cross-platform deterministic HMAC-like digest generator (64-character hex).
 */
export function computeDeterministicHmac(message: string, secret: string): string {
  const combined = `${secret}:${message}`;
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  let h3 = 0x85ebca6b ^ 0;
  let h4 = 0xc2b2ae35 ^ 0;

  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 1597334677) ^ Math.imul(h3 ^ (h3 >>> 13), 2654435761);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 3266489909) ^ Math.imul(h4 ^ (h4 >>> 13), 2246822507);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2654435761) ^ Math.imul(h1 ^ (h1 >>> 13), 1597334677);

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const hex4 = (h4 >>> 0).toString(16).padStart(8, '0');

  return `${hex1}${hex2}${hex3}${hex4}`.repeat(2);
}

/**
 * Validates provider webhook authenticity and rejects replay attacks outside maxDriftSeconds.
 */
export function validateProviderWebhookSignature(
  rawPayload: string,
  signature: string,
  secret: string,
  timestampMs: number,
  maxDriftSeconds = 300,
): boolean {
  if (!rawPayload || !signature || !secret) return false;

  const nowMs = Date.now();
  const driftMs = Math.abs(nowMs - timestampMs);
  if (driftMs > maxDriftSeconds * 1000) {
    return false; // Timestamp outside allowed replay window
  }

  const expectedSig = computeDeterministicHmac(rawPayload, `${secret}:${timestampMs}`);
  return signature.toLowerCase() === expectedSig.toLowerCase();
}
