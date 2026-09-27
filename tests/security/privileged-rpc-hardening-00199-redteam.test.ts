import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveInvoiceTdsBase,
  PILOT_MONTHLY_RFQ_ALLOWANCE,
  STANDARD_MONTHLY_RFQ_ALLOWANCE,
} from '@otp/domain';

/**
 * Static contract tests for migration 00199. No database is available in this
 * environment, so the migration has never been executed; these tests pin the
 * SQL text, re-derive the always-true guard inventory from 00001..00198 and
 * emulate the guard rewrite on every affected definition.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql';
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

interface FnDef {
  schema: string;
  name: string;
  args: string;
  header: string;
  body: string;
  file: string;
}

const FN_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public|private)\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*(RETURNS[\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\5([^;]*);/gi;

function functionDefs(file: string, text?: string): FnDef[] {
  const src = text ?? readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
  const out: FnDef[] = [];
  const re = new RegExp(FN_RE.source, FN_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({
      schema: (m[1] || 'public').toLowerCase(),
      name: m[2],
      args: m[3],
      header: `${m[4]} ${m[7]}`,
      body: m[6],
      file,
    });
  }
  return out;
}

function argTypes(args: string): string {
  return args
    .split(/,(?![^(]*\))/)
    .map((a) => a.replace(/\bDEFAULT\b[\s\S]*$/i, '').replace(/=[\s\S]*$/, '').trim())
    .filter(Boolean)
    .map((a) => {
      const parts = a.replace(/^(IN|OUT|INOUT)\s+/i, '').split(/\s+/);
      return (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).toLowerCase().replace(/\s*\(\s*[\d,\s]+\)/, '');
    })
    .join(',');
}

/** Latest definition of every public function (by name + arg types) before 00199. */
function latestPublicDefinitionsBefore199(): Map<string, FnDef> {
  const latest = new Map<string, FnDef>();
  for (const file of MIGRATION_FILES.slice(0, 198)) {
    const src = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    const dropRe = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?\s*\(([^;]*?)\)\s*(?:CASCADE)?\s*;/gi;
    let d: RegExpExecArray | null;
    while ((d = dropRe.exec(src))) latest.delete(`${d[1]}(${argTypes(d[2])})`);
    for (const def of functionDefs(file, src)) {
      if (def.schema !== 'public') continue;
      latest.set(`${def.name}(${argTypes(def.args)})`, def);
    }
  }
  return latest;
}

