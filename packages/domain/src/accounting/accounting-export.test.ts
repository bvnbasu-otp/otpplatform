import { describe, expect, it } from 'vitest';
import { exportToTallyXml, type AccountingOrderPayload } from './tally-xml-exporter';
import { exportToZohoInvoice } from './zoho-json-exporter';

describe('Accounting & ERP Exports (Tally XML & Zoho Books JSON)', () => {
  const sampleOrder: AccountingOrderPayload = {
    poNumber: 'PO-2026-BLR-0049',
    orderDate: '2026-09-10',
    buyerOrgName: 'Sunrise Residency Owners Association',
    buyerGstin: '29ABCDE1234F1Z5',
    supplierName: 'Metro Coating Solutions Pvt Ltd',
    supplierGstin: '27AABCT3518Q1ZV',
    category: 'Painting & Waterproofing',
    baseAmount: 420000,
    gstAmount: 75600,
    totalAmount: 495600,
  };

  it('generates valid Tally Prime XML with balanced ledger debits and credits', () => {
    const xml = exportToTallyXml(sampleOrder);

    expect(xml).toContain('<VOUCHER VCHTYPE="Purchase Order" ACTION="Create">');
    expect(xml).toContain('<VOUCHERNUMBER>PO-2026-BLR-0049</VOUCHERNUMBER>');
    expect(xml).toContain('<PARTYNAME>Metro Coating Solutions Pvt Ltd</PARTYNAME>');
    expect(xml).toContain('<AMOUNT>-420000.00</AMOUNT>');
    expect(xml).toContain('<AMOUNT>-75600.00</AMOUNT>');
    expect(xml).toContain('<AMOUNT>495600.00</AMOUNT>');
  });

  it('generates valid Zoho Books invoice line items payload', () => {
    const zoho = exportToZohoInvoice(sampleOrder);

    expect(zoho.customer_name).toBe('Sunrise Residency Owners Association');
    expect(zoho.invoice_number).toBe('PO-2026-BLR-0049');
    expect(zoho.line_items[0].rate).toBe(420000);
    expect(zoho.line_items[0].name).toBe('Painting & Waterproofing');
  });
});
