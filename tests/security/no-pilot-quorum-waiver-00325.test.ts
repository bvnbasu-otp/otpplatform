import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SQL = readFileSync(
  resolve(ROOT, 'supabase/migrations/00325_disable_pilot_quote_quorum_waiver.sql'),
  'utf8',
);
const DISCOVERY = readFileSync(
  resolve(ROOT, 'supabase/migrations/00251_fresh_pin_coverage_otp_registered_fallback.sql'),
  'utf8',
);
const SEED = readFileSync(resolve(ROOT, 'supabase/seed.sql'), 'utf8');

describe('00325 controlled-pilot quote quorum', () => {
  it('disables the legacy waiver RPC for every API role', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.waive_rfq_quote_quorum(');
    expect(SQL).toContain('PILOT_QUORUM_WAIVER_DISABLED');
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.waive_rfq_quote_quorum\(uuid, text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(SQL).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.waive_rfq_quote_quorum\(uuid, text\)/,
    );
  });

  it('refuses new waiver flags and enforces actual final-quote count on award insertion', () => {
    expect(SQL).toContain('BEFORE INSERT OR UPDATE OF min_quotes_waived ON public.rfqs');
    expect(SQL).toContain('BEFORE INSERT ON public.awards');
    expect(SQL).toContain("status = 'FINAL'::public.quote_status");
    expect(SQL).toContain('IF v_final < v_required THEN');
    const awardGuard =
      SQL.match(
        /CREATE FUNCTION private\.enforce_award_quote_quorum\(\)[\s\S]*?\n\$fn\$;/,
      )?.[0] ?? '';
    expect(awardGuard).not.toContain('min_quotes_waived');
  });

  it('does not gate supplier discovery on quote count or waiver state', () => {
    const functionBody =
      DISCOVERY.match(
        /CREATE OR REPLACE FUNCTION public\.discover_and_invite_for_rfq\([\s\S]*?\n\$\$;/,
      )?.[0] ?? '';
    expect(functionBody).toContain("v_rfq.status NOT IN ('DRAFT', 'OPEN')");
    expect(functionBody).not.toContain('min_quotes_required');
    expect(functionBody).not.toContain('min_quotes_waived');
  });

  it('keeps the deterministic awarded fixture valid without bypassing quorum', () => {
    const finalQuote = SEED.indexOf("'FINAL',");
    const award = SEED.indexOf('INSERT INTO awards');
    const selected = SEED.indexOf("SET status = 'SELECTED'", award);
    expect(finalQuote).toBeGreaterThan(-1);
    expect(award).toBeGreaterThan(finalQuote);
    expect(selected).toBeGreaterThan(award);
    expect(SEED).not.toContain('min_quotes_waived');
  });
});
