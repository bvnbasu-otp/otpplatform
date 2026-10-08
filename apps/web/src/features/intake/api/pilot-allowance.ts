import {
  countRfqsInUtcCalendarMonth,
  countUtcCalendarQuarterBonusUsed,
  evaluatePilotRfqAllowance,
  getCalendarQuarterWindow,
  type PilotRfqAllowance,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';

/**
 * Allowance for an organisation: RFQs it published in the current UTC calendar
 * quarter, evaluated by the shared domain rule against the stored subscription
 * plan. The dashboard label and the intake publish gate both call this, so
 * they cannot disagree. The plan is read from organizations. There is no
 * client-supplied plan argument.
 */
export async function fetchPilotAllowance(
  organizationId: string,
  now: Date = new Date(),
): Promise<{ ok: true; allowance: PilotRfqAllowance } | { ok: false; error: string }> {
  const quarter = getCalendarQuarterWindow(now);
  const [rfqResult, orgResult] = await Promise.all([
    supabase
      .from('rfqs')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', quarter.startIso)
      .lte('created_at', quarter.endIso),
    supabase
      .from('organizations')
      .select('subscription_plan, subscription_status, subscription_expires_at, org_type')
      .eq('id', organizationId)
      .maybeSingle(),
  ]);

  if (rfqResult.error || !Array.isArray(rfqResult.data)) {
    return { ok: false, error: 'Could not load pilot allowance' };
  }
  if (orgResult.error || !orgResult.data) {
    return { ok: false, error: 'Could not load pilot allowance' };
  }

  const createdAts: string[] = [];
  for (const row of rfqResult.data) {
    const createdAt = (row as { created_at?: unknown }).created_at;
    if (typeof createdAt !== 'string' || createdAt.trim() === '') {
      return { ok: false, error: 'Could not load pilot allowance' };
    }
    createdAts.push(createdAt);
  }

  try {
    return {
      ok: true,
      allowance: evaluatePilotRfqAllowance({
        rfqsPublishedThisMonth: countRfqsInUtcCalendarMonth(createdAts, now),
        quarterlyBonusUsedInCurrentQuarter: countUtcCalendarQuarterBonusUsed(createdAts, now),
        storedSubscriptionPlan: orgResult.data.subscription_plan,
        subscriptionStatus: orgResult.data.subscription_status,
        subscriptionExpiresAt: orgResult.data.subscription_expires_at,
        orgType: orgResult.data.org_type,
        now,
      }),
    };
  } catch {
    return { ok: false, error: 'Could not load pilot allowance' };
  }
}

export const PILOT_ALLOWANCE_EXHAUSTED_ERROR =
  'You have used all RFQs in this month\'s pilot allowance. It resets on the 1st of next month.';

export const PILOT_ALLOWANCE_UNVERIFIED_ERROR =
  'We could not verify your pilot RFQ allowance. Please check your connection and try again.';

/** Publish gate. Fails closed: an unreadable count or plan does not let a publish through. */
export async function checkPilotAllowanceBeforePublish(
  organizationId: string | null | undefined,
  now: Date = new Date(),
): Promise<{ ok: true; allowance: PilotRfqAllowance | null } | { ok: false; error: string }> {
  if (!organizationId) return { ok: true, allowance: null };
  const res = await fetchPilotAllowance(organizationId, now);
  if (!res.ok) return { ok: false, error: PILOT_ALLOWANCE_UNVERIFIED_ERROR };
  if (!res.allowance.canPublish) {
    return { ok: false, error: `${res.allowance.label}. ${PILOT_ALLOWANCE_EXHAUSTED_ERROR}` };
  }
  return { ok: true, allowance: res.allowance };
}
