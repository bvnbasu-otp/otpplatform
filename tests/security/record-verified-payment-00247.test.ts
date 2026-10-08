/**
 * Static grant chain for record_verified_payment. Does not connect to Postgres.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve('.');
const MIGRATIONS_DIR = resolve('supabase/migrations');
// Security boundary under test. Not the repository migration ceiling.
const FILE = '00247_revoke_record_verified_payment_client_execute.sql';
// Repository ceiling. 00249, 00250, and 00251 do not grant this function back to clients.
const REPOSITORY_CEILING = '00253_cancelled_rfq_allowance_and_utgst.sql';
const FN = 'public.record_verified_payment';

type Role = 'public' | 'anon' | 'authenticated' | 'service_role';

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function parseRoles(list: string): Role[] {
  return list
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/"/g, ''))
    .filter((part): part is Role =>
      part === 'public' || part === 'anon' || part === 'authenticated' || part === 'service_role',
    );
}

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx|sql|js|mjs)$/.test(name)) acc.push(path);
  }
}

describe('record_verified_payment execute boundary', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
  const grants: Record<Role, boolean> = {
    public: false,
    anon: false,
    authenticated: false,
    service_role: false,
  };
  let created = false;

  for (const file of files) {
    const sql = stripComments(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
    const events: { at: number; kind: string; roles: Role[] }[] = [];
    const patterns: { kind: string; re: RegExp }[] = [
      { kind: 'create', re: /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_verified_payment\s*\(/gi },
      { kind: 'grant-all', re: /GRANT\s+EXECUTE\s+ON\s+ALL\s+ROUTINES\s+IN\s+SCHEMA\s+public\s+TO\s+([^;]+)/gi },
      { kind: 'revoke-all', re: /REVOKE\s+EXECUTE\s+ON\s+ALL\s+ROUTINES\s+IN\s+SCHEMA\s+public\s+FROM\s+([^;]+)/gi },
      { kind: 'grant-fn', re: /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_verified_payment\b[^;]*?\bTO\s+([^;]+)/gi },
      { kind: 'revoke-fn', re: /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.record_verified_payment\b[^;]*?\bFROM\s+([^;]+)/gi },
    ];
    for (const pattern of patterns) {
      for (const match of sql.matchAll(pattern.re)) {
        events.push({
          at: match.index ?? 0,
          kind: pattern.kind,
          roles: pattern.kind === 'create' ? [] : parseRoles(match[1] ?? ''),
        });
      }
    }
    events.sort((a, b) => a.at - b.at);
    for (const event of events) {
      if (event.kind === 'create' && !created) {
        grants.public = true;
        created = true;
        continue;
      }
      const allow = event.kind === 'grant-all' || event.kind === 'grant-fn';
      for (const role of event.roles) grants[role] = allow;
    }
  }

  it('keeps the 00247 boundary in the contiguous chain ending at 00253 and leaves only service_role', () => {
    expect(files).toContain(FILE);
    expect(files.at(-1)).toBe(REPOSITORY_CEILING);
    files.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
    expect(created).toBe(true);
    expect(grants).toEqual({
      public: false,
      anon: false,
      authenticated: false,
      service_role: true,
    });
  });

  it('does not give the function a caller-role check, so the grant is the boundary', () => {
    const body = readFileSync(resolve(MIGRATIONS_DIR, '00150_payment_webhook_verification.sql'), 'utf8');
    const start = body.indexOf(`CREATE OR REPLACE FUNCTION ${FN}`);
    const end = body.indexOf('GRANT EXECUTE ON FUNCTION public.record_verified_payment');
    const fn = body.slice(start, end);
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).not.toMatch(/auth\.uid\s*\(/);
    expect(fn).not.toMatch(/auth\.role\s*\(/);
    expect(fn).not.toMatch(/is_platform_admin\s*\(/);
    expect(fn).not.toMatch(/current_user/);
  });

  it('is called only by the service-role webhook handler', () => {
    const paths: string[] = [];
    for (const dir of ['apps', 'packages', 'supabase', 'tests']) walk(resolve(ROOT, dir), paths);
    const hits = paths.filter((path) => readFileSync(path, 'utf8').includes('record_verified_payment'));
    const rel = hits.map((path) => path.slice(ROOT.length + 1).replace(/\\/g, '/')).sort();
    expect(rel).toEqual([
      'supabase/functions/payment-webhook/index.ts',
      'supabase/migrations/00150_payment_webhook_verification.sql',
      'supabase/migrations/00202_scope_invoice_work_order_updates_and_close_client_audit_notification_inserts.sql',
      'supabase/migrations/00247_revoke_record_verified_payment_client_execute.sql',
      // Comment only: names the preserved function. Does not grant or call it.
      'supabase/migrations/00249_freeze_organization_subscription_entitlement_fields.sql',
      // Cites the 00247 filename and asserts 00250 SQL does not name the function.
      'tests/security/financial-authority-00250.test.ts',
      'tests/security/invoice-work-order-linkage-and-client-inserts-00202-redteam.test.ts',
      'tests/security/payment-webhook-fail-closed.test.ts',
      'tests/security/record-verified-payment-00247.test.ts',
      'tests/security/signup-buyer-type-00246.test.ts',
      // Proves authenticated EXECUTE is denied. Not a settlement caller.
      'tests/security/subscription-persona-authority.test.ts',
    ]);
    const rpcCallers = rel.filter((path) =>
      /rpc\(\s*['"]record_verified_payment['"]/.test(readFileSync(resolve(ROOT, path), 'utf8')),
    );
    expect(rpcCallers).toEqual([
      'supabase/functions/payment-webhook/index.ts',
      'tests/security/payment-webhook-fail-closed.test.ts',
      'tests/security/record-verified-payment-00247.test.ts',
    ]);

    const index = readFileSync(resolve('supabase/functions/payment-webhook/index.ts'), 'utf8');
    const guard = index.indexOf('if (!verification.valid || !verification.extractedPayload)');
    const rpc = index.indexOf("rpc('record_verified_payment'");
    expect(guard).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(guard);
    expect(index.slice(0, guard)).not.toContain("rpc('record_verified_payment'");
    expect(index).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(index).toContain('createClient(supabaseUrl, supabaseServiceKey');
  });
});
