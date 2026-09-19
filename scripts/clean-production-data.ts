/**
 * =============================================================================
 * OTP Platform — Production Clean State Reset CLI
 * =============================================================================
 * Safely triggers the comprehensive transactional purge RPC:
 *   public.admin_purge_all_transactional_records(p_confirmation_token)
 *
 * Purges all historical transactional data across Phase 1 to Phase 6:
 * - Requirements, RFQs, Quotes, Purchase Orders, Work Orders, Invoices, Payments
 * - Settlements, Platform Fees, TDS, Change Orders, Bank Reconciliations
 * - Double-Entry Ledger Journals, Lines, Account Balance Snapshots
 * - Organization Wallets (balances reset to 0.00), Rewards, Transactions
 * - Supplier Scorecards, Procurement Contracts, RFQ Approval Stages, Disputes
 * - Notifications, Dispatch Queue, Messaging, Audit Logs
 *
 * Strictly preserves:
 * - Registered Users (`auth.users`, `public.profiles`, `public.profile_roles`)
 * - Organizations & Members (`public.organizations`, `public.organization_members`)
 * - Verified Suppliers & Users (`public.suppliers`, `public.supplier_users`)
 * - Master Categories & Taxonomies
 * - Ledger Chart of Accounts (`public.ledger_accounts`)
 * - Approval Policies, Fee Policies, Notification Templates & Preferences
 *
 * Usage:
 *   npx tsx scripts/clean-production-data.ts --confirm PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN
 *   npx tsx scripts/clean-production-data.ts --dry-run
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js';

const CONFIRMATION_TOKEN = 'PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN';

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const confirmIdx = args.indexOf('--confirm');
  const providedToken = confirmIdx !== -1 ? args[confirmIdx + 1] : '';

  console.log('\x1b[36m=================================================================\x1b[0m');
  console.log('\x1b[36m  OTP Platform — Production Clean State Reset Utility\x1b[0m');
  console.log('\x1b[36m=================================================================\x1b[0m');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('\x1b[31m[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.\x1b[0m');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (isDryRun) {
    console.log('\x1b[33m[DRY-RUN MODE] Inspecting current transactional records...\x1b[0m');
    const { count: reqCount } = await supabase.from('requirements').select('*', { count: 'exact', head: true });
    const { count: rfqCount } = await supabase.from('rfqs').select('*', { count: 'exact', head: true });
    const { count: poCount } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true });
    const { count: invCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: supCount } = await supabase.from('suppliers').select('*', { count: 'exact', head: true });
    const { count: orgCount } = await supabase.from('organizations').select('*', { count: 'exact', head: true });

    console.log(`Current Transactional Counts:`);
    console.log(`  Requirements     : ${reqCount ?? 0}`);
    console.log(`  RFQs             : ${rfqCount ?? 0}`);
    console.log(`  Purchase Orders  : ${poCount ?? 0}`);
    console.log(`  Invoices         : ${invCount ?? 0}`);
    console.log(`\nPreserved Master Data:`);
    console.log(`  Users/Profiles   : ${userCount ?? 0}`);
    console.log(`  Suppliers        : ${supCount ?? 0}`);
    console.log(`  Organizations    : ${orgCount ?? 0}`);
    console.log('\n\x1b[32mDry run complete. To execute actual purge, run with:\x1b[0m');
    console.log(`  npx tsx scripts/clean-production-data.ts --confirm ${CONFIRMATION_TOKEN}\n`);
    process.exit(0);
  }

  if (providedToken !== CONFIRMATION_TOKEN) {
    console.error('\x1b[31m[SAFETY REJECTION] Production reset requires explicit confirmation token.\x1b[0m');
    console.error(`Please provide: --confirm ${CONFIRMATION_TOKEN}`);
    process.exit(1);
  }

  console.log('\x1b[33mExecuting authoritative purge RPC public.admin_purge_all_transactional_records()...\x1b[0m');

  const { data, error } = await supabase.rpc('admin_purge_all_transactional_records', {
    p_confirmation_token: providedToken,
  });

  if (error) {
    console.error(`\x1b[31m[FAILED] Purge RPC execution failed: ${error.message}\x1b[0m`);
    process.exit(1);
  }

  console.log('\x1b[32m[SUCCESS] Production Clean State Reset Completed Successfully!\x1b[0m');
  console.log(JSON.stringify(data, null, 2));
  console.log('\x1b[36m=================================================================\x1b[0m');
}

if (process.argv[1] && process.argv[1].endsWith('clean-production-data.ts')) {
  void main();
}
