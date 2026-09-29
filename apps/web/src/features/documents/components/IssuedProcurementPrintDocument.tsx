import { useEffect, useRef, useState } from 'react';
import { PrintableProcurementDocument } from '@/features/reporting/components/PrintableProcurementDocument';
import type { ProcurementDocumentModel } from '@/features/reporting/lib/procurement-document';
import { fetchActiveIssuedSnapshotForSource } from '../api/fetch-issued-document-snapshot';
import { buildPrintModelFromIssuedSnapshot } from '../lib/issued-snapshot-render';

export interface IssuedProcurementPrintDocumentProps {
  organizationId: string;
  documentKind: 'DECISION_RECEIPT' | 'PURCHASE_ORDER' | 'TAX_INVOICE';
  sourceEntityType: 'AWARD' | 'PURCHASE_ORDER' | 'INVOICE';
  sourceEntityId: string;
  identityState: 'PRE_REVEAL' | 'POST_REVEAL';
  perspective: 'BUYER' | 'SUPPLIER';
  /** Fallback when no issued snapshot exists (legacy rows). */
  fallbackModel?: ProcurementDocumentModel | null;
}

/**
 * Authoritative print layer: renders from frozen issued_document_snapshots when present.
 */
export function IssuedProcurementPrintDocument({
  organizationId,
  documentKind,
  sourceEntityType,
  sourceEntityId,
  identityState,
  perspective,
  fallbackModel = null,
}: IssuedProcurementPrintDocumentProps) {
  const [model, setModel] = useState<ProcurementDocumentModel | null>(null);
  const fallbackRef = useRef(fallbackModel);
  fallbackRef.current = fallbackModel;

  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await fetchActiveIssuedSnapshotForSource({
        organizationId,
        documentKind,
        sourceEntityType,
        sourceEntityId,
        identityState,
        perspective,
      });
      if (!active) return;
      if (res.ok && res.snapshot) {
        setModel(buildPrintModelFromIssuedSnapshot(res.snapshot));
        return;
      }
      setModel(fallbackRef.current);
    })();
    return () => {
      active = false;
    };
  }, [organizationId, documentKind, sourceEntityType, sourceEntityId, identityState, perspective]);

  if (!model) return null;
  return <PrintableProcurementDocument model={model} />;
}
