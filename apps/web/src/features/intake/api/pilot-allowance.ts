import { evaluatePilotRfqAllowance, type PilotRfqAllowance } from '@otp/domain';
import { supabase } from '@/lib/supabase';

/**
 * Buyer-facing allowance. The database function get_buyer_pilot_allowance is
 * the source for included monthly use, the quarterly bonus, and unexpired
 * purchased extra-RFQ credits. This module only formats that result. Publishing
 * does not consume an allowance, and a failed lookup does not open the gate.
 */
type AllowancePayload = {
  ok?: unknown;
  includedAndBonusUsedThisMonth?: unknown;
  quarterlyBonusUsed?: unknown;
  purchasedCredits?: unknown;
  subscriptionPlan?: unknown;
  subscriptionStatus?: unknown;
  subscriptionExpiresAt?: unknown;
  orgType?: unknown;
  canAcceptNextQuote?: unknown;
};

function wholeCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export async function fetchPilotAllowance(
  organizationId: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; allowance: PilotRfqAllowance } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('get_buyer_pilot_allowance', {
    p_organization_id: organizationId,
  });
  if (error || !data || typeof data !== 'object') {
    return { ok: false, error: 'Could not load pilot allowance' };
  }

  const payload = data as AllowancePayload;
  const includedAndBonusUsedThisMonth = wholeCount(payload.includedAndBonusUsedThisMonth);
  const quarterlyBonusUsed = wholeCount(payload.quarterlyBonusUsed);
  const purchasedCredits = wholeCount(payload.purchasedCredits);
  if (
    payload.ok !== true
    || includedAndBonusUsedThisMonth === null
    || quarterlyBonusUsed === null
    || purchasedCredits === null
    || typeof payload.canAcceptNextQuote !== 'boolean'
  ) {
    return { ok: false, error: 'Could not load pilot allowance' };
  }

  try {
    const allowance = evaluatePilotRfqAllowance({
      rfqsPublishedThisMonth: includedAndBonusUsedThisMonth,
      quarterlyBonusUsedInCurrentQuarter: quarterlyBonusUsed,
      additionalPurchasedCredits: purchasedCredits,
      storedSubscriptionPlan: optionalText(payload.subscriptionPlan),
      subscriptionStatus: optionalText(payload.subscriptionStatus),
      subscriptionExpiresAt: optionalText(payload.subscriptionExpiresAt),
      orgType: optionalText(payload.orgType),
      now,
    });
    return {
      ok: true,
      allowance: { ...allowance, canPublish: payload.canAcceptNextQuote },
    };
  } catch {
    return { ok: false, error: 'Could not load pilot allowance' };
  }
}

export const PILOT_ALLOWANCE_EXHAUSTED_ERROR =
  'You have used all RFQs in this month\'s pilot allowance. It resets on the 1st of next month.';

export const PILOT_ALLOWANCE_UNVERIFIED_ERROR =
  'We could not verify your pilot RFQ allowance. Please check your connection and try again.';

/** Publish gate. Fails closed when the authoritative entitlement result is missing or incomplete. */
export async function checkPilotAllowanceBeforePublish(
  organizationId: string | null | undefined,
  now: Date = new Date(),
): Promise<{ ok: true; allowance: PilotRfqAllowance } | { ok: false; error: string }> {
  const res = await fetchPilotAllowance(organizationId ?? null, now);
  if (!res.ok) return { ok: false, error: PILOT_ALLOWANCE_UNVERIFIED_ERROR };
  if (!res.allowance.canPublish) {
    return { ok: false, error: `${res.allowance.label}. ${PILOT_ALLOWANCE_EXHAUSTED_ERROR}` };
  }
  return { ok: true, allowance: res.allowance };
}
