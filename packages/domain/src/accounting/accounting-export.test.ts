import { describe, expect, it } from 'vitest';
import { exportToTallyXml, type AccountingOrderPayload } from './tally-xml-exporter';
import { exportToZohoInvoice } from './zoho-json-exporter';
import { exportToTallyPaymentVoucher, escapeXml, type TallyPaymentVoucherParams } from './tally-payment-voucher';
import { exportToZohoPaymentReceipt, type ZohoPaymentReceiptParams } from './zoho-payment-receipt';

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

describe('Phase 5C.3 Dual-Rail ERP Payment Voucher Exporters', () => {
  describe('XML Escaping Helper', () => {
    it('escapes XML special characters strictly (&, <, >, ", \')', () => {
      expect(escapeXml('A & B < C > "D" \'E\'')).toBe('A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;');
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
    });
  });

  describe('Tally Prime Payment Voucher XML Exporter', () => {
    it('generates valid, balanced Tally XML payment voucher with multi-invoice bill-by-bill allocations', () => {
      const voucherParams: TallyPaymentVoucherParams = {
        voucherNumber: 'PAY-2026-0091',
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-HDFC-99128301',
        paymentMethod: 'NEFT',
        amount: 250000,
        bankLedgerName: 'HDFC Bank Operating Account',
        supplierName: 'Apex & Sons Engineering <Pvt> "Ltd"',
        buyerOrgName: 'Skyline Towers RWA',
        poNumber: 'PO-2026-SKY-010',
        allocations: [
          { invoiceNumber: 'INV-2026-01', allocatedAmount: 150000 },
          { invoiceNumber: 'INV-2026-02', allocatedAmount: 100000 },
        ],
      };

      const xml = exportToTallyPaymentVoucher(voucherParams);

      expect(xml).toContain('<VOUCHER VCHTYPE="Payment" ACTION="Create">');
      expect(xml).toContain('<DATE>20260917</DATE>');
      expect(xml).toContain('<VOUCHERNUMBER>PAY-2026-0091</VOUCHERNUMBER>');
      // Strict XML escaping
      expect(xml).toContain('<PARTYNAME>Apex &amp; Sons Engineering &lt;Pvt&gt; &quot;Ltd&quot;</PARTYNAME>');
      expect(xml).toContain('<LEDGERNAME>Apex &amp; Sons Engineering &lt;Pvt&gt; &quot;Ltd&quot;</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-250000.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');

      // Bill allocations
      expect(xml).toContain('<NAME>INV-2026-01</NAME>');
      expect(xml).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
      expect(xml).toContain('<AMOUNT>-150000.00</AMOUNT>');

      expect(xml).toContain('<NAME>INV-2026-02</NAME>');
      expect(xml).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
      expect(xml).toContain('<AMOUNT>-100000.00</AMOUNT>');

      // Credit Bank entry
      expect(xml).toContain('<LEDGERNAME>HDFC Bank Operating Account</LEDGERNAME>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      expect(xml).toContain('<AMOUNT>250000.00</AMOUNT>');
      expect(xml).toContain('<TRANSACTIONTYPE>e-Fund Transfer</TRANSACTIONTYPE>');
      expect(xml).toContain('<INSTRUMENTNUMBER>UTR-HDFC-99128301</INSTRUMENTNUMBER>');
    });

    it('generates Tally XML with Advance bill allocation when unallocated portion exists', () => {
      const voucherParams: TallyPaymentVoucherParams = {
        voucherNumber: 'PAY-ADV-001',
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-ICICI-881920',
        paymentMethod: 'RTGS',
        amount: 300000,
        bankLedgerName: 'ICICI Bank Current A/c',
        supplierName: 'Bharat Infrastructure Corp',
        poNumber: 'PO-2026-042',
        allocations: [
          { invoiceNumber: 'INV-001', allocatedAmount: 200000 },
        ],
        unallocatedAmount: 100000,
      };

      const xml = exportToTallyPaymentVoucher(voucherParams);

      expect(xml).toContain('<NAME>INV-001</NAME>');
      expect(xml).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
      expect(xml).toContain('<AMOUNT>-200000.00</AMOUNT>');

      expect(xml).toContain('<NAME>UTR-ICICI-881920</NAME>');
      expect(xml).toContain('<BILLTYPE>Advance</BILLTYPE>');
      expect(xml).toContain('<AMOUNT>-100000.00</AMOUNT>');
    });

    it('supports Cheque payment method and On-Account allocation fallback', () => {
      const voucherParams: TallyPaymentVoucherParams = {
        paymentDate: '2026-09-17',
        paymentReference: 'CHQ-550192',
        paymentMethod: 'CHEQUE',
        amount: 50000,
        supplierName: 'Local Maintenance Services',
      };

      const xml = exportToTallyPaymentVoucher(voucherParams);

      expect(xml).toContain('<TRANSACTIONTYPE>Cheque</TRANSACTIONTYPE>');
      expect(xml).toContain('<INSTRUMENTNUMBER>CHQ-550192</INSTRUMENTNUMBER>');
      expect(xml).toContain('<BILLTYPE>On Account</BILLTYPE>');
      expect(xml).toContain('<AMOUNT>-50000.00</AMOUNT>');
    });
  });

  describe('Zoho Books Payment Receipt JSON Exporter', () => {
    it('generates valid Zoho Books payment receipt payload with bill allocations', () => {
      const params: ZohoPaymentReceiptParams = {
        paymentId: 'pay-uuid-001',
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-AXIS-992019',
        paymentMode: 'Bank Transfer',
        amount: 150000,
        bankAccountName: 'Axis Bank - 9912',
        supplierName: 'Precision Tools Pvt Ltd',
        buyerOrgName: 'Greenwood Society',
        poNumber: 'PO-2026-GW-003',
        allocations: [
          { invoiceNumber: 'INV-101', invoiceId: 'inv-uuid-1', invoiceAmount: 100000, allocatedAmount: 100000 },
          { invoiceNumber: 'INV-102', invoiceId: 'inv-uuid-2', invoiceAmount: 80000, allocatedAmount: 50000 },
        ],
      };

      const payload = exportToZohoPaymentReceipt(params);

      expect(payload.vendor_name).toBe('Precision Tools Pvt Ltd');
      expect(payload.customer_name).toBe('Greenwood Society');
      expect(payload.date).toBe('2026-09-17');
      expect(payload.reference_number).toBe('UTR-AXIS-992019');
      expect(payload.amount).toBe(150000);
      expect(payload.paid_through_account_name).toBe('Axis Bank - 9912');
      expect(payload.bills).toHaveLength(2);
      expect(payload.bills[0]).toEqual({
        bill_number: 'INV-101',
        bill_id: 'inv-uuid-1',
        bill_date: undefined,
        total_amount: 100000,
        amount_applied: 100000,
      });
      expect(payload.bills[1]).toEqual({
        bill_number: 'INV-102',
        bill_id: 'inv-uuid-2',
        bill_date: undefined,
        total_amount: 80000,
        amount_applied: 50000,
      });
      expect(payload.excess_amount).toBe(0);
      expect(payload.description).toContain('PO-2026-GW-003');
    });

    it('handles advance/excess unallocated amount correctly in Zoho Books payload', () => {
      const params: ZohoPaymentReceiptParams = {
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-SBI-001928',
        amount: 200000,
        supplierName: 'Southern Steel Traders',
        allocations: [
          { invoiceNumber: 'INV-201', allocatedAmount: 120000 },
        ],
        unallocatedAmount: 80000,
      };

      const payload = exportToZohoPaymentReceipt(params);
      expect(payload.amount).toBe(200000);
      expect(payload.excess_amount).toBe(80000);
      expect(payload.bills).toHaveLength(1);
      expect(payload.bills[0]?.amount_applied).toBe(120000);
    });

    it('generates Tally XML with TDS withholding maintaining exact debit and credit balance (RED-20)', () => {
      const voucherParams: TallyPaymentVoucherParams = {
        voucherNumber: 'PAY-TDS-001',
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-HDFC-882200',
        paymentMethod: 'NEFT',
        amount: 98000, // Net paid
        tdsAmount: 2000, // 2% TDS on ₹1,00,000 gross
        tdsSection: '194C',
        supplierName: 'Delta Works Pvt Ltd',
        bankLedgerName: 'HDFC Current A/c',
        allocations: [{ invoiceNumber: 'INV-2026-99', allocatedAmount: 98000 }],
      };

      const xml = exportToTallyPaymentVoucher(voucherParams);

      // Supplier debited with Gross amount (-100000.00)
      expect(xml).toContain('<PARTYNAME>Delta Works Pvt Ltd</PARTYNAME>');
      expect(xml).toContain('<AMOUNT>-100000.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');

      // Bank credited with Net amount (98000.00)
      expect(xml).toContain('<LEDGERNAME>HDFC Current A/c</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>98000.00</AMOUNT>');

      // TDS Payable credited with TDS amount (2000.00)
      expect(xml).toContain('<LEDGERNAME>TDS Payable Sec 194C</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>2000.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
    });

    it('includes TDS fields in Zoho Books payment receipt payload', () => {
      const params: ZohoPaymentReceiptParams = {
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-AXIS-991122',
        amount: 98000,
        tdsAmount: 2000,
        tdsSection: '194C',
        supplierName: 'Delta Works Pvt Ltd',
        allocations: [{ invoiceNumber: 'INV-2026-99', allocatedAmount: 98000 }],
      };

      const payload = exportToZohoPaymentReceipt(params);
      expect(payload.amount).toBe(98000);
      expect(payload.tds_amount).toBe(2000);
      expect(payload.tds_section).toBe('194C');
      expect(payload.tds_tax_account).toBe('TDS Payable');
      expect(payload.description).toContain('TDS Withheld: ₹2000.00');
    });

    it('generates Tally XML with platform fee and TDS maintaining exact debit and credit balance (Phase 5C.5)', () => {
      const voucherParams: TallyPaymentVoucherParams = {
        voucherNumber: 'PAY-5C5-001',
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-HDFC-995511',
        paymentMethod: 'NEFT',
        amount: 292500, // Net paid through bank
        tdsAmount: 6000, // 2% TDS on ₹3,00,000
        tdsSection: '194C',
        platformFeeAmount: 1500, // 0.5% Platform Fee
        supplierName: 'Apex Precision Engineering Ltd',
        bankLedgerName: 'HDFC Current A/c',
        allocations: [{ invoiceNumber: 'INV-2026-5C5', allocatedAmount: 292500 }],
      };

      const xml = exportToTallyPaymentVoucher(voucherParams);

      // Supplier debited with Gross amount (292500 + 6000 + 1500 = 300000.00)
      expect(xml).toContain('<PARTYNAME>Apex Precision Engineering Ltd</PARTYNAME>');
      expect(xml).toContain('<AMOUNT>-300000.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');

      // Bank credited with Net amount (292500.00)
      expect(xml).toContain('<LEDGERNAME>HDFC Current A/c</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>292500.00</AMOUNT>');

      // TDS credited with TDS amount (6000.00)
      expect(xml).toContain('<LEDGERNAME>TDS Payable Sec 194C</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>6000.00</AMOUNT>');

      // Platform Fee credited with Fee amount (1500.00)
      expect(xml).toContain('<LEDGERNAME>OTP Platform Fee Deduction</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>1500.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
    });

    it('includes platform fee in Zoho Books payment receipt payload (Phase 5C.5)', () => {
      const params: ZohoPaymentReceiptParams = {
        paymentDate: '2026-09-17',
        paymentReference: 'UTR-AXIS-883311',
        amount: 292500,
        tdsAmount: 6000,
        tdsSection: '194C',
        platformFeeAmount: 1500,
        supplierName: 'Apex Precision Engineering Ltd',
        allocations: [{ invoiceNumber: 'INV-2026-5C5', allocatedAmount: 292500 }],
      };

      const payload = exportToZohoPaymentReceipt(params);
      expect(payload.amount).toBe(292500);
      expect(payload.tds_amount).toBe(6000);
      expect(payload.platform_fee_amount).toBe(1500);
      expect(payload.platform_fee_account).toBe('OTP Platform Fee Deduction');
      expect(payload.description).toContain('Platform Fee: ₹1500.00');
    });
  });
});