const ALWAYS_TRUE = [
  /auth\.role\(\)\s*=\s*'(authenticated|anon)'/i,
  /auth\.role\(\)\s+IN\s*\([^)]*'(authenticated|anon)'/i,
  /current_user\s+IN\s*\(\s*'postgres'/i,
];
const isAlwaysTrue = (body: string) => ALWAYS_TRUE.some((re) => re.test(stripComments(body)));
const isDefiner = (def: FnDef) => /SECURITY\s+DEFINER/i.test(def.header);

/** JS mirror of the three regexp_replace passes in the 00199 sweep. */
function sweepRewrite(body: string): string {
  return body
    .replace(/\s+OR\s+auth\.role\(\)\s*=\s*'(authenticated|anon)'/gi, '')
    .replace(/current_user\s+IN\s*\(\s*'postgres'\s*,\s*'service_role'\s*\)\s+OR\s+/gi, '')
    .replace(/auth\.role\(\)\s+IN\s*\(\s*'authenticated'\s*,\s*'anon'\s*\)/gi, 'false');
}

function listArray(varName: string): string[] {
  const m = SQL.match(new RegExp(`${varName} text\\[\\] := ARRAY\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${varName} not found`);
  return [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
}

const SWEEP_NAMES = listArray('v_names');
const SWEEP_WRAPPERS = listArray('v_wrappers');
const DEFS_199 = functionDefs(FILE, SQL);

function fn199(name: string, schema = 'public'): string {
  const hits = DEFS_199.filter((d) => d.name === name && d.schema === schema);
  expect(hits, `${schema}.${name} defined once in 00199`).toHaveLength(1);
  return stripComments(hits[0].body);
}

function latestBefore199(name: string): FnDef {
  let hit: FnDef | undefined;
  for (const file of MIGRATION_FILES.slice(0, 198)) {
    for (const def of functionDefs(file)) if (def.name === name && def.schema === 'public') hit = def;
  }
  if (!hit) throw new Error(`no prior definition of ${name}`);
  return hit;
}

/** Multiset line diff (trimmed, comments and blank lines ignored). */
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

describe('00199 migration file', () => {
  it('sits at position 199 of the contiguous chain 00001..00203', () => {
    expect(MIGRATION_FILES.length).toBe(203);
    expect(MIGRATION_FILES[198]).toBe(FILE);
    MIGRATION_FILES.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('runs in one transaction', () => {
    const code = stripComments(SQL).trim();
    expect(code.startsWith('BEGIN;')).toBe(true);
    expect(code.endsWith('COMMIT;')).toBe(true);
  });

  it('is non-destructive: no row deletion, truncation, table/column/function drops or RLS/trigger disabling', () => {
    const code = stripComments(SQL);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|SCHEMA|VIEW|INDEX|TYPE)\b/i);
    expect(code).not.toMatch(/DISABLE\s+(ROW\s+LEVEL\s+SECURITY|TRIGGER)/i);
    expect(code).not.toMatch(/ALTER\s+TABLE[^;]*DROP\b/i);
    for (const drop of code.match(/\bDROP\s+\w+[^;]*;/gi) ?? []) {
      expect(drop).toMatch(/^DROP\s+(POLICY|TRIGGER)\s+IF\s+EXISTS\b/i);
    }
  });

  it('never grants anything to anon or PUBLIC', () => {
    const code = stripComments(SQL);
    for (const grant of code.match(/\bGRANT\b[^;]*;/gi) ?? []) {
      expect(grant, grant).not.toMatch(/\bTO\b[^;]*\b(anon|PUBLIC)\b/i);
    }
  });

  it('does not touch pilot financial settings', () => {
    const code = stripComments(SQL);
    expect(code).not.toMatch(/platform_settings|system_settings|fee_percent|reward_percent|referral_reward|PILOT_SANDBOX/i);
  });
});

describe('A1. always-true admin guard sweep (SEC-3, SEC-4 and the wider sweep)', () => {
  const latest = latestPublicDefinitionsBefore199();
  const flagged = [...latest.values()].filter((d) => isDefiner(d) && isAlwaysTrue(d.body));
  const redefinedIn199 = new Set(DEFS_199.filter((d) => d.schema === 'public').map((d) => d.name));

  it('the inventory re-derived from 00001..00198 finds the known always-true definer functions', () => {
    expect(flagged.length).toBeGreaterThanOrEqual(40);
    const names = new Set(flagged.map((d) => d.name));
    expect(names).toContain('admin_execute_service_action');
    expect(names).toContain('admin_get_users_and_organizations');
    expect(names).toContain('admin_bulk_delete_users');
    expect(names).toContain('admin_run_diagnostic_query');
    expect(names).toContain('admin_purge_all_transactional_records');
  });

  it('every always-true definer function is either swept or re-created by 00199', () => {
    const uncovered = flagged
      .map((d) => d.name)
      .filter((n) => !SWEEP_NAMES.includes(n) && !redefinedIn199.has(n));
    expect(uncovered).toEqual([]);
  });

  it('every swept name exists in the chain', () => {
    const names = new Set([...latest.values()].map((d) => d.name));
    for (const n of [...SWEEP_NAMES, ...SWEEP_WRAPPERS]) expect(names.has(n), n).toBe(true);
  });

  it('the rewrite leaves every swept definition clean and still admin-gated', () => {
    const swept = flagged.filter((d) => SWEEP_NAMES.includes(d.name));
    expect(swept.length).toBeGreaterThan(0);
    for (const def of swept) {
      const rewritten = sweepRewrite(def.body);
      expect(isAlwaysTrue(rewritten), `${def.name} (${def.file})`).toBe(false);
      expect(rewritten, `${def.name} residual current_user`).not.toMatch(/current_user\s+IN\s*\(/i);
      expect(rewritten, `${def.name} keeps admin check`).toContain('private.is_platform_admin()');
    }
  });

  it('the SQL sweep uses the same three rewrites, asserts the result and re-grants without anon', () => {
    const block = SQL.slice(SQL.indexOf('DO $sweep$'), SQL.indexOf('$sweep$;'));
    expect(block).toContain(`regexp_replace(v_def, '\\s+OR\\s+auth\\.role\\(\\)\\s*=\\s*''(authenticated|anon)''', '', 'gi')`);
    expect(block).toContain(
      `regexp_replace(v_new, 'current_user\\s+IN\\s*\\(\\s*''postgres''\\s*,\\s*''service_role''\\s*\\)\\s+OR\\s+', '', 'gi')`,
    );
    expect(block).toContain(
      `regexp_replace(v_new, 'auth\\.role\\(\\)\\s+IN\\s*\\(\\s*''authenticated''\\s*,\\s*''anon''\\s*\\)', 'false', 'gi')`,
    );
    expect(block).toContain("RAISE EXCEPTION '00199: residual always-true guard in %'");
    expect(block).toContain("RAISE EXCEPTION '00199: % lost its platform-admin check during rewrite'");
    expect(block).toContain("EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure)");
    expect(block).toContain("EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.oid::regprocedure)");
    expect(block).toContain('p.proname = ANY (v_names || v_wrappers)');
  });

  it('SEC-3 and SEC-4 are in the sweep', () => {
    expect(SWEEP_NAMES).toContain('admin_execute_service_action');
    expect(SWEEP_NAMES).toContain('admin_get_users_and_organizations');
  });

  it('a post-condition block warns about any definer function still matching the patterns', () => {
    const block = SQL.slice(SQL.indexOf('DO $verify$'), SQL.indexOf('$verify$;'));
    expect(block).toContain('p.prosecdef');
    expect(block).toContain('RAISE WARNING');
  });
});

describe('A2/A3. admin snapshots and notification read', () => {
  it('admin_database_snapshots policies are platform-admin only and anon is revoked', () => {
    const code = stripComments(SQL);
    expect(code).toMatch(
      /CREATE POLICY admin_snapshots_select ON public\.admin_database_snapshots\s+FOR SELECT TO authenticated\s+USING \(private\.is_platform_admin\(\)\);/,
    );
    expect(code).toMatch(
      /CREATE POLICY admin_snapshots_all ON public\.admin_database_snapshots\s+FOR ALL TO authenticated\s+USING \(private\.is_platform_admin\(\)\)\s+WITH CHECK \(private\.is_platform_admin\(\)\);/,
    );
    expect(code).toContain('REVOKE ALL ON public.admin_database_snapshots FROM anon;');
  });

  it('admin_mark_notification_read limits normal users to their own notifications', () => {
    const body = fn199('admin_mark_notification_read');
    expect(body).toContain('AND (v_is_admin OR profile_id = v_profile_id)');
    expect(body).toContain('IF NOT v_is_admin AND v_profile_id IS NULL THEN');
    expect(body).not.toMatch(/auth\.role\(\)/);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.admin_mark_notification_read(uuid) FROM PUBLIC, anon;');
  });
});

describe('SEC-2 admin_bulk_delete_users', () => {
  const body = fn199('admin_bulk_delete_users');

  it('is platform admin / service_role only', () => {
    expect(body).toContain("IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN");
    expect(isAlwaysTrue(body)).toBe(false);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.admin_bulk_delete_users(uuid[], boolean) FROM PUBLIC, anon;');
  });

  it('never deletes rows, including when p_soft_delete = false', () => {
    expect(body).not.toMatch(/\bDELETE\b/i);
    expect(body).not.toMatch(/IF\s+(NOT\s+)?p_soft_delete/i);
    expect(body).toContain("SET status = 'DELETED'");
    expect(body).toContain('deleted_at = COALESCE(deleted_at, now())');
    expect(body).toContain("'hardDeleteRefused', (p_soft_delete IS FALSE)");
    const prior = latestBefore199('admin_bulk_delete_users');
    expect(prior.file.startsWith('00186')).toBe(true);
    expect(stripComments(prior.body)).toMatch(/DELETE FROM/i);
  });

  it('keeps the protected-admin filter', () => {
    expect(body).toContain('AND COALESCE(p.is_platform_admin, false) = false');
    expect(body).toContain("'bvnbasu@gmail.com'");
  });

  it('writes the audit row with real audit_events columns and does not swallow failures', () => {
    expect(body).toMatch(/INSERT INTO public\.audit_events \(\s*event_type,\s*actor_id,\s*entity_type,\s*entity_id,\s*payload\s*\)/);
    expect(body).toContain("'admin.bulk_delete_users'");
    expect(body).not.toMatch(/\bactor_role\b|\baction\b/);
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/i);
  });
});

describe('SEC-1 lock_and_reveal_award_atomic', () => {
  const body = fn199('lock_and_reveal_award_atomic');
  const guard = "RAISE EXCEPTION 'Only an owner or manager of the buying organization can lock an award (AWARD-UNAUTHORIZED)'";

  it('requires buyer OWNER/MANAGER, platform admin or service_role, fail-closed on NULL', () => {
    expect(body).toContain("COALESCE(auth.role(), '') = 'service_role'");
    expect(body).toContain('OR private.is_platform_admin()');
    expect(body).toContain(
      'OR (auth.uid() IS NOT NULL AND COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false))',
    );
    expect(body).toContain(guard);
  });

  it('checks authorization right after the RFQ lock and before any write', () => {
    const lockAt = body.indexOf('FOR UPDATE;');
    const guardAt = body.indexOf(guard);
    const firstWrite = body.search(/\b(INSERT\s+INTO|UPDATE\s+public\.|UPDATE\s+\w+\s+SET)\b/i);
    expect(lockAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(lockAt);
    expect(guardAt).toBeLessThan(firstWrite);
    expect(guardAt).toBeLessThan(body.indexOf('Required approval tier(s) are pending satisfaction'));
  });

  it('only adds the guard to the 00196 body (approval tiers, quorum, COI, anti-self-approval kept)', () => {
    const prior = latestBefore199('lock_and_reveal_award_atomic');
    expect(prior.file.startsWith('00196')).toBe(true);
    const diff = lineDiff(prior.body, body);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual(
      [
        'END IF;',
        'IF NOT (',
        "COALESCE(auth.role(), '') = 'service_role'",
        'OR private.is_platform_admin()',
        'OR (auth.uid() IS NOT NULL AND COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false))',
        ') THEN',
        `${guard};`,
      ].sort(),
    );
  });

  it('is revoked from anon and PUBLIC', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) FROM PUBLIC, anon;');
  });
});

describe('SEC-5 upsert_buyer_address_atomic', () => {
  const body = fn199('upsert_buyer_address_atomic');

  it('checks ownership of an existing address before unsetting other primaries or updating', () => {
    const ownAt = body.indexOf('IF NOT v_can_edit THEN');
    expect(ownAt).toBeGreaterThan(-1);
    expect(ownAt).toBeLessThan(body.indexOf('SET is_primary = false'));
    expect(ownAt).toBeLessThan(body.indexOf('UPDATE public.buyer_addresses\n    SET\n      label'));
    expect(body).toContain('SELECT * INTO v_existing FROM public.buyer_addresses WHERE id = p_address_id FOR UPDATE;');
  });

  it('allows the owning profile, an org member of the owning org, or a platform admin; NULL fails closed', () => {
    expect(body).toMatch(/v_can_edit := COALESCE\(\s*private\.is_platform_admin\(\)/);
    expect(body).toContain('AND (v_existing.profile_id = auth.uid() OR v_existing.profile_id = private.get_profile_id()))');
    expect(body).toContain('OR (v_existing.organization_id IS NOT NULL AND private.is_org_member(v_existing.organization_id)),');
    expect(body).toContain('IF v_existing.organization_id IS DISTINCT FROM p_org_id THEN');
  });

  it('otherwise preserves the 00196 body', () => {
    const prior = latestBefore199('upsert_buyer_address_atomic');
    expect(prior.file.startsWith('00196')).toBe(true);
    const diff = lineDiff(prior.body, body);
    expect(diff.removed).toEqual(['SELECT * INTO v_existing FROM public.buyer_addresses WHERE id = p_address_id;']);
    expect(diff.added.every((l) => !/DELETE|DROP/i.test(l))).toBe(true);
  });

  it('revokes anon on the address RPCs', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;',
    );
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.get_buyer_addresses(uuid) FROM PUBLIC, anon;');
  });
});

describe('A7. anon-granted readers', () => {
  it('get_organization_subscription requires membership, platform admin or service_role', () => {
    const body = fn199('get_organization_subscription');
    const diff = lineDiff(latestBefore199('get_organization_subscription').body, body);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual(
      [
        'IF NOT (',
        'COALESCE(private.is_org_member(p_organization_id), false)',
        'OR private.is_platform_admin()',
        "OR COALESCE(auth.role(), '') = 'service_role'",
        ') THEN',
        "RETURN jsonb_build_object('ok', false, 'error', 'Access denied');",
        'END IF;',
      ].sort(),
    );
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.get_organization_subscription(uuid) FROM PUBLIC, anon;');
  });

  it('get_purchase_order_invoicing_summary is limited to the buyer org, the PO supplier or an admin', () => {
    const body = fn199('get_purchase_order_invoicing_summary');
    expect(body).toMatch(
      /IF NOT COALESCE\(\s*private\.is_platform_admin\(\)\s*OR private\.is_org_member\(v_po\.organization_id\)\s*OR private\.is_supplier_user_for\(v_po\.supplier_id\),\s*false\s*\) THEN/,
    );
    expect(lineDiff(latestBefore199('get_purchase_order_invoicing_summary').body, body).removed).toEqual([]);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.get_purchase_order_invoicing_summary(uuid) FROM PUBLIC, anon;');
  });

  it('create_system_notification is service_role only; step/eligibility readers need a session', () => {
    const block = SQL.slice(SQL.indexOf('DO $readers$'), SQL.indexOf('$readers$;'));
    expect(block).toContain("p.proname = 'create_system_notification'");
    expect(block).toContain("EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure)");
    expect(block).toContain("EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure)");
    expect(block).toContain("p.proname IN ('get_current_procurement_step', 'check_supplier_award_eligibility_atomic')");
  });

  it('create_system_notification is only called from SECURITY DEFINER code', () => {
    const latest = latestPublicDefinitionsBefore199();
    const callers = [...latest.values()].filter(
      (d) => d.name !== 'create_system_notification' && /create_system_notification\s*\(/.test(stripComments(d.body)),
    );
    expect(callers.length).toBeGreaterThan(0);
    for (const c of callers) expect(isDefiner(c), `${c.name} (${c.file})`).toBe(true);
    const webSrc = resolve(__dirname, '../../apps/web/src');
    const hits = readdirSync(webSrc, { recursive: true, withFileTypes: false } as never) as unknown as string[];
    for (const rel of hits.filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
      expect(readFileSync(resolve(webSrc, rel), 'utf8'), rel).not.toContain("'create_system_notification'");
    }
  });
});

describe('SEC-6 rfqs address snapshots', () => {
  const block = SQL.slice(SQL.indexOf('DO $cols$'), SQL.indexOf('$cols$;'));

  it('grants SELECT on every rfqs column except the two snapshots', () => {
    expect(block).toContain("AND column_name NOT IN ('delivery_address_snapshot', 'billing_address_snapshot')");
    expect(block).toContain('REVOKE SELECT ON public.rfqs FROM PUBLIC, anon, authenticated;');
    expect(block).toContain("EXECUTE format('GRANT SELECT (%s) ON public.rfqs TO authenticated', v_cols);");
    expect(block).not.toMatch(/GRANT[^;]*anon/i);
  });

  it('the snapshot columns exist in the chain (added by 00196)', () => {
    const src = readFileSync(resolve(MIGRATIONS_DIR, MIGRATION_FILES[195]), 'utf8');
    expect(MIGRATION_FILES[195].startsWith('00196')).toBe(true);
    expect(src).toMatch(/delivery_address_snapshot/);
    expect(src).toMatch(/billing_address_snapshot/);
  });
});

describe('SEC-7 buyer identity masking for suppliers', () => {
  const viewSql = stripComments(SQL.slice(SQL.indexOf('CREATE OR REPLACE VIEW public.rfqs_supplier_masked'), SQL.indexOf('REVOKE ALL ON public.rfqs_supplier_masked')));
  const reveal = /WHEN r\.reveal_status = 'REVEALED' AND EXISTS \(\s*SELECT 1\s*FROM awards a\s*JOIN quotes q ON q\.id = a\.quote_id\s*WHERE a\.rfq_id = r\.id\s*AND a\.status = 'REVEALED'\s*AND q\.supplier_id = (ri\.supplier_id|p_supplier_id)\s*\) THEN o\.name/;

  it('rfqs_supplier_masked shows the buyer name only to the revealed awarded supplier', () => {
    expect(viewSql).toMatch(reveal);
    expect(viewSql).toContain("ELSE 'Identity protected'::text");
    expect(viewSql).not.toMatch(/WHEN r\.buyer_anonymous_to_suppliers THEN 'Identity protected'/);
    expect(viewSql).toContain('WHERE private.is_supplier_user_for(ri.supplier_id);');
    expect(viewSql).not.toMatch(/address_snapshot|address_line|contact_phone/);
    expect(SQL).toContain('REVOKE ALL ON public.rfqs_supplier_masked FROM anon;');
  });

  it('keeps the 00117 view column list and order', () => {
    const prior = readFileSync(resolve(MIGRATIONS_DIR, MIGRATION_FILES.find((f) => f.startsWith('00117'))!), 'utf8');
    const priorView = stripComments(prior.slice(prior.indexOf('CREATE OR REPLACE VIEW public.rfqs_supplier_masked')));
    const cols = (v: string) =>
      [...v.slice(0, v.search(/\bFROM rfqs r\b/)).matchAll(/\bAS (\w+)\s*,?\s*$|^\s*(?:r|ri|req|cat|sub)\.(\w+)\s*,?\s*$/gm)].map(
        (m) => m[1] ?? m[2],
      );
    expect(cols(viewSql)).toEqual(cols(priorView));
    expect(cols(viewSql)).toContain('buyer_display_name');
  });

  it('supplier_rfq_message_payload masks buyerDisplay the same way and is service_role only', () => {
    const body = fn199('supplier_rfq_message_payload');
    expect(body).toMatch(reveal);
    expect(body).toContain("ELSE 'IDENTITY PROTECTED'");
    const diff = lineDiff(latestBefore199('supplier_rfq_message_payload').body, body);
    expect(diff.removed.join('\n')).toMatch(/buyer_anonymous_to_suppliers/);
    expect(diff.removed).toHaveLength(3);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public.supplier_rfq_message_payload(uuid, uuid) FROM PUBLIC, anon, authenticated;');
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.supplier_rfq_message_payload(uuid, uuid) TO service_role;');
  });
});

describe('Issue 13 TDS server enforcement', () => {
  const body = fn199('apply_tds_withholding_atomic');

  it('keeps the RPC signature', () => {
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text) TO authenticated, service_role;',
    );
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text) FROM PUBLIC, anon;',
    );
  });

  it('ignores the client taxable amount for the computation', () => {
    const uses = body.match(/p_taxable_amount/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(body).toContain("'client_taxable_amount', p_taxable_amount");
    expect(body).toMatch(/section,\s*v_taxable,\s*p_tds_rate,\s*v_statutory_tds,/);
  });

  it('derives the organization from the invoice PO and rejects a mismatched org', () => {
    expect(body).toContain('SELECT organization_id INTO v_org_id FROM public.purchase_orders WHERE id = v_po_id;');
    expect(body).toContain('SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_invoice.work_order_id;');
    expect(body).toContain('TDS-5C4-NO-PO');
    expect(body).toContain('IF p_organization_id IS NOT NULL AND p_organization_id <> v_org_id THEN');
    expect(body).toContain('TDS-5C4-ORG-MISMATCH');
    expect(body).toMatch(/INSERT INTO public\.tds_deductions \([\s\S]*?\) VALUES \(\s*v_org_id,/);
  });

  it('role check fails closed when the caller has no role', () => {
    expect(body).toContain("COALESCE(private.get_org_role(v_org_id)::text, '') NOT IN ('OWNER', 'MANAGER')");
  });

  it('is idempotent: an existing live deduction is returned before any validation or write', () => {
    const replayAt = body.indexOf("'idempotent_replay', true");
    expect(replayAt).toBeGreaterThan(-1);
    expect(body).toMatch(/FROM public\.tds_deductions\s+WHERE invoice_id = p_invoice_id AND status <> 'VOIDED'/);
    expect(replayAt).toBeLessThan(body.indexOf('INSERT INTO public.tds_deductions'));
    expect(body.indexOf('FOR UPDATE;')).toBeLessThan(replayAt);
  });

  it('checks real invoice status labels and rate bounds', () => {
    expect(body).toContain("IF v_invoice.status::text NOT IN ('SUBMITTED', 'APPROVED', 'PARTIALLY_PAID') THEN");
    expect(body).not.toMatch(/'DRAFT'|'CANCELLED'/);
    expect(body).toContain('IF p_tds_rate IS NULL OR p_tds_rate < 0 OR p_tds_rate > 20 THEN');
  });

  it('never deducts more than the outstanding balance', () => {
    expect(body).toContain('v_outstanding := GREATEST(0, v_gross - COALESCE(v_invoice.paid_amount, 0));');
    expect(body).toContain('TDS-5C4-EXCEEDS-OUTSTANDING');
  });

  it('writes the audit row with real audit_events columns', () => {
    expect(body).toMatch(
      /INSERT INTO public\.audit_events \(\s*event_type,\s*actor_id,\s*organization_id,\s*entity_type,\s*entity_id,\s*payload\s*\) VALUES \(\s*'tds\.deducted'/,
    );
    expect(body).not.toMatch(/\baction\s*,/);
  });

  // JS mirror of the SQL base precedence, checked against the domain rule the UI uses.
  function sqlBase(inv: { amount: number; cgst?: number; sgst?: number; utgst?: number; igst?: number; taxableTotal?: number }) {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const gross = r2(Math.max(inv.amount, 0));
    const gst = r2([inv.cgst, inv.sgst, inv.utgst, inv.igst].reduce<number>((a, v) => a + Math.max(v ?? 0, 0), 0));
    if (gst > 0 && gst < gross) return gross - gst;
    if ((inv.taxableTotal ?? 0) > 0 && (inv.taxableTotal as number) < gross) return r2(inv.taxableTotal as number);
    return gross;
  }

  it('the SQL base precedence matches deriveInvoiceTdsBase', () => {
    expect(body).toMatch(/IF v_gst > 0 AND v_gst < v_gross THEN\s*v_taxable := v_gross - v_gst;/);
    expect(body).toMatch(/ELSIF COALESCE\(v_invoice\.taxable_total, 0\) > 0 AND v_invoice\.taxable_total < v_gross THEN\s*v_taxable := ROUND\(v_invoice\.taxable_total, 2\);/);
    expect(body).toMatch(/ELSE\s*v_taxable := v_gross;/);
    const cases = [
      { amount: 118000, cgst: 9000, sgst: 9000 },
      { amount: 118000, igst: 18000 },
      { amount: 118000, taxableTotal: 100000 },
      { amount: 100000 },
      { amount: 50000, igst: 50000 },
      { amount: 1180.5, cgst: 90.25, sgst: 90.25, taxableTotal: 1000 },
    ];
    for (const c of cases) {
      const domain = deriveInvoiceTdsBase({
        amount: c.amount,
        cgstTotal: c.cgst,
        sgstTotal: c.sgst,
        utgstTotal: c.utgst,
        igstTotal: c.igst,
        taxableTotal: c.taxableTotal,
      });
      expect(sqlBase(c), JSON.stringify(c)).toBeCloseTo(domain.taxableAmount, 2);
    }
  });

  it('allows at most one live deduction per invoice and blocks direct buyer writes', () => {
    const code = stripComments(SQL);
    expect(code).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_tds_deductions_one_live_per_invoice\s+ON public\.tds_deductions \(invoice_id\)\s+WHERE status <> 'VOIDED';/,
    );
    expect(code).toMatch(
      /CREATE POLICY tds_deductions_mutate ON public\.tds_deductions\s+FOR ALL TO authenticated\s+USING \(private\.is_platform_admin\(\)\)\s+WITH CHECK \(private\.is_platform_admin\(\)\);/,
    );
  });

  it('nets live TDS into balance_due on every invoice update so the invoice can reach PAID', () => {
    const trg = fn199('enforce_invoice_tds_balance', 'private');
    expect(trg).toContain("WHERE invoice_id = NEW.id AND status <> 'VOIDED';");
    expect(trg).toContain('NEW.balance_due := GREATEST(0.00, COALESCE(NEW.amount, 0) - COALESCE(NEW.paid_amount, 0) - v_tds);');
    expect(trg).toMatch(/IF NEW\.status::text IN \('APPROVED', 'PARTIALLY_PAID'\)\s+AND COALESCE\(NEW\.paid_amount, 0\) \+ v_tds >= COALESCE\(NEW\.amount, 0\) THEN\s+NEW\.status := 'PAID';/);
    expect(trg).toMatch(/IF v_tds <= 0 THEN\s+RETURN NEW;/);
    expect(stripComments(SQL)).toMatch(/CREATE TRIGGER trg_enforce_invoice_tds_balance\s+BEFORE UPDATE ON public\.invoices\s+FOR EACH ROW/);
    expect(stripComments(SQL)).toMatch(/CREATE TRIGGER trg_touch_invoice_after_tds_change\s+AFTER UPDATE OF status, tds_amount ON public\.tds_deductions/);
    expect(body).toContain('UPDATE public.invoices SET updated_at = now() WHERE id = p_invoice_id;');
  });
});

