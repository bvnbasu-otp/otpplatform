import { useEffect, useState } from 'react';
import type { PilotRfqAllowance } from '@otp/domain';
import { fetchPilotAllowance } from '../api/pilot-allowance';

export function usePilotAllowance(organizationId: string | null | undefined): PilotRfqAllowance | null {
  const [allowance, setAllowance] = useState<PilotRfqAllowance | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setAllowance(null);
      return;
    }
    let cancelled = false;
    void fetchPilotAllowance(organizationId).then((res) => {
      if (!cancelled) setAllowance(res.ok ? res.allowance : null);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return allowance;
}
