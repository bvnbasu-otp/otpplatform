/**
 * Static contract for migration 00248. Does not connect to Postgres and does
 * not apply the migration. The trigger body was not executed against a database.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00248_yearly_plan_quarterly_rfq_bonus.sql';
const PRIOR = '00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql';
const PUBLISH = '00180_fix_signup_and_publish_audit.sql';

function readMigration(name: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
}

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION ${name}(`;
  const start = sql.lastIndexOf(marker);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open + 2, close);
}

describe('ENT-01 migration 00248 yearly quarterly RFQ bonus', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
  const sql = readMigration(FILE);
  const code = stripComments(sql);
  const body = functionBody(code, 'private.enforce_pilot_rfq_allowance');

  it('is the contiguous ENT-01 file immediately after 00247 and does not edit 00199', () => {
    const index = files.indexOf(FILE);
    expect(index).toBeGreaterThan(0);
    expect(files[index - 1]?.startsWith('00247_')).toBe(true);
    expect(files[index + 1]?.startsWith('00249_')).toBe(true);
    files.forEach((f, i) => expect(f.slice(0, 5), f).toBe(String(i + 1).padStart(5, '0')));
    const priorBody = functionBody(stripComments(readMigration(PRIOR)), 'private.enforce_pilot_rfq_allowance');
    expect(priorBody).toContain('v_allowance CONSTANT integer := 3');
    expect(priorBody).not.toContain('v_quarter_start');
    expect(priorBody).not.toContain('subscription_plan');
    const definers = files.filter((f) =>
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.enforce_pilot_rfq_allowance\s*\(/.test(readMigration(f)),
    );
    expect(definers).toEqual([PRIOR, FILE, '00253_cancelled_rfq_allowance_and_utgst.sql']);
    const later = functionBody(
      stripComments(readMigration('00253_cancelled_rfq_allowance_and_utgst.sql')),
      'private.enforce_pilot_rfq_allowance',
    );
    expect(later).toContain('v_allowance CONSTANT integer := 3');
    expect(later).toContain("status IS DISTINCT FROM 'CANCELLED'::public.rfq_status");
  });

  it('keeps the public yearly promise sentence unchanged', () => {
    const pricing = readFileSync(
      resolve(ROOT, 'apps/web/src/features/site/pages/PricingPage.tsx'),
      'utf8',
    );
    expect(pricing).toContain(
      'The allowance is 3 requests a month, with 1 extra request each quarter on a yearly plan.',
    );
  });

  it('locks the organization, then counts the UTC month, then allows one UTC-quarter bonus', () => {
    expect(code).toContain('SECURITY DEFINER');
    expect(code).toContain('SET search_path = public, private, pg_temp');
    expect(body).toContain("v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';");
    expect(body).toContain("v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';");
    const admin = body.indexOf('IF private.is_platform_admin() THEN');
    const lock = body.indexOf('FOR UPDATE');
    const monthCount = body.indexOf('SELECT count(*)::integer INTO v_used');
    const underCap = body.indexOf('IF v_used < v_allowance THEN');
    const bonus = body.indexOf('IF v_yearly AND v_used = v_allowance THEN');
    expect(admin).toBeGreaterThan(-1);
    expect(admin).toBeLessThan(lock);
    expect(lock).toBeLessThan(monthCount);
    expect(monthCount).toBeLessThan(underCap);
    expect(underCap).toBeLessThan(bonus);
    expect(body).toContain("AND created_at >= v_month_start");
    expect(body).toContain("AND created_at < v_month_start + interval '1 month'");
    expect(body).toContain("AND created_at >= v_quarter_start");
    expect(body).toContain("AND created_at < v_quarter_start + interval '3 months'");
    expect(body).toContain("date_trunc('month', created_at AT TIME ZONE 'UTC')");
    expect(body).toContain("v_plan = 'YEARLY'");
    expect(body).toContain("v_status = 'ACTIVE'");
    expect(body).toContain('v_expires IS NULL OR v_expires >= now()');
    expect(body).toContain("v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME')");
    expect(body).not.toContain("'ENTERPRISE'");
    expect(body).not.toContain("'INSTITUTION'");
    const outsideMonth = body.indexOf('NEW.created_at < v_month_start OR NEW.created_at >= v_month_start + interval \'1 month\'');
    expect(outsideMonth).toBeGreaterThan(admin);
    expect(outsideMonth).toBeLessThan(lock);
    expect(body).toContain('IF COALESCE(v_bonus_used, 0) < 1 THEN');
    expect(body).toContain("HINT = 'PILOT_ALLOWANCE_EXHAUSTED'");
  });

  it('does not read sourcing mode, session, device, or payment rows, and does not write a second ledger', () => {
    expect(body).not.toMatch(/sourcing_mode|subscription_payment_logs|session|device/i);
    expect(body.replace(/FOR UPDATE/g, '')).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(code).not.toMatch(/\bGRANT\b/);
    expect(code).toContain(
      'REVOKE ALL ON FUNCTION private.enforce_pilot_rfq_allowance() FROM PUBLIC, anon, authenticated;',
    );
    expect(code).toMatch(
      /CREATE TRIGGER trg_enforce_pilot_rfq_allowance\s+BEFORE INSERT ON public\.rfqs\s+FOR EACH ROW EXECUTE FUNCTION private\.enforce_pilot_rfq_allowance\(\);/,
    );
  });

  it('keeps publish_requirement idempotent and free of a client plan argument', () => {
    const publishers = files.filter((f) =>
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_requirement\s*\(/.test(readMigration(f)),
    );
    expect(publishers.at(-1)).toBe(PUBLISH);
    const publish = readMigration(PUBLISH);
    const existsAt = publish.indexOf(
      'IF EXISTS (SELECT 1 FROM rfqs WHERE requirement_id = p_requirement_id) THEN',
    );
    const insertAt = publish.indexOf('INSERT INTO rfqs');
    expect(existsAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(existsAt);
    const signature = publish.slice(
      publish.indexOf('CREATE OR REPLACE FUNCTION public.publish_requirement('),
      publish.indexOf('RETURNS jsonb'),
    );
    expect(signature).not.toMatch(/p_plan|p_subscription_plan|p_cycle|yearly/i);
  });
});
