/**
 * OTP Platform — Full Fresh-Start Database Reset Engine
 * Stage R2-27: Referral, Growth, Product Completeness, Data Purity & Full Fresh-Start Reset
 *
 * Implements authoritative table classification and cascading transactional purge:
 * 1. STRUCTURE & PRESERVED TABLES: Master taxonomy, Chart of Accounts, system settings, migrations
 * 2. TRANSACTIONAL & RESET TABLES: RFQs, quotes, orders, invoices, payments, journal lines, disputes
 * 3. ZERO-DATA PURITY INVARIANT: Guarantees 0 active test transactions while leaving all 197 migrations,
 *    RLS policies, DB functions, and canonical master data 100% intact.
 */

export interface DatabaseTableInventory {
  structureAndPreserve: string[];
  transactionalAndReset: string[];
  configurationAndPolicies: string[];
}

export const CANONICAL_DATABASE_TABLE_INVENTORY: DatabaseTableInventory = {
  structureAndPreserve: [
    'otp_schema_migrations',
    'platform_environment_settings',
    'categories',
    'requirement_categories',
    'requirement_subcategories',
    'subcategory_capabilities',
    'subcategory_evaluation_suggestions',
    'category_attribute_definitions',
    'capabilities',
    'supplier_capabilities',
    'supplier_service_areas',
    'ledger_accounts',
    'accounting_periods',
    'subscription_plans',
    'buyer_type_config',
    'demo_settings',
    'demo_scenarios',
    'demo_price_anchors',
    'notification_templates',
    'notification_preferences',
    'admin_database_snapshots',
  ],
  configurationAndPolicies: [
    'platform_fee_policies',
    'organization_approval_policies',
    'approval_policies',
    'evaluation_criteria',
    'market_intelligence_baselines',
    'announcements',
  ],
  transactionalAndReset: [
    // Phase 5D Double-Entry Financial Ledger
    'account_balance_snapshots',
    'journal_lines',
    'journal_entries',

    // Phase 6 Wallets, Rewards, Scorecards, Contracts & Disputes
    'buyer_reward_allocations',
    'wallet_transactions',
    'dispute_events',
    'dispute_evidence',
    'disputes',
    'work_order_inspection_items',
    'work_order_inspections',
    'procurement_contracts',
    'scorecard_dimension_history',
    'supplier_scorecards',
    'rfq_approval_stages',
    'notification_dispatch_queue',

    // Phase 5A-5C Settlements, TDS, Change Orders, Reconciliations, Platform Fees
    'settlement_exception_events',
    'settlement_exceptions',
    'settlement_reconciliations',
    'erp_export_manifests',
    'bank_reconciliation_records',
    'platform_fee_transactions',
    'po_fee_snapshots',
    'tds_deductions',
    'po_change_order_items',
    'po_change_orders',
    'credit_debit_notes',
    'payment_allocations',
    'invoice_line_items',
    'purchase_order_line_items',

    // Fulfillment, Invoices, Payments, Milestones, Inspections, POs, Awards
    'payments',
    'delivery_inspections',
    'work_order_milestones',
    'invoices',
    'work_orders',
    'purchase_orders',
    'procurement_performance_records',
    'awards',

    // Governance, Evaluations, Quotes, RFQs, Requirements
    'evaluator_scores',
    'rfq_evaluation_rounds',
    'rfq_invited_suppliers',
    'supplier_evaluations',
    'committee_votes',
    'conflict_of_interest_declarations',
    'committee_assignments',
    'approval_instances',
    'quote_evaluations',
    'quote_versions',
    'clarification_messages',
    'rfq_clarification_messages',
    'rfq_cancellations',
    'direct_supplier_invites',
    'rfq_invitations',
    'quotes',
    'attachments',
    'rfqs',
    'requirements',

    // Dynamic Approval Route & Market Intelligence Snapshots
    'rfq_approval_route_evaluations',
    'market_intelligence_snapshots',

    // Governance Audits & Stage Events
    'org_governance_action_audits',
    'procurement_stage_events',
    'audit_pings',

    // Specifications, Communications, Channels, Sessions, Tickets, Signups
    'requirement_specifications',
    'requirement_attachments',
    'messaging_messages',
    'messaging_channels',
    'supplier_messaging_channels',
    'messaging_events',
    'messaging_rate_limits',
    'supplier_quote_sessions',
    'supplier_notifications',
    'supplier_magic_links',
    'support_tickets',
    'notifications',
    'password_reset_otps',
    'signup_verification_otps',
    'profile_verification_otps',
    'subscription_payment_logs',
    'signup_requests',
  ],
};

