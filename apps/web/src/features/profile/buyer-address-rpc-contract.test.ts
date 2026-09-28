import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { buildUpsertBuyerAddressParams } from './api/buyer-addresses';

/**
 * PostgREST resolves an RPC by its exact named-parameter set; a client that
 * sends a different set gets "Could not find the function ... in the schema
 * cache". These checks tie the client's parameter names to the newest
 * migration that defines each function.
 */
const MIGRATIONS = resolve(__dirname, '../../../../../supabase/migrations');
const files = readdirSync(MIGRATIONS).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();

function latestDefinition(fn: string): { file: string; params: string[]; sql: string } {
  const header = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(([\\s\\S]*?)\\)\\s*RETURNS`, 'i');
  for (const file of [...files].reverse()) {
    const sql = readFileSync(resolve(MIGRATIONS, file), 'utf8');
    const match = sql.match(header);
    if (match) {
      const params = (match[1] ?? '')
        .split(',')
        .map((p) => p.trim().split(/\s+/)[0] ?? '')
        .filter(Boolean);
      return { file, params, sql };
    }
  }
  throw new Error(`no migration defines public.${fn}`);
}

describe('buyer address RPC contract', () => {
  it('the client sends exactly the named parameters of upsert_buyer_address_atomic', () => {
    const { params } = latestDefinition('upsert_buyer_address_atomic');
    const sent = buildUpsertBuyerAddressParams({
      persona: 'INDIVIDUAL',
      label: 'Home',
      line1: '12 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      addressType: 'DELIVERY',
      isPrimary: true,
    });
    expect(Object.keys(sent).sort()).toEqual([...params].sort());
  });

  it('get_buyer_addresses takes only p_org_id', () => {
    expect(latestDefinition('get_buyer_addresses').params).toEqual(['p_org_id']);
  });

  it('the newest definitions resolve the owner server-side and are not callable signed out', () => {
    for (const fn of ['upsert_buyer_address_atomic', 'get_buyer_addresses']) {
      const { sql } = latestDefinition(fn);
      expect(sql).toMatch(new RegExp(`REVOKE[^;]*ON FUNCTION public\\.${fn}\\([^)]*\\)[^;]*FROM[^;]*\\banon\\b`, 'i'));
      expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON FUNCTION public\\.${fn}\\([^)]*\\)[^;]*TO[^;]*\\banon\\b`, 'i'));
    }
    expect(latestDefinition('upsert_buyer_address_atomic').sql).toMatch(/private\.get_profile_id\(\)/);
  });
});
