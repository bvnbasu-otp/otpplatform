/**
 * Tally Prime XML Payment Voucher Generator (Phase 5C.3 & 5C.4)
 * Formats recorded payments, multi-invoice allocations, and statutory TDS withholdings
 * into statutory Tally XML schema with balanced supplier debit, bank credit, TDS credit,
 * bill-by-bill references, and exact paise balancing.
 */

export function escapeXml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TallyPaymentAllocationItem {
  invoiceNumber: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  allocatedAmount: number;
  notes?: string;
}

export interface TallyPaymentVoucherParams {
  voucherNumber?: string;
  paymentId?: string;
  paymentDate: string; // YYYY-MM-DD
  paymentReference?: string | null; // UTR / Cheque / Txn reference
  paymentMethod?: string; // 'BANK_TRANSFER' | 'NEFT' | 'RTGS' | 'UPI' | 'CHEQUE' | 'CASH'
  amount: number; // Net paid through bank
  tdsAmount?: number; // Statutory TDS withheld
  tdsSection?: string; // e.g. "194C", "194Q", "194J"
  tdsLedgerName?: string; // e.g. "TDS Payable - Sec 194C"
  currency?: string;
  bankLedgerName?: string; // e.g. "HDFC Bank Account", "Bank Account", "Petty Cash"
  supplierName: string;
  buyerOrgName?: string;
  poNumber?: string;
  narration?: string;
  allocations?: TallyPaymentAllocationItem[];
  unallocatedAmount?: number;
}

