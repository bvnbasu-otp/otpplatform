export type PeriodType = 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

export type UserReportingRole = 'buyer' | 'supplier' | 'approver' | 'auditor';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

export interface CategorySpendSummary {
  category: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

export interface StatusSpendSummary {
  status: string;
  label: string;
  count: number;
  totalAmount: number;
}

export interface PeriodReportingSummary {
  periodType: PeriodType;
  dateRange: DateRange;
  role: UserReportingRole;
  totalAmount: number;
  totalOrdersCount: number;
  settledAmount: number;
  settledOrdersCount: number;
  activeAmount: number;
  activeOrdersCount: number;
  cancelledAmount: number;
  cancelledOrdersCount: number;
  disputedAmount: number;
  disputedOrdersCount: number;
  averageOrderValue: number;
  estimatedSavings: number;
  onTimeDeliveryRate: number;
  complianceScorePercent: number;
  categoryBreakdown: CategorySpendSummary[];
  statusBreakdown: StatusSpendSummary[];
}
