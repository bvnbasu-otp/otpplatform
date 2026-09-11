export type DrillDownMetric =
  | 'TOTAL_SPEND'
  | 'SETTLED_PAID'
  | 'ACTIVE_COMMITMENTS'
  | 'CANCELLED_EXITS'
  | 'DISPUTED_ORDERS'
  | 'QUOTING_SAVINGS'
  | 'GROSS_REVENUE'
  | 'ON_TIME_PERF'
  | 'APPROVED_SPEND'
  | 'QUORUM_RATE'
  | 'AUDITED_VOLUME'
  | 'COMPLIANCE_SCORE'
  | null;

export interface QuotingSavingsItem {
  rfqId: string;
  title: string;
  category: string;
  highestQuote: number;
  averageQuote: number;
  awardedQuote: number;
  savingsAmount: number;
  savingsPercent: number;
}
