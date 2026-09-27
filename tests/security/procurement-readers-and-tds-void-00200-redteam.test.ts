import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract tests for migration 00200. No database is available in this
 * environment, so the migration has never been executed; these tests pin the
 * SQL text and diff each re-created function against its latest prior
 * definition.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00200_scope_procurement_readers_and_recompute_invoice_on_tds_void.sql';
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

const FN_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public|private)\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*(RETURNS[\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\5([^;]*);/gi;

function bodies(text: string, schema: string, name: string): string[] {
  const re = new RegExp(FN_RE.source, FN_RE.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if ((m[1] || 'public').toLowerCase() === schema && m[2] === name) out.push(m[6]);
  }
  return out;
}

function fn200(name: string, schema = 'public'): string {
  const hits = bodies(SQL, schema, name);
  expect(hits, `${schema}.${name} defined once in 00200`).toHaveLength(1);
  return stripComments(hits[0] as string);
}

function latestBefore200(name: string, schema = 'public'): { file: string; body: string } {
  let hit: { file: string; body: string } | undefined;
  for (const file of MIGRATION_FILES.slice(0, 199)) {
    const found = bodies(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'), schema, name);
    if (found.length) hit = { file, body: found[found.length - 1] as string };
  }
  if (!hit) throw new Error(`no prior definition of ${schema}.${name}`);
  return hit;
}

function lineDiff(before: string, after: string): { added: string[]; removed: string[] } {
  const norm = (b: string) =>
    stripComments(b)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  const count = (lines: string[]) => lines.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
  const a = count(norm(before));
  const b = count(norm(after));
  const added: string[] = [];
  const removed: string[] = [];
  for (const [l, n] of b) for (let i = 0; i < n - (a.get(l) ?? 0); i++) added.push(l);
  for (const [l, n] of a) for (let i = 0; i < n - (b.get(l) ?? 0); i++) removed.push(l);
  return { added: added.sort(), removed: removed.sort() };
}

const ORG_GUARD = [
  'IF NOT COALESCE(',
  "COALESCE(auth.role(), '') = 'service_role'",
  'OR private.is_platform_admin()',
  'OR (v_org_id IS NOT NULL AND private.is_org_member(v_org_id)),',
  'false',
  ') THEN',
  "RETURN jsonb_build_object('ok', false, 'error', 'Access denied');",
  'END IF;',
];

describe('00200 migration file', () => {
  it('sits at position 200 of the contiguous chain 00001..00202', () => {
    expect(MIGRATION_FILES.length).toBe(202);
    expect(MIGRATION_FILES[199]).toBe(FILE);
    MIGRATION_FILES.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('runs in one transaction and is non-destructive', () => {
    const code = stripComments(SQL).trim();
    expect(code.startsWith('BEGIN;')).toBe(true);
    expect(code.endsWith('COMMIT;')).toBe(true);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|SCHEMA|VIEW|INDEX|TYPE|POLICY)\b/i);
    expect(code).not.toMatch(/DISABLE\s+(ROW\s+LEVEL\s+SECURITY|TRIGGER)/i);
    for (const drop of code.match(/\bDROP\s+\w+[^;]*;/gi) ?? []) {
      expect(drop).toMatch(/^DROP\s+TRIGGER\s+IF\s+EXISTS\b/i);
    }
  });

  it('never grants anything to anon or PUBLIC', () => {
    for (const grant of stripComments(SQL).match(/\bGRANT\b[^;]*;/gi) ?? []) {
      expect(grant, grant).not.toMatch(/\bTO\b[^;]*\b(anon|PUBLIC)\b/i);
    }
  });

  it('does not touch pilot financial settings', () => {
    expect(stripComments(SQL)).not.toMatch(/platform_settings|system_settings|fee_percent|reward_percent|referral_reward|PILOT_SANDBOX/i);
  });
});

describe('R1 get_current_procurement_step', () => {
  const body = fn200('get_current_procurement_step');

  it('resolves the requirement organization and checks the caller before reading stage events', () => {
    const orgAt = body.indexOf('SELECT organization_id INTO v_org_id FROM public.requirements WHERE id = p_requirement_id;');
    const deniedAt = body.indexOf("'Access denied'");
    expect(orgAt).toBeGreaterThan(-1);
    expect(deniedAt).toBeGreaterThan(orgAt);
    expect(deniedAt).toBeLessThan(body.indexOf('FROM public.procurement_stage_events'));
  });

  it('only adds the org guard to the 00148 body', () => {
    const prior = latestBefore200('get_current_procurement_step');
    expect(prior.file.startsWith('00148')).toBe(true);
    const diff = lineDiff(prior.body, body);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual(
      [
        'v_org_id uuid;',
        'SELECT organization_id INTO v_org_id FROM public.requirements WHERE id = p_requirement_id;',
        ...ORG_GUARD,
      ].sort(),
    );
  });

  it('has no supplier path and revokes anon', () => {
    expect(body).not.toMatch(/is_supplier_user_for|supplier_users/);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.get_current_procurement_step(uuid) FROM PUBLIC, anon;');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.get_current_procurement_step(uuid) TO authenticated, service_role;');
  });
});

describe('R1 check_supplier_award_eligibility_atomic', () => {
  const body = fn200('check_supplier_award_eligibility_atomic');

  it('checks the buying organization of the award RFQ before reading quote or supplier data', () => {
    const orgAt = body.indexOf('SELECT organization_id INTO v_org_id FROM public.rfqs WHERE id = v_award.rfq_id;');
    const deniedAt = body.indexOf("'Access denied'");
    expect(orgAt).toBeGreaterThan(body.indexOf("'Award not found'"));
    expect(deniedAt).toBeGreaterThan(orgAt);
    expect(deniedAt).toBeLessThan(body.indexOf('FROM public.quotes'));
    expect(deniedAt).toBeLessThan(body.indexOf('FROM public.suppliers'));
  });

  it('only adds the org guard to the 00196 body', () => {
    const prior = latestBefore200('check_supplier_award_eligibility_atomic');
    expect(prior.file.startsWith('00196')).toBe(true);
    const diff = lineDiff(prior.body, body);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual(
      ['v_org_id    uuid;', 'SELECT organization_id INTO v_org_id FROM public.rfqs WHERE id = v_award.rfq_id;', ...ORG_GUARD].sort(),
    );
  });

  it('has no supplier path, returns no buyer identity, and revokes anon', () => {
    expect(body).not.toMatch(/is_supplier_user_for|supplier_users/);
    expect(body).not.toMatch(/organizations|o\.name|buyer_/);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.check_supplier_award_eligibility_atomic(uuid) FROM PUBLIC, anon;');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.check_supplier_award_eligibility_atomic(uuid) TO authenticated, service_role;');
  });

  it('neither reader has a client caller that the guard could break', () => {
    const roots = ['../../apps/web/src', '../../packages', '../../supabase/functions'].map((p) => resolve(__dirname, p));
    for (const root of roots) {
      const files = (readdirSync(root, { recursive: true }) as string[]).filter(
        (f) => /\.(ts|tsx)$/.test(f) && !/node_modules|\.test\./.test(f),
      );
      for (const f of files) {
        const src = readFileSync(resolve(root, f), 'utf8');
        expect(src, f).not.toMatch(/get_current_procurement_step|check_supplier_award_eligibility_atomic/);
      }
    }
  });
});

describe('TDS void recomputes the invoice', () => {
  const trg = fn200('enforce_invoice_tds_balance', 'private');

  it('recomputes for every invoice that has ever carried TDS, not only while TDS is live', () => {
    expect(trg).toMatch(
      /SELECT COALESCE\(SUM\(tds_amount\) FILTER \(WHERE status <> 'VOIDED'\), 0\.00\), count\(\*\)\s+INTO v_tds, v_rows/,
    );
    expect(trg).toMatch(/IF v_rows = 0 THEN\s+RETURN NEW;/);
    expect(trg).not.toMatch(/IF v_tds <= 0 THEN/);
    expect(trg).toContain('NEW.balance_due := GREATEST(0.00, v_amount - v_paid - v_tds);');
    const prior = latestBefore200('enforce_invoice_tds_balance', 'private');
    expect(prior.file.startsWith('00199')).toBe(true);
    expect(stripComments(prior.body)).toMatch(/IF v_tds <= 0 THEN\s+RETURN NEW;/);
  });

  it('moves PAID back to PARTIALLY_PAID / APPROVED when the balance reopens (sync_invoice_payment_state rule)', () => {
    expect(trg).toMatch(/IF NEW\.status::text IN \('APPROVED', 'PARTIALLY_PAID'\) AND v_paid \+ v_tds >= v_amount THEN\s+NEW\.status := 'PAID';/);
    expect(trg).toMatch(/ELSIF NEW\.status::text = 'PAID' AND v_paid \+ v_tds < v_amount THEN/);
    expect(trg).toContain("WHEN v_paid > 0 THEN 'PARTIALLY_PAID'::public.invoice_status");
    expect(trg).toContain("ELSE 'APPROVED'::public.invoice_status");
  });

  // JS mirror of the trigger, applied to a full apply → void → re-apply cycle.
  type Inv = { amount: number; paid: number; status: string; balanceDue: number };
  function recompute(inv: Inv, liveTds: number, hasTdsRows: boolean): Inv {
    if (!hasTdsRows) return inv;
    const out = { ...inv, balanceDue: Math.max(0, inv.amount - inv.paid - liveTds) };
    if (['APPROVED', 'PARTIALLY_PAID'].includes(out.status) && inv.paid + liveTds >= inv.amount) out.status = 'PAID';
    else if (out.status === 'PAID' && inv.paid + liveTds < inv.amount) out.status = inv.paid > 0 ? 'PARTIALLY_PAID' : 'APPROVED';
    return out;
  }

  it('mirror: void after PAID reopens the balance, repeating it is a no-op, re-applying settles again', () => {
    const start: Inv = { amount: 118000, paid: 116000, status: 'PARTIALLY_PAID', balanceDue: 2000 };
    const applied = recompute(start, 2000, true);
    expect(applied).toEqual({ amount: 118000, paid: 116000, status: 'PAID', balanceDue: 0 });
    const voided = recompute(applied, 0, true);
    expect(voided).toEqual({ amount: 118000, paid: 116000, status: 'PARTIALLY_PAID', balanceDue: 2000 });
    expect(recompute(voided, 0, true)).toEqual(voided);
    expect(recompute(voided, 2000, true).status).toBe('PAID');
    const unpaid = recompute({ amount: 1000, paid: 0, status: 'PAID', balanceDue: 0 }, 0, true);
    expect(unpaid).toEqual({ amount: 1000, paid: 0, status: 'APPROVED', balanceDue: 1000 });
    const fullyPaid = recompute({ amount: 1000, paid: 1000, status: 'PAID', balanceDue: 0 }, 0, true);
    expect(fullyPaid.status).toBe('PAID');
    const noTds = { amount: 1000, paid: 0, status: 'PAID', balanceDue: 0 };
    expect(recompute(noTds, 0, false)).toBe(noTds);
  });

  it('touches the invoice on insert, status, amount or invoice change and audits a void once', () => {
    const touch = fn200('touch_invoice_after_tds_change', 'private');
    expect(stripComments(SQL)).toMatch(
      /CREATE TRIGGER trg_touch_invoice_after_tds_change\s+AFTER INSERT OR UPDATE OF status, tds_amount, invoice_id ON public\.tds_deductions\s+FOR EACH ROW/,
    );
    expect(touch).toContain('UPDATE public.invoices SET updated_at = now() WHERE id = NEW.invoice_id;');
    expect(touch).toContain('UPDATE public.invoices SET updated_at = now() WHERE id = OLD.invoice_id;');
    expect(touch).toContain("IF TG_OP = 'UPDATE' AND NEW.status = 'VOIDED' AND OLD.status IS DISTINCT FROM 'VOIDED' THEN");
    expect(touch.indexOf('UPDATE public.invoices')).toBeLessThan(touch.indexOf('INSERT INTO public.audit_events'));
    expect(touch).toMatch(/INSERT INTO public\.audit_events \(\s*event_type, actor_id, organization_id, entity_type, entity_id, payload\s*\) VALUES \(\s*'tds\.voided'/);
    expect(touch).toContain("'invoice_status_after', v_inv.status");
    expect(touch).toContain("'invoice_balance_due_after', v_inv.balance_due");
  });

  it('trigger functions are not callable by API roles', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION private.enforce_invoice_tds_balance() FROM PUBLIC, anon, authenticated;');
    expect(SQL).toContain('REVOKE ALL ON FUNCTION private.touch_invoice_after_tds_change() FROM PUBLIC, anon, authenticated;');
  });
});
