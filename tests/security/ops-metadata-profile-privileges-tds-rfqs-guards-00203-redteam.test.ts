import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract tests for migration 00203 plus regression guards for R4 and
 * future rfqs columns. No database is available in this environment, so the
 * migration has never been executed; these tests pin the SQL text, re-derive
 * the effective RLS policy set and scan every SQL, client, edge and script
 * reader of the affected objects.
 */

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00203_restrict_ops_metadata_guard_profile_privileges_and_one_live_tds.sql';
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');
const CODE = stripComments(SQL);
const flat = (s: string) => s.replace(/\s+/g, ' ');

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function read(file: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
}

interface Policy {
  table: string;
  name: string;
  cmd: string;
  roles: string;
  body: string;
  file: string;
}

function effectivePolicies(files: string[]): Map<string, Policy> {
  const pol = new Map<string, Policy>();
  const re =
    /(CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+(?:public\.)?"?(\w+)"?([\s\S]*?);)|(DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+)\s+ON\s+(?:public\.)?"?(\w+)"?\s*;)/gi;
  for (const file of files) {
    const src = stripComments(read(file));
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(src))) {
      if (m[1]) {
        const name = (m[2] as string).replace(/"/g, '');
        const body = flat(m[4] as string).trim();
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

const BEFORE = effectivePolicies(MIGRATION_FILES.slice(0, 202));
const AFTER = effectivePolicies(MIGRATION_FILES);

const FN_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(\w+)\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*(RETURNS[\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\5([^;]*);/gi;

interface Fn {
  file: string;
  body: string;
  definer: boolean;
}

const latestIn = (files: string[]) => {
  const out = new Map<string, Fn>();
  for (const file of files) {
    const src = stripComments(read(file));
    const re = new RegExp(FN_RE.source, FN_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      out.set(`${(m[1] || 'public').toLowerCase()}.${m[2]}`, {
        file,
        body: m[6] as string,
        definer: /SECURITY\s+DEFINER/i.test(`${m[4]} ${m[7]}`),
      });
    }
  }
  return out;
};
const LATEST = latestIn(MIGRATION_FILES);
/** Definitions as 00203 left them; later migrations may redefine these. */
const AS_OF_203 = latestIn(MIGRATION_FILES.slice(0, MIGRATION_FILES.indexOf(FILE) + 1));

function fn203(key: string): string {
  const hit = AS_OF_203.get(key);
  expect(hit?.file, `${key} defined in 00203`).toBe(FILE);
  return stripComments(hit?.body as string);
}

const SKIP_WALK_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.turbo',
  '.next',
  '.cache',
]);

/** Source-controlled application files only. Does not descend into dependencies or build output. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (SKIP_WALK_DIRS.has(ent.name)) continue;
        walk(resolve(dir, ent.name), nextRel);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(ent.name) || /\.test\./.test(ent.name)) continue;
      out.push(nextRel);
    }
  };
  walk(root, '');
  return out;
}
const APP_ROOTS = ['apps/web/src', 'packages', 'supabase/functions'].map((p) => resolve(ROOT, p));

describe('00203 migration file', () => {
  it('sits at position 203 of the contiguous chain', () => {
    expect(MIGRATION_FILES.length).toBeGreaterThanOrEqual(203);
    expect(MIGRATION_FILES[202]).toBe(FILE);
    MIGRATION_FILES.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('runs in one transaction, is idempotent and non-destructive', () => {
    const code = CODE.trim();
    expect(code.startsWith('BEGIN;')).toBe(true);
    expect(code.endsWith('COMMIT;')).toBe(true);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+(public\.)?\w+\s+SET\b/i);
    expect(code).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(code).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(code).not.toMatch(/DISABLE\s+(ROW\s+LEVEL\s+SECURITY|TRIGGER)/i);
    expect(code).not.toMatch(/CREATE\s+FUNCTION/i);
    for (const drop of code.match(/\bDROP\s+\w+[^;]*;/gi) ?? []) {
      expect(drop).toMatch(/^DROP\s+(POLICY|TRIGGER)\s+IF\s+EXISTS\s+("?\w+"?)\s+ON\s+public\.\w+;$/i);
    }
    for (const create of code.match(/\bCREATE\s+(POLICY|TRIGGER)\s+("?\w+"?)\s+ON\s+public\.\w+/gi) ?? []) {
      const [, kind, name] = create.match(/CREATE\s+(POLICY|TRIGGER)\s+("?\w+"?)/i) as RegExpMatchArray;
      expect(code, `${kind} ${name} is dropped first`).toContain(`DROP ${kind!.toUpperCase()} IF EXISTS ${name} ON`);
    }
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_tds_deductions_one_live_per_invoice/);
  });

  it('the only anon grant is the content-free heartbeat, and no always-true policy is added', () => {
    const anonGrants = (CODE.match(/\bGRANT\b[^;]*;/gi) ?? []).filter((g) => /\bTO\b[^;]*\b(anon|PUBLIC)\b/i.test(g));
    expect(anonGrants.map(flat)).toEqual([
      'GRANT EXECUTE ON FUNCTION public.platform_heartbeat() TO anon, authenticated, service_role;',
    ]);
    expect(CODE).not.toMatch(/USING\s*\(\s*true\s*\)|WITH\s+CHECK\s*\(\s*true\s*\)/i);
  });
});

describe('R9 ops metadata', () => {
  it('root cause: before 00203 both tables were SELECT USING (true) for anon (00125)', () => {
    for (const key of ['platform_environment_settings.platform_env_read', 'otp_schema_migrations.otp_schema_migrations_read']) {
      const p = BEFORE.get(key) as Policy;
      expect(p.file.startsWith('00125'), key).toBe(true);
      expect(p.roles, key).toMatch(/anon/);
      expect(p.body, key).toMatch(/USING \(true\)/);
    }
    expect(read(MIGRATION_FILES[124] as string)).toContain(
      'GRANT EXECUTE ON FUNCTION public.assert_production_data_integrity() TO authenticated, anon;',
    );
  });

  it('reads are platform-admin only and anon loses table access', () => {
    const env = AFTER.get('platform_environment_settings.platform_env_read') as Policy;
    const mig = AFTER.get('otp_schema_migrations.otp_schema_migrations_admin_read') as Policy;
    expect(AFTER.has('otp_schema_migrations.otp_schema_migrations_read')).toBe(false);
    for (const p of [env, mig]) {
      expect(p.file).toBe(FILE);
      expect(p.cmd).toBe('SELECT');
      expect(p.roles).toBe('authenticated');
      expect(p.body).toMatch(/USING \(private\.is_platform_admin\(\)\)$/);
    }
    for (const t of ['platform_environment_settings', 'otp_schema_migrations']) {
      const onTable = [...AFTER.values()].filter((p) => p.table === t);
      for (const p of onTable) {
        expect(p.roles, `${t}.${p.name}`).not.toMatch(/anon|PUBLIC/);
        expect(p.body, `${t}.${p.name}`).toContain('private.is_platform_admin()');
      }
      expect(CODE).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon;`);
    }
  });

  it('assert_production_data_integrity is service_role only; its SQL readers are SECURITY DEFINER', () => {
    expect(CODE).toContain(
      'REVOKE ALL ON FUNCTION public.assert_production_data_integrity() FROM PUBLIC, anon, authenticated;',
    );
    expect(CODE).toContain('GRANT EXECUTE ON FUNCTION public.assert_production_data_integrity() TO service_role;');
    const readers = [...LATEST].filter(([, f]) => /platform_environment_settings|otp_schema_migrations/.test(stripComments(f.body)));
    expect(readers.map(([k]) => k).sort()).toEqual([
      'private.is_production_environment',
      'public.assert_production_data_integrity',
    ]);
    for (const [k, f] of readers) expect(f.definer, k).toBe(true);
  });

  it('platform_heartbeat reads no table and returns only ok', () => {
    const body = fn203('public.platform_heartbeat');
    expect(flat(body).trim()).toBe("SELECT jsonb_build_object('ok', true);");
    expect(LATEST.get('public.platform_heartbeat')?.definer).toBe(false);
  });

  it('no client, package or edge code reads the tables or calls the integrity report', () => {
    for (const root of APP_ROOTS) {
      for (const f of sourceFiles(root)) {
        const src = readFileSync(resolve(root, f), 'utf8');
        if (f.replace(/\\/g, '/').endsWith('reset/clean-start-reset.ts')) continue;
        expect(src, f).not.toMatch(/platform_environment_settings|otp_schema_migrations|assert_production_data_integrity/);
      }
    }
  });

  it('the keep-alive script pings the heartbeat RPC instead of reading environment settings', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/ping-supabase-keep-alive.ts'), 'utf8');
    expect(src).toContain('/rest/v1/rpc/platform_heartbeat');
    expect(src).toContain("method: 'POST'");
    expect(src).not.toContain('platform_environment_settings');
  });

  it('the deploy tracker no longer re-opens otp_schema_migrations to anon', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/deploy-migrations.ts'), 'utf8');
    const ensure = src.slice(src.indexOf('export async function ensureTrackingTables'), src.indexOf('export async function getAppliedMigrations'));
    expect(ensure).not.toMatch(/CREATE\s+POLICY/i);
    expect(ensure).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(ensure).toContain('DROP POLICY IF EXISTS "otp_schema_migrations_read" ON public.otp_schema_migrations;');
    expect(ensure).toContain('REVOKE ALL ON public.otp_schema_migrations FROM PUBLIC, anon;');
    for (const f of readdirSync(resolve(ROOT, 'scripts')).filter((n) => /\.(ts|ps1|mjs|js)$/.test(n))) {
      const s = readFileSync(resolve(ROOT, 'scripts', f), 'utf8');
      expect(s, f).not.toMatch(/(otp_schema_migrations|platform_environment_settings)[\s\S]{0,120}USING\s*\(\s*true\s*\)/i);
    }
  });
});

describe('R5 (partial) privileged profile columns', () => {
  const guard = () => fn203('private.guard_profile_privileges');

  it('root cause: profiles_update / profiles_insert only check row ownership and no earlier trigger guards the admin flag', () => {
    const upd = AFTER.get('profiles.profiles_update') as Policy;
    expect(upd.file.startsWith('00004')).toBe(true);
    expect(upd.body).toMatch(/USING \(auth_user_id = auth\.uid\(\) OR private\.is_platform_admin\(\)\)/);
    const priorGuards = [...LATEST].filter(
      ([k, f]) => k !== 'private.guard_profile_privileges' && /NEW\.is_platform_admin/.test(stripComments(f.body)),
    );
    expect(priorGuards.map(([k]) => k)).toEqual(['private_security.enforce_superadmin_immutability']);
    const immut = flat(stripComments(priorGuards[0]![1].body));
    expect(immut).toMatch(/IF v_is_whitelisted THEN .* IF NEW\.is_platform_admin IS DISTINCT FROM true THEN/);
    const isAdmin = stripComments(LATEST.get('private.is_platform_admin')?.body as string);
    expect(isAdmin).toMatch(/FROM public\.profiles[\s\S]*?AND is_platform_admin = true/);
    expect(isAdmin).toMatch(/FROM public\.profiles[\s\S]*?AND lower\(email\) IN/);
  });

  it('non-admin callers cannot set the admin flag, take a whitelisted email or change account status', () => {
    const g = flat(guard());
    expect(g).toContain("IF COALESCE(auth.role(), '') IN ('service_role', '') OR COALESCE(private.is_platform_admin(), false) THEN RETURN NEW;");
    expect(g).toContain("IF TG_OP = 'INSERT' THEN IF COALESCE(NEW.is_platform_admin, false) THEN RAISE EXCEPTION");
    expect(g).toContain('IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN');
    expect(g).toContain('IF lower(NEW.email) = ANY (v_admin_emails) THEN');
    expect(g).toContain('IF lower(NEW.email) IS DISTINCT FROM lower(OLD.email) AND lower(NEW.email) = ANY (v_admin_emails) THEN');
    for (const col of ['status', 'deleted_at', 'blocked_at', 'blocked_reason', 'blocked_by']) {
      expect(g, col).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    expect(g.match(/\(PROFILE-PRIVILEGE\)/g)?.length).toBe(5);
  });

  it('the reserved-email list equals the whitelist in private.is_platform_admin', () => {
    const list = (s: string) =>
      [...s.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1] as string).filter((v, i, a) => a.indexOf(v) === i).sort();
    const isAdmin = stripComments(LATEST.get('private.is_platform_admin')?.body as string);
    expect(list(guard())).toEqual(list(isAdmin));
    expect(list(guard())).toHaveLength(7);
  });

  it('the guard is SECURITY DEFINER, not callable by API roles, and covers INSERT and UPDATE', () => {
    expect(LATEST.get('private.guard_profile_privileges')?.definer).toBe(true);
    expect(CODE).toContain('REVOKE ALL ON FUNCTION private.guard_profile_privileges() FROM PUBLIC, anon, authenticated;');
    expect(flat(CODE)).toContain(
      'CREATE TRIGGER trg_aa_guard_profile_privileges BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_profile_privileges();',
    );
  });

  it('every SQL path that writes a guarded profile column is an admin function', () => {
    const guarded = /\b(is_platform_admin|status|deleted_at|blocked_at|blocked_reason|blocked_by)\s*=/;
    const writers: string[] = [];
    for (const [k, f] of LATEST) {
      for (const stmt of stripComments(f.body).match(/UPDATE\s+(public\.)?profiles\b[\s\S]*?;/gi) ?? []) {
        const set = stmt.match(/\bSET\b([\s\S]*?)(\bWHERE\b|;)/i)?.[1] ?? '';
        if (guarded.test(set)) writers.push(k);
      }
    }
    expect(writers.length).toBeGreaterThan(0);
    for (const w of writers) expect(w, w).toMatch(/^public\.admin_/);
  });

  it('client profile writes outside the admin feature never touch a guarded column', () => {
    const web = resolve(ROOT, 'apps/web/src');
    const found: string[] = [];
    for (const f of sourceFiles(web)) {
      const src = readFileSync(resolve(web, f), 'utf8');
      const re = /from\(\s*'profiles'\s*\)\s*\.(update|upsert|insert)\(\s*\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const rel = f.replace(/\\/g, '/');
        found.push(rel);
        if (!rel.startsWith('features/admin/')) {
          expect(m[2], rel).not.toMatch(/\b(is_platform_admin|email|status|deleted_at|blocked_\w+)\s*:/);
        }
      }
    }
    expect(found).toContain('features/auth/usePresenceHeartbeat.ts');
  });
});

describe('R6 one live TDS deduction per invoice', () => {
  it('root cause: 00199 skips the unique index when duplicates exist', () => {
    const f199 = read(MIGRATION_FILES[198] as string);
    expect(f199).toMatch(/RAISE WARNING '00199: invoices with more than one live TDS deduction exist; uq_tds_deductions_one_live_per_invoice not created/);
  });

  it('a trigger rejects new live duplicates for every caller, without touching existing rows', () => {
    const body = flat(fn203('private.enforce_one_live_tds_per_invoice'));
    expect(body).toContain("IF NEW.status = 'VOIDED' THEN RETURN NEW; END IF;");
    expect(body).toContain("IF TG_OP = 'UPDATE' AND OLD.status <> 'VOIDED' AND OLD.invoice_id = NEW.invoice_id THEN RETURN NEW; END IF;");
    expect(body).toContain('PERFORM 1 FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;');
    expect(body).toContain("AND t.status <> 'VOIDED' AND t.id <> NEW.id");
    expect(body).toContain('(TDS-ONE-LIVE-PER-INVOICE)');
    expect(body).not.toMatch(/auth\.role|is_platform_admin|UPDATE public|DELETE/);
    expect(LATEST.get('private.enforce_one_live_tds_per_invoice')?.definer).toBe(true);
    expect(flat(CODE)).toContain(
      'CREATE TRIGGER trg_enforce_one_live_tds_per_invoice BEFORE INSERT OR UPDATE OF status, invoice_id ON public.tds_deductions FOR EACH ROW EXECUTE FUNCTION private.enforce_one_live_tds_per_invoice();',
    );
  });

  it('the only SQL writer already returns the existing live row instead of inserting a second', () => {
    const writers = [...LATEST].filter(([, f]) => /(INSERT\s+INTO|UPDATE)\s+(public\.)?tds_deductions\b/i.test(stripComments(f.body)));
    expect(writers.map(([k]) => k)).toEqual(['public.apply_tds_withholding_atomic']);
    const body = flat(stripComments(writers[0]![1].body));
    expect(body.indexOf("WHERE invoice_id = p_invoice_id AND status <> 'VOIDED'")).toBeLessThan(body.indexOf('INSERT INTO public.tds_deductions'));
    expect(body).toContain("'idempotent_replay', true");
  });

  it('clients only read tds_deductions', () => {
    for (const root of APP_ROOTS) {
      for (const f of sourceFiles(root)) {
        const src = readFileSync(resolve(root, f), 'utf8');
        expect(src, f).not.toMatch(/from\(\s*'tds_deductions'\s*\)\s*\.(insert|update|upsert|delete)\(/);
      }
    }
  });

  it('the unique index is retried with a WARNING naming the duplicates, and duplicates are reported, never modified', () => {
    const block = flat(CODE.slice(CODE.indexOf('DO $tds_idx$'), CODE.indexOf('$tds_idx$;')));
    expect(block).toContain("RAISE WARNING '00203: % invoice(s) have more than one live TDS deduction");
    expect(block).toContain('public.admin_list_duplicate_live_tds()');
    expect(block).not.toMatch(/UPDATE|DELETE|VOIDED'\s*WHERE/);
    const fn = flat(fn203('public.admin_list_duplicate_live_tds'));
    expect(fn).toContain("IF NOT COALESCE(COALESCE(auth.role(), '') = 'service_role' OR private.is_platform_admin(), false) THEN RETURN jsonb_build_object('ok', false, 'error', 'Access denied');");
    expect(fn).toContain('HAVING count(*) > 1');
    expect(fn).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(CODE).toContain('REVOKE ALL ON FUNCTION public.admin_list_duplicate_live_tds() FROM PUBLIC, anon;');
    expect(CODE).toContain('GRANT EXECUTE ON FUNCTION public.admin_list_duplicate_live_tds() TO authenticated, service_role;');
  });
});

describe('R4 guard: transaction-local GUC flags cannot be forged through set_config', () => {
  it('every set_config in the migration chain uses a literal otp.* name and constant value', () => {
    let count = 0;
    for (const file of MIGRATION_FILES) {
      for (const call of stripComments(read(file)).match(/set_config\s*\([^;]*?\)/gi) ?? []) {
        count++;
        expect(call, `${file}: ${call}`).toMatch(/^set_config\s*\(\s*'otp\.[a-z_]+'\s*,\s*'[^']*'\s*,\s*true\s*\)$/i);
      }
    }
    expect(count).toBeGreaterThanOrEqual(13);
  });

  it('only accept_delivery_inspection sets otp.wo_inspection_signoff, and it is not callable by anon', () => {
    const setters = [...LATEST].filter(([, f]) => /set_config\s*\(\s*'otp\.wo_inspection_signoff'/.test(stripComments(f.body)));
    expect(setters.map(([k]) => k)).toEqual(['public.accept_delivery_inspection']);
    const readers = [...LATEST]
      .filter(([, f]) => /current_setting\s*\(\s*'otp\.wo_inspection_signoff'/.test(stripComments(f.body)))
      .map(([k]) => k)
      .sort();
    expect(readers).toEqual(['private.audit_work_order_milestone', 'private.enforce_work_order_milestone_progression']);
    const f199 = read(MIGRATION_FILES[198] as string);
    expect(f199).toMatch(/REVOKE ALL ON FUNCTION public\.accept_delivery_inspection\([^)]*\) FROM PUBLIC, anon;/);
  });

  it('no client, package or edge code calls set_config', () => {
    for (const root of APP_ROOTS) {
      for (const f of sourceFiles(root)) {
        expect(readFileSync(resolve(root, f), 'utf8'), f).not.toMatch(/rpc\(\s*'set_config'/);
      }
    }
  });
});

/** Violations of the rfqs column-grant rule in migrations after 00199. */
function rfqsGrantViolations(files: { name: string; sql: string }[]): string[] {
  const SENSITIVE = new Set(['delivery_address_snapshot', 'billing_address_snapshot']);
  const out: string[] = [];
  for (const { name, sql } of files) {
    const code = stripComments(sql);
    const granted = new Set<string>();
    for (const g of code.matchAll(/GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:TABLE\s+)?(?:public\.)?rfqs\s+TO\s+[^;]*\bauthenticated\b/gi)) {
      for (const c of (g[1] as string).split(',')) granted.add(c.trim().replace(/"/g, ''));
    }
    const dynamic = /GRANT SELECT \(%s\) ON public\.rfqs TO authenticated/.test(code) && /table_name\s*=\s*'rfqs'/.test(code);
    for (const alter of code.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?rfqs\b([^;]*);/gi)) {
      for (const add of (alter[1] as string).matchAll(/ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) {
        const col = add[1] as string;
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(col)) continue;
        if (SENSITIVE.has(col) || granted.has(col) || dynamic) continue;
        out.push(`${name}: rfqs.${col} added without GRANT SELECT (${col}) ON public.rfqs TO authenticated`);
      }
    }
    if (/GRANT\s+(SELECT|ALL)(\s+PRIVILEGES)?\s+ON\s+(TABLE\s+)?(public\.)?rfqs\b/i.test(code)) {
      out.push(`${name}: table-wide grant on rfqs re-exposes the address snapshots`);
    }
    if (/GRANT\s+[^;]*ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+[^;]*\b(anon|authenticated|PUBLIC)\b/i.test(code)) {
      out.push(`${name}: schema-wide grant re-exposes rfqs columns`);
    }
  }
  return out;
}

describe('rfqs column-grant guard (future columns)', () => {
  it('every migration after 00199 that adds an rfqs column also grants it column-wise; no table-wide re-grant', () => {
    const later = MIGRATION_FILES.slice(199).map((name) => ({ name, sql: read(name) }));
    expect(later.length).toBeGreaterThanOrEqual(4);
    expect(rfqsGrantViolations(later)).toEqual([]);
  });

  it('the guard fails on an ungranted column, a table-wide grant and a schema-wide grant', () => {
    expect(
      rfqsGrantViolations([
        { name: 'x1', sql: 'ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS buyer_notes text;' },
        { name: 'x2', sql: 'GRANT SELECT ON public.rfqs TO authenticated;' },
        { name: 'x3', sql: 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;' },
      ]),
    ).toEqual([
      'x1: rfqs.buyer_notes added without GRANT SELECT (buyer_notes) ON public.rfqs TO authenticated',
      'x2: table-wide grant on rfqs re-exposes the address snapshots',
      'x3: schema-wide grant re-exposes rfqs columns',
    ]);
  });

  it('the guard accepts an explicit column grant, the 00199 dynamic re-grant and the sensitive snapshots', () => {
    expect(
      rfqsGrantViolations([
        {
          name: 'ok1',
          sql: 'ALTER TABLE public.rfqs ADD COLUMN buyer_notes text, ADD COLUMN IF NOT EXISTS "due_by" date;\nGRANT SELECT (buyer_notes, due_by) ON public.rfqs TO authenticated;',
        },
        { name: 'ok2', sql: 'ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS billing_address_snapshot jsonb;' },
        { name: 'ok3', sql: 'ALTER TABLE rfqs ADD CONSTRAINT rfqs_x CHECK (true);' },
        { name: 'ok4', sql: read(MIGRATION_FILES[198] as string) },
      ]),
    ).toEqual([]);
  });
});