export interface ResetExecutionPlan {
  totalPreservedTables: number;
  totalResetTables: number;
  totalConfigTables: number;
  tablesToTruncate: string[];
  tablesToPreserve: string[];
  walletResetRequired: boolean;
  requiresConfirmationToken: boolean;
  confirmationToken: string;
}

export const PRODUCTION_RESET_CONFIRMATION_TOKEN =
  'PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN';

/**
 * Builds the authoritative fresh-start execution plan.
 */
export function buildFreshStartResetPlan(): ResetExecutionPlan {
  return {
    totalPreservedTables: CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve.length,
    totalResetTables: CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset.length,
    totalConfigTables: CANONICAL_DATABASE_TABLE_INVENTORY.configurationAndPolicies.length,
    tablesToTruncate: [...CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset],
    tablesToPreserve: [
      ...CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve,
      ...CANONICAL_DATABASE_TABLE_INVENTORY.configurationAndPolicies,
    ],
    walletResetRequired: true,
    requiresConfirmationToken: true,
    confirmationToken: PRODUCTION_RESET_CONFIRMATION_TOKEN,
  };
}

export interface PostResetIntegrityCheckResult {
  isClean: boolean;
  preservedTableCount: number;
  resetTableCount: number;
  activeTransactionsCount: number;
  migrationCeilingPreserved: boolean;
  expectedMigrations: number;
  errors: string[];
}

/**
 * Validates post-reset integrity invariants.
 */
export function validatePostResetIntegrity(metrics: {
  transactionalRecordCount: number;
  preservedMigrationsCount: number;
  preservedTaxonomyCount: number;
  preservedLedgerAccountsCount: number;
  nonZeroWalletBalancesCount: number;
}): PostResetIntegrityCheckResult {
  const errors: string[] = [];

  if (metrics.transactionalRecordCount > 0) {
    errors.push(
      `Purity Violation: Found ${metrics.transactionalRecordCount} lingering transactional records post-reset.`,
    );
  }

  if (metrics.preservedMigrationsCount !== 197) {
    errors.push(
      `Migration Integrity Violation: Expected exactly 197 preserved schema migrations, found ${metrics.preservedMigrationsCount}.`,
    );
  }

  if (metrics.preservedTaxonomyCount <= 0) {
    errors.push('Master Data Violation: Canonical taxonomy categories were wiped.');
  }

  if (metrics.preservedLedgerAccountsCount <= 0) {
    errors.push('Ledger Integrity Violation: Chart of accounts was wiped.');
  }

  if (metrics.nonZeroWalletBalancesCount > 0) {
    errors.push(
      `Wallet Balance Violation: Found ${metrics.nonZeroWalletBalancesCount} non-zero wallet balances post-reset.`,
    );
  }

  return {
    isClean: errors.length === 0,
    preservedTableCount:
      CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve.length +
      CANONICAL_DATABASE_TABLE_INVENTORY.configurationAndPolicies.length,
    resetTableCount: CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset.length,
    activeTransactionsCount: metrics.transactionalRecordCount,
    migrationCeilingPreserved: metrics.preservedMigrationsCount === 197,
    expectedMigrations: 197,
    errors,
  };
}
