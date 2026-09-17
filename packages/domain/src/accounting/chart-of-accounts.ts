/**
 * Chart of Accounts & Ledger Account Models (Phase 5D)
 * Defines standard account classifications, subtypes, default accounts, and validation logic.
 */

export type AccountClassification = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type AccountSubtype =
  | 'CURRENT_ASSET'
  | 'BANK'
  | 'ACCOUNTS_RECEIVABLE'
  | 'ADVANCE_TO_SUPPLIER'
  | 'CURRENT_LIABILITY'
  | 'ACCOUNTS_PAYABLE'
  | 'TDS_PAYABLE'
  | 'GST_PAYABLE'
  | 'GST_INPUT_TAX'
  | 'SETTLEMENT_CLEARING'
  | 'OPERATING_REVENUE'
  | 'PLATFORM_FEE_REVENUE'
  | 'DIRECT_EXPENSE'
  | 'PROCUREMENT_EXPENSE'
  | 'CONTRA_ACCOUNT';

export type LedgerAccountStatus = 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';

export interface LedgerAccount {
  id: string;
  organizationId: string;
  accountCode: string; // Unique within org e.g. "1010-BANK-MAIN"
  accountName: string;
  classification: AccountClassification;
  subtype: AccountSubtype;
  currency: string;
  isSystemAccount: boolean;
  status: LedgerAccountStatus;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StandardAccountDefinition {
  accountCode: string;
  accountName: string;
  classification: AccountClassification;
  subtype: AccountSubtype;
  description: string;
  isSystemAccount: boolean;
}

export const STANDARD_CHART_OF_ACCOUNTS: ReadonlyArray<StandardAccountDefinition> = [
  // Assets
  {
    accountCode: '1010-BANK-DEFAULT',
    accountName: 'Bank / Main Operating Account',
    classification: 'ASSET',
    subtype: 'BANK',
    description: 'Primary corporate bank account for procurement payments and fund flows',
    isSystemAccount: true,
  },
  {
    accountCode: '1020-ACCOUNTS-RECEIVABLE',
    accountName: 'Accounts Receivable',
    classification: 'ASSET',
    subtype: 'ACCOUNTS_RECEIVABLE',
    description: 'Receivables from buyers / customers',
    isSystemAccount: true,
  },
  {
    accountCode: '1030-ADVANCES-TO-SUPPLIERS',
    accountName: 'Advances to Suppliers',
    classification: 'ASSET',
    subtype: 'ADVANCE_TO_SUPPLIER',
    description: 'Unallocated milestone and mobilization advances paid to suppliers',
    isSystemAccount: true,
  },
  {
    accountCode: '1040-GST-INPUT-TAX-CGST',
    accountName: 'GST Input Tax Credit - CGST',
    classification: 'ASSET',
    subtype: 'GST_INPUT_TAX',
    description: 'Input Central GST recoverable on procurement purchases',
    isSystemAccount: true,
  },
  {
    accountCode: '1041-GST-INPUT-TAX-SGST',
    accountName: 'GST Input Tax Credit - SGST',
    classification: 'ASSET',
    subtype: 'GST_INPUT_TAX',
    description: 'Input State GST recoverable on procurement purchases',
    isSystemAccount: true,
  },
  {
    accountCode: '1042-GST-INPUT-TAX-IGST',
    accountName: 'GST Input Tax Credit - IGST',
    classification: 'ASSET',
    subtype: 'GST_INPUT_TAX',
    description: 'Input Integrated GST recoverable on inter-state procurement purchases',
    isSystemAccount: true,
  },
  {
    accountCode: '1043-GST-INPUT-TAX-UTGST',
    accountName: 'GST Input Tax Credit - UTGST',
    classification: 'ASSET',
    subtype: 'GST_INPUT_TAX',
    description: 'Input Union Territory GST recoverable on procurement purchases',
    isSystemAccount: true,
  },

  // Liabilities
  {
    accountCode: '2010-ACCOUNTS-PAYABLE',
    accountName: 'Accounts Payable (Trade Payables)',
    classification: 'LIABILITY',
    subtype: 'ACCOUNTS_PAYABLE',
    description: 'Trade payables owed to suppliers against approved commercial invoices',
    isSystemAccount: true,
  },
  {
    accountCode: '2020-TDS-PAYABLE-STATUTORY',
    accountName: 'TDS Payable (Statutory Withholdings)',
    classification: 'LIABILITY',
    subtype: 'TDS_PAYABLE',
    description: 'Statutory Tax Deducted at Source (Sec 194C, 194Q, 194J) to be remitted to government',
    isSystemAccount: true,
  },
  {
    accountCode: '2030-GST-OUTPUT-PAYABLE',
    accountName: 'GST Output Tax Liability',
    classification: 'LIABILITY',
    subtype: 'GST_PAYABLE',
    description: 'Output GST liability accrued on sales or taxable platform services',
    isSystemAccount: true,
  },

  // Contra / Clearing
  {
    accountCode: '2090-SETTLEMENT-CLEARING',
    accountName: 'Settlement Clearing Account',
    classification: 'LIABILITY',
    subtype: 'SETTLEMENT_CLEARING',
    description: 'Intermediate transit clearing account for multi-stage allocation & UTR matching',
    isSystemAccount: true,
  },

  // Revenue
  {
    accountCode: '4010-PLATFORM-FEE-REVENUE',
    accountName: 'Platform Fee Revenue',
    classification: 'REVENUE',
    subtype: 'PLATFORM_FEE_REVENUE',
    description: 'OTP platform facilitation fee earned on supplier procurement settlements',
    isSystemAccount: true,
  },

  // Expense
  {
    accountCode: '5010-PROCUREMENT-EXPENSE',
    accountName: 'Procurement Purchases & Work Orders',
    classification: 'EXPENSE',
    subtype: 'PROCUREMENT_EXPENSE',
    description: 'Base procurement expense incurred for goods, equipment, and services',
    isSystemAccount: true,
  },
];

/**
 * Validates that an account code conforms to uppercase alphanumeric code convention.
 */
export function isValidAccountCode(code: string): boolean {
  return /^[A-Z0-9_-]{3,50}$/.test(code);
}
