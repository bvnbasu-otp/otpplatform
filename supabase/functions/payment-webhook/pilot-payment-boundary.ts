/**
 * Pilot boundary for the payment webhook.
 *
 * Supplier purchase-order payments are recorded by the buyer through
 * record_invoice_payment_atomic. The webhook may activate a subscription.
 * It must not create or alter procurement invoice payment evidence.
 */
export interface PilotWebhookDisposition {
  /** Call record_verified_payment for a subscription only. */
  recordSubscription: boolean;
  /** Always false during the pilot. Procurement invoices stay off-platform. */
  recordProcurementInvoice: false;
  reason?: string;
}

export function pilotWebhookDisposition(input: {
  paymentType?: string | null;
}): PilotWebhookDisposition {
  if ((input.paymentType ?? '').toUpperCase() === 'INVOICE') {
    return {
      recordSubscription: false,
      recordProcurementInvoice: false,
      reason:
        'Procurement invoices are not settled by the payment webhook. Buyers record off-platform payment evidence on the purchase order.',
    };
  }
  return { recordSubscription: true, recordProcurementInvoice: false };
}
