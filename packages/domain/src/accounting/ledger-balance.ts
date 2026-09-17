/**
 * Ledger Balances & Trial Balance Derivation (Phase 5D)
 * Computes trial balances, debits/credits summaries, and verifies balance invariants across all posted journals.
 */

import type { AccountClassification, LedgerAccount } from './chart-of-accounts';
import type { JournalLine } from './journal-entry';

export interface AccountBalanceSummary {
  accountId: string;
  accountCode: string;
  accountName: string;
  classification: AccountClassification;
  currency: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number; // For Assets/Expenses: Debits - Credits; For Liab/Equity/Rev: Credits - Debits
  balanceType: 'DEBIT' | 'CREDIT' | 'ZERO';
  lineCount: number;
}

export interface TrialBalanceSummary {
  organizationId: string;
  periodId?: string;
  asOfDate: string;
  totalDebits: number;
  totalCredits: number;
  difference: number;
  isBalanced: boolean;
  
  // High level classifications
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpense: number;

  accounts: AccountBalanceSummary[];
}

/**
 * Derives a complete trial balance from a set of accounts and all posted journal lines.
 */
export function calculateTrialBalance(
  organizationId: string,
  accounts: LedgerAccount[],
  postedLines: JournalLine[],
  asOfDate: string = new Date().toISOString().split('T')[0]!,
  periodId?: string,
): TrialBalanceSummary {
  const accountMap = new Map<string, LedgerAccount>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc);
  }

  const debitMap = new Map<string, number>();
  const creditMap = new Map<string, number>();
  const countMap = new Map<string, number>();

  for (const line of postedLines) {
    const accId = line.accountId;
    const debit = Math.round(Number(line.debitAmount || 0) * 100) / 100;
    const credit = Math.round(Number(line.creditAmount || 0) * 100) / 100;

    debitMap.set(accId, Math.round(((debitMap.get(accId) || 0) + debit) * 100) / 100);
    creditMap.set(accId, Math.round(((creditMap.get(accId) || 0) + credit) * 100) / 100);
    countMap.set(accId, (countMap.get(accId) || 0) + 1);
  }

  let totalDebits = 0;
  let totalCredits = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpense = 0;

  const summaries: AccountBalanceSummary[] = [];

  for (const acc of accounts) {
    const debits = debitMap.get(acc.id) || 0;
    const credits = creditMap.get(acc.id) || 0;
    const count = countMap.get(acc.id) || 0;

    totalDebits = Math.round((totalDebits + debits) * 100) / 100;
    totalCredits = Math.round((totalCredits + credits) * 100) / 100;

    let netBalance = 0;
    let balanceType: 'DEBIT' | 'CREDIT' | 'ZERO' = 'ZERO';

    if (acc.classification === 'ASSET' || acc.classification === 'EXPENSE') {
      netBalance = Math.round((debits - credits) * 100) / 100;
      balanceType = netBalance > 0 ? 'DEBIT' : netBalance < 0 ? 'CREDIT' : 'ZERO';
      if (acc.classification === 'ASSET') totalAssets = Math.round((totalAssets + netBalance) * 100) / 100;
      if (acc.classification === 'EXPENSE') totalExpense = Math.round((totalExpense + netBalance) * 100) / 100;
    } else {
      netBalance = Math.round((credits - debits) * 100) / 100;
      balanceType = netBalance > 0 ? 'CREDIT' : netBalance < 0 ? 'DEBIT' : 'ZERO';
      if (acc.classification === 'LIABILITY') totalLiabilities = Math.round((totalLiabilities + netBalance) * 100) / 100;
      if (acc.classification === 'EQUITY') totalEquity = Math.round((totalEquity + netBalance) * 100) / 100;
      if (acc.classification === 'REVENUE') totalRevenue = Math.round((totalRevenue + netBalance) * 100) / 100;
    }

    summaries.push({
      accountId: acc.id,
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      classification: acc.classification,
      currency: acc.currency,
      debitTotal: debits,
      creditTotal: credits,
      netBalance,
      balanceType,
      lineCount: count,
    });
  }

  const difference = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;

  return {
    organizationId,
    periodId,
    asOfDate,
    totalDebits,
    totalCredits,
    difference,
    isBalanced: difference < 0.001,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalRevenue,
    totalExpense,
    accounts: summaries,
  };
}
