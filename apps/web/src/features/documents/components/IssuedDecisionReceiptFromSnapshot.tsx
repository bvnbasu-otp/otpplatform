import { useEffect, useState } from 'react';
import type { CanonicalDecisionReceipt } from '@otp/domain';
import { DecisionReceiptCard } from '@/features/reveal/components/DecisionReceiptCard';
import { fetchActiveIssuedSnapshotForSource } from '../api/fetch-issued-document-snapshot';
import { canonicalReceiptFromIssuedSnapshot } from '../lib/issued-snapshot-render';

export interface IssuedDecisionReceiptFromSnapshotProps {
  organizationId: string;
  awardId: string;
  identityState: 'PRE_REVEAL' | 'POST_REVEAL';
  perspective?: 'BUYER' | 'SUPPLIER';
  collapsible?: boolean;
}

/**
 * Renders the institutional decision receipt from stored snapshot payload (not live award tables).
 */
export function IssuedDecisionReceiptFromSnapshot({
  organizationId,
  awardId,
  identityState,
  perspective = 'BUYER',
  collapsible = false,
}: IssuedDecisionReceiptFromSnapshotProps) {
  const [receipt, setReceipt] = useState<CanonicalDecisionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await fetchActiveIssuedSnapshotForSource({
        organizationId,
        documentKind: 'DECISION_RECEIPT',
        sourceEntityType: 'AWARD',
        sourceEntityId: awardId,
        identityState,
        perspective,
      });
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        setReceipt(null);
        return;
      }
      if (!res.snapshot) {
        setError('Issued decision receipt not found');
        setReceipt(null);
        return;
      }
      setError(null);
      setReceipt(canonicalReceiptFromIssuedSnapshot(res.snapshot));
    })();
    return () => {
      active = false;
    };
  }, [organizationId, awardId, identityState, perspective]);

  if (error) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
        {error}
      </section>
    );
  }
  if (!receipt) return null;
  return (
    <div data-testid="issued-decision-receipt-snapshot">
      <DecisionReceiptCard receipt={receipt} collapsible={collapsible} />
    </div>
  );
}
