import type { AccountingOrderPayload } from './tally-xml-exporter';

export interface ZohoLineItem {
  name: string;
  description: string;
  hsn_or_sac?: string;
  rate: number;
  quantity: number;
  taxable_amount?: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  utgst_rate?: number;
  utgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  item_total: number;
}

export interface ZohoInvoicePayload {
  customer_name: string;
  gst_no?: string;
  place_of_supply?: string;
  invoice_number: string;
  date: string;
  line_items: ZohoLineItem[];
  cgst_total?: number;
  sgst_total?: number;
  utgst_total?: number;
  igst_total?: number;
  total?: number;
  notes: string;
  terms: string;
}

export function exportToZohoInvoice(order: AccountingOrderPayload): ZohoInvoicePayload {
  let lineItems: ZohoLineItem[];

  if (order.lineItems && order.lineItems.length > 0) {
    lineItems = order.lineItems.map((li) => ({
      name: li.name,
      description: li.description,
      hsn_or_sac: li.hsnOrSac || order.hsnOrSac || undefined,
      rate: li.rate,
      quantity: li.quantity,
      taxable_amount: li.taxableAmount,
      cgst_rate: li.cgstRate,
      cgst_amount: li.cgstAmount,
      sgst_rate: li.sgstRate,
      sgst_amount: li.sgstAmount,
      utgst_rate: li.utgstRate,
      utgst_amount: li.utgstAmount,
      igst_rate: li.igstRate,
      igst_amount: li.igstAmount,
      item_total: li.itemTotal,
    }));
  } else {
    lineItems = [
      {
        name: order.category,
        description: `Procurement fulfillment for ${order.category}`,
        hsn_or_sac: order.hsnOrSac || undefined,
        rate: order.baseAmount,
        quantity: 1,
        taxable_amount: order.baseAmount,
        cgst_amount: order.cgstAmount,
        sgst_amount: order.sgstAmount,
        utgst_amount: order.utgstAmount,
        igst_amount: order.igstAmount,
        item_total: order.baseAmount,
      },
    ];
  }

  return {
    customer_name: order.buyerOrgName,
    gst_no: order.buyerGstin,
    place_of_supply: order.placeOfSupplyStateCode,
    invoice_number: order.poNumber,
    date: order.orderDate,
    line_items: lineItems,
    cgst_total: order.cgstAmount,
    sgst_total: order.sgstAmount,
    utgst_total: order.utgstAmount,
    igst_total: order.igstAmount,
    total: order.totalAmount,
    notes: `Generated via OTP Identity-Protected Procurement Platform. Ref: ${order.poNumber}`,
    terms: 'Payment due on milestone delivery inspection sign-off.',
  };
}
