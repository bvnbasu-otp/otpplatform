/**
 * Zoho Books Journal Entry Exporter (Phase 5D)
 * Formats double-entry journal entries into Zoho Books JSON schema with debit and credit line items.
 */

import type { JournalEntry } from './journal-entry';

export interface ZohoJournalLineItem {
  account_name: string;
  account_id?: string;
  debit_or_credit: 'd' | 'c';
  amount: number;
  description?: string;
}

export interface ZohoJournalEntryPayload {
  journal_date: string;
  entry_number: string;
  reference_number?: string;
  notes: string;
  line_items: ZohoJournalLineItem[];
  total: number;
}

export function exportToZohoJournalEntry(journal: JournalEntry): ZohoJournalEntryPayload {
  const lineItems: ZohoJournalLineItem[] = journal.lines.map((line) => {
    const isDebit = Number(line.debitAmount || 0) > 0;
    return {
      account_name: line.accountName || line.accountCode || 'Ledger Account',
      account_id: line.accountId,
      debit_or_credit: isDebit ? 'd' : 'c',
      amount: isDebit ? Number(line.debitAmount) : Number(line.creditAmount),
      description: line.description || undefined,
    };
  });

  return {
    journal_date: journal.entryDate,
    entry_number: journal.journalNumber,
    reference_number: journal.sourceEntityId || undefined,
    notes: journal.narration,
    line_items: lineItems,
    total: journal.totalDebit,
  };
}
