import { supabase } from '@/lib/supabase';
import type {
  InvoiceStatus,
  PaymentStatus,
  PurchaseOrderStatus,
  RequirementStatus,
  RfqRevealStatus,
  RfqStatus,
  WorkOrderStatus,
} from '@otp/domain';
import type { LifecycleSignals } from '../types/lifecycle';

/**
 * Walks the golden-path chain for one RFQ: rfq → requirement → PO → work order
 * → invoice → payment. Each link is optional; a missing row leaves that stage
 * pending rather than failing the whole tracker.
 */
export async function fetchLifecycleSignals(rfqId: string): Promise<
  { ok: true; signals: LifecycleSignals } | { ok: false; error: string }
> {
  const { data: rfq, error: rfqError } = await supabase
    .from('rfqs')
    .select('status, reveal_status, requirement_id')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqError) return { ok: false, error: rfqError.message };
  if (!rfq) return { ok: false, error: 'RFQ not found' };

  const signals: LifecycleSignals = {
    rfqStatus: rfq.status as RfqStatus,
    revealStatus: rfq.reveal_status as RfqRevealStatus,
  };

  const [{ data: requirement }, { data: po }] = await Promise.all([
    supabase
      .from('requirements')
      .select('status')
      .eq('id', rfq.requirement_id)
      .maybeSingle(),
    supabase
      .from('purchase_orders')
      .select('id, status')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  signals.requirementStatus = (requirement?.status as RequirementStatus) ?? null;

  if (!po) return { ok: true, signals };
  signals.poStatus = po.status as PurchaseOrderStatus;

  const { data: workOrder } = await supabase
    .from('work_orders')
    .select('id, status, progress_percent')
    .eq('purchase_order_id', po.id)
    .maybeSingle();

  if (!workOrder) return { ok: true, signals };
  signals.workOrderStatus = workOrder.status as WorkOrderStatus;
  signals.workOrderProgressPercent =
    workOrder.progress_percent != null ? Number(workOrder.progress_percent) : null;

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('work_order_id', workOrder.id)
    .maybeSingle();

  if (!invoice) return { ok: true, signals };
  signals.invoiceStatus = invoice.status as InvoiceStatus;

  const { data: payment } = await supabase
    .from('payments')
    .select('status')
    .eq('invoice_id', invoice.id)
    .maybeSingle();

  signals.paymentStatus = (payment?.status as PaymentStatus) ?? null;

  return { ok: true, signals };
}
