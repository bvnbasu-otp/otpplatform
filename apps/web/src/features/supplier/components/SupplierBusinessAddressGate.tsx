import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useRoleContext } from '@/features/roles';
import { isInternalOperatorContext } from '@/features/roles/customer-procurement-access';
import { fetchSupplierBusinessAddress } from '../api/business-address';
import { SupplierBusinessAddressPanel } from './SupplierBusinessAddressPanel';

/**
 * Supplier workspace routes stay behind a complete operating address.
 * Award-onboarding token routes live outside this layout. Profile stays
 * reachable so the same form can be edited there. Buyer routes are unchanged.
 */
export function SupplierBusinessAddressGate({ children }: { children: ReactNode }) {
  const { context } = useRoleContext();
  const { pathname } = useLocation();
  const supplierId = context.supplierId;
  const isSupplier = context.side === 'SUPPLIER' && !isInternalOperatorContext(context);
  const allowedPath =
    pathname.startsWith('/profile') || pathname.startsWith('/supplier/award-onboarding');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'required' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isSupplier) {
      setPhase('idle');
      return;
    }
    if (!supplierId) {
      setPhase('required');
      setError('This account is not linked to a supplier business profile.');
      return;
    }
    let cancelled = false;
    setPhase('loading');
    void fetchSupplierBusinessAddress(supplierId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setPhase('error');
        return;
      }
      setError(null);
      setPhase(result.snapshot.complete ? 'ready' : 'required');
    });
    return () => {
      cancelled = true;
    };
  }, [isSupplier, supplierId, revision]);

  if (!isSupplier || allowedPath || phase === 'ready') {
    return <>{children}</>;
  }

  if (phase === 'loading' || phase === 'idle') {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground" role="status" data-testid="supplier-business-address-loading">
        Checking the business address…
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-4" data-testid="supplier-business-address-gate">
      {error && phase === 'error' && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      <SupplierBusinessAddressPanel
        supplierId={supplierId}
        mode="gate"
        onSaved={() => setRevision((value) => value + 1)}
      />
    </div>
  );
}
