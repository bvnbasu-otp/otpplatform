import { useEffect, useState } from 'react';
import type { PilotRfqAllowance } from '@otp/domain';
import { fetchPilotAllowance } from '../api/pilot-allowance';

export type PilotAllowanceLoadStatus = 'loading' | 'ready' | 'unavailable';

export function usePilotAllowance(organizationId: string | null | undefined): {
  allowance: PilotRfqAllowance | null;
  status: PilotAllowanceLoadStatus;
} {
  const [allowance, setAllowance] = useState<PilotRfqAllowance | null>(null);
  const [status, setStatus] = useState<PilotAllowanceLoadStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setAllowance(null);
    void fetchPilotAllowance(organizationId ?? null).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setAllowance(res.allowance);
        setStatus('ready');
      } else {
        setAllowance(null);
        setStatus('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { allowance, status };
}
