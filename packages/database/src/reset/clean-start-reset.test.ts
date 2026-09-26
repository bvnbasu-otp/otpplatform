import { describe, it, expect } from 'vitest';
import {
  CANONICAL_DATABASE_TABLE_INVENTORY,
  PRODUCTION_RESET_CONFIRMATION_TOKEN,
  buildFreshStartResetPlan,
  validatePostResetIntegrity,
} from './clean-start-reset';

describe('Clean-Start Database Reset Engine (Stage R2-27)', () => {
  it('categorizes database tables into preserve, configuration, and transactional reset partitions', () => {
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve.length).toBeGreaterThan(15);
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.configurationAndPolicies.length).toBeGreaterThan(4);
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset.length).toBeGreaterThan(40);

    // Assert key tables are preserved
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve).toContain('otp_schema_migrations');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve).toContain('categories');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.structureAndPreserve).toContain('ledger_accounts');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.configurationAndPolicies).toContain('platform_fee_policies');

    // Assert key transactional tables are cleared
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('requirements');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('rfqs');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('quotes');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('purchase_orders');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('invoices');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('payments');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('journal_entries');
    expect(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset).toContain('disputes');
  });

  it('builds a verified fresh-start reset execution plan', () => {
    const plan = buildFreshStartResetPlan();
    expect(plan.requiresConfirmationToken).toBe(true);
    expect(plan.confirmationToken).toBe(PRODUCTION_RESET_CONFIRMATION_TOKEN);
    expect(plan.walletResetRequired).toBe(true);
    expect(plan.tablesToTruncate.length).toBe(CANONICAL_DATABASE_TABLE_INVENTORY.transactionalAndReset.length);
  });

  it('passes post-reset integrity check when data is pure and 197 migrations are intact', () => {
    const result = validatePostResetIntegrity({
      transactionalRecordCount: 0,
      preservedMigrationsCount: 197,
      preservedTaxonomyCount: 14,
      preservedLedgerAccountsCount: 20,
      nonZeroWalletBalancesCount: 0,
    });

    expect(result.isClean).toBe(true);
    expect(result.activeTransactionsCount).toBe(0);
    expect(result.migrationCeilingPreserved).toBe(true);
    expect(result.expectedMigrations).toBe(197);
    expect(result.errors).toHaveLength(0);
  });

  it('fails post-reset integrity check if transactional records remain or migrations are altered', () => {
    const result = validatePostResetIntegrity({
      transactionalRecordCount: 5,
      preservedMigrationsCount: 195, // Altered
      preservedTaxonomyCount: 0,
      preservedLedgerAccountsCount: 20,
      nonZeroWalletBalancesCount: 2,
    });

    expect(result.isClean).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.errors.some((e) => e.includes('Purity Violation'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Migration Integrity Violation'))).toBe(true);
  });
});
