/**
 * Truthful outbound-notification status semantics.
 *
 * A provider API returning 2xx means the request was taken, not that a person
 * received anything. Only a provider delivery receipt (callback/webhook) may
 * move a message to DELIVERED. Every customer-facing sentence about an outbound
 * message (registration, OTP, password reset, welcome, referral) should come
 * from `describeNotificationStatus` so the UI can never over-claim.
 */

export type NotificationDeliveryStatus =
  | 'NOT_ATTEMPTED'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'FAILED';

export type NotificationDeliveryChannel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'IN_APP';

export type NotificationPurpose =
  | 'REGISTRATION'
  | 'VERIFICATION_CODE'
  | 'PASSWORD_RESET'
  | 'WELCOME'
  | 'REFERRAL'
  | 'GENERAL';

export type ProviderObservation =
  | { kind: 'NOT_ATTEMPTED'; reason?: string }
  | { kind: 'ENQUEUED' }
  | {
      kind: 'HTTP_RESPONSE';
      httpStatus: number;
      providerMessageId?: string | null;
      errorMessage?: string | null;
    }
  | { kind: 'NETWORK_ERROR'; errorMessage?: string | null }
  | { kind: 'TIMEOUT'; timeoutMs?: number }
  | { kind: 'PROVIDER_CALLBACK'; providerStatus: string; providerMessageId?: string | null }
  | { kind: 'DUPLICATE'; providerMessageId?: string | null };

export interface ResolveNotificationStatusInput {
  channel: NotificationDeliveryChannel;
  observation: ProviderObservation;
  /** Status already recorded for this message, if any (for callbacks, retries and duplicates). */
  previousStatus?: NotificationDeliveryStatus | null;
  /** 1-based attempt number that produced this observation. */
  attempt?: number;
  maxAttempts?: number;
}

export interface NotificationStatusResolution {
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  /** True only when a provider receipt confirmed delivery. */
  deliveryConfirmed: boolean;
  /** True when a failed attempt may be retried and attempts remain. */
  retryScheduled: boolean;
  /** True when the observation was a duplicate of an earlier dispatch. */
  duplicate: boolean;
  /** Timeout / network loss: the provider may or may not have received the request. */
  outcomeUnknown: boolean;
  providerMessageId: string | null;
  detail: string | null;
}

const STATUS_RANK: Record<NotificationDeliveryStatus, number> = {
  NOT_ATTEMPTED: 0,
  QUEUED: 1,
  SUBMITTED: 2,
  ACCEPTED: 3,
  DELIVERED: 4,
  FAILED: -1,
};

const DELIVERED_CALLBACK = new Set(['DELIVERED', 'DELIVERY_ACK', 'READ', 'PLAYED', 'OPENED', 'CLICKED']);
const ACCEPTED_CALLBACK = new Set(['SENT', 'ACCEPTED', 'SERVER_ACK', 'PROCESSED', 'DEFERRED', 'QUEUED']);
const FAILED_CALLBACK = new Set([
  'FAILED',
  'ERROR',
  'BOUNCED',
  'BOUNCE',
  'DROPPED',
  'REJECTED',
  'UNDELIVERABLE',
  'UNDELIVERED',
  'EXPIRED',
  'SPAMREPORT',
]);

