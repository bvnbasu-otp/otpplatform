import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const PROPOSAL = resolve(ROOT, 'supabase/migrations/00318_support_ticket_rpc_hardening.sql');
const sql = readFileSync(PROPOSAL, 'utf8');
const code = sql.replace(/--.*$/gm, '');

function body(name: string): string {
  return code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?\\$fn\\$;`))?.[0] ?? '';
}

describe('00318 support-ticket RPC hardening, formerly proposal 00323 (static review, no database)', () => {
  it('is retained in the promoted chain and leaves no proposal copy behind', () => {
    expect(sql.startsWith('-- 00318: support-ticket admin RPC hardening (SEC-SUPPORT-01).')).toBe(true);
    expect(sql).not.toMatch(/UNAPPLIED|REVIEW ONLY|NOT APPLIED/);
    const migrations = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => /^\d{5}_.+\.sql$/.test(f)).sort();
    expect(migrations.at(-1)).toBe('00330_authoritative_pricing_and_supplier_fee_gate.sql');
    expect(readdirSync(resolve(ROOT, 'supabase')).filter((f) => /support_ticket/.test(f))).toEqual([]);
    expect(existsSync(resolve(ROOT, 'supabase/migrations/00323_support_ticket_rpc_hardening.sql'))).toBe(false);
    expect(code).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/m);
  });

  it('describes the authenticated EXECUTE grant truthfully: the body, not the grant, authorizes', () => {
    const header = sql.slice(0, sql.indexOf('DO $preconditions$'));
    expect(header).toContain('granted back to authenticated');
    expect(header).toContain('the authenticated grant is not an authorization decision');
    expect(header).toContain('private.is_platform_admin()');
    expect(header).not.toMatch(/ordinary authenticated callers retain no EXECUTE path/);
  });

  it('requires authenticated JWT identity and the established platform-admin helper', () => {
    for (const name of ['admin_get_support_tickets', 'admin_resolve_support_ticket']) {
      const fn = body(name);
      expect(fn).toContain('auth.uid() IS NULL');
      expect(fn).toContain("COALESCE(auth.role(), '') <> 'authenticated'");
      expect(fn).toContain('NOT COALESCE(private.is_platform_admin(), false)');
      expect(fn).not.toMatch(/auth\.role\(\)\s*=\s*'(?:anon|authenticated)'/);
      expect(fn).not.toMatch(/p_(?:caller|user|requester|is_admin|admin_flag)/i);
    }
  });

  it('denies anonymous, PUBLIC and service-role execution while retaining the admin path', () => {
    for (const signature of [
      'public.admin_get_support_tickets(text, text, int, int, text)',
      'public.admin_resolve_support_ticket(uuid, text, text)',
    ]) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated, service_role;`);
      expect(code).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`);
      expect(code).not.toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO anon`);
      expect(code).not.toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });

  it('keeps create_support_ticket off the 00217 anon allowlist instead of re-granting anon', () => {
    const signature = 'public.create_support_ticket(text, text, text, text, text, text, text, text)';
    expect(code).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon;`);
    expect(code).toContain(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO authenticated, service_role;`);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_support_ticket\([^)]*\)\s+TO[^;]*\banon\b/);
    const allowlist = readFileSync(resolve(ROOT, 'supabase/migrations/00217_revoke_public_execute_default_privileges.sql'), 'utf8');
    expect(allowlist).toContain('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon;');
    expect(allowlist).not.toContain('create_support_ticket');
  });

  it('keeps security-definer search paths explicit', () => {
    for (const name of ['admin_get_support_tickets', 'admin_resolve_support_ticket']) {
      const fn = body(name);
      expect(fn).toContain('SECURITY DEFINER');
      expect(fn).toContain('SET search_path = public, private, auth');
    }
  });

  it('routes ticket notifications to bvnbasu@gmail.com only', () => {
    const fn = body('create_support_ticket');
    expect(fn).toContain("v_routed_email text := 'bvnbasu@gmail.com';");
    expect(fn.match(/[\w.+-]+@[\w.-]+/g)).toEqual(['bvnbasu@gmail.com']);
    expect(code).not.toContain('bvnbasu+');
  });

  describe('admin_resolve_support_ticket', () => {
    const fn = body('admin_resolve_support_ticket');
    const authCheck = fn.indexOf('auth.uid() IS NULL');
    const statusCheck = fn.indexOf("IF p_status IS NULL OR p_status NOT IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED') THEN");
    const nullTicketCheck = fn.indexOf('IF p_ticket_id IS NULL THEN');
    const update = fn.indexOf('UPDATE public.support_tickets');
    const notFound = fn.indexOf('IF NOT FOUND THEN');
    const audit = fn.indexOf('INSERT INTO public.audit_events');
    const success = fn.indexOf("RETURN jsonb_build_object('success', true");

    it('authorizes before validating, and validates before any update or audit', () => {
      expect(authCheck).toBeGreaterThan(0);
      expect(statusCheck).toBeGreaterThan(authCheck);
      expect(nullTicketCheck).toBeGreaterThan(statusCheck);
      expect(update).toBeGreaterThan(nullTicketCheck);
    });

    it('allows exactly the statuses of the 00076 support_tickets CHECK constraint', () => {
      const migration = readFileSync(resolve(ROOT, 'supabase/migrations/00076_support_tickets_and_ops_routing.sql'), 'utf8');
      expect(migration).toContain("status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'))");
      const branch = fn.slice(statusCheck, fn.indexOf('END IF;', statusCheck));
      expect(branch).toContain("RAISE EXCEPTION 'SUPPORT_TICKET_INVALID_STATUS");
      expect(branch).toContain("USING ERRCODE = '22023'");
    });

    it('fails a nonexistent ticket truthfully: no success and no audit entry', () => {
      expect(fn).toMatch(/WHERE id = p_ticket_id\s+RETURNING COALESCE\(is_demo, false\) INTO v_is_demo;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'SUPPORT_TICKET_NOT_FOUND' USING ERRCODE = 'P0002';\s+END IF;/);
      expect(notFound).toBeGreaterThan(update);
      expect(audit).toBeGreaterThan(notFound);
      expect(success).toBeGreaterThan(audit);
      expect(fn.slice(nullTicketCheck, update)).toContain("RAISE EXCEPTION 'SUPPORT_TICKET_NOT_FOUND' USING ERRCODE = 'P0002';");
    });

    it('updates the ticket, audits the change and reports success on the valid path', () => {
      expect(fn).toContain('SET status = p_status,');
      expect(fn).toContain("resolved_at = CASE WHEN p_status IN ('RESOLVED', 'CLOSED') THEN now() ELSE NULL END,");
      expect(fn).toContain("'support.ticket.updated', v_actor_id, v_org_id, 'SUPPORT_TICKET'");
      expect(fn).toContain("RETURN jsonb_build_object('success', true, 'message', 'Ticket updated successfully.');");
      expect(fn.match(/'success', true/g)).toHaveLength(1);
    });
  });

  it('is valid UTF-8 without mojibake, and keeps the intended ticket title characters', () => {
    const bytes = readFileSync(PROPOSAL);
    expect(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)).toBe(true);
    expect(bytes[0]).not.toBe(0xef);
    expect(sql).not.toMatch(/[\u00c2\u00c3][\u0080-\u00bf]|\u00e2\u20ac|\u00f0\u0178|\ufffd/);
    expect(body('create_support_ticket')).toContain("'\u{1F3AB} New ' || v_normalized_cat || ' Ticket: ' || v_ticket_number,");
  });
});
