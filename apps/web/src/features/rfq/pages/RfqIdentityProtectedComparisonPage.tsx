import React from 'react';
import { EvaluationDecisionCockpit } from '@/features/evaluation/components/EvaluationDecisionCockpit';

export interface RfqIdentityProtectedComparisonPageProps {
  rfqId: string;
  rfqTitle?: string;
  initialTab?: 'matrix' | 'vote' | 'award';
}

// Legacy alias
export type RfqBlindComparisonPageProps = RfqIdentityProtectedComparisonPageProps;

export function RfqIdentityProtectedComparisonPage({
  rfqId,
  rfqTitle,
  initialTab = 'matrix',
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
