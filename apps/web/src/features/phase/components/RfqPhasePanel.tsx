import { useCallback, useEffect, useState } from 'react';
import { useRoleContext } from '@/features/roles';
import { can } from '@/features/roles/api/roles';
import { fetchRfqPhase } from '../api/phase';
import type { RfqPhase } from '../types/phase';
import { PhaseTimeline } from './PhaseTimeline';
import { ScheduleEditor } from './ScheduleEditor';

interface RfqPhasePanelProps {
  rfqId: string;
  /** A supplier is told why they cannot quote; a buyer is offered the schedule. */
  side: 'BUYER' | 'SUPPLIER';
}

/**
 * The phase panel a page drops in.
 *
 * Refetched on a timer rather than counted down in the browser, for the same reason
 * the countdown is computed server-side: the interesting moment is when the window
 * actually closes, and the browser is not the authority on when that is.
 */
export function RfqPhasePanel({ rfqId, side }: RfqPhasePanelProps) {
  const { context } = useRoleContext();
  const [phase, setPhase] = useState<RfqPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchRfqPhase(rfqId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setPhase(result.phase);
  }, [rfqId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Phase information is unavailable: {error}
      </p>
    );
  }

  if (!phase) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Loading phase…
      </p>
    );
  }

  const mayOfferSchedule = side === 'BUYER' && can(context, 'WRITE');

  return (
    <PhaseTimeline phase={phase} showQuotingNotice={side === 'SUPPLIER'}>
      {mayOfferSchedule && <ScheduleEditor phase={phase} onChanged={setPhase} />}
    </PhaseTimeline>
  );
}
