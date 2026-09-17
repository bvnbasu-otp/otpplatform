import { describe, expect, it } from 'vitest';
import { exportToTallyXml, type AccountingOrderPayload } from './tally-xml-exporter';
import { exportToZohoInvoice } from './zoho-json-exporter';

describe('Accounting & ERP Exports (Tally XML & Zoho Books JSON)', () => {
  const intraStateOrder: AccountingOrderPayload = {
    poNumber: 'PO-2026-BLR-0049',
    orderDate: '2026-09-10',
    buyerOrgName: 'Sunrise Residency Owners Association',
    buyerGstin: '29ABCDE1234F1Z5',
    supplierName: 'Metro Coating Solutions Pvt Ltd',
    supplierGstin: '29AABCT3518Q1ZV',
    category: 'Painting & Waterproofing',
    baseAmount: 420000,
    gstAmount: 75600,
    cgstAmount: 37800,
    sgstAmount: 37800,
    totalAmount: 495600,
    placeOfSupplyStateCode: '29',
    hsnOrSac: '995473',
  };

  const interStateOrder: AccountingOrderPayload = {
    poNumber: 'PO-2026-MUM-0088',
    orderDate: '2026-09-15',
    buyerOrgName: 'Bengaluru Tech Park Phase 2',
    buyerGstin: '29ABCDE1234F1Z5',
    supplierName: 'Maharashtra Industrial Pumps Ltd',
    supplierGstin: '27AABCT3518Q1ZV',
    category: 'Pumps & Motors',
    baseAmount: 500000,
    gstAmount: 90000,
    igstAmount: 90000,
    totalAmount: 590000,
    placeOfSupplyStateCode: '29',
    isInterState: true,
    hsnOrSac: '8413',
  };

  const utgstOrder: AccountingOrderPayload = {
    poNumber: 'PO-2026-CHD-0012',
    orderDate: '2026-09-16',
    buyerOrgName: 'Chandigarh Solar Cooperative',
    buyerGstin: '04AAAAA0000A1Z5',
    supplierName: 'Chandigarh Clean Energy Pvt Ltd',
    supplierGstin: '04BBBBB2222B2Z2',
    category: 'Solar Energy',
    baseAmount: 200000,
    gstAmount: 36000,
    cgstAmount: 18000,
    utgstAmount: 18000,
    totalAmount: 236000,
    placeOfSupplyStateCode: '04',
    isUnionTerritory: true,
    hsnOrSac: '854140',
  };

  it('generates valid Tally Prime XML with split Input CGST & SGST ledgers for Intra-State', () => {
    const xml = exportToTallyXml(intraStateOrder);

    expect(xml).toContain('<VOUCHER VCHTYPE="Purchase Order" ACTION="Create">');
    expect(xml).toContain('<VOUCHERNUMBER>PO-2026-BLR-0049</VOUCHERNUMBER>');
    expect(xml).toContain('<PARTYNAME>Metro Coating Solutions Pvt Ltd</PARTYNAME>');
    expect(xml).toContain('<LEDGERNAME>Painting & Waterproofing Expense</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>-420000.00</AMOUNT>');
    expect(xml).toContain('<LEDGERNAME>Input CGST</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>-37800.00</AMOUNT>');
    expect(xml).toContain('<LEDGERNAME>Input SGST</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>-37800.00</AMOUNT>');
    expect(xml).toContain('<AMOUNT>495600.00</AMOUNT>');
    expect(xml).toContain('[HSN/SAC: 995473]');
    expect(xml).toContain('[POS: State 29]');
  });

  it('generates valid Tally Prime XML with Input IGST ledger for Inter-State', () => {
    const xml = exportToTallyXml(interStateOrder);

    expect(xml).toContain('<LEDGERNAME>Input IGST</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>-90000.00</AMOUNT>');
    expect(xml).not.toContain('<LEDGERNAME>Input CGST</LEDGERNAME>');
    expect(xml).not.toContain('<LEDGERNAME>Input SGST</LEDGERNAME>');
  });

  it('generates valid Tally Prime XML with Input UTGST ledger for Intra-UT', () => {
    const xml = exportToTallyXml(utgstOrder);

    expect(xml).toContain('<LEDGERNAME>Input CGST</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>-18000.00</AMOUNT>');
    expect(xml).toContain('<LEDGERNAME>Input UTGST</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>-18000.00</AMOUNT>');
    expect(xml).not.toContain('<LEDGERNAME>Input SGST</LEDGERNAME>');
    expect(xml).not.toContain('<LEDGERNAME>Input IGST</LEDGERNAME>');
  });

  it('generates valid Zoho Books invoice payload with HSN/SAC and tax splitting', () => {
    const zoho = exportToZohoInvoice(intraStateOrder);

    expect(zoho.customer_name).toBe('Sunrise Residency Owners Association');
    expect(zoho.gst_no).toBe('29ABCDE1234F1Z5');
    expect(zoho.place_of_supply).toBe('29');
    expect(zoho.invoice_number).toBe('PO-2026-BLR-0049');
    expect(zoho.line_items[0]?.rate).toBe(420000);
    expect(zoho.line_items[0]?.hsn_or_sac).toBe('995473');
    expect(zoho.cgst_total).toBe(37800);
    expect(zoho.sgst_total).toBe(37800);
  });
});
