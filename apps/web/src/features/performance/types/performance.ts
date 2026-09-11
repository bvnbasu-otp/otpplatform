export interface PerformanceRecord {
  id: string;
  supplierId: string;
  rfqId: string;
  organizationId: string;
  quotedTotal: number;
  actualTotal: number | null;
  quotedDeliveryDays: number;
  actualDeliveryDays: number | null;
  qualityRating: number | null;
  variance: Record<string, unknown> | null;
  recordedAt: string;
}

export function formatDeliveryDelta(quoted: number, actual: number | null): string {
  if (actual == null) return '—';
  const delta = actual - quoted;
  if (delta === 0) return 'On time';
  if (delta < 0) return `${Math.abs(delta)} day(s) early`;
  return `${delta} day(s) late`;
}
