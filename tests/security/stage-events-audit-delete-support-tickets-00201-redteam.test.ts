import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract tests for migration 00201. No database is available in this
 * environment, so the migration has never been executed; these tests pin the
 * SQL text and re-derive the effective RLS policy set from 00001..00201.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00201_scope_procurement_stage_events_audit_delete_and_support_tickets.sql';
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

interface Policy {
  table: string;
  name: string;
  cmd: string;
  roles: string;
  body: string;
  file: string;
}

/** Effective policies after applying CREATE / DROP POLICY in file order. */
function effectivePolicies(files: string[]): Map<string, Policy> {
  const pol = new Map<string, Policy>();
  const re =
    /(CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+(?:public\.)?"?(\w+)"?([\s\S]*?);)|(DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+)\s+ON\s+(?:public\.)?"?(\w+)"?\s*;)/gi;
  for (const file of files) {
    const src = stripComments(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(src))) {
      if (m[1]) {
        const name = (m[2] as string).replace(/"/g, '');
        const body = (m[4] as string).replace(/\s+/g, ' ').trim();
        const cmd = (body.match(/\bFOR\s+(SELECT|ALL|INSERT|UPDATE|DELETE)\b/i)?.[1] ?? 'ALL').toUpperCase();
        const roles = (body.match(/\bTO\s+([\w\s,]+?)(?=\s+(USING|WITH)\b)/i)?.[1] ?? 'PUBLIC').trim();
        pol.set(`${m[3]}.${name}`, { table: m[3] as string, name, cmd, roles, body, file });
      } else {
        pol.delete(`${m[7]}.${(m[6] as string).replace(/"/g, '')}`);
      }
    }
  }
  return pol;
}

const isAlwaysTrue = (p: Policy) =>
  /\bUSING\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(p.body) || /\bWITH\s+CHECK\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(p.body);
const reachesApiRoles = (p: Policy) => !/^service_role$/i.test(p.roles);

const BEFORE = effectivePolicies(MIGRATION_FILES.slice(0, 200));
const AFTER = effectivePolicies(MIGRATION_FILES);

function sourceFiles(root: string): string[] {
  return (readdirSync(root, { recursive: true }) as string[]).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/node_modules|\.test\./.test(f),
  );
}

describe('00201 migration file', () => {
  it('is the highest migration and the chain is contiguous 00001..00201', () => {
    expect(MIGRATION_FILES.length).toBe(201);
    expect(MIGRATION_FILES[MIGRATION_FILES.length - 1]).toBe(FILE);
    MIGRATION_FILES.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('runs in one transaction and is non-destructive', () => {
    const code = stripComments(SQL).trim();
    expect(code.startsWith('BEGIN;')).toBe(true);
    expect(code.endsWith('COMMIT;')).toBe(true);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(code).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|SCHEMA|VIEW|INDEX|TYPE|TRIGGER)\b/i);
    expect(code).not.toMatch(/DISABLE\s+(ROW\s+LEVEL\s+SECURITY|TRIGGER)/i);
    for (const drop of code.match(/\bDROP\s+\w+[^;]*;/gi) ?? []) {
      expect(drop).toMatch(/^DROP\s+POLICY\s+IF\s+EXISTS\b/i);
    }
  });

  it('grants nothing to anon or PUBLIC and adds no always-true policy', () => {
    const code = stripComments(SQL);
    for (const grant of code.match(/\bGRANT\b[^;]*;/gi) ?? []) {
      expect(grant, grant).not.toMatch(/\bTO\b[^;]*\b(anon|PUBLIC)\b/i);
    }
    expect(code).not.toMatch(/USING\s*\(\s*true\s*\)|WITH\s+CHECK\s*\(\s*true\s*\)/i);
  });
});

