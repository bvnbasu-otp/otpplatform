import React from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { EvaluationDecisionCockpit, type CockpitTab } from '../components/EvaluationDecisionCockpit';
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

export interface EvaluationDecisionCockpitPageProps {
  rfqId?: string;
  rfqTitle?: string;
  initialTab?: CockpitTab;
}

export function EvaluationDecisionCockpitPage({
  rfqId: propRfqId,
  rfqTitle: propRfqTitle,
  initialTab: propInitialTab,
}: EvaluationDecisionCockpitPageProps) {
  const params = useParams<{ rfqId: string }>();
  const [searchParams] = useSearchParams();
  const rawId = propRfqId || params.rfqId;
  const rfqId = sanitizeRouteParam(rawId);

  if (!rfqId) {
    return <Navigate to="/dashboard" replace />;
  }

  const tabParam = searchParams.get('tab')?.toLowerCase();
  const resolvedTab: CockpitTab = propInitialTab
    ? propInitialTab
    : tabParam === 'qa' || tabParam === 'clarification' || tabParam === 'q&a' || tabParam === 'questions'
    ? 'qa'
    : tabParam === 'vote' || tabParam === 'ballot' || tabParam === 'committee'
    ? 'vote'
    : tabParam === 'award' || tabParam === 'decision' || tabParam === 'reveal'
    ? 'award'
    : 'quotes';

  const pilot = getPilotByRfqId(rfqId);
  const effectiveTitle =
    propRfqTitle || (pilot ? `RFQ: ${pilot.requirementTitle}` : undefined);

  return (
    <EvaluationDecisionCockpit
      rfqId={rfqId}
      rfqTitle={effectiveTitle}
      initialTab={resolvedTab}
    />
  );
}
