/**
 * Static contract for migration 00246. Does not connect to Postgres.
 * Live database execution was not run.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve('supabase/migrations');
const FILE = '00246_buyer_signup_allowlist_and_reveal_po_guard.sql';
const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

function stripComments(s: string): string {
  return s.replace(/--.*$/gm, '');
}

function functionBody(src: string, name: string): string {
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('$$', start);
  const close = src.indexOf('$$;', open + 2);
  return src.slice(start, close + 3);
}

const code = stripComments(sql);

describe('Migration 00246 static SQL contract', () => {
  it('is the contiguous file after 00245', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const index = files.indexOf(FILE);
    expect(index).toBeGreaterThan(0);
    expect(files[index - 1]).toBe('00245_f13_po_gst_tax_accuracy.sql');
    expect(files[index + 1]).toBe('00247_revoke_record_verified_payment_client_execute.sql');
    files.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('rejects non-customer buyer types before any signup insert', () => {
    const body = functionBody(code, 'public.submit_signup_request');
    const guardAt = body.indexOf('SIGNUP_BUYER_TYPE_REJECTED');
    const insertAt = body.indexOf('INSERT INTO signup_requests');
    expect(guardAt).toBeGreaterThan(0);
    expect(insertAt).toBeGreaterThan(guardAt);
    expect(body).toContain("'INDIVIDUAL', 'COMMUNITY', 'MSME'");
    expect(body).toContain('NOT IN');
    expect(code).not.toMatch(/ALTER TYPE[^;]*ADD VALUE/i);
    expect(code).not.toMatch(/DROP TYPE/i);
  });

  it('raises when auto-reveal does not receive a purchase order id', () => {
    const body = functionBody(code, 'public.lock_and_reveal_award_atomic');
    const raiseAt = body.indexOf('Reveal failed: Purchase Order was not created');
    const returnAt = body.indexOf("'revealed', true");
    expect(raiseAt).toBeGreaterThan(0);
    expect(returnAt).toBeGreaterThan(raiseAt);
    expect(body).toContain('IF v_po_id IS NULL THEN');
  });
});
