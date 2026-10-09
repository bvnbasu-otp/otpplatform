import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const FILE = '00256_standardize_auth_otp_eight_digits.sql';
const SQL = readFileSync(resolve(ROOT, 'supabase/migrations', FILE), 'utf8');

describe('00256 auth OTP eight-digit standardization', () => {
  it('is the repository migration ceiling', () => {
    const files = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((f) => /^\d{5}_.*\.sql$/.test(f))
      .sort();
    expect(files.at(-1)).toBe(FILE);
  });

  it('issues eight-digit codes and rejects non-eight-digit verify input before hash compare', () => {
    expect(SQL).not.toMatch(/generate_numeric_otp\(6\)/);
    expect(SQL.match(/generate_numeric_otp\(8\)/g)?.length).toBe(4);
    expect(SQL).toContain("DEFAULT 8");
    expect(SQL.match(/\^\[0-9\]\{8\}\$/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SQL).toContain("SET search_path = public, private, auth, extensions");
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) TO anon, authenticated, service_role');
  });
});
