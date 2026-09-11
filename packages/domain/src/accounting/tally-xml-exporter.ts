/**
 * Tally Prime XML Export Generator
 * Formats approved purchase orders and invoices into Tally XML schema.
 */

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
}

export function exportToTallyXml(order: AccountingOrderPayload): string {
  const tallyDate = order.orderDate.replace(/-/g, '');

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
    `            <NARRATION>OTP Platform Sourcing PO ${order.poNumber} for ${order.category}</NARRATION>`,
    `            <ALLLEDGERENTRIES.LIST>`,
    `              <LEDGERNAME>${order.category} Expense</LEDGERNAME>`,
    `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
    `              <AMOUNT>-${order.baseAmount.toFixed(2)}</AMOUNT>`,
    `            </ALLLEDGERENTRIES.LIST>`,
    `            <ALLLEDGERENTRIES.LIST>`,
    `              <LEDGERNAME>Input GST</LEDGERNAME>`,
    `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`,
    `              <AMOUNT>-${order.gstAmount.toFixed(2)}</AMOUNT>`,
    `            </ALLLEDGERENTRIES.LIST>`,
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
