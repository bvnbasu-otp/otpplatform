import { describe, expect, it } from 'vitest';
import { PIN_ONLY_WARMING_CATEGORY } from '@otp/domain';
import {
  isExactServiceRoleBearer,
  resolveRecoveryAdminAuthorization,
  resolveBuyerOnboardingWarmingScope,
} from './location-pin-coverage-request-auth';

const validBody = {
  executeDiscovery: true,
  discoveryContext: 'BUYER_ONBOARDING',
  signupRequestId: '7bdc0a01-96e2-4cb8-82d4-11f1496c60a9',
  city: 'BENGALURU',
  pincode: '560048',
  category: PIN_ONLY_WARMING_CATEGORY,
};

describe('location PIN coverage onboarding authorization', () => {
  it('derives a PIN-only warming scope from the stored buyer signup row', () => {
    const result = resolveBuyerOnboardingWarmingScope({
      ...validBody,
      signup: { side: 'BUYER', status: 'PENDING', coverage_city: 'Bengaluru', coverage_pincode: '560048' },
    });

    expect(result).toEqual({
      ok: true,
      scope: {
        state: '',
        city: 'Bengaluru',
        pincode: '560048',
        category: PIN_ONLY_WARMING_CATEGORY,
        discoveryContext: 'BUYER_ONBOARDING',
      },
    });
  });

  it('rejects mismatched location, rejected requests, and force refresh', () => {
    const signup = { side: 'BUYER', status: 'PENDING', coverage_city: 'Bengaluru', coverage_pincode: '560048' };
    const mismatch = resolveBuyerOnboardingWarmingScope({ ...validBody, pincode: '560001', signup });
    const rejected = resolveBuyerOnboardingWarmingScope({ ...validBody, signup: { ...signup, status: 'REJECTED' } });
    const forced = resolveBuyerOnboardingWarmingScope({ ...validBody, forceRefresh: true, signup });

    expect(mismatch).toMatchObject({ ok: false, status: 403 });
    expect(rejected).toMatchObject({ ok: false, status: 403 });
    expect(forced).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects malformed or non-buyer signup IDs and client category/city manipulation', () => {
    const buyerSignup = { side: 'BUYER', status: 'PENDING', coverage_city: 'Bengaluru', coverage_pincode: '560048' };
    const malformedId = resolveBuyerOnboardingWarmingScope({
      ...validBody,
      signupRequestId: 'not-a-uuid',
      signup: buyerSignup,
    });
    const supplierRequest = resolveBuyerOnboardingWarmingScope({
      ...validBody,
      signup: { ...buyerSignup, side: 'SUPPLIER' },
    });
    const alteredCategory = resolveBuyerOnboardingWarmingScope({
      ...validBody,
      category: 'Electrical & Power',
      signup: buyerSignup,
    });
    const alteredCity = resolveBuyerOnboardingWarmingScope({
      ...validBody,
      city: 'Mysuru',
      signup: buyerSignup,
    });

    expect(malformedId).toMatchObject({ ok: false, status: 401 });
    expect(supplierRequest).toMatchObject({ ok: false, status: 403 });
    expect(alteredCategory).toMatchObject({ ok: false, status: 403 });
    expect(alteredCity).toMatchObject({ ok: false, status: 403 });
  });

  it('treats a repeated valid signup request as the same idempotent scope', () => {
    const signup = { side: 'BUYER', status: 'PENDING', coverage_city: 'Bengaluru', coverage_pincode: '560048' };
    const first = resolveBuyerOnboardingWarmingScope({ ...validBody, signup });
    const replay = resolveBuyerOnboardingWarmingScope({ ...validBody, signup });
    expect(replay).toEqual(first);
  });

  it('accepts only the exact configured service-role bearer for scheduled workers', () => {
    expect(isExactServiceRoleBearer('Bearer local-service-key', 'local-service-key')).toBe(true);
    expect(isExactServiceRoleBearer('Bearer local-service-key-extra', 'local-service-key')).toBe(false);
    expect(isExactServiceRoleBearer('Bearer local-service-key', '')).toBe(false);
    expect(isExactServiceRoleBearer(null, 'local-service-key')).toBe(false);
  });

  it('requires an authenticated SuperAdmin to inspect or retry coverage recovery jobs', () => {
    expect(resolveRecoveryAdminAuthorization({ isAuthenticated: false, isSuperAdmin: true })).toMatchObject({ ok: false, status: 401 });
    expect(resolveRecoveryAdminAuthorization({ isAuthenticated: true, isSuperAdmin: false })).toMatchObject({ ok: false, status: 403 });
    expect(resolveRecoveryAdminAuthorization({ isAuthenticated: true, isSuperAdmin: true })).toEqual({ ok: true });
  });
});