import { useCallback, useEffect, useState } from 'react';
import type { IdentityProtectedQuote } from '@otp/domain';
import { fetchIdentityProtectedQuotes } from '../api/fetch-identity-protected-quotes';
import { ensureSimulatedQuotesForRfq } from '../api/simulate-quotes';

export function useIdentityProtectedQuotes(rfqId: string) {
  const [quotes, setQuotes] = useState<IdentityProtectedQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let result = await fetchIdentityProtectedQuotes(rfqId);
    if (result.ok && result.quotes.length === 0 && rfqId) {
      await ensureSimulatedQuotesForRfq(rfqId);
      result = await fetchIdentityProtectedQuotes(rfqId);
    }

    if (result.ok) {
      setQuotes(result.quotes);
    } else {
      setQuotes([]);
      setError(result.error);
    }
    setIsLoading(false);
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { quotes, isLoading, error, refresh: load };
}

// Legacy alias
export const useBlindQuotes = useIdentityProtectedQuotes;
