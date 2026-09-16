import React from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { EvaluationDecisionCockpit } from '../components/EvaluationDecisionCockpit';
import { getPilotByRfqId } from '@/lib/pilots';

function sanitizeRouteParam(raw: string | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim();
  if (
    !decoded ||
    decoded === ':rfqId' ||
    decoded === 'undefined' ||
    decoded === 'null' ||
    decoded === '[id]'
  ) {
    return null;
  }
  return decoded;
}

export function EvaluationDecisionCockpitPage({
  rfqId: propRfqId,
  rfqTitle: propRfqTitle,
}: {
  rfqId?: string;
  rfqTitle?: string;
}) {
  const params = useParams<{ rfqId: string }>();
  const [searchParams] = useSearchParams();
  const rawId = propRfqId || params.rfqId;
  const rfqId = sanitizeRouteParam(rawId);

  if (!rfqId) {
    return <Navigate to="/dashboard" replace />;
  }

  const tabParam = searchParams.get('tab');
  const initialTab: 'matrix' | 'vote' | 'award' =
    tabParam === 'vote' || tabParam === 'ballot'
      ? 'vote'
      : tabParam === 'award' || tabParam === 'reveal'
      ? 'award'
      : 'matrix';

  const pilot = getPilotByRfqId(rfqId);
  const effectiveTitle =
    propRfqTitle || (pilot ? `RFQ: ${pilot.requirementTitle}` : undefined);

  return (
    <EvaluationDecisionCockpit
      rfqId={rfqId}
      rfqTitle={effectiveTitle}
      initialTab={initialTab}
    />
  );
}
