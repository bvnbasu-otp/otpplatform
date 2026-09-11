import { supabase } from '@/lib/supabase';
import type { RfqPhase } from '../types/phase';

/**
 * Reading and setting an enquiry's schedule.
 *
 * Both go through RPCs rather than reading rfqs directly, and not only for
 * authorization. `rfq_phase` answers "is this window over" against the database
 * clock, and `set_rfq_schedule` validates the three dates together — a revision
 * deadline before the quote deadline is refused as one decision rather than accepted
 * as two saves that were each fine on their own.
 */

export async function fetchRfqPhase(
  rfqId: string,
): Promise<{ ok: true; phase: RfqPhase } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('rfq_phase', { p_rfq_id: rfqId });

  if (error) return { ok: false, error: error.message };
  return { ok: true, phase: data as RfqPhase };
}

export interface ScheduleChange {
  quoteDeadline?: string | null;
  revisionDeadline?: string | null;
  evaluationDeadline?: string | null;
}

export async function setRfqSchedule(
  rfqId: string,
  change: ScheduleChange,
): Promise<{ ok: true; phase: RfqPhase } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('set_rfq_schedule', {
    p_rfq_id: rfqId,
    // Undefined means "leave this one alone", which the RPC reads as NULL and
    // coalesces to the current value. Sending an empty string instead would ask
    // it to clear a deadline nobody meant to clear.
    p_bid_deadline: change.quoteDeadline ?? null,
    p_revision_deadline: change.revisionDeadline ?? null,
    p_evaluation_deadline: change.evaluationDeadline ?? null,
  });

  if (error) return { ok: false, error: humanizeScheduleError(error.message) };
  return { ok: true, phase: data as RfqPhase };
}

/**
 * The refusals a buyer will actually hit, in the terms they were thinking in.
 *
 * The database messages are already written for people, so most pass through. The
 * two worth rewording are the ordering rules, because the buyer is looking at
 * three date pickers and needs to know which one to move.
 */
export function humanizeScheduleError(message: string): string {
  if (/revision deadline cannot be before the quote deadline/i.test(message)) {
    return 'The revision window has to end after quoting closes. Move the revision deadline later, or quoting earlier.';
  }
  if (/voting deadline cannot be before/i.test(message)) {
    return 'Voting has to end after quoting closes. Move the voting deadline later.';
  }
  if (/finished/i.test(message)) {
    return 'This enquiry is finished, so its schedule can no longer change.';
  }
  return message;
}
