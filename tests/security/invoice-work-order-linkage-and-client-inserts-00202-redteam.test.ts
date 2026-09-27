import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static contract tests for migration 00202. No database is available in this
 * environment, so the migration has never been executed; these tests pin the
 * SQL text, re-derive the effective RLS policy set from 00001..00202 and scan
 * every SQL, client and edge writer of the affected tables.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00202_scope_invoice_work_order_updates_and_close_client_audit_notification_inserts.sql';
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');
const CODE = stripComments(SQL);

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

const BEFORE = effectivePolicies(MIGRATION_FILES.slice(0, 201));
const AFTER = effectivePolicies(MIGRATION_FILES);
const isAlwaysTrue = (p: Policy) =>
  /\bUSING\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(p.body) || /\bWITH\s+CHECK\s*\(\s*\(?\s*true\s*\)?\s*\)/i.test(p.body);

/** Text inside the parentheses that open at `open`. */
function balanced(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced');
}

function usingAndCheck(p: Policy): { using: string; check: string } {
  const u = p.body.search(/\bUSING\s*\(/i);
  const c = p.body.search(/\bWITH\s+CHECK\s*\(/i);
  return {
    using: balanced(p.body, p.body.indexOf('(', u)).trim(),
    check: balanced(p.body, p.body.indexOf('(', c)).trim(),
  };
}

const FN_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public|private)\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*(RETURNS[\s\S]*?)\bAS\s+(\$\w*\$)([\s\S]*?)\5([^;]*);/gi;

/** Latest definition of every function across the whole chain. */
function latestFunctions(): Map<string, { file: string; body: string; definer: boolean; params: string }> {
  const out = new Map<string, { file: string; body: string; definer: boolean; params: string }>();
  for (const file of MIGRATION_FILES) {
    const src = stripComments(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
    const re = new RegExp(FN_RE.source, FN_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      out.set(`${(m[1] || 'public').toLowerCase()}.${m[2]}`, {
        file,
        body: m[6] as string,
        definer: /SECURITY\s+DEFINER/i.test(`${m[4]} ${m[7]}`),
        params: m[3] as string,
      });
    }
  }
  return out;
}
const LATEST = latestFunctions();

function fn202(key: string): string {
  const hit = LATEST.get(key);
  expect(hit?.file, `${key} defined in 00202`).toBe(FILE);
  return hit?.body as string;
}

function sourceFiles(root: string): string[] {
  return (readdirSync(root, { recursive: true }) as string[]).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/node_modules|\.test\./.test(f),
  );
}
const ROOTS = ['../../apps/web/src', '../../packages', '../../supabase/functions'].map((p) => resolve(__dirname, p));

const INVOICE_LINKAGE = ['work_order_id', 'supplier_id', 'purchase_order_id', 'milestone_id', 'is_demo'];
const WORK_ORDER_LINKAGE = ['purchase_order_id', 'supplier_id', 'is_demo'];

describe('00202 migration file', () => {
  it('sits at position 202 of the contiguous chain 00001..00203', () => {
    expect(MIGRATION_FILES.length).toBe(203);
    expect(MIGRATION_FILES[201]).toBe(FILE);
    MIGRATION_FILES.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('runs in one transaction, is idempotent and non-destructive', () => {
    const code = CODE.trim();
    expect(code.startsWith('BEGIN;')).toBe(true);
    expect(code.endsWith('COMMIT;')).toBe(true);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(code).not.toMatch(/DISABLE\s+(ROW\s+LEVEL\s+SECURITY|TRIGGER)/i);
    expect(code).not.toMatch(/\bALTER\s+TABLE\b/i);
    for (const drop of code.match(/\bDROP\s+\w+[^;]*;/gi) ?? []) {
      expect(drop).toMatch(/^DROP\s+(POLICY\s+IF\s+EXISTS\s+\w+|TRIGGER\s+IF\s+EXISTS\s+trg_aa_guard_\w+)\s+ON\s+public\.\w+;$/i);
    }
    for (const create of code.match(/\bCREATE\s+(POLICY|TRIGGER)\s+(\w+)\s+ON\s+public\.\w+/gi) ?? []) {
      const [, kind, name] = create.match(/CREATE\s+(POLICY|TRIGGER)\s+(\w+)/i) as RegExpMatchArray;
      expect(code, `${kind} ${name} is dropped first`).toMatch(new RegExp(`DROP\\s+${kind}\\s+IF\\s+EXISTS\\s+${name}\\s+ON`, 'i'));
    }
    expect(code).not.toMatch(/CREATE\s+FUNCTION/i);
  });

  it('grants nothing to anon or PUBLIC and adds no always-true policy', () => {
    for (const grant of CODE.match(/\bGRANT\b[^;]*;/gi) ?? []) {
      expect(grant, grant).not.toMatch(/\bTO\b[^;]*\b(anon|PUBLIC)\b/i);
    }
    expect(CODE).not.toMatch(/USING\s*\(\s*true\s*\)|WITH\s+CHECK\s*\(\s*true\s*\)/i);
  });
});

describe('R10 invoices_update / work_orders_update', () => {
  it('root cause: before 00202 both were scoped by USING but WITH CHECK (true) (00004)', () => {
    for (const key of ['invoices.invoices_update', 'work_orders.work_orders_update']) {
      const p = BEFORE.get(key) as Policy;
      expect(p.file.startsWith('00004'), key).toBe(true);
      expect(p.body, key).toMatch(/WITH CHECK \(true\)/);
    }
  });

  it('WITH CHECK now mirrors USING exactly, with the same roles and scope', () => {
    for (const key of ['invoices.invoices_update', 'work_orders.work_orders_update']) {
      const before = BEFORE.get(key) as Policy;
      const after = AFTER.get(key) as Policy;
      expect(after.file).toBe(FILE);
      expect(after.cmd).toBe('UPDATE');
      expect(after.roles).toBe('authenticated');
      const { using, check } = usingAndCheck(after);
      expect(check).toBe(using);
      const priorUsing = usingAndCheck({ ...before, body: before.body.replace(/WITH CHECK \(true\)/, 'WITH CHECK (x)') }).using;
      expect(using.replace(/public\./g, '')).toBe(priorUsing.replace(/public\./g, ''));
    }
    const inv = usingAndCheck(AFTER.get('invoices.invoices_update') as Policy).check;
    expect(inv).toContain('private.is_supplier_user_for(supplier_id)');
    expect(inv).toContain("private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER', 'APPROVER')");
    const wo = usingAndCheck(AFTER.get('work_orders.work_orders_update') as Policy).check;
    expect(wo).toContain('private.is_org_manager_or_above(po.organization_id)');
    expect(wo).toContain('private.is_supplier_user_for(work_orders.supplier_id)');
  });

  it('linkage guards reject changes to every linkage column for API callers', () => {
    const inv = stripComments(fn202('private.guard_invoice_linkage'));
    for (const col of INVOICE_LINKAGE) expect(inv, col).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    expect(inv).toContain('(INV-LINKAGE-IMMUTABLE)');
    const wo = stripComments(fn202('private.guard_work_order_linkage'));
    for (const col of WORK_ORDER_LINKAGE) expect(wo, col).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    expect(wo).toContain('(WO-LINKAGE-IMMUTABLE)');
    for (const body of [inv, wo]) {
      expect(body).toContain("IF COALESCE(auth.role(), '') IN ('service_role', '') OR pg_trigger_depth() > 1 THEN");
      expect(body).not.toMatch(/is_platform_admin|is_org_member|is_supplier_user_for/);
    }
  });

  it('only the derived NULL -> own work-order PO transition is allowed on invoices.purchase_order_id', () => {
    const inv = stripComments(fn202('private.guard_invoice_linkage')).replace(/\s+/g, ' ');
    expect(inv).toContain(
      'AND NOT ( OLD.purchase_order_id IS NULL AND NEW.purchase_order_id IS NOT DISTINCT FROM (SELECT wo.purchase_order_id FROM public.work_orders wo WHERE wo.id = OLD.work_order_id) )',
    );
  });

  it('guards are SECURITY DEFINER, not callable by API roles, and fire first on every UPDATE', () => {
    for (const key of ['private.guard_invoice_linkage', 'private.guard_work_order_linkage']) {
      expect(LATEST.get(key)?.definer, key).toBe(true);
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${key}() FROM PUBLIC, anon, authenticated;`);
    }
    expect(CODE.replace(/\s+/g, ' ')).toContain(
      'CREATE TRIGGER trg_aa_guard_invoice_linkage BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_linkage();',
    );
    expect(CODE.replace(/\s+/g, ' ')).toContain(
      'CREATE TRIGGER trg_aa_guard_work_order_linkage BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_linkage();',
    );
    for (const [table, mine] of [
      ['invoices', 'trg_aa_guard_invoice_linkage'],
      ['work_orders', 'trg_aa_guard_work_order_linkage'],
    ] as const) {
      const others = new Set<string>();
      for (const file of MIGRATION_FILES.slice(0, 201)) {
        const src = stripComments(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
        const re = new RegExp(`CREATE\\s+TRIGGER\\s+(\\w+)\\s+BEFORE\\s+[^;]*?UPDATE[^;]*?ON\\s+(?:public\\.)?${table}\\b`, 'gi');
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) others.add(m[1] as string);
      }
      const nonTimestamp = [...others].filter((n) => !n.endsWith('_updated_at'));
      expect(nonTimestamp.length, table).toBeGreaterThan(0);
      for (const other of nonTimestamp) expect(mine < other, `${mine} before ${other}`).toBe(true);
    }
  });

  it('no SQL updater of invoices or work_orders writes a linkage column, and all are SECURITY DEFINER', () => {
    const updaters: string[] = [];
    for (const [key, fn] of LATEST) {
      const body = stripComments(fn.body);
      for (const stmt of body.match(/UPDATE\s+(?:public\.)?(invoices|work_orders)\b[\s\S]*?;/gi) ?? []) {
        const table = /work_orders/i.test(stmt.slice(0, 40)) ? 'work_orders' : 'invoices';
        const set = (stmt.match(/\bSET\b([\s\S]*?)(\bWHERE\b|;)/i)?.[1] ?? '').replace(/\s+/g, ' ');
        const cols = set.split(',').map((a) => a.trim().split(/\s*=/)[0]?.trim());
        for (const col of table === 'invoices' ? INVOICE_LINKAGE : WORK_ORDER_LINKAGE) {
          expect(cols, `${key} ${stmt.slice(0, 60)}`).not.toContain(col);
        }
        expect(fn.definer, key).toBe(true);
        updaters.push(key);
      }
    }
    expect([...new Set(updaters)].sort()).toEqual([
      'private.simulate_pilot_supplier_fulfillment',
      'private.touch_invoice_after_tds_change',
      'public.accept_delivery_inspection',
      'public.admin_fix_buyer_issue',
      'public.admin_force_transition_order_state',
      'public.admin_retry_invoice_payment_webhook',
      'public.admin_simulate_po_acceptance',
      'public.apply_tds_withholding_atomic',
      'public.record_verified_payment',
      'public.reverse_payment_allocation_atomic',
      'public.sync_invoice_payment_state',
    ]);
  });

  it('no client or edge update of invoices or work_orders sets a linkage column', () => {
    const found: string[] = [];
    for (const root of ROOTS) {
      for (const f of sourceFiles(root)) {
        const src = readFileSync(resolve(root, f), 'utf8');
        const re = /from\(\s*'(invoices|work_orders)'\s*\)\s*\.(update|upsert)\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          let arg = balanced(src, m.index + m[0].length - 1).trim();
          if (/^\w+$/.test(arg)) {
            const id = arg;
            const decl = src.match(new RegExp(`const\\s+${id}\\b[^=]*=\\s*\\{`));
            expect(decl, `${f}: ${id} is an object literal`).toBeTruthy();
            const at = src.indexOf('{', decl?.index ?? 0);
            arg = src.slice(at, src.indexOf('};', at));
            expect(src, `${f}: ${id} is not mutated after declaration`).not.toMatch(
              new RegExp(`\\b${id}\\[|\\b${id}\\.\\w+\\s*=[^=]`),
            );
          }
          const cols = m[1] === 'invoices' ? INVOICE_LINKAGE : WORK_ORDER_LINKAGE;
          for (const col of cols) expect(arg, `${f} ${m[1]}.${col}`).not.toMatch(new RegExp(`\\b${col}\\b`));
          found.push(`${f.replace(/\\/g, '/')}:${m[1]}`);
        }
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(8);
  });
});

describe('R11 direct client inserts', () => {
  const TABLES = ['audit_events', 'notifications', 'supplier_notifications'];

  it('root cause: before 00202 all three tables had WITH CHECK (true) inserts reaching API roles (00134)', () => {
    expect(BEFORE.get('audit_events.audit_events_insert')?.roles).toBe('anon, authenticated, service_role');
    for (const t of TABLES) {
      const p = BEFORE.get(`${t}.${t}_insert`) as Policy;
      expect(p.file.startsWith('00134'), t).toBe(true);
      expect(isAlwaysTrue(p), t).toBe(true);
      expect(p.roles, t).toMatch(/authenticated/);
    }
  });

  it('no INSERT (or ALL) policy remains on the three tables and INSERT is revoked from API roles', () => {
    for (const t of TABLES) {
      const onTable = [...AFTER.values()].filter((p) => p.table === t && ['INSERT', 'ALL'].includes(p.cmd));
      expect(onTable.map((p) => p.name), t).toEqual([]);
    }
    expect(CODE).toContain('REVOKE INSERT ON public.audit_events FROM PUBLIC, anon, authenticated;');
    expect(CODE).toContain('REVOKE INSERT ON public.notifications FROM PUBLIC, anon, authenticated;');
    expect(CODE).toContain('REVOKE INSERT ON public.supplier_notifications FROM PUBLIC, anon, authenticated;');
  });

  it('audit_events stays append-only (PA-10): no UPDATE policy, admin-only DELETE, 00134 guard triggers untouched', () => {
    const onTable = [...AFTER.values()].filter((p) => p.table === 'audit_events');
    expect(onTable.map((p) => p.cmd).sort()).toEqual(['DELETE', 'SELECT']);
    expect((AFTER.get('audit_events.audit_events_delete') as Policy).body).toMatch(/USING \(private\.is_platform_admin\(\)\)/);
    expect(CODE).not.toMatch(/audit_events_no_(update|delete)/);
    expect(CODE).not.toMatch(/UPDATE\s+public\.audit_events/i);
  });

  it('every SQL writer of the three tables is SECURITY DEFINER, so dropping the policies breaks no server path', () => {
    const writers: string[] = [];
    for (const [key, fn] of LATEST) {
      if (/INSERT\s+INTO\s+(public\.)?(audit_events|notifications|supplier_notifications)\b/i.test(stripComments(fn.body))) {
        writers.push(key);
        expect(fn.definer, `${key} [${fn.file}]`).toBe(true);
      }
    }
    expect(writers.length).toBeGreaterThan(80);
    expect(writers).toContain('public.log_client_audit_event');
    expect(writers).toContain('public.create_system_notification');
  });

  it('log_client_audit_event: actor from the session, admin-only admin.* events, allow-listed entities, org check', () => {
    const fn = LATEST.get('public.log_client_audit_event');
    expect(fn?.file).toBe(FILE);
    expect(fn?.definer).toBe(true);
    expect(fn?.params).not.toMatch(/actor/i);
    const body = stripComments(fn?.body as string);
    const at = (s: string) => {
      const i = body.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const insertAt = at('INSERT INTO public.audit_events');
    expect(at('IF auth.uid() IS NULL THEN')).toBeLessThan(insertAt);
    expect(at('IF NOT COALESCE(private.is_platform_admin(), false) THEN')).toBeLessThan(insertAt);
    expect(at("p_event_type !~ '^admin\\.[a-z0-9_]+(\\.[a-z0-9_]+)*$'")).toBeLessThan(insertAt);
    expect(at("p_entity_type NOT IN (")).toBeLessThan(insertAt);
    expect(at('private.is_org_member(p_organization_id)')).toBeLessThan(insertAt);
    expect(at("jsonb_typeof(p_payload) <> 'object'")).toBeLessThan(insertAt);
    expect(at('v_actor := private.get_profile_id();')).toBeLessThan(insertAt);
    expect(body).toContain("COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('source', 'client_rpc')");
    expect(body.match(/INSERT INTO/g)).toHaveLength(1);
    expect(SQL).toMatch(/SECURITY DEFINER\s+SET search_path = public, private, pg_temp\s+AS \$\$\s+DECLARE\s+v_actor uuid;/);
    expect(CODE).toContain(
      'REVOKE ALL ON FUNCTION public.log_client_audit_event(text, text, text, jsonb, uuid, boolean) FROM PUBLIC, anon;',
    );
    expect(CODE).toContain(
      'GRANT EXECUTE ON FUNCTION public.log_client_audit_event(text, text, text, jsonb, uuid, boolean) TO authenticated;',
    );
  });

  it('the entity allow-list covers every entity type the client writers send', () => {
    const body = stripComments(LATEST.get('public.log_client_audit_event')?.body as string);
    for (const t of [
      'REQUIREMENT', 'RFQ', 'QUOTE', 'PURCHASE_ORDER', 'INVOICE', 'SUPPLIER', 'BUYER', 'SYSTEM',
      'DATABASE_RESET', 'AUDIT_SYSTEM', 'NOTIFICATION_SYSTEM',
    ]) {
      expect(body).toContain(`'${t}'`);
    }
  });

  it('no client, package or edge code inserts into the three tables directly', () => {
    for (const root of ROOTS) {
      for (const f of sourceFiles(root)) {
        const src = readFileSync(resolve(root, f), 'utf8');
        expect(src, f).not.toMatch(/from\(\s*'(audit_events|notifications|supplier_notifications)'\s*\)\s*\.(insert|upsert)\(/);
      }
    }
  });

  it('the four former client writers call the RPC helper and only the helper calls the RPC', () => {
    const web = resolve(__dirname, '../../apps/web/src');
    const helper = 'features/audit/api/log-client-audit-event.ts';
    const expected: Record<string, string[]> = {
      'features/admin/api/admin-telemetry.ts': ['await logClientAuditEvent({'],
      'features/admin/api/admin-ops.ts': ["'admin.clean_production_reset'", "'admin.audit_logs_purged'"],
      'features/notifications/services/notificationService.ts': ["'admin.notifications_purged'"],
    };
    for (const [f, events] of Object.entries(expected)) {
      const src = readFileSync(resolve(web, f), 'utf8');
      expect(src, f).toContain("import { logClientAuditEvent } from '@/features/audit/api/log-client-audit-event';");
      for (const e of events) expect(src, f).toContain(e);
      expect(src, f).not.toMatch(/actor_id\s*:/);
    }
    const callers = sourceFiles(web).filter((f) => readFileSync(resolve(web, f), 'utf8').includes("'log_client_audit_event'"));
    expect(callers.map((f) => f.replace(/\\/g, '/'))).toEqual([helper]);
  });

  it('the edge function touching supplier_notifications only reads it, with a service_role client', () => {
    const src = readFileSync(resolve(__dirname, '../../supabase/functions/messaging-outbound/index.ts'), 'utf8');
    expect(src).toMatch(/const db = serviceClient\(\);\s*[\s\S]*?\.from\('supplier_notifications'\)\s*\.select\(/);
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
