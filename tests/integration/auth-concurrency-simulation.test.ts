/**
 * =============================================================================
 * Test Suite: Authentication Lifecycles, Rate Limiting & 25-User Concurrency
 * =============================================================================
 */

import { describe, expect, it } from 'vitest';
import {
  MockGoTrueEngine,
  computeLatencyStats,
  runCompleteAuthAndConcurrencySimulation,
} from '../../scripts/simulate-auth-and-load';

describe('Authentication Lifecycle Verification', () => {
  const engine = new MockGoTrueEngine();

  it('verifies Buyer registration and organization creation with initial profile', () => {
    const res = engine.signupWithEmailPassword(
      'vitest.buyer@lakeview.test',
      'SecurePass2026!',
      'Lakeview Committee Lead',
      'PROCUREMENT_LEAD',
      'BUYER',
      'Lakeview Residency Society'
    );

    expect(res.ok).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.portalRole).toBe('buyer');
    expect(res.user?.orgId).toBeTruthy();
    expect(res.user?.orgName).toBe('Lakeview Residency Society');
    expect(res.user?.isPlatformAdmin).toBe(false);
  });

  it('verifies Supplier registration and entity mapping', () => {
    const res = engine.signupWithEmailPassword(
      'vitest.supplier@powertransformers.test',
      'SecurePass2026!',
      'Power Transformers Managing Partner',
      'SUPPLIER_FOUNDER',
      'SUPPLIER',
      'Power Transformers & Rewinding Works'
    );

    expect(res.ok).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.portalRole).toBe('supplier');
    expect(res.user?.supplierId).toBeTruthy();
    expect(res.user?.supplierName).toBe('Power Transformers & Rewinding Works');
    expect(res.user?.orgId).toBeNull();
  });

  it('verifies WhatsApp OTP request, expiration, and password reset workflow', () => {
    const otpRes = engine.requestWhatsAppOtp('secretary@sunrise.test');
    expect(otpRes.ok).toBe(true);
    expect(otpRes.otpCode).toMatch(/^[0-9]{6}$/);

    // Verify successful password reset
    const resetRes = engine.verifyWhatsAppPasswordReset(
      'secretary@sunrise.test',
      otpRes.otpCode!,
      'NewSunrisePassword@2026'
    );
    expect(resetRes.ok).toBe(true);

    // Verify login with updated password
    const loginRes = engine.signInWithPassword('secretary@sunrise.test', 'NewSunrisePassword@2026');
    expect(loginRes.ok).toBe(true);
    expect(loginRes.session).toBeDefined();
  });

  it('verifies SuperAdmin JWT claims and strict role/org isolation', () => {
    const login = engine.signInWithPassword('bvnbasu@gmail.com', 'Admin@OTP2026!');
    expect(login.ok).toBe(true);
    expect(login.session).toBeDefined();

    const verify = engine.verifyJwt(login.session!.accessToken);
    expect(verify.valid).toBe(true);
    expect(verify.payload?.app_metadata.is_platform_admin).toBe(true);
    expect(verify.payload?.app_metadata.org_id).toBeNull();
    expect(verify.payload?.email).toBe('bvnbasu@gmail.com');
  });

  it('verifies refresh token cycling, token rotation and reuse prevention', () => {
    const login = engine.signInWithPassword('manager@sunrise.test', 'password');
    const oldRefresh = login.session!.refreshToken;

    const refresh1 = engine.refreshSession(oldRefresh);
    expect(refresh1.ok).toBe(true);
    expect(refresh1.session?.refreshToken).not.toBe(oldRefresh);

    // Replay attack / old token reuse detection
    const replay = engine.refreshSession(oldRefresh);
    expect(replay.ok).toBe(false);
    expect(replay.status).toBe(401);
  });

  it('verifies session revocation on logout', () => {
    const login = engine.signInWithPassword('supplier01@otpdemo.test', 'password');
    const refresh = login.session!.refreshToken;

    const logout = engine.signOut(refresh);
    expect(logout.ok).toBe(true);

    const postLogoutRefresh = engine.refreshSession(refresh);
    expect(postLogoutRefresh.ok).toBe(false);
  });

  it('handles edge cases: invalid credentials, short passwords, invalid tokens', () => {
    const wrong = engine.signInWithPassword('admin@otp.test', 'wrong_pass');
    expect(wrong.ok).toBe(false);
    expect(wrong.status).toBe(400);

    const short = engine.signupWithEmailPassword('a@b.com', '12', 'Short', 'PROPERTY_OWNER', 'BUYER', 'Short');
    expect(short.ok).toBe(false);
    expect(short.code).toBe(422);

    const corruptJwt = engine.verifyJwt('header.payload.invalidsig');
    expect(corruptJwt.valid).toBe(false);
  });
});

describe('Rate Limiting & Security Invariants', () => {
  it('enforces GOTRUE_RATE_LIMIT_OTP (30 requests/hr) and triggers graceful 429', () => {
    const engine = new MockGoTrueEngine();
    const key = 'otp_request:rate_test@domain.test';
    engine.resetRateLimit(key);

    let allowed = 0;
    let blocked = 0;

    for (let i = 0; i < 35; i++) {
      const res = engine.checkRateLimit(key, 30, 3600000);
      if (res.allowed) allowed++;
      else blocked++;
    }

    expect(allowed).toBe(30);
    expect(blocked).toBe(5);
  });

  it('enforces GOTRUE_RATE_LIMIT_VERIFY (30 requests/hr)', () => {
    const engine = new MockGoTrueEngine();
    const key = 'otp_verify:verify_test@domain.test';
    engine.resetRateLimit(key);

    let allowed = 0;
    let blocked = 0;

    for (let i = 0; i < 33; i++) {
      const res = engine.checkRateLimit(key, 30, 3600000);
      if (res.allowed) allowed++;
      else blocked++;
    }

    expect(allowed).toBe(30);
    expect(blocked).toBe(3);
  });
});

describe('25-User Concurrent Load & Performance Simulation', () => {
  it('runs complete 25-user concurrent load simulation and asserts performance invariants', async () => {
    const sim = await runCompleteAuthAndConcurrencySimulation();

    expect(sim.simulationResults.length).toBe(25);
    expect(sim.tokenCollisions).toBe(0);
    expect(sim.sessionBleeding).toBe(0);
    expect(sim.loginStats.p95).toBeLessThan(150); // P95 latency bound < 150ms
    expect(sim.verifyStats.p95).toBeLessThan(50);
    expect(sim.throughput).toBeGreaterThan(5);     // Throughput > 5 users/sec
  });
});
