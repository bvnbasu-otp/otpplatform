import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const FILE = '00256_standardize_auth_otp_eight_digits.sql';
const SQL = readFileSync(resolve(ROOT, 'supabase/migrations', FILE), 'utf8');

describe('00256 auth OTP eight-digit standardization', () => {
  it('precedes 00257 in the migration chain', () => {
    const files = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((f) => /^\d{5}_.*\.sql$/.test(f))
      .sort();
    const index = files.indexOf(FILE);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(files[index + 1]).toBe('00257_canonical_role_catalog_and_signup_provisioning.sql');
    expect(files[index + 2]).toBe('00258_rwa_committee_vote_authority_trigger_order.sql');
    expect(files[index + 3]).toBe('00259_document_reveal_integrity_digest_hmac_parity.sql');
  });

  it('issues eight-digit codes and rejects non-eight-digit verify input before hash compare', () => {
    const sqlNoComments = SQL.replace(/--.*$/gm, '');
    expect(sqlNoComments).not.toMatch(/generate_numeric_otp\(6\)/);
    expect(SQL.match(/generate_numeric_otp\(8\)/g)?.length).toBe(4);
    expect(SQL).toContain("DEFAULT 8");
    expect(SQL.match(/\^\[0-9\]\{8\}\$/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SQL).toContain("SET search_path = public, private, auth, extensions");
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) TO anon, authenticated, service_role');
  });
});
