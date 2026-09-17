/**
 * Zoho Books Payment Receipt / Vendor Payment Export Generator (Phase 5C.3, 5C.4 & 5C.5)
 * Formats recorded payments, UTRs, invoice allocations, statutory TDS withholdings,
 * and OTP platform fees into Zoho Books JSON payload.
 */

export interface ZohoPaymentAllocationItem {
  invoiceNumber: string;
  invoiceId?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  allocatedAmount: number;
  notes?: string;
}

export interface ZohoPaymentReceiptParams {
  paymentId?: string;
  receiptNumber?: string;
  paymentDate: string; // YYYY-MM-DD
  paymentReference?: string | null; // UTR / Cheque / Txn reference
  paymentMode?: string; // 'Bank Transfer' | 'UPI' | 'Check' | 'Cash' | 'Credit Card'
  amount: number; // Net paid amount
  tdsAmount?: number; // Statutory TDS withheld
  tdsSection?: string; // e.g. "194C"
  tdsTaxAccountName?: string; // e.g. "TDS Payable"
  platformFeeAmount?: number; // Platform fee deducted
  platformFeeAccountName?: string; // e.g. "OTP Platform Fee Expense" / "Platform Fee Deduction"
  currency?: string;
  bankAccountName?: string; // e.g. "Petty Cash", "HDFC Bank", "Undeposited Funds"
  supplierName: string;
  buyerOrgName?: string;
  poNumber?: string;
  description?: string;
  allocations?: ZohoPaymentAllocationItem[];
  unallocatedAmount?: number;
}

export interface ZohoPaymentBillAllocation {
  bill_number: string;
  amount_applied: number;
  bill_id?: string;
  bill_date?: string;
  total_amount?: number;
}

export interface ZohoPaymentReceiptPayload {
  vendor_name: string;
  customer_name: string;
  payment_mode: string;
  date: string;
  reference_number: string;
  amount: number;
  paid_through_account_name: string;
  tds_amount?: number;
  tds_section?: string;
  tds_tax_account?: string;
  platform_fee_amount?: number;
  platform_fee_account?: string;
  bills: ZohoPaymentBillAllocation[];
  excess_amount: number;
  description: string;
}

export function exportToZohoPaymentReceipt(
  params: ZohoPaymentReceiptParams,
): ZohoPaymentReceiptPayload {
  const totalAmount = Math.round(Number(params.amount || 0) * 100) / 100;
  const tdsAmount = params.tdsAmount
    ? Math.round(Number(params.tdsAmount) * 100) / 100
    : undefined;
  const platformFeeAmount = params.platformFeeAmount
    ? Math.round(Number(params.platformFeeAmount) * 100) / 100
    : undefined;

  let sumAllocated = 0;

  const bills: ZohoPaymentBillAllocation[] = (params.allocations || []).map(
    (alloc) => {
      const allocAmt =
        Math.round(Number(alloc.allocatedAmount || 0) * 100) / 100;
      sumAllocated = Math.round((sumAllocated + allocAmt) * 100) / 100;
      return {
        bill_number: alloc.invoiceNumber,
        amount_applied: allocAmt,
        bill_id: alloc.invoiceId,
        bill_date: alloc.invoiceDate,
        total_amount: alloc.invoiceAmount,
      };
    },
  );

  const excessAmount =
    params.unallocatedAmount !== undefined
      ? Math.round(Number(params.unallocatedAmount || 0) * 100) / 100
      : Math.max(0, Math.round((totalAmount - sumAllocated) * 100) / 100);

  const poRef = params.poNumber ? ` for PO ${params.poNumber}` : '';
  const refNum = params.paymentReference || '';
  const tdsInfo = tdsAmount ? ` (TDS Withheld: ₹${tdsAmount.toFixed(2)})` : '';
  const feeInfo = platformFeeAmount
    ? ` (Platform Fee: ₹${platformFeeAmount.toFixed(2)})`
    : '';
  const defaultDesc = `Settlement payment of ₹${totalAmount.toFixed(2)} to ${params.supplierName}${poRef}${refNum ? ` (Ref: ${refNum})` : ''}${tdsInfo}${feeInfo}`;

  return {
    vendor_name: params.supplierName,
    customer_name: params.buyerOrgName || 'Organization',
    payment_mode: params.paymentMode || 'Bank Transfer',
    date: params.paymentDate,
    reference_number: refNum,
    amount: totalAmount,
    paid_through_account_name: params.bankAccountName || 'Bank Account',
    tds_amount: tdsAmount,
    tds_section: params.tdsSection,
    tds_tax_account: params.tdsTaxAccountName || (tdsAmount ? 'TDS Payable' : undefined),
    platform_fee_amount: platformFeeAmount,
    platform_fee_account:
      params.platformFeeAccountName ||
      (platformFeeAmount ? 'OTP Platform Fee Deduction' : undefined),
    bills,
    excess_amount: excessAmount,
    description: params.description || defaultDesc,
  };
}
