/**
 * Tally Prime XML Journal Voucher Exporter (Phase 5D)
 * Formats double-entry journal entries into statutory Tally XML schema
 * with `<VOUCHER VCHTYPE="Journal">` and debit/credit ledger entries.
 */

import { escapeXml } from './tally-payment-voucher';
import type { JournalEntry } from './journal-entry';

export function exportToTallyJournalVoucher(journal: JournalEntry): string {
  const tallyDate = journal.entryDate.replace(/-/g, '');
  const voucherNum = escapeXml(journal.journalNumber);
  const narrationEsc = escapeXml(journal.narration);

  const ledgerEntriesXml: string[] = [];

  for (const line of journal.lines) {
    const accName = escapeXml(line.accountName || line.accountCode || 'Ledger Account');
    const isDebit = Number(line.debitAmount || 0) > 0;
    const amount = isDebit
      ? -Math.abs(Number(line.debitAmount)) // Tally convention: Debit is negative in XML
      : Math.abs(Number(line.creditAmount));

    ledgerEntriesXml.push(
      `            <ALLLEDGERENTRIES.LIST>`,
      `              <LEDGERNAME>${accName}</LEDGERNAME>`,
      `              <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
      `              <AMOUNT>${amount.toFixed(2)}</AMOUNT>`,
      `            </ALLLEDGERENTRIES.LIST>`,
    );
  }

  return [
    `<ENVELOPE>`,
    `  <HEADER>`,
    `    <TALLYREQUEST>Import Data</TALLYREQUEST>`,
    `  </HEADER>`,
    `  <BODY>`,
    `    <IMPORTDATA>`,
    `      <REQUESTDESC>`,
    `        <REPORTNAME>Vouchers</REPORTNAME>`,
    `        <STATICVARIABLES>`,
    `          <SVCURRENTCOMPANY>OTP Platform</SVCURRENTCOMPANY>`,
    `        </STATICVARIABLES>`,
    `      </REQUESTDESC>`,
    `      <REQUESTDATA>`,
    `        <TALLYMESSAGE xmlns:UDF="TallyUDF">`,
    `          <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `            <DATE>${tallyDate}</DATE>`,
    `            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>`,
    `            <VOUCHERNUMBER>${voucherNum}</VOUCHERNUMBER>`,
    `            <NARRATION>${narrationEsc}</NARRATION>`,
    ...ledgerEntriesXml,
    `          </VOUCHER>`,
    `        </TALLYMESSAGE>`,
    `      </REQUESTDATA>`,
    `    </IMPORTDATA>`,
    `  </BODY>`,
    `</ENVELOPE>`,
  ].join('\n');
}
