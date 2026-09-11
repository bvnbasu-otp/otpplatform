import type { AccountingOrderPayload } from './tally-xml-exporter';

export interface ZohoInvoicePayload {
  customer_name: string;
  gst_no?: string;
  invoice_number: string;
  date: string;
  line_items: Array<{
    name: string;
    description: string;
    rate: number;
    quantity: number;
    item_total: number;
  }>;
  notes: string;
  terms: string;
}

export function exportToZohoInvoice(order: AccountingOrderPayload): ZohoInvoicePayload {
  return {
    customer_name: order.buyerOrgName,
    gst_no: order.buyerGstin,
    invoice_number: order.poNumber,
    date: order.orderDate,
    line_items: [
      {
        name: order.category,
        description: `Procurement fulfillment for ${order.category}`,
        rate: order.baseAmount,
        quantity: 1,
        item_total: order.baseAmount,
      },
    ],
    notes: `Generated via OTP Identity-Protected Procurement Platform. Ref: ${order.poNumber}`,
    terms: 'Payment due on milestone delivery inspection sign-off.',
  };
}
