import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyCoverageResponse, discoveryRequirementIssues, sourceSummary } from './lib/discovery-source';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('discovery source separation', () => {
  it('A treats a real Google count as Google discovery without verification', () => {
    expect(classifyCoverageResponse({ ok: true, knownSuppliersCount: 2, message: 'Discovered 2 Google Places suppliers' })).toBe(
      'GOOGLE_PLACES_DISCOVERY',
    );
    expect(sourceSummary({ google: 2, otp: 0 }).label).toMatch(/Google Places: 2/);
  });

  it('B keeps a Google zero distinct from an OTP substitution', () => {
    expect(
      classifyCoverageResponse({
        ok: false,
        knownSuppliersCount: 0,
        message: 'Discovery completed with zero suppliers (not cached as fresh).',
      }),
    ).toBe('ZERO_RESULTS');
    expect(sourceSummary({ google: 0, otp: 0 }).label).toMatch(/0 discovered/);
    expect(sourceSummary({ google: 0, otp: 0 }).label).toMatch(/not substituted|No OTP/i);
  });

  it('C and F keep Google unavailable and quota distinct from zero', () => {
    expect(classifyCoverageResponse({ ok: false, error: 'PROVIDER_UNAVAILABLE', message: 'not configured' })).toBe(
      'SERVICE_FAILURE',
    );
    expect(classifyCoverageResponse({ ok: false, error: 'QUOTA_EXHAUSTED', message: 'Daily Google Places budget exhausted.' })).toBe(
      'QUOTA_FAILURE',
    );
  });

  it('D and E do not search when the category or PIN cannot be used', () => {
    expect(classifyCoverageResponse({ ok: false, error: 'UNSUPPORTED_CATEGORY', message: 'Unsupported category' })).toBe(
      'UNSUPPORTED_CATEGORY',
    );
    expect(discoveryRequirementIssues({ pincode: '56004', city: 'Bengaluru', state: 'Karnataka', category: 'Safety' })).toMatch(
      /PIN/,
    );
    expect(discoveryRequirementIssues({ pincode: '560048', city: 'Bengaluru', state: 'Karnataka', category: '' })).toMatch(
      /category/,
    );
    expect(discoveryRequirementIssues({ pincode: '', city: '', state: '', category: '' })).not.toBeNull();
  });

  it('G labels an OTP registered search as not a Google result', () => {
    const summary = sourceSummary({ google: 0, otp: 3 });
    expect(summary.outcome).toBe('OTP_REGISTERED_SUPPLIER_DISCOVERY');
    expect(summary.label).toMatch(/not a Google Places discovery/);
  });

  it('does not silently pad a Google miss with unrelated active suppliers or open quoting at zero', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/00232_discovery_source_separation.sql'), 'utf8');
    expect(sql).not.toContain('LIMIT (4 -');
    expect(sql).toContain("IS DISTINCT FROM 'verified_active'");
    expect(sql).toContain('GOOGLE_PLACES');
    expect(sql).toContain('OTP_REGISTERED_SUPPLIER_DISCOVERY');
    expect(sql).toContain('ZERO_RESULTS');
    expect(sql).toContain("v_total > 0");
    expect(sql).not.toContain("s.status = 'ACTIVE'");
    expect(sql).toContain("p_network text DEFAULT 'GOOGLE_PLACES'");
    const client = readFileSync(join(root, 'apps/web/src/features/requirement/api/rfq-lifecycle.ts'), 'utf8');
    expect(client).toContain("if (network === 'OTP_REGISTERED') args.p_network = 'OTP_REGISTERED'");
  });
});
