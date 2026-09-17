/**
 * Tally Prime XML Export Generator
 * Formats approved purchase orders and invoices into statutory Tally XML schema
 * with split Input CGST / SGST / UTGST / IGST ledger accounts and HSN/SAC codes.
 */

export interface AccountingLineItemPayload {
  name: string;
  description: string;
  hsnOrSac?: string | null;
  rate: number;
  quantity: number;
  taxableAmount?: number;
  gstRate?: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  itemTotal: number;
}

export interface AccountingOrderPayload {
  poNumber: string;
  orderDate: string; // YYYY-MM-DD
  buyerOrgName: string;
  buyerGstin?: string;
  supplierName: string;
  supplierGstin?: string;
  category: string;
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
  currency?: string;
  // Phase 5B Statutory GST Splitting Attributes
  placeOfSupplyStateCode?: string;
  placeOfSupplyBasis?: string;
  isInterState?: boolean;
  isUnionTerritory?: boolean;
  cgstAmount?: number;
  sgstAmount?: number;
  utgstAmount?: number;
  igstAmount?: number;
  hsnOrSac?: string | null;
  lineItems?: AccountingLineItemPayload[];
}

export function exportToTallyXml(order: AccountingOrderPayload): string {
  const tallyDate = order.orderDate.replace(/-/g, '');
  const hasSplitGst =
    (order.cgstAmount != null && order.cgstAmount > 0) ||
    (order.sgstAmount != null && order.sgstAmount > 0) ||
    (order.utgstAmount != null && order.utgstAmount > 0) ||
    (order.igstAmount != null && order.igstAmount > 0);

  const gstLedgerEntries: string[] = [];

  if (hasSplitGst) {
    if (order.cgstAmount && order.cgstAmount > 0) {
      gstLedgerEntries.push(
        `            <ALLLEDGERENTRIES.LIST>`,
        `              <LEDGERNAME>Input CGST</LEDGERNAME>`,
        `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `              <AMOUNT>-${order.cgstAmount.toFixed(2)}</AMOUNT>`,
        `            </ALLLEDGERENTRIES.LIST>`,
      );
    }
    if (order.sgstAmount && order.sgstAmount > 0) {
      gstLedgerEntries.push(
        `            <ALLLEDGERENTRIES.LIST>`,
        `              <LEDGERNAME>Input SGST</LEDGERNAME>`,
        `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `              <AMOUNT>-${order.sgstAmount.toFixed(2)}</AMOUNT>`,
        `            </ALLLEDGERENTRIES.LIST>`,
      );
    }
    if (order.utgstAmount && order.utgstAmount > 0) {
      gstLedgerEntries.push(
        `            <ALLLEDGERENTRIES.LIST>`,
        `              <LEDGERNAME>Input UTGST</LEDGERNAME>`,
        `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `              <AMOUNT>-${order.utgstAmount.toFixed(2)}</AMOUNT>`,
        `            </ALLLEDGERENTRIES.LIST>`,
      );
    }
    if (order.igstAmount && order.igstAmount > 0) {
      gstLedgerEntries.push(
        `            <ALLLEDGERENTRIES.LIST>`,
        `              <LEDGERNAME>Input IGST</LEDGERNAME>`,
        `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
        `              <AMOUNT>-${order.igstAmount.toFixed(2)}</AMOUNT>`,
        `            </ALLLEDGERENTRIES.LIST>`,
      );
    }
  } else if (order.gstAmount > 0) {
    // Backward compatibility fallback
    gstLedgerEntries.push(
      `            <ALLLEDGERENTRIES.LIST>`,
      `              <LEDGERNAME>Input GST</LEDGERNAME>`,
      `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
      `              <AMOUNT>-${order.gstAmount.toFixed(2)}</AMOUNT>`,
      `            </ALLLEDGERENTRIES.LIST>`,
    );
  }

  const hsnTag = order.hsnOrSac ? ` [HSN/SAC: ${order.hsnOrSac}]` : '';
  const posTag = order.placeOfSupplyStateCode ? ` [POS: State ${order.placeOfSupplyStateCode}]` : '';

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
    `          <VOUCHER VCHTYPE="Purchase Order" ACTION="Create">`,
    `            <DATE>${tallyDate}</DATE>`,
    `            <VOUCHERNUMBER>${order.poNumber}</VOUCHERNUMBER>`,
    `            <PARTYLEDGERNAME>${order.supplierName}</PARTYLEDGERNAME>`,
    `            <PARTYNAME>${order.supplierName}</PARTYNAME>`,
    `            <NARRATION>OTP Platform Sourcing PO ${order.poNumber} for ${order.category}${hsnTag}${posTag}</NARRATION>`,
    `            <ALLLEDGERENTRIES.LIST>`,
    `              <LEDGERNAME>${order.category} Expense</LEDGERNAME>`,
    `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
    `              <AMOUNT>-${order.baseAmount.toFixed(2)}</AMOUNT>`,
    `            </ALLLEDGERENTRIES.LIST>`,
    ...gstLedgerEntries,
    `            <ALLLEDGERENTRIES.LIST>`,
    `              <LEDGERNAME>${order.supplierName}</LEDGERNAME>`,
    `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`,
    `              <AMOUNT>${order.totalAmount.toFixed(2)}</AMOUNT>`,
    `            </ALLLEDGERENTRIES.LIST>`,
    `          </VOUCHER>`,
    `        </TALLYMESSAGE>`,
    `      </REQUESTDATA>`,
    `    </IMPORTDATA>`,
    `  </BODY>`,
    `</ENVELOPE>`,
  ].join('\n');
}
