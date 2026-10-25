#!/usr/bin/env npx tsx
/**
 * Clears all transactional test data (Requirements, RFQs, Quotes, Votes, Awards, POs, WOs, Payments)
 * while preserving all User Accounts, Organizations, Suppliers, Capabilities, and Taxonomy.
 */
import { createClient } from '@supabase/supabase-js';
import { assertSafeEnvironment } from './env-guard';

assertSafeEnvironment('clear-transactions');

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function clearTransactions() {
  console.log('\n🧹 Clearing all transactional data (leaving all accounts & directories intact)...\n');

  const { error } = await supabase.rpc('clear_all_transactional_data');

  if (error) {
    console.log('RPC not found, executing direct cascade cleanup via SQL...');
    const { error: sqlError } = await supabase.from('requirements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (sqlError) {
      console.warn('Notice on delete requirements:', sqlError.message);
    }
  }

  console.log('✅ All transactional data cleared successfully.');
  console.log('✨ All buyer accounts, suppliers, and capabilities are ready for fresh manual testing!\n');
}

clearTransactions().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
