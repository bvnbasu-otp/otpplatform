import React from 'react';
import { EvaluationDecisionCockpit, type CockpitTab } from '@/features/evaluation/components/EvaluationDecisionCockpit';

export interface RfqIdentityProtectedComparisonPageProps {
  rfqId: string;
  rfqTitle?: string;
  initialTab?: CockpitTab | 'matrix' | 'clarification' | 'committee' | 'ballot' | 'decision' | 'reveal';
}

// Legacy alias
export type RfqBlindComparisonPageProps = RfqIdentityProtectedComparisonPageProps;

export function RfqIdentityProtectedComparisonPage({
  rfqId,
  rfqTitle,
  initialTab = 'quotes',
}: RfqIdentityProtectedComparisonPageProps) {
  return (
    <EvaluationDecisionCockpit
      rfqId={rfqId}
      rfqTitle={rfqTitle}
      initialTab={initialTab}
    />
  );
}

// Legacy alias
export const RfqBlindComparisonPage = RfqIdentityProtectedComparisonPage;