describe('R8 procurement_stage_events', () => {
  it('root cause: before 00201 reads and inserts were open to every signed-in user', () => {
    const read = BEFORE.get('procurement_stage_events.procurement_stage_events_read');
    const insert = BEFORE.get('procurement_stage_events.procurement_stage_events_insert');
    expect(read?.file.startsWith('00148')).toBe(true);
    expect(read && isAlwaysTrue(read)).toBe(true);
    expect(insert && isAlwaysTrue(insert)).toBe(true);
  });

  it('reads and inserts are limited to the requirement buying organization and platform admins', () => {
    const scope =
      /private\.is_platform_admin\(\) OR EXISTS \( SELECT 1 FROM public\.requirements r WHERE r\.id = procurement_stage_events\.requirement_id AND private\.is_org_member\(r\.organization_id\) \)/;
    const read = AFTER.get('procurement_stage_events.procurement_stage_events_read') as Policy;
    const insert = AFTER.get('procurement_stage_events.procurement_stage_events_insert') as Policy;
    expect(read.file).toBe(FILE);
    expect(read.cmd).toBe('SELECT');
    expect(read.roles).toBe('authenticated');
    expect(read.body).toMatch(scope);
    expect(insert.cmd).toBe('INSERT');
    expect(insert.roles).toBe('authenticated');
    expect(insert.body).toMatch(scope);
    expect(read.body).not.toMatch(/supplier/i);
  });

  it('stays append-only (PA-10): no UPDATE, DELETE or ALL policy, and API roles cannot update or delete', () => {
    const onTable = [...AFTER.values()].filter((p) => p.table === 'procurement_stage_events');
    expect(onTable.map((p) => p.cmd).sort()).toEqual(['INSERT', 'SELECT']);
    expect(SQL).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON public.procurement_stage_events FROM PUBLIC, anon, authenticated;');
    expect(SQL).toContain('REVOKE ALL ON public.procurement_stage_events FROM anon;');
  });

  it('advance_procurement_step (the only writer) only gains the org guard and loses the anon grant', () => {
    const fnRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.advance_procurement_step\s*\([\s\S]*?\bAS\s+\$\$([\s\S]*?)\$\$/;
    const prior = readFileSync(resolve(MIGRATIONS_DIR, MIGRATION_FILES.find((f) => f.startsWith('00148')) as string), 'utf8');
    const norm = (b: string) =>
      stripComments(b)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const before = norm(prior.match(fnRe)?.[1] ?? '');
    const after = norm(SQL.match(fnRe)?.[1] ?? '');
    expect(before.length).toBeGreaterThan(20);
    const count = (lines: string[]) => lines.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
    const cb = count(before);
    const ca = count(after);
    const removed: string[] = [];
    const added: string[] = [];
    for (const [l, n] of cb) for (let i = 0; i < n - (ca.get(l) ?? 0); i++) removed.push(l);
    for (const [l, n] of ca) for (let i = 0; i < n - (cb.get(l) ?? 0); i++) added.push(l);
    expect(removed).toEqual([]);
    expect(added.sort()).toEqual(
      [
        'v_org_id uuid;',
        'SELECT organization_id INTO v_org_id FROM public.requirements WHERE id = p_requirement_id;',
        'IF NOT COALESCE(',
        "COALESCE(auth.role(), '') = 'service_role'",
        'OR private.is_platform_admin()',
        'OR (v_org_id IS NOT NULL AND private.is_org_member(v_org_id)),',
        'false',
        ') THEN',
        "RETURN jsonb_build_object('ok', false, 'error', 'Access denied');",
        'END IF;',
      ].sort(),
    );
    const guardAt = SQL.indexOf("'Access denied'");
    expect(guardAt).toBeLessThan(SQL.indexOf('INSERT INTO public.procurement_stage_events'));
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.advance_procurement_step(uuid, int, int, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon;',
    );
  });

  it('every SQL reader or writer is SECURITY DEFINER and no view is built on the table', () => {
    const touching: string[] = [];
    for (const file of MIGRATION_FILES) {
      const src = stripComments(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
      expect(src, file).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW[^;]*procurement_stage_events/i);
      const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\([\s\S]*?\bAS\s+(\$\w*\$)([\s\S]*?)\2([^;]*);/gi;
      let m: RegExpExecArray | null;
      while ((m = fnRe.exec(src))) {
        if (/procurement_stage_events/.test(m[3] as string)) {
          touching.push(m[1] as string);
          expect(/SECURITY\s+DEFINER/i.test(m[0]), `${m[1]} in ${file}`).toBe(true);
        }
      }
    }
    expect([...new Set(touching)].sort()).toEqual(['advance_procurement_step', 'get_current_procurement_step']);
  });

  it('no client or edge code reads the table (the reset inventory only lists its name)', () => {
    const roots = ['../../apps/web/src', '../../packages', '../../supabase/functions'].map((p) => resolve(__dirname, p));
    for (const root of roots) {
      for (const f of sourceFiles(root)) {
        const src = readFileSync(resolve(root, f), 'utf8');
        expect(src, f).not.toMatch(/from\(\s*'procurement_stage_events'\s*\)|advance_procurement_step/);
        if (!f.replace(/\\/g, '/').endsWith('reset/clean-start-reset.ts')) {
          expect(src, f).not.toContain('procurement_stage_events');
        }
      }
    }
  });
});

describe('audit_events delete', () => {
  it('root cause: anon and any signed-in user could delete audit rows (00134)', () => {
    const before = BEFORE.get('audit_events.audit_events_delete') as Policy;
    expect(before.file.startsWith('00134')).toBe(true);
    expect(isAlwaysTrue(before)).toBe(true);
    expect(before.roles).toMatch(/anon/);
  });

  it('only platform admins may delete now', () => {
    const after = AFTER.get('audit_events.audit_events_delete') as Policy;
    expect(after.file).toBe(FILE);
    expect(after.cmd).toBe('DELETE');
    expect(after.roles).toBe('authenticated');
    expect(after.body).toMatch(/USING \(private\.is_platform_admin\(\)\)/);
  });

  it('the only client deletes of audit_events are in the platform-admin ops module', () => {
    const root = resolve(__dirname, '../../apps/web/src');
    const hits = sourceFiles(root).filter((f) =>
      /from\('audit_events'\)\s*\.delete\(/.test(readFileSync(resolve(root, f), 'utf8')),
    );
    expect(hits.map((f) => f.replace(/\\/g, '/'))).toEqual(['features/admin/api/admin-ops.ts']);
  });
});

describe('support_tickets', () => {
  it('root cause: SELECT and UPDATE were USING (true) for PUBLIC (00076)', () => {
    const read = BEFORE.get('support_tickets.Admins and creators can read tickets') as Policy;
    const update = BEFORE.get('support_tickets.Admins can update tickets') as Policy;
    expect(read.file.startsWith('00076')).toBe(true);
    expect(isAlwaysTrue(read)).toBe(true);
    expect(read.roles).toBe('PUBLIC');
    expect(isAlwaysTrue(update)).toBe(true);
  });

  it('reads go to platform admins and the ticket email; updates to platform admins', () => {
    const read = AFTER.get('support_tickets.Admins and creators can read tickets') as Policy;
    const update = AFTER.get('support_tickets.Admins can update tickets') as Policy;
    expect(read.roles).toBe('authenticated');
    expect(read.body).toContain('private.is_platform_admin()');
    expect(read.body).toContain("lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))");
    expect(update.roles).toBe('authenticated');
    expect(update.body).toMatch(/USING \(private\.is_platform_admin\(\)\) WITH CHECK \(private\.is_platform_admin\(\)\)/);
  });

  it('no client code reads or updates support_tickets directly', () => {
    const root = resolve(__dirname, '../../apps/web/src');
    for (const f of sourceFiles(root)) {
      const src = readFileSync(resolve(root, f), 'utf8');
      expect(src, f).not.toMatch(/from\('support_tickets'\)\s*\.(select|update|upsert)\(/);
    }
  });
});

describe('remaining always-true policies after 00201', () => {
  it('SELECT/ALL USING (true) policies reaching API roles are only reference, config and ops-metadata tables', () => {
    const open = [...AFTER.values()]
      .filter((p) => ['SELECT', 'ALL'].includes(p.cmd) && reachesApiRoles(p) && /\bUSING\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(p.body))
      .map((p) => p.table)
      .sort();
    expect(open).toEqual([
      'buyer_type_config',
      'demo_price_anchors',
      'demo_settings',
      'market_intelligence_baselines',
      'otp_schema_migrations',
      'platform_environment_settings',
      'platform_fee_policies',
      'subcategory_capabilities',
      'subcategory_evaluation_suggestions',
    ]);
  });

  it('no UPDATE or DELETE policy reaching API roles lets any caller touch any row', () => {
    const open = [...AFTER.values()].filter(
      (p) => ['UPDATE', 'DELETE'].includes(p.cmd) && reachesApiRoles(p) && /\bUSING\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(p.body),
    );
    expect(open.map((p) => `${p.table}.${p.name}`)).toEqual([]);
  });

  it('known residuals: scoped UPDATE policies with WITH CHECK (true), and always-true INSERT policies', () => {
    const withCheckTrue = [...AFTER.values()]
      .filter((p) => p.cmd === 'UPDATE' && reachesApiRoles(p) && /\bWITH\s+CHECK\s*\(\s*true\s*\)/i.test(p.body))
      .map((p) => `${p.table}.${p.name}`)
      .sort();
    expect(withCheckTrue).toEqual(['invoices.invoices_update', 'work_orders.work_orders_update']);
    const insertTrue = [...AFTER.values()]
      .filter((p) => p.cmd === 'INSERT' && reachesApiRoles(p) && isAlwaysTrue(p))
      .map((p) => `${p.table}.${p.name} [${p.roles}]`)
      .sort();
    expect(insertTrue).toEqual([
      'audit_events.audit_events_insert [anon, authenticated, service_role]',
      'notifications.notifications_insert [authenticated, service_role]',
      'organizations.organizations_insert [authenticated]',
      'supplier_notifications.supplier_notifications_insert [authenticated, service_role]',
      'support_tickets.Anyone can create support tickets [PUBLIC]',
    ]);
  });
});
