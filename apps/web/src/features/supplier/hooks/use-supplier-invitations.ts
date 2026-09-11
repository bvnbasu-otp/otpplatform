import { useCallback, useEffect, useState } from 'react';
import { fetchSupplierInvitations } from '../api/fetch-invitations';
import type { SupplierInvitation } from '../types/supplier-quote';

export function useSupplierInvitations() {
  const [invitations, setInvitations] = useState<SupplierInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await fetchSupplierInvitations();
    if (result.ok) {
      setInvitations(result.invitations);
    } else {
      setInvitations([]);
      setError(result.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { invitations, isLoading, error, refresh: load };
}