function isRetryableHttp(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function resolveNotificationStatus(
  input: ResolveNotificationStatusInput,
): NotificationStatusResolution {
  const { channel, observation } = input;
  const previous = input.previousStatus ?? null;
  const attempt = Math.max(1, input.attempt ?? 1);
  const maxAttempts = Math.max(1, input.maxAttempts ?? 1);
  const attemptsRemain = attempt < maxAttempts;

  const base: NotificationStatusResolution = {
    channel,
    status: 'NOT_ATTEMPTED',
    deliveryConfirmed: false,
    retryScheduled: false,
    duplicate: false,
    outcomeUnknown: false,
    providerMessageId: null,
    detail: null,
  };

  // Status never moves backwards; a late failure never erases an earlier provider acceptance or receipt.
  const keepHigherPrevious = (next: NotificationStatusResolution): NotificationStatusResolution => {
    if (!previous || previous === 'FAILED') return next;
    const isDowngrade =
      next.status === 'FAILED'
        ? previous === 'ACCEPTED' || previous === 'DELIVERED'
        : STATUS_RANK[previous] > STATUS_RANK[next.status];
    if (!isDowngrade) return next;
    return { ...next, status: previous, deliveryConfirmed: previous === 'DELIVERED', retryScheduled: false };
  };

  const failure = (detail: string | null, retryable: boolean, outcomeUnknown = false): NotificationStatusResolution =>
    keepHigherPrevious({
      ...base,
      status: retryable && attemptsRemain ? 'QUEUED' : 'FAILED',
      retryScheduled: retryable && attemptsRemain,
      outcomeUnknown,
      detail,
    });

  switch (observation.kind) {
    case 'NOT_ATTEMPTED':
      return keepHigherPrevious({ ...base, status: 'NOT_ATTEMPTED', detail: observation.reason ?? null });

    case 'ENQUEUED':
      return keepHigherPrevious({ ...base, status: 'QUEUED' });

    case 'HTTP_RESPONSE': {
      const code = observation.httpStatus;
      if (code >= 200 && code < 300) {
        const id = observation.providerMessageId?.trim() || null;
        return keepHigherPrevious({
          ...base,
          status: id ? 'ACCEPTED' : 'SUBMITTED',
          providerMessageId: id,
        });
      }
      return failure(observation.errorMessage ?? `Provider responded with HTTP ${code}`, isRetryableHttp(code));
    }

    case 'NETWORK_ERROR':
      return failure(observation.errorMessage ?? 'Provider unreachable', true, true);

    case 'TIMEOUT':
      return failure(
        `No provider response within ${observation.timeoutMs ?? 'the allotted'} ms`,
        true,
        true,
      );

    case 'PROVIDER_CALLBACK': {
      const s = (observation.providerStatus || '').trim().toUpperCase();
      const id = observation.providerMessageId?.trim() || null;
      if (DELIVERED_CALLBACK.has(s)) {
        return { ...base, status: 'DELIVERED', deliveryConfirmed: true, providerMessageId: id };
      }
      if (FAILED_CALLBACK.has(s)) {
        if (previous === 'DELIVERED') {
          return { ...base, status: 'DELIVERED', deliveryConfirmed: true, providerMessageId: id };
        }
        return { ...base, status: 'FAILED', providerMessageId: id, detail: `Provider reported ${s}` };
      }
      if (ACCEPTED_CALLBACK.has(s)) {
        return keepHigherPrevious({ ...base, status: 'ACCEPTED', providerMessageId: id });
      }
      return keepHigherPrevious({
        ...base,
        status: previous && previous !== 'NOT_ATTEMPTED' ? previous : 'SUBMITTED',
        deliveryConfirmed: previous === 'DELIVERED',
        providerMessageId: id,
        detail: s ? `Unrecognised provider status ${s}` : null,
      });
    }

    case 'DUPLICATE': {
      const kept: NotificationDeliveryStatus = previous && previous !== 'NOT_ATTEMPTED' ? previous : 'SUBMITTED';
      return {
        ...base,
        status: kept,
        deliveryConfirmed: kept === 'DELIVERED',
        duplicate: true,
        providerMessageId: observation.providerMessageId?.trim() || null,
        detail: 'Duplicate dispatch suppressed; no second message was sent',
      };
    }
  }
}

/**
 * Maps legacy/stored notification rows (notifications.status) onto the truthful scale.
 * SENT historically meant "handed to provider", so it maps to ACCEPTED, never DELIVERED.
 */
export function mapStoredNotificationStatus(raw?: string | null): NotificationDeliveryStatus {
  switch ((raw || '').trim().toUpperCase()) {
    case 'CREATED':
    case 'PENDING':
    case 'QUEUED':
      return 'QUEUED';
    case 'DISPATCH_REQUESTED':
    case 'SUBMITTED':
      return 'SUBMITTED';
    case 'PROVIDER_ACCEPTED':
    case 'ACCEPTED':
    case 'SENT':
      return 'ACCEPTED';
    case 'DELIVERED':
    case 'READ':
    case 'OPENED':
    case 'CLAIMED':
      return 'DELIVERED';
    case 'FAILED':
    case 'DEAD_LETTER':
      return 'FAILED';
    case 'UNAVAILABLE':
    case 'NOT_ATTEMPTED':
    default:
      return 'NOT_ATTEMPTED';
  }
}

const CHANNEL_LABEL: Record<NotificationDeliveryChannel, string> = {
  EMAIL: 'email',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  IN_APP: 'in-app',
};

const PURPOSE_NOUN: Record<NotificationPurpose, string> = {
  REGISTRATION: 'registration confirmation',
  VERIFICATION_CODE: 'verification code',
  PASSWORD_RESET: 'password reset message',
  WELCOME: 'welcome message',
  REFERRAL: 'referral message',
  GENERAL: 'message',
};

export const NOTIFICATION_STATUS_LABEL: Record<NotificationDeliveryStatus, string> = {
  NOT_ATTEMPTED: 'Not sent',
  QUEUED: 'Queued',
  SUBMITTED: 'Submitted',
  ACCEPTED: 'Accepted by provider',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
};

export interface NotificationStatusCopy {
  status: NotificationDeliveryStatus;
  label: string;
  message: string;
  tone: 'neutral' | 'info' | 'success' | 'danger';
}

export function describeNotificationStatus(
  resolution: Pick<NotificationStatusResolution, 'status' | 'channel'> &
    Partial<Pick<NotificationStatusResolution, 'retryScheduled' | 'duplicate' | 'outcomeUnknown'>>,
  purpose: NotificationPurpose = 'GENERAL',
): NotificationStatusCopy {
  const ch = CHANNEL_LABEL[resolution.channel];
  const noun = PURPOSE_NOUN[purpose];
  const label = NOTIFICATION_STATUS_LABEL[resolution.status];
  switch (resolution.status) {
    case 'NOT_ATTEMPTED':
      return { status: 'NOT_ATTEMPTED', label, tone: 'neutral', message: `No ${ch} ${noun} was sent.` };
    case 'QUEUED':
      return {
        status: 'QUEUED',
        label,
        tone: 'info',
        message: resolution.retryScheduled
          ? `Your ${ch} ${noun} could not be sent on the first try and is queued for another attempt.`
          : `Your ${ch} ${noun} is queued and has not been sent yet.`,
      };
    case 'SUBMITTED':
      return {
        status: 'SUBMITTED',
        label,
        tone: 'info',
        message: resolution.duplicate
          ? `Your ${ch} ${noun} was already requested, so no second copy was sent. Delivery is not confirmed yet.`
          : `We submitted your ${ch} ${noun}. Delivery is not confirmed yet.`,
      };
    case 'ACCEPTED':
      return {
        status: 'ACCEPTED',
        label,
        tone: 'info',
        message: `The ${ch} provider accepted your ${noun}. Delivery is not confirmed yet.`,
      };
    case 'DELIVERED':
      return {
        status: 'DELIVERED',
        label,
        tone: 'success',
        message: `The ${ch} provider confirmed your ${noun} was delivered.`,
      };
    case 'FAILED':
      return {
        status: 'FAILED',
        label,
        tone: 'danger',
        message: resolution.outcomeUnknown
          ? `We could not confirm that your ${ch} ${noun} was sent. Please try again or use another channel.`
          : `We could not send your ${ch} ${noun}. Please try again or use another channel.`,
      };
  }
}

/** Convenience for the common "one HTTP attempt" case. */
export function resolveHttpDispatch(
  channel: NotificationDeliveryChannel,
  httpStatus: number,
  providerMessageId?: string | null,
): NotificationStatusResolution {
  return resolveNotificationStatus({
    channel,
    observation: { kind: 'HTTP_RESPONSE', httpStatus, providerMessageId },
  });
}