describe('Issue 11 milestone progression', () => {
  const trg = fn199('enforce_work_order_milestone_progression', 'private');

  it('only allows the next 25% step, by the supplier or a buyer owner/manager', () => {
    expect(trg).toContain('v_reached := (GREATEST(v_from, 0) / 25) * 25;');
    expect(trg).toContain('IF v_to NOT IN (25, 50, 75, 100) THEN');
    expect(trg).toContain('IF v_to <= v_reached THEN');
    expect(trg).toContain('IF v_to <> v_reached + 25 THEN');
    expect(trg).toMatch(/private\.is_supplier_user_for\(NEW\.supplier_id\)\s+OR private\.is_org_manager_or_above\(v_po\.organization_id\),\s+false/);
    for (const code of ['WO-MILESTONE-STEP', 'WO-MILESTONE-BACKWARD', 'WO-MILESTONE-SKIP', 'WO-MILESTONE-UNAUTHORIZED', 'WO-MILESTONE-LOCKED']) {
      expect(trg).toContain(code);
    }
  });

  it('mirrors the rule in JS: 0→25→50→75→100 only', () => {
    const allowed = (from: number, to: number) => {
      const reached = Math.floor(Math.max(from, 0) / 25) * 25;
      return [25, 50, 75, 100].includes(to) && to > reached && to === reached + 25;
    };
    expect(allowed(0, 25)).toBe(true);
    expect(allowed(25, 50)).toBe(true);
    expect(allowed(75, 100)).toBe(true);
    expect(allowed(0, 50)).toBe(false);
    expect(allowed(25, 100)).toBe(false);
    expect(allowed(50, 25)).toBe(false);
    expect(allowed(40, 50)).toBe(true);
    expect(allowed(0, 30)).toBe(false);
  });

  it('COMPLETED requires the inspection sign-off and 100%', () => {
    expect(trg).toContain("v_signoff boolean := COALESCE(current_setting('otp.wo_inspection_signoff', true), '') = 'on';");
    expect(trg).toMatch(/IF NEW\.status = 'COMPLETED' THEN\s+IF NOT v_signoff THEN/);
    expect(trg).toContain('WO-COMPLETION-REQUIRES-INSPECTION');
    expect(trg).toMatch(/IF v_to < 100 THEN\s+RAISE EXCEPTION[^;]*WO-COMPLETION-BEFORE-100/);
  });

  it('RAISE messages print a literal percent sign correctly', () => {
    for (const m of trg.match(/RAISE EXCEPTION '[^']*(?:''[^']*)*'/g) ?? []) {
      expect(m).not.toContain('%%%');
    }
    expect(trg).toContain("v_reached || '%', v_to || '%'");
  });

  it('exempts only platform admins and the demo simulator running inside another trigger', () => {
    expect(trg.indexOf('IF private.is_platform_admin() THEN')).toBeLessThan(trg.indexOf('WO-MILESTONE-LOCKED'));
    expect(trg).toMatch(/IF pg_trigger_depth\(\) > 1 THEN\s+v_is_demo := COALESCE\(NEW\.is_demo, false\)/);
  });

  it('fires on progress/status updates and audits every change', () => {
    const code = stripComments(SQL);
    expect(code).toMatch(/CREATE TRIGGER trg_enforce_work_order_milestone_progression\s+BEFORE UPDATE OF progress_percent, status ON public\.work_orders/);
    expect(code).toMatch(/CREATE TRIGGER trg_audit_work_order_milestone\s+AFTER UPDATE OF progress_percent, status ON public\.work_orders/);
    const audit = fn199('audit_work_order_milestone', 'private');
    expect(audit).toContain("'work_order.completed'");
    expect(audit).toContain("'work_order.milestone_recorded'");
    expect(audit).toMatch(/INSERT INTO public\.audit_events \(\s*event_type, actor_id, organization_id, entity_type, entity_id, payload\s*\)/);
  });

  it('accept_delivery_inspection requires 100% and brackets its update with the sign-off flag', () => {
    const body = fn199('accept_delivery_inspection');
    const pre = body.indexOf('WO-INSPECTION-BEFORE-100');
    const on = body.indexOf("PERFORM set_config('otp.wo_inspection_signoff', 'on', true);");
    const upd = body.indexOf('UPDATE work_orders');
    const off = body.indexOf("PERFORM set_config('otp.wo_inspection_signoff', '', true);");
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(on);
    expect(on).toBeLessThan(upd);
    expect(upd).toBeLessThan(off);
    const prior = latestBefore199('accept_delivery_inspection');
    expect(prior.file.startsWith('00195')).toBe(true);
    expect(lineDiff(prior.body, body).removed).toEqual([]);
    expect(lineDiff(prior.body, body).added).toHaveLength(5);
  });
});

describe('Issue 22 pilot allowance at RFQ creation', () => {
  const trg = fn199('enforce_pilot_rfq_allowance', 'private');

  it('uses the same allowance as the domain rule the UI shows', () => {
    const m = trg.match(/v_allowance CONSTANT integer := (\d+);/);
    expect(Number(m?.[1])).toBe(PILOT_MONTHLY_RFQ_ALLOWANCE);
    expect(PILOT_MONTHLY_RFQ_ALLOWANCE).toBe(STANDARD_MONTHLY_RFQ_ALLOWANCE);
  });

  it('counts the organization RFQs in the current UTC calendar month, serialized per org', () => {
    expect(trg).toContain("v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';");
    expect(trg).toContain('PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;');
    expect(trg).toMatch(/AND created_at >= v_month_start\s+AND created_at < v_month_start \+ interval '1 month';/);
    expect(trg).toContain('IF v_used >= v_allowance THEN');
  });

  it('raises the same message the client publish gate shows', async () => {
    const { PILOT_ALLOWANCE_EXHAUSTED_ERROR } = await import('@/features/intake/api/pilot-allowance');
    const sqlMsg = trg.match(/RAISE EXCEPTION '((?:[^']|'')*)'/)?.[1].replace(/''/g, "'");
    const clientMsg = `Pilot Allowance: 0 of ${PILOT_MONTHLY_RFQ_ALLOWANCE} RFQs remaining this month (₹0 charged in Pilot Mode). ${PILOT_ALLOWANCE_EXHAUSTED_ERROR}`;
    expect(sqlMsg?.replace('%', String(PILOT_MONTHLY_RFQ_ALLOWANCE))).toBe(clientMsg);
    expect(trg).toContain("HINT = 'PILOT_ALLOWANCE_EXHAUSTED'");
  });

  it('runs before every rfqs insert (publish_requirement and direct inserts)', () => {
    expect(stripComments(SQL)).toMatch(/CREATE TRIGGER trg_enforce_pilot_rfq_allowance\s+BEFORE INSERT ON public\.rfqs\s+FOR EACH ROW/);
    expect(trg.indexOf('IF private.is_platform_admin() THEN')).toBeLessThan(trg.indexOf('SELECT count(*)'));
  });
});

describe('trigger helper functions are not callable by API roles', () => {
  it.each([
    'enforce_invoice_tds_balance',
    'touch_invoice_after_tds_change',
    'enforce_work_order_milestone_progression',
    'audit_work_order_milestone',
    'enforce_pilot_rfq_allowance',
  ])('%s', (name) => {
    expect(SQL).toContain(`REVOKE ALL ON FUNCTION private.${name}() FROM PUBLIC, anon, authenticated;`);
  });
});
