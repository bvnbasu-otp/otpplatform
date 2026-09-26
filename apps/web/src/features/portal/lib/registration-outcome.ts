import {
  describeNotificationStatus,
  resolveNotificationStatus,
  type NotificationStatusCopy,
  type NotificationStatusResolution,
} from '@otp/domain';
import type { SignupResult } from '../api/signup';

/**
 * What the applicant is told after submitting the registration form.
 *
 * Three facts are kept apart on purpose:
 * 1. the registration record the server created (and whether it is an active account yet),
 * 2. whether a confirmation message was handed to a provider,
 * 3. whether that message was delivered (only a provider receipt can say so).
 */

export const REFERRAL_ATTRIBUTION_NOTE =
  'Referral code recorded for attribution. Referral credit during the controlled pilot is ₹0.';

export type RegistrationAccountState = 'REGISTRATION_CREATED' | 'ACCOUNT_ACTIVE' | 'ALREADY_REGISTERED';

export interface RegistrationOutcome {
  accountState: RegistrationAccountState;
  headline: string;
  body: string;
  reference: string;
  serverStatus: string;
  canSignInNow: boolean;
  notification: NotificationStatusResolution;
  notificationCopy: NotificationStatusCopy;
}

const ACTIVE_SERVER_STATUSES = new Set(['ONBOARDED', 'ACTIVE', 'APPROVED']);

export function deriveRegistrationOutcome(
  result: SignupResult,
  side: 'BUYER' | 'SUPPLIER',
): RegistrationOutcome {
  const serverStatus = (result.status || 'PENDING').toUpperCase();
  const accountState: RegistrationAccountState = result.alreadySubmitted
    ? 'ALREADY_REGISTERED'
    : ACTIVE_SERVER_STATUSES.has(serverStatus)
      ? 'ACCOUNT_ACTIVE'
      : 'REGISTRATION_CREATED';

  const notification =
    result.notification ??
    resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'NOT_ATTEMPTED', reason: 'No confirmation message was requested' },
    });

  const reviewSentence =
    side === 'BUYER'
      ? 'Your account request is pending verification of the organisation you buy for. You can sign in once it is approved.'
      : 'Your account request is pending verification of your business and coverage. You can sign in once it is approved.';

  const headline =
    accountState === 'ALREADY_REGISTERED'
      ? 'We already have this registration'
      : accountState === 'ACCOUNT_ACTIVE'
        ? 'Account created'
        : 'Registration created';

  const body =
    accountState === 'ALREADY_REGISTERED'
      ? 'This email already has a registration under the reference below. No new account was created.'
      : accountState === 'ACCOUNT_ACTIVE'
        ? 'Your account is active. You can sign in now.'
        : `Your registration was saved under the reference below. ${reviewSentence}`;

  return {
    accountState,
    headline,
    body,
    reference: result.reference,
    serverStatus,
    canSignInNow: accountState === 'ACCOUNT_ACTIVE',
    notification,
    notificationCopy: describeNotificationStatus(notification, 'REGISTRATION'),
  };
}
