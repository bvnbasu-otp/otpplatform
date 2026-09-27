/**
 * Static contract tests for migration 00198 (synthetic-quote / pilot-simulator
 * isolation). These read the SQL text; they do not execute it against Postgres.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00198_harden_synthetic_quote_and_pilot_simulator_isolation.sql';
const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');
const sql00188 = readFileSync(
  resolve(MIGRATIONS_DIR, '00188_automatic_and_on_demand_simulated_quotes_generation.sql'),
  'utf8',
);

/** Returns the body of the last `CREATE OR REPLACE FUNCTION <name>(` in `src`, up to its closing `$$;`. */
function functionBody(src: string, name: string): string {
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('$$', start);
  const close = src.indexOf('$$;', open + 2);
  return src.slice(start, close + 3);
}

function stripComments(s: string): string {
  return s.replace(/--.*$/gm, '');
}

describe('Migration 00198 — synthetic quote & simulator isolation (static SQL contract)', () => {
  it('sits at position 198 of the contiguous chain 00001..00200', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    expect(files.length).toBe(200);
    expect(files[197]).toBe(FILE);
    files.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('is wrapped in a single transaction and never deletes or drops data', () => {
    const code = stripComments(sql);
    expect(code.trim().startsWith('BEGIN;')).toBe(true);
    expect(code.trim().endsWith('COMMIT;')).toBe(true);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+(TABLE|POLICY|TRIGGER|COLUMN|SCHEMA)\b/i);
    expect(code).not.toMatch(/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
    expect(code).not.toMatch(/\bDISABLE\s+TRIGGER\b/i);
  });

  it('stub flag fails closed when no demo_settings row exists', () => {
    const body = functionBody(sql, 'private.supplier_network_stub_enabled');
    expect(body).toMatch(/COALESCE\(\(SELECT supplier_network_stub_enabled FROM demo_settings WHERE id\), false\)/);
    expect(body).not.toMatch(/,\s*true\)/);
  });

  it('stub toggle requires platform admin or service_role and is revoked from anon', () => {
    const body = stripComments(functionBody(sql, 'public.admin_toggle_supplier_network_stub'));
    expect(body).toMatch(/IF NOT \(private\.is_platform_admin\(\) OR COALESCE\(auth\.role\(\), ''\) = 'service_role'\) THEN\s+RAISE EXCEPTION/);
    expect(body).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/);
    expect(body).not.toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.admin_toggle_supplier_network_stub\(boolean\) FROM anon;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_toggle_supplier_network_stub\(boolean\) FROM PUBLIC;/);
    const grant = sql.match(/GRANT EXECUTE ON FUNCTION public\.admin_toggle_supplier_network_stub\(boolean\) TO ([^;]+);/);
    expect(grant?.[1]).not.toMatch(/anon/);
  });

  it('discover_and_invite_for_rfq never calls auto_submit_pilot_quotes (real pilot = zero synthetic quotes)', () => {
    const body = stripComments(functionBody(sql, 'public.discover_and_invite_for_rfq'));
    expect(body).not.toMatch(/auto_submit_pilot_quotes/);
    expect(body).not.toMatch(/seed_simulated_quotes_for_rfq/);
    expect(body).not.toMatch(/INSERT INTO quotes\b/);
    expect(body).not.toMatch(/INSERT INTO quote_versions\b/);
  });

  it('discover_and_invite_for_rfq preserves every other statement of the 00188 definition', () => {
    const before = stripComments(functionBody(sql00188, 'public.discover_and_invite_for_rfq'));
    const after = stripComments(functionBody(sql, 'public.discover_and_invite_for_rfq'));
    const norm = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
    const removed = norm(before).filter((l) => !norm(after).includes(l));
    const added = norm(after).filter((l) => !norm(before).includes(l));
    expect(removed).toEqual([
      'IF private.supplier_network_stub_enabled() AND NOT v_rfq.is_demo AND NOT v_is_staging AND NOT v_is_reset THEN',
      'SELECT public.auto_submit_pilot_quotes(p_rfq_id) INTO v_quotes_res;',
    ]);
    expect(added).toEqual([
      "v_quotes_res := jsonb_build_object('skipped', true, 'reason', 'Discovery never generates quotes');",
    ]);
    expect(after).toMatch(/private\.is_org_member\(v_rfq\.organization_id\)/);
    expect(after).toMatch(/private\.assign_anonymous_label/);
    expect(after).toMatch(/'rfq\.suppliers_discovered'/);
    expect(after).toMatch(/SET status = 'QUOTING'::requirement_status/);
  });

  it('seed_simulated_quotes_for_rfq and auto_submit_pilot_quotes require privilege AND a demo RFQ', () => {
    const guard = stripComments(functionBody(sql, 'private.assert_synthetic_quotes_allowed'));
    expect(guard).toMatch(/private\.is_platform_admin\(\)/);
    expect(guard).toMatch(/'service_role'/);
    expect(guard).toMatch(/IF v_is_demo IS NOT TRUE THEN\s+RETURN 'Simulated quotes are disabled for real RFQs';/);
    expect(guard).not.toMatch(/'anon'|'authenticated'/);

    for (const [name, impl] of [
      ['public.seed_simulated_quotes_for_rfq', 'private.seed_simulated_quotes_for_rfq_impl'],
      ['public.auto_submit_pilot_quotes', 'private.auto_submit_pilot_quotes_impl'],
    ] as const) {
      const body = stripComments(functionBody(sql, name));
      const guardIdx = body.indexOf('private.assert_synthetic_quotes_allowed(p_rfq_id)');
      const implIdx = body.indexOf(impl);
      expect(guardIdx).toBeGreaterThan(0);
      expect(implIdx).toBeGreaterThan(guardIdx);
      expect(body).toMatch(/IF v_denied IS NOT NULL THEN\s+RETURN jsonb_build_object/);
    }
  });

  it('revokes anon/PUBLIC execute on the simulated-quote RPCs and hides the impls', () => {
    for (const sig of ['public.seed_simulated_quotes_for_rfq(uuid, integer)', 'public.auto_submit_pilot_quotes(uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`);
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon;`);
      const grant = sql.match(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig.replace(/[().]/g, '\\$&')} TO ([^;]+);`));
      expect(grant?.[1]).not.toMatch(/anon/);
    }
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.seed_simulated_quotes_for_rfq_impl(uuid, integer) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.auto_submit_pilot_quotes_impl(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION private.assert_synthetic_quotes_allowed(uuid) FROM PUBLIC, anon, authenticated;');
  });

  it('moves the original bodies idempotently (only when the impl does not yet exist)', () => {
    expect(sql).toMatch(/IF to_regprocedure\('private\.seed_simulated_quotes_for_rfq_impl\(uuid, integer\)'\) IS NULL/);
    expect(sql).toMatch(/IF to_regprocedure\('private\.auto_submit_pilot_quotes_impl\(uuid\)'\) IS NULL/);
  });

  it('stubbed fulfillment returns before completing work or raising invoices for non-demo work orders', () => {
    const body = stripComments(functionBody(sql, 'private.simulate_pilot_supplier_fulfillment'));
    const demoGate = body.search(/IF NOT \(COALESCE\(NEW\.is_demo, false\) OR COALESCE\(v_po\.is_demo, false\) OR COALESCE\(v_rfq_is_demo, false\)\) THEN\s+RETURN NEW;/);
    expect(demoGate).toBeGreaterThan(0);
    expect(body.indexOf("SET status = 'COMPLETED'")).toBeGreaterThan(demoGate);
    expect(body.indexOf('INSERT INTO invoices')).toBeGreaterThan(demoGate);
    expect(body.indexOf("SET status = 'ACCEPTED'")).toBeGreaterThan(demoGate);
  });
});
