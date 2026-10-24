import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  resolve(__dirname, '../../supabase/migrations/00319_supplier_business_address_enforcement.sql'),
  'utf8',
);

describe('00319 supplier business-address database boundary', () => {
  it('exposes a narrow authenticated RPC and keeps registered address out of its update', () => {
    const rpc = SQL.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_supplier_business_address[\s\S]*?REVOKE ALL ON FUNCTION public\.upsert_supplier_business_address/,
    )?.[0] ?? '';
    expect(rpc).toContain('SECURITY DEFINER');
    expect(rpc).toContain('SET search_path = public, private, auth, extensions');
    expect(rpc).toContain('SET address = v_address');
    expect(rpc).not.toMatch(/SET[\s\S]*registered_address\s*=/);
    expect(SQL).toContain('TO authenticated');
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION private.guard_supplier_trust_fields()');
  });

  it('blocks incomplete addresses before quote submission', () => {
    expect(SQL).toContain('trg_quote_requires_business_address');
    expect(SQL).toContain('Save the supplier business address before submitting a quote');
    expect(SQL).toContain('private.supplier_has_operating_address(NEW.supplier_id)');
    expect(SQL).toContain('registered_address is intentionally absent');
  });
});