export function exportToTallyPaymentVoucher(
  params: TallyPaymentVoucherParams,
): string {
  const tallyDate = params.paymentDate.replace(/-/g, '');
  const voucherNum = escapeXml(
    params.voucherNumber ||
      params.paymentReference ||
      params.paymentId ||
      'PAYMENT',
  );
  const supplierNameEsc = escapeXml(params.supplierName);
  const bankLedgerEsc = escapeXml(params.bankLedgerName || 'Bank Account');
  const tdsSection = params.tdsSection ? ` Sec ${params.tdsSection}` : '';
  const tdsLedgerEsc = escapeXml(
    params.tdsLedgerName || `TDS Payable${tdsSection}`,
  );
  const poTag = params.poNumber ? ` for PO ${escapeXml(params.poNumber)}` : '';
  const refTag = params.paymentReference
    ? ` (Ref: ${escapeXml(params.paymentReference)})`
    : '';
  const narrationEsc = params.narration
    ? escapeXml(params.narration)
    : `OTP Settlement Payment to ${supplierNameEsc}${poTag}${refTag}`;

  const netPaidAmount = Math.round(Number(params.amount || 0) * 100) / 100;
  const tdsWithheld = Math.round(Number(params.tdsAmount || 0) * 100) / 100;
  const grossSupplierDebit =
    Math.round((netPaidAmount + tdsWithheld) * 100) / 100;

  const formattedNetPaid = netPaidAmount.toFixed(2);
  const formattedGrossDebit = grossSupplierDebit.toFixed(2);
  const formattedTds = tdsWithheld.toFixed(2);

  // Bill-by-bill allocations for Supplier Ledger (Debit)
  const billAllocationsXml: string[] = [];

  if (params.allocations && params.allocations.length > 0) {
    let sumAllocated = 0;
    for (const alloc of params.allocations) {
      const allocAmt =
        Math.round(Number(alloc.allocatedAmount || 0) * 100) / 100;
      if (allocAmt > 0) {
        sumAllocated = Math.round((sumAllocated + allocAmt) * 100) / 100;
        billAllocationsXml.push(
          `              <BILLALLOCATIONS.LIST>`,
          `                <NAME>${escapeXml(alloc.invoiceNumber)}</NAME>`,
          `                <BILLTYPE>Agst Ref</BILLTYPE>`,
          `                <AMOUNT>-${allocAmt.toFixed(2)}</AMOUNT>`,
          `              </BILLALLOCATIONS.LIST>`,
        );
      }
    }

    const unallocated =
      params.unallocatedAmount !== undefined
        ? Math.round(Number(params.unallocatedAmount || 0) * 100) / 100
        : Math.max(0, Math.round((netPaidAmount - sumAllocated) * 100) / 100);

    if (unallocated > 0) {
      const advRef = escapeXml(
        params.paymentReference || params.poNumber || 'Advance',
      );
      billAllocationsXml.push(
        `              <BILLALLOCATIONS.LIST>`,
        `                <NAME>${advRef}</NAME>`,
        `                <BILLTYPE>Advance</BILLTYPE>`,
        `                <AMOUNT>-${unallocated.toFixed(2)}</AMOUNT>`,
        `              </BILLALLOCATIONS.LIST>`,
      );
    }
  } else if (params.unallocatedAmount && params.unallocatedAmount > 0) {
    const advRef = escapeXml(
      params.paymentReference || params.poNumber || 'Advance',
    );
    billAllocationsXml.push(
      `              <BILLALLOCATIONS.LIST>`,
      `                <NAME>${advRef}</NAME>`,
      `                <BILLTYPE>Advance</BILLTYPE>`,
      `                <AMOUNT>-${formattedNetPaid}</AMOUNT>`,
      `              </BILLALLOCATIONS.LIST>`,
    );
  } else {
    // Default On-Account reference
    const onAccountRef = escapeXml(
      params.paymentReference || params.poNumber || 'Payment',
    );
    billAllocationsXml.push(
      `              <BILLALLOCATIONS.LIST>`,
      `                <NAME>${onAccountRef}</NAME>`,
      `                <BILLTYPE>On Account</BILLTYPE>`,
      `                <AMOUNT>-${formattedGrossDebit}</AMOUNT>`,
      `              </BILLALLOCATIONS.LIST>`,
    );
  }

  // Bank allocation metadata
  const isCheque = params.paymentMethod?.toUpperCase() === 'CHEQUE';
  const txnType = isCheque ? 'Cheque' : 'e-Fund Transfer';
  const instrumentNum = escapeXml(params.paymentReference || '');

  // TDS Ledger entry XML if TDS is withheld
  const tdsLedgerEntryXml: string[] =
    tdsWithheld > 0
      ? [
          `            <ALLLEDGERENTRIES.LIST>`,
          `              <LEDGERNAME>${tdsLedgerEsc}</LEDGERNAME>`,
          `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
          `              <AMOUNT>${formattedTds}</AMOUNT>`,
          `            </ALLLEDGERENTRIES.LIST>`,
        ]
      : [];

  return [
    `<ENVELOPE>`,
    `  <HEADER>`,
    `    <TALLYREQUEST>Import Data</TALLYREQUEST>`,
    `  </HEADER>`,
    `  <BODY>`,
    `    <IMPORTDATA>`,
    `      <REQUESTDESC>`,
    `        <REPORTNAME>Vouchers</REPORTNAME>`,
    `      </REQUESTDESC>`,
    `      <REQUESTDATA>`,
    `        <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
    `          <VOUCHER VCHTYPE="Payment" ACTION="Create">`,
    `            <DATE>${tallyDate}</DATE>`,
    `            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>`,
    `            <VOUCHERNUMBER>${voucherNum}</VOUCHERNUMBER>`,
    `            <PARTYLEDGERNAME>${supplierNameEsc}</PARTYLEDGERNAME>`,
    `            <PARTYNAME>${supplierNameEsc}</PARTYNAME>`,
    `            <NARRATION>${narrationEsc}</NARRATION>`,
    `            <ALLLEDGERENTRIES.LIST>`,
    `              <LEDGERNAME>${supplierNameEsc}</LEDGERNAME>`,
    `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
    `              <AMOUNT>-${formattedGrossDebit}</AMOUNT>`,
    ...billAllocationsXml,
    `            </ALLLEDGERENTRIES.LIST>`,
    `            <ALLLEDGERENTRIES.LIST>`,
    `              <LEDGERNAME>${bankLedgerEsc}</LEDGERNAME>`,
    `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
    `              <AMOUNT>${formattedNetPaid}</AMOUNT>`,
    `              <BANKALLOCATIONS.LIST>`,
    `                <TRANSACTIONTYPE>${txnType}</TRANSACTIONTYPE>`,
    `                <INSTRUMENTNUMBER>${instrumentNum}</INSTRUMENTNUMBER>`,
    `                <AMOUNT>${formattedNetPaid}</AMOUNT>`,
    `              </BANKALLOCATIONS.LIST>`,
    `            </ALLLEDGERENTRIES.LIST>`,
    ...tdsLedgerEntryXml,
    `          </VOUCHER>`,
    `        </TALLYMESSAGE>`,
    `      </REQUESTDATA>`,
    `    </IMPORTDATA>`,
    `  </BODY>`,
    `</ENVELOPE>`,
  ].join('\n');
}
