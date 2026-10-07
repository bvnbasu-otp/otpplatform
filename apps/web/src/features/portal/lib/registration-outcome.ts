import {
  describeNotificationStatus,
  resolveNotificationStatus,
  type NotificationStatusCopy,
  type NotificationStatusResolution,
} from '@otp/domain';
import type { SignupResult, VerificationChannel } from '../api/signup';

/**
 * What the applicant is told after submitting the registration form.
 *
 * Three facts are kept apart on purpose:
 * 1. the registration record the server created (and whether it is an active account yet),
 * 2. whether a confirmation message was handed to a provider,
 * 3. whether that message was delivered (only a provider receipt can say so).
 */

export const REFERRAL_ATTRIBUTION_NOTE =
  'Referral code recorded for attribution. Referral credit during the pilot is ₹0.';

export type RegistrationAccountState =
  | 'REGISTRATION_CREATED'
  | 'AUTH_SETUP_PENDING'
  | 'ACCOUNT_ACTIVE'
  | 'ALREADY_REGISTERED';

export interface RegistrationOutcome {
  accountState: RegistrationAccountState;
  headline: string;
  body: string;
  reference: string;
  /** Raw status returned by the registration row. Not shown when auth is still pending. */
  serverStatus: string;
  /** What the applicant is shown. A registration row is not labelled ONBOARDED while sign-in is pending. */
  statusLabel: string;
  canSignInNow: boolean;
  notification: NotificationStatusResolution;
  notificationCopy: NotificationStatusCopy;
}

const ACTIVE_SERVER_STATUSES = new Set(['ONBOARDED', 'ACTIVE', 'APPROVED']);

function pendingStatusLabel(result: SignupResult, notification: NotificationStatusResolution): string {
  const channel = result.verificationChannel ?? 'WHATSAPP';
  if (notification.status === 'FAILED') {
    return channel === 'EMAIL' ? 'BLOCKED — EMAIL NOT DELIVERED' : 'BLOCKED — CONFIRMATION NOT DELIVERED';
  }
  if (channel === 'EMAIL') return 'PENDING EMAIL';
  return 'AUTH SETUP PENDING';
}

function pendingBody(result: SignupResult, notification: NotificationStatusResolution): string {
  const channel = result.verificationChannel ?? 'WHATSAPP';
  const saved = 'Your registration was saved under the reference below.';
  if (channel === 'EMAIL' && notification.status === 'FAILED') {
    return `${saved} The sign-in email could not be delivered, so password sign-in is blocked. This account is pending, not onboarded. Use Forgot password on the sign-in screen to request that email again. Sending the request is not proof the message arrived.`;
  }
  if (channel === 'EMAIL') {
    return `${saved} Email confirmation is pending and delivery is not confirmed. Password sign-in is not ready until that email is delivered and you finish setting a password. This account is pending, not onboarded.`;
  }
  if (notification.status === 'FAILED') {
    return `${saved} The confirmation message could not be delivered, so sign-in is blocked. This account is pending, not onboarded.`;
  }
  if (notification.status === 'NOT_ATTEMPTED') {
    return `${saved} No confirmation message was sent, so auth setup is still pending and sign-in is not ready.`;
  }
  return `${saved} Auth setup is pending. The confirmation was not confirmed as delivered, so sign-in is not ready.`;
}

export function deriveRegistrationOutcome(
  result: SignupResult,
  side: 'BUYER' | 'SUPPLIER',
): RegistrationOutcome {
  const serverStatus = (result.status || 'PENDING').toUpperCase();
  const verificationChannel: VerificationChannel = result.verificationChannel ?? 'WHATSAPP';

  const notification =
    result.notification ??
    resolveNotificationStatus({
      channel: verificationChannel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP',
      observation: { kind: 'NOT_ATTEMPTED', reason: 'No confirmation message was requested' },
    });

  // A registration row — including one stored as ONBOARDED or one whose
  // message was delivered — is not authentication-ready. Password sign-in
  // still has to be finished by the applicant. This screen does not
  // auto-confirm the user.
  const serverClaimsRecord = ACTIVE_SERVER_STATUSES.has(serverStatus);
  const accountState: RegistrationAccountState = result.alreadySubmitted
    ? 'ALREADY_REGISTERED'
    : serverClaimsRecord
      ? 'AUTH_SETUP_PENDING'
      : 'REGISTRATION_CREATED';

  const reviewSentence =
    side === 'BUYER'
      ? 'Your account request is pending verification of the organisation you buy for. You can sign in once it is approved.'
      : 'Your account request is pending verification of your business and coverage. You can sign in once it is approved.';

  const headline =
    accountState === 'ALREADY_REGISTERED'
      ? 'We already have this registration'
      : accountState === 'AUTH_SETUP_PENDING'
        ? notification.status === 'FAILED'
          ? 'Sign-in is blocked'
          : 'Auth setup pending'
        : 'Registration created';

  const body =
    accountState === 'ALREADY_REGISTERED'
      ? 'This email already has a registration under the reference below. No new account was created.'
      : accountState === 'AUTH_SETUP_PENDING'
        ? pendingBody(result, notification)
        : `Your registration was saved under the reference below. ${reviewSentence}`;

  return {
    accountState,
    headline,
    body,
    reference: result.reference,
    serverStatus,
    statusLabel: accountState === 'AUTH_SETUP_PENDING' ? pendingStatusLabel(result, notification) : serverStatus,
    canSignInNow: false,
    notification,
    notificationCopy: describeNotificationStatus(
      notification,
      verificationChannel === 'EMAIL' ? 'PASSWORD_RESET' : 'REGISTRATION',
    ),
  };
}
