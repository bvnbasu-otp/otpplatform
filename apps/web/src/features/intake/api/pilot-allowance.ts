import {
  evaluatePilotRfqAllowance,
  getCalendarMonthWindow,
  type PilotRfqAllowance,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';

/**
 * Pilot allowance for an organisation: RFQs it published in the current UTC
 * calendar month, evaluated by the shared domain rule. The dashboard label and
 * the intake publish gate both call this, so they cannot disagree.
 */
export async function fetchPilotAllowance(
  organizationId: string,
  now: Date = new Date(),
): Promise<{ ok: true; allowance: PilotRfqAllowance } | { ok: false; error: string }> {
  const month = getCalendarMonthWindow(now);
  const { count, error } = await supabase
    .from('rfqs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', month.startIso)
    .lte('created_at', month.endIso);

  if (error) return { ok: false, error: error.message || 'Could not load pilot allowance' };
  if (typeof count !== 'number') return { ok: false, error: 'Could not load pilot allowance' };

  return { ok: true, allowance: evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: count, now }) };
}

export const PILOT_ALLOWANCE_EXHAUSTED_ERROR =
  'You have used all RFQs in this month\'s pilot allowance. It resets on the 1st of next month.';

export const PILOT_ALLOWANCE_UNVERIFIED_ERROR =
  'We could not verify your pilot RFQ allowance. Please check your connection and try again.';

/** Publish gate. Fails closed: an unreadable count does not let a publish through. */
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
