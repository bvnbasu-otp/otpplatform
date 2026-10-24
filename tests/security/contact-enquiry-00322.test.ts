import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATION = resolve(ROOT, 'supabase/migrations/00324_public_contact_enquiries.sql');
const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--.*$/gm, '');
const edge = readFileSync(resolve(ROOT, 'supabase/functions/contact-enquiry/index.ts'), 'utf8');

describe('00324 contact enquiries migration (static review, no database)', () => {
  it('is a genuine numbered migration', () => {
    expect(sql).toContain('-- 00324: Rate-limited public contact enquiries.');
    expect(sql).toContain('Forward-only; deployment remains a separate authorized operation.');
  });

  it('enables RLS and lets only platform admins read', () => {
    expect(code).toContain('ALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;');
    expect(code).toContain('REVOKE ALL ON public.contact_enquiries FROM PUBLIC, anon, authenticated, service_role;');
    expect(code).toMatch(/CREATE POLICY contact_enquiries_platform_admin_read[\s\S]*FOR SELECT[\s\S]*TO authenticated[\s\S]*USING \(private\.is_platform_admin\(\)\);/);
    expect(code).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*contact_enquiries[^;]*TO (anon|authenticated)/i);
    expect(code).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)[^;]*contact_enquiries/i);
    expect(code).not.toMatch(/USING \(true\)|WITH CHECK \(true\)/i);
  });

  it('writes only through service_role RPCs, and admin RPCs check platform admin', () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_contact_enquiry\([^)]*\) TO service_role;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_contact_enquiry_notification\([^)]*\) TO service_role;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.submit_contact_enquiry\([^)]*\)\s*FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.mark_contact_enquiry_notification\([^)]*\)\s*FROM PUBLIC, anon, authenticated;/);
    expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.(submit_contact_enquiry|mark_contact_enquiry_notification)[^;]*TO (anon|authenticated)/);
    for (const fn of ['admin_list_contact_enquiries', 'admin_set_contact_enquiry_status']) {
      const body = code.match(new RegExp(`CREATE FUNCTION public\\.${fn}[\\s\\S]*?\\$fn\\$;`))?.[0] ?? '';
      expect(body).toContain('IF NOT private.is_platform_admin() THEN');
    }
  });

  it('uses a bounded 90-day retention contract and a service-role-only purge', () => {
    expect(code).toContain("retention_expires_at       timestamptz NOT NULL DEFAULT (now() + interval '90 days')");
    expect(code).toContain('CREATE FUNCTION public.purge_expired_contact_enquiries(p_limit integer DEFAULT 500)');
    expect(code).toContain('FOR UPDATE SKIP LOCKED');
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.purge_expired_contact_enquiries\(integer\)\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(code).toContain(
      'GRANT EXECUTE ON FUNCTION public.purge_expired_contact_enquiries(integer) TO service_role;',
    );
  });

  it('keeps the dedicated limiter private and exposes no caller-controlled limits or endpoint bucket', () => {
    expect(code).toContain('ALTER TABLE public.contact_enquiry_rate_limits ENABLE ROW LEVEL SECURITY;');
    expect(code).toContain('REVOKE ALL ON public.contact_enquiry_rate_limits FROM PUBLIC, anon, authenticated, service_role;');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.check_contact_enquiry_rate_limit(text)\n  FROM PUBLIC, anon, authenticated;');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.check_contact_enquiry_rate_limit(text) TO service_role;');
    expect(edge).toContain("db.rpc('check_contact_enquiry_rate_limit'");
    expect(edge).not.toContain("db.rpc('check_and_increment_rate_limit'");

    const limiter = code.match(/CREATE FUNCTION public\.check_contact_enquiry_rate_limit[\s\S]*?\$fn\$;/)?.[0] ?? '';
    expect(limiter).not.toMatch(/p_(?:endpoint|max_requests|window|scope|emergency)/i);
    expect(limiter).toContain("v_endpoint_count >= 200");
    expect(limiter).toContain("v_client_count >= 5");
    expect(limiter).toContain("scope = 'ENDPOINT'");
    expect(limiter).toContain("scope = 'CLIENT'");
  });

  it('serializes each identity and the distinct endpoint ceiling before counting and inserting', () => {
    const limiter = code.match(/CREATE FUNCTION public\.check_contact_enquiry_rate_limit[\s\S]*?\$fn\$;/)?.[0] ?? '';
    const globalLock = limiter.indexOf("pg_advisory_xact_lock(hashtextextended('contact-enquiry:endpoint:v1'");
    const clientLock = limiter.indexOf("pg_advisory_xact_lock(hashtextextended('contact-enquiry:client:' || p_client_key");
    const firstCount = limiter.indexOf('SELECT count(*)::integer');
    const insert = limiter.indexOf('INSERT INTO public.contact_enquiry_rate_limits');
    expect(globalLock).toBeGreaterThan(0);
    expect(clientLock).toBeGreaterThan(globalLock);
    expect(firstCount).toBeGreaterThan(clientLock);
    expect(insert).toBeGreaterThan(firstCount);
    expect(limiter).toContain("bucket_key = p_client_key");
    expect(limiter).toContain("('ENDPOINT', v_endpoint_key, v_now)");
    expect(limiter).toContain("('CLIENT', p_client_key, v_now)");
  });

  it('is idempotent on submission id and records one notification outcome', () => {
    expect(code).toMatch(/submission_id\s+uuid NOT NULL UNIQUE/);
    expect(code).toContain('ON CONFLICT (submission_id) DO NOTHING;');
    expect(code).toMatch(/WHERE id = p_id\s+AND notification_status = 'PENDING'/);
  });

  describe('submission id reuse', () => {
    const submit = code.match(/CREATE FUNCTION public\.submit_contact_enquiry[\s\S]*?\$fn\$;/)?.[0] ?? '';

    it('stores a server-computed SHA-256 payload fingerprint', () => {
      expect(code).toContain("payload_fingerprint        text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$')");
      expect(submit).not.toMatch(/p_(?:payload_)?fingerprint/);
      expect(submit).toMatch(/v_fingerprint := encode\(sha256\(convert_to\(jsonb_build_array\(/);
      expect(submit).toMatch(/\)::text, 'UTF8'\)\), 'hex'\);/);
    });

    it('fingerprints every stored field in a fixed canonical order with a version tag', () => {
      const args = submit.match(/jsonb_build_array\(([\s\S]*?)\)::text/)?.[1] ?? '';
      expect(args.split(',').map((a) => a.trim())).toEqual([
        "'contact-enquiry:payload:v1'",
        'p_category',
        'p_name',
        'v_email',
        'v_phone',
        'v_organisation',
        'p_subject',
        'p_message',
      ]);
      expect(submit).toContain('v_email        text := lower(p_email);');
      expect(submit).toContain("v_phone        text := NULLIF(p_phone, '');");
      expect(submit).toContain("v_organisation text := NULLIF(p_organisation, '');");
    });

    it('inserts the same normalized values it fingerprints', () => {
      const insert = submit.match(/INSERT INTO public\.contact_enquiries[\s\S]*?ON CONFLICT \(submission_id\) DO NOTHING;/)?.[0] ?? '';
      expect(insert).toContain('payload_fingerprint');
      for (const value of ['v_fingerprint', 'v_email', 'v_phone', 'v_organisation']) expect(insert).toContain(value);
      expect(insert).not.toMatch(/lower\(p_email\)|NULLIF\(p_/);
    });

    it('rejects a different payload as SUBMISSION_CONFLICT before any row details are returned', () => {
      const conflictCheck = submit.indexOf('IF v_count = 0 AND v_row.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN');
      const conflictReturn = submit.indexOf("RETURN jsonb_build_object('result', 'SUBMISSION_CONFLICT', 'created', false);");
      const rowReturn = submit.indexOf("'id', v_row.id");
      expect(conflictCheck).toBeGreaterThan(submit.indexOf('GET DIAGNOSTICS v_count = ROW_COUNT;'));
      expect(conflictReturn).toBeGreaterThan(conflictCheck);
      expect(rowReturn).toBeGreaterThan(conflictReturn);
      const conflictBranch = submit.slice(conflictCheck, submit.indexOf('END IF;', conflictCheck));
      expect(conflictBranch).not.toMatch(/v_row\.(id|reference|notification_status)/);
      expect(conflictBranch).not.toMatch(/UPDATE|INSERT|DELETE/);
    });

    it('distinguishes CREATED from a same-payload DUPLICATE', () => {
      expect(submit).toContain("'result', CASE WHEN v_count = 1 THEN 'CREATED' ELSE 'DUPLICATE' END,");
      expect(submit).toContain("'created', v_count = 1,");
    });

    it('keeps the RPC service-role only', () => {
      expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_contact_enquiry\([^)]*\) TO service_role;/);
      expect(code).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_contact_enquiry[^;]*TO (anon|authenticated|PUBLIC)/);
    });
  });

  it('implements bounded privacy retention without granting a browser deletion path', () => {
    expect(code).toContain("retention_expires_at       timestamptz NOT NULL DEFAULT (now() + interval '90 days')");
    expect(code).toContain('DELETE FROM public.contact_enquiries enquiry');
    expect(code).toContain('LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000)');
    expect(code).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.purge_expired_contact_enquiries[^;]*TO (anon|authenticated|PUBLIC)/,
    );
  });

  it('uses a server-issued signed identity, not a caller-selected or spoofed network identity', () => {
    expect(edge).toContain("Deno.env.get('CONTACT_RATE_LIMIT_SECRET')");
    expect(edge).toContain("req.headers.get('x-otp-contact-client-token')");
    expect(edge).toContain('resolveContactClientIdentity');
    expect(edge).not.toMatch(/x-forwarded-for|cf-connecting-ip|x-real-ip/i);
    expect(edge).toContain("return jsonResponse({ ok: false, code: 'NOT_RECORDED' }, 503");
  });

  it('mirrors the category allowlist, size limits and the single-line header rule', () => {
    expect(code).toContain("'BUYER', 'SUPPLIER_ONBOARDING', 'BUSINESS_PARTNERSHIP', 'TECHNICAL_SUPPORT', 'OTHER'");
    expect(code).toContain('char_length(message) BETWEEN 10 AND 4000');
    for (const col of ['name', 'subject', 'organisation']) {
      expect(code).toMatch(new RegExp(`${col} !~ '\\[\\\\r\\\\n\\]'`));
    }
  });

  it('stays separate from procurement, supplier, buyer, support and legal records', () => {
    expect(code).not.toMatch(/REFERENCES/i);
    expect(code).not.toMatch(/\b(rfqs|requirements|suppliers|organizations|support_tickets|legal_\w+|profiles)\b/);
  });
});
