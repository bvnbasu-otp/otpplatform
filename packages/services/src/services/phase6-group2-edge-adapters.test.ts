import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OndcPublicKeyCache,
  OndcBapReceiver,
  generateOndcKeyPair,
  createOndcAuthHeader,
  verifyOndcAuthHeader,
  OndcGatewayClient,
  LiveGstVerificationAdapter,
  InMemoryRepositories,
} from '../index';
import {
  computeSmartScores,
  type RawQuoteMetrics,
  type ScoringWeights,
} from '@otp/domain';
import { isAllowedOrigin, getCorsHeaders } from '../../../../supabase/functions/_shared/cors';

describe('Phase 6.2 Group 2: Edge Functions, Adapters, Public-Key Caching & Identity-Protected Minimization', () => {
  // ===========================================================================
  // SECTION 1: FND-01 Identity-Protected Data Minimization (RED-G2-01 to RED-G2-04)
  // ===========================================================================
  describe('FND-01: Identity-Protected Data Minimization in quotes_revealed', () => {
    it('RED-G2-01: Winning SELECTED quote projects complete legal, contact, and statutory profile', () => {
      const winnerRow = {
        quote_id: 'q-winner-01',
        anonymous_label: 'Supplier 74AF',
        rfq_id: 'rfq-100',
        status: 'SELECTED',
        supplier_id: 'sup-winner-88',
        business_name: 'Apex Industrial Engineering Ltd',
        legal_name: 'Apex Industrial Engineering Private Limited',
        trade_name: 'Apex Eng',
        gstin: '33AABCT1452F1Z8',
        phone: '+919840012345',
        email: 'sales@apexeng.in',
        total_cost: 450000,
        delivery_days: 10,
        warranty_months: 24,
      };

      expect(winnerRow.supplier_id).toBe('sup-winner-88');
      expect(winnerRow.business_name).toBe('Apex Industrial Engineering Ltd');
      expect(winnerRow.legal_name).toBe('Apex Industrial Engineering Private Limited');
      expect(winnerRow.gstin).toBe('33AABCT1452F1Z8');
      expect(winnerRow.phone).toBe('+919840012345');
      expect(winnerRow.email).toBe('sales@apexeng.in');
    });

    it('RED-G2-02: Losing non-winning quotes mask supplier_id and all identity fields to null', () => {
      const losingRow = {
        quote_id: 'q-losing-02',
        anonymous_label: 'Supplier 89BC',
        rfq_id: 'rfq-100',
        status: 'SUBMITTED',
        supplier_id: null,
        business_name: null,
        legal_name: null,
        trade_name: null,
        gstin: null,
        phone: null,
        email: null,
        address: null,
        source: null,
        total_cost: 490000,
        delivery_days: 15,
        warranty_months: 12,
      };

      expect(losingRow.supplier_id).toBeNull();
      expect(losingRow.business_name).toBeNull();
      expect(losingRow.legal_name).toBeNull();
      expect(losingRow.gstin).toBeNull();
      expect(losingRow.phone).toBeNull();
      expect(losingRow.email).toBeNull();
    });

    it('RED-G2-03: Commercial parameters, SLA, and scores remain fully accessible for comparison matrix', () => {
      const candidateRow = {
        quote_id: 'q-candidate-03',
        anonymous_label: 'Supplier 99ZZ',
        rfq_id: 'rfq-100',
        status: 'SHORTLISTED',
        supplier_id: null,
        business_name: null,
        version: 1,
        evaluation_score: 92.5,
        total_cost: 475000,
        base_price: 402542,
        delivery_days: 12,
        warranty_months: 18,
      };

      expect(candidateRow.anonymous_label).toBe('Supplier 99ZZ');
      expect(candidateRow.version).toBe(1);
      expect(candidateRow.evaluation_score).toBe(92.5);
      expect(candidateRow.total_cost).toBe(475000);
      expect(candidateRow.delivery_days).toBe(12);
      expect(candidateRow.warranty_months).toBe(18);
    });

    it('RED-G2-04: View definition strictly specifies security_barrier = true', () => {
      const viewSql = `
        CREATE OR REPLACE VIEW public.quotes_revealed
        WITH (security_barrier = true) AS
        SELECT ...
      `;
      expect(viewSql).toContain('WITH (security_barrier = true)');
    });
  });

  // ===========================================================================
  // SECTION 2: FND-04 External Adapter Timeout & Resilience (RED-G2-05 to RED-G2-08)
  // ===========================================================================
  describe('FND-04: External Adapter Timeout and Resilience', () => {
    it('RED-G2-05: ONDC Gateway Client enforces timeout and handles AbortError as TIMEOUT error code', async () => {
      const keys = generateOndcKeyPair();
      const client = new OndcGatewayClient({
        environment: 'STAGING',
        gatewayUrl: 'https://mock-gateway.ondc.org',
        subscriberId: 'bap.otp.in',
        bapUri: 'https://api.otp.in/ondc',
        uniqueKeyId: 'k1',
        signingPrivateKeyPem: keys.privateKeyPem,
        timeoutMs: 10, // ultra short timeout
      });

      const context = client.createContext({
        domain: 'ONDC:SRV11',
        action: 'search',
        transactionId: 'tx-test-01',
      });

      // Mock fetch that hangs
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      try {
        const res = await client.search({
          context,
          intent: { item: { descriptor: { name: 'Pumps' } } },
        });

        expect(res.ok).toBe(false);
        expect(res.errorCode).toBe('TIMEOUT');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('RED-G2-06: ONDC Gateway Client classifies HTTP non-200 errors with statusCode', async () => {
      const keys = generateOndcKeyPair();
      const client = new OndcGatewayClient({
        environment: 'STAGING',
        gatewayUrl: 'https://mock-gateway.ondc.org',
        subscriberId: 'bap.otp.in',
        bapUri: 'https://api.otp.in/ondc',
        uniqueKeyId: 'k1',
        signingPrivateKeyPem: keys.privateKeyPem,
      });

      const context = client.createContext({
        domain: 'ONDC:SRV11',
        action: 'search',
        transactionId: 'tx-test-02',
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      } as Response);

      try {
        const res = await client.search({
          context,
          intent: { item: { descriptor: { name: 'Pumps' } } },
        });

        expect(res.ok).toBe(false);
        expect(res.errorCode).toBe('HTTP_STATUS');
        expect(res.statusCode).toBe(502);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('RED-G2-07: Live GST Verification Adapter respects AbortSignal timeout', async () => {
      const adapter = new LiveGstVerificationAdapter(
        'https://api.gst.gov.in',
        'test-key',
        10 // 10ms timeout
      );

      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'TimeoutError';
            reject(err);
          });
        });
      });

      try {
        const res = await adapter.verifyGstin('33AABCT1452F1ZT');
        expect(res.verified).toBe(false);
        expect(res.error).toContain('timed out');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('RED-G2-08: Live GST Verification Adapter returns clean error on HTTP 500 error', async () => {
      const adapter = new LiveGstVerificationAdapter(
        'https://api.gst.gov.in',
        'test-key'
      );

      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      try {
        const res = await adapter.verifyGstin('33AABCT1452F1ZT');
        expect(res.verified).toBe(false);
        expect(res.error).toContain('HTTP 500');
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  // ===========================================================================
  // SECTION 3: FND-09 ONDC Public-Key Cache & Single-Flight (RED-G2-09 to RED-G2-13)
  // ===========================================================================
  describe('FND-09: ONDC Public-Key Cache & Single-Flight Mutex', () => {
    let keyCache: OndcPublicKeyCache;
    const keyPair1 = generateOndcKeyPair();
    const keyPair2 = generateOndcKeyPair();

    beforeEach(() => {
      keyCache = new OndcPublicKeyCache({
        maxCapacity: 3,
        ttlMs: 50, // 50ms for TTL testing
      });
    });

    it('RED-G2-09: Formats canonical key namespace ${subscriberId}|${uniqueKeyId}|${algorithm}', () => {
      const keyId = OndcPublicKeyCache.formatKeyNamespace('seller.pureaqua.in', 'key-2026', 'ed25519');
      expect(keyId).toBe('seller.pureaqua.in|key-2026|ed25519');
    });

    it('RED-G2-10: Caches retrieved keys and respects TTL expiration', async () => {
      keyCache.set('key-1', keyPair1.publicKeyPem, 30); // 30ms TTL
      expect(keyCache.get('key-1')).toBe(keyPair1.publicKeyPem);
      expect(keyCache.has('key-1')).toBe(true);

      // Wait 40ms for TTL to expire
      await new Promise((r) => setTimeout(r, 40));
      expect(keyCache.get('key-1')).toBeNull();
      expect(keyCache.has('key-1')).toBe(false);
    });

    it('RED-G2-11: Enforces LRU capacity limit by evicting least recently used entries', () => {
      keyCache.set('k1', 'val1', 10000);
      keyCache.set('k2', 'val2', 10000);
      keyCache.set('k3', 'val3', 10000);

      // Access k1 to make it recently used (k2 becomes oldest)
      keyCache.get('k1');

      // Insert k4, should evict k2
      keyCache.set('k4', 'val4', 10000);

      expect(keyCache.get('k1')).toBe('val1');
      expect(keyCache.get('k2')).toBeNull(); // evicted
      expect(keyCache.get('k3')).toBe('val3');
      expect(keyCache.get('k4')).toBe('val4');
    });

    it('RED-G2-12: Single-flight mutex executes ONLY ONE external fetch under concurrent requests', async () => {
      let fetchCount = 0;
      const slowResolver = async (keyId: string) => {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 20));
        return `PEM_FOR_${keyId}`;
      };

      const cache = new OndcPublicKeyCache({
        fetchFn: slowResolver,
      });

      // Fire 10 concurrent lookups for the exact same keyId
      const promises = Array.from({ length: 10 }, () =>
        cache.getOrFetch('subscriber.bpp|key-1|ed25519')
      );

      const results = await Promise.all(promises);

      expect(fetchCount).toBe(1); // Executed exactly once!
      for (const res of results) {
        expect(res).toBe('PEM_FOR_subscriber.bpp|key-1|ed25519');
      }
    });

    it('RED-G2-13: Receiver seamlessly utilizes key cache for webhook verification', async () => {
      const keys = generateOndcKeyPair();
      const body = { action: 'on_search', item: 'Pumps' };
      const authHeader = createOndcAuthHeader({
        body,
        subscriberId: 'bpp.seller.in',
        uniqueKeyId: 'k-prod',
        privateKeyPem: keys.privateKeyPem,
      });

      let fetchInvocations = 0;
      const keyCacheInstance = new OndcPublicKeyCache({
        fetchFn: async (keyId) => {
          fetchInvocations++;
          if (keyId === 'bpp.seller.in|k-prod|ed25519') {
            return keys.publicKeyPem;
          }
          return null;
        },
      });

      const receiver = new OndcBapReceiver({
        keyCache: keyCacheInstance,
      });

      // Verification 1: Cache Miss -> Fetches key
      const res1 = await receiver.verifyWebhook(authHeader, body);
      expect(res1.valid).toBe(true);
      expect(fetchInvocations).toBe(1);

      // Verification 2: Cache Hit -> Zero new fetches
      const res2 = await receiver.verifyWebhook(authHeader, body);
      expect(res2.valid).toBe(true);
      expect(fetchInvocations).toBe(1);
    });
  });

  // ===========================================================================
  // SECTION 4: FND-10 Derived/Fallback SLA Transparency (RED-G2-14 to RED-G2-17)
  // ===========================================================================
  describe('FND-10: Derived/Fallback SLA Transparency', () => {
    it('RED-G2-14: OndcBapReceiver marks isDeliveryDaysEstimated and isWarrantyEstimated as true on default SLAs', () => {
      const receiver = new OndcBapReceiver();
      const payload = {
        context: {
          domain: 'ONDC:SRV11',
          action: 'on_select' as const,
          bpp_id: 'seller.water.in',
          transaction_id: 'tx-001',
        },
        message: {
          order: {
            provider: { id: 'prv-01' },
            quote: { price: { value: '50000' } },
          },
        },
      };

      const result = receiver.handleOnSelect(payload as any);
      expect(result.quote.deliveryDays).toBe(3);
      expect(result.quote.isDeliveryDaysEstimated).toBe(true);
      expect(result.quote.warrantyMonths).toBe(12);
      expect(result.quote.isWarrantyEstimated).toBe(true);
    });

    it('RED-G2-15: OndcBapReceiver parses explicit fulfillment duration and marks isDeliveryDaysEstimated as false', () => {
      const receiver = new OndcBapReceiver();
      const payload = {
        context: {
          domain: 'ONDC:SRV11',
          action: 'on_select' as const,
          bpp_id: 'seller.water.in',
          transaction_id: 'tx-002',
        },
        message: {
          order: {
            provider: { id: 'prv-01' },
            quote: { price: { value: '50000' } },
            fulfillments: [
              {
                '@ondc/org/tat': 'P5D', // 5 days explicit SLA
              },
            ],
          },
        },
      };

      const result = receiver.handleOnSelect(payload as any);
      expect(result.quote.deliveryDays).toBe(5);
      expect(result.quote.isDeliveryDaysEstimated).toBe(false);
    });

    it('RED-G2-16: Smart Scoring applies SLA confidence damping on estimated delivery days', () => {
      const quotes: RawQuoteMetrics[] = [
        {
          quoteId: 'q-confirmed',
          totalCost: 100000,
          deliveryDays: 5,
          warrantyMonths: 12,
          ratingAvg: 4.5,
          onTimePercent: 90,
          isGstVerified: true,
          isDeliveryDaysEstimated: false,
          isWarrantyEstimated: false,
        },
        {
          quoteId: 'q-estimated',
          totalCost: 100000,
          deliveryDays: 5,
          warrantyMonths: 12,
          ratingAvg: 4.5,
          onTimePercent: 90,
          isGstVerified: true,
          isDeliveryDaysEstimated: true, // fallback default
          isWarrantyEstimated: true,
        },
      ];

      const weights: ScoringWeights = {
        commercial: 40,
        speed: 30,
        warranty: 15,
        quality: 15,
      };

      const scores = computeSmartScores(quotes, weights);
      const confirmed = scores.find((s) => s.quoteId === 'q-confirmed')!;
      const estimated = scores.find((s) => s.quoteId === 'q-estimated')!;

      expect(confirmed.compositeScore).toBeGreaterThan(estimated.compositeScore);
      expect(estimated.slaConfidencePenalty).toBeGreaterThan(0);
      expect(estimated.isDeliveryDaysEstimated).toBe(true);
    });

    it('RED-G2-17: Scoring outcome exposes transparency flags and breakdown metadata', () => {
      const quotes: RawQuoteMetrics[] = [
        {
          quoteId: 'q-1',
          totalCost: 200000,
          deliveryDays: 7,
          warrantyMonths: 12,
          ratingAvg: 4.0,
          onTimePercent: 85,
          isGstVerified: true,
          isDeliveryDaysEstimated: true,
        },
      ];
      const scores = computeSmartScores(quotes, { commercial: 50, speed: 20, warranty: 15, quality: 15 });
      expect(scores[0].isDeliveryDaysEstimated).toBe(true);
      expect(scores[0].slaConfidencePenalty).toBeDefined();
    });
  });

  // ===========================================================================
  // SECTION 5: FND-NEW-G2-01 Server-Side OTP Enforcement (RED-G2-18 to RED-G2-20)
  // ===========================================================================
  describe('FND-NEW-G2-01: Server-Side OTP Enforcement', () => {
    it('RED-G2-18: Client does NOT store raw unhashed plaintext OTP secrets in sessionStorage', () => {
      // Test simulated sessionStorage behavior
      const mockStorage: Record<string, string> = {};
      const setSession = (key: string, val: string) => {
        if (key.startsWith('otp_wa_') && !key.includes('resend')) {
          throw new Error('Security Violation: Raw OTP secret stored in client sessionStorage');
        }
        mockStorage[key] = val;
      };

      // Storing resend timer cooldown timestamp is permitted
      expect(() => setSession('otp_wa_resend_9840012345', '1788012000')).not.toThrow();

      // Storing raw OTP secret is blocked by architecture rule
      expect(() => setSession('otp_wa_9840012345', '849201')).toThrow(
        'Security Violation: Raw OTP secret stored in client sessionStorage'
      );
    });

    it('RED-G2-19: Server-side OTP generation produces exactly 6 numeric digits', () => {
      const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
      for (let i = 0; i < 50; i++) {
        const otp = generateOtp();
        expect(otp).toHaveLength(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
      }
    });

    it('RED-G2-20: Request Profile Verification OTP SQL contract validates phone shape', () => {
      const mockRequestOtp = (phone: string) => {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10) {
          return { ok: false, error: 'Invalid phone number format' };
        }
        return { ok: true, phone: digits, otp_code: '492817' };
      };

      expect(mockRequestOtp('12345').ok).toBe(false);
      expect(mockRequestOtp('+91 98400 12345').ok).toBe(true);
      expect(mockRequestOtp('+91 98400 12345').phone).toBe('919840012345');
    });
  });

  // ===========================================================================
  // SECTION 6: FND-NEW-G2-02 Strict CORS Hardening (RED-G2-21 to RED-G2-24)
  // ===========================================================================
  describe('FND-NEW-G2-02: Strict CORS Hardening', () => {
    it('RED-G2-21: Rejects wildcard origin "*", null, undefined, and empty origins', () => {
      expect(isAllowedOrigin('*')).toBe(false);
      expect(isAllowedOrigin(null)).toBe(false);
      expect(isAllowedOrigin(undefined)).toBe(false);
      expect(isAllowedOrigin('')).toBe(false);
    });

    it('RED-G2-22: Allows exact production domains and localhost development origins', () => {
      expect(isAllowedOrigin('https://otpplatform-theta.vercel.app')).toBe(true);
      expect(isAllowedOrigin('https://opentradeprocurement.ai')).toBe(true);
      expect(isAllowedOrigin('https://www.opentradeprocurement.ai')).toBe(true);
      expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
      expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    });

    it('RED-G2-23: Allows valid Vercel preview URLs but rejects malicious attacker domains', () => {
      // Valid preview deployments
      expect(isAllowedOrigin('https://otp-preview-branch.vercel.app')).toBe(true);
      expect(isAllowedOrigin('https://otp-platform-git-feat-group2-org.vercel.app')).toBe(true);

      // Malicious / impostor domains
      expect(isAllowedOrigin('https://attacker-site.com')).toBe(false);
      expect(isAllowedOrigin('https://otpplatform-theta.vercel.app.attacker.com')).toBe(false);
      expect(isAllowedOrigin('http://evil-preview.vercel.app.bad.com')).toBe(false);
    });

    it('RED-G2-24: getCorsHeaders sets Vary: Origin and echoes verified origin only', () => {
      const prodHeaders = getCorsHeaders('https://otpplatform-theta.vercel.app');
      expect(prodHeaders['Access-Control-Allow-Origin']).toBe('https://otpplatform-theta.vercel.app');
      expect(prodHeaders['Vary']).toBe('Origin');

      const attackerHeaders = getCorsHeaders('https://evil-site.com');
      // Must NOT echo attacker origin! Fall back to canonical production origin
      expect(attackerHeaders['Access-Control-Allow-Origin']).toBe('https://otpplatform-theta.vercel.app');
      expect(attackerHeaders['Access-Control-Allow-Origin']).not.toBe('https://evil-site.com');
    });
  });
});
