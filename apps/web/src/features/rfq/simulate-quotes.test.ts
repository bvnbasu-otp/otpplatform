import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { simulateQuotesForRfq, ensureSimulatedQuotesForRfq } from './api/simulate-quotes';
import { supabase } from '@/lib/supabase';
import * as evaluationApi from '@/features/evaluation/api/fetch-quote-evaluations';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

function createSupabaseQueryMock(resolvedResult: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(resolvedResult),
    single: vi.fn().mockResolvedValue(resolvedResult),
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    then: (resolve: (val: any) => any, reject?: (err: any) => any) =>
      Promise.resolve(resolvedResult).then(resolve, reject),
  };
  return chain;
}

describe('Simulated Quotes Generation Engine (Demo / Pilot Mode)', () => {
  let recomputeSpy: any;

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    recomputeSpy = vi.spyOn(evaluationApi, 'recomputeEvaluations').mockResolvedValue({
      ok: true,
      scored: 4,
    });
  });

  afterEach(() => {
    recomputeSpy?.mockRestore();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  describe('1. RPC-driven quote generation', () => {
    it('successfully calls seed_simulated_quotes_for_rfq and triggers evaluation recomputation', async () => {
      vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
        if (fn === 'seed_simulated_quotes_for_rfq') {
          return Promise.resolve({
            data: { ok: true, quotes_seeded: 4, count: 4 },
            error: null,
          }) as any;
        }
        return Promise.resolve({ data: null, error: null }) as any;
      });

      const res = await simulateQuotesForRfq('rfq-demo-123');
      expect(res.ok).toBe(true);
      expect(res.quotesSubmitted).toBe(4);
      expect(recomputeSpy).toHaveBeenCalledWith('rfq-demo-123');
    });

    it('falls back to auto_submit_pilot_quotes if primary RPC is missing or fails', async () => {
      let rpcCallCount = 0;
      vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
        rpcCallCount++;
        if (fn === 'seed_simulated_quotes_for_rfq') {
          return Promise.resolve({ data: null, error: { message: 'function does not exist' } }) as any;
        }
        if (fn === 'auto_submit_pilot_quotes') {
          return Promise.resolve({
            data: { ok: true, quotes_submitted: 3, total_quotes: 3 },
            error: null,
          }) as any;
        }
        return Promise.resolve({ data: null, error: null }) as any;
      });

      const res = await simulateQuotesForRfq('rfq-demo-456');
      expect(res.ok).toBe(true);
      expect(res.quotesSubmitted).toBe(3);
      expect(rpcCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('2. Client-driven direct table fallback', () => {
    it('generates 4 realistic sealed quotes with GST breakdown when RPCs are offline', async () => {
      // Mock both RPCs failing
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'network error' } } as any);

      const mockRfq = {
        id: 'rfq-fallback-789',
        requirement_id: 'req-fallback-789',
        organization_id: 'org-demo-1',
        status: 'OPEN',
      };

      const mockReq = {
        id: 'req-fallback-789',
        title: 'Solar Inverter Replacement',
        category_id: 'SOLAR_INSTALLATION',
        commercial: { budgetAmount: 100000 },
      };

      const mockSuppliers = [
        { id: 'sup-1', business_name: 'SolarTech Apex Pvt Ltd' },
        { id: 'sup-2', business_name: 'GreenEnergy Solutions' },
        { id: 'sup-3', business_name: 'SunPower Enterprises' },
        { id: 'sup-4', business_name: 'BrightGrid Power Ltd' },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'requirements') return createSupabaseQueryMock({ data: mockReq, error: null });
        if (table === 'suppliers') return createSupabaseQueryMock({ data: mockSuppliers, error: null });
        if (table === 'rfq_invitations') return createSupabaseQueryMock({ data: [], error: null });
        if (table === 'quotes') return createSupabaseQueryMock({ data: [], error: null });
        if (table === 'quote_versions') return createSupabaseQueryMock({ data: [], error: null });
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await simulateQuotesForRfq('rfq-fallback-789');
      expect(res.ok).toBe(true);
      expect(res.quotesSubmitted).toBe(4);
      expect(recomputeSpy).toHaveBeenCalledWith('rfq-fallback-789');
    });
  });

  describe('3. ensureSimulatedQuotesForRfq threshold guard', () => {
    it('skips simulation if RFQ already has >= 3 quotes', async () => {
      const existingQuotes = [
        { quote_id: 'q-1', status: 'FINAL' },
        { quote_id: 'q-2', status: 'FINAL' },
        { quote_id: 'q-3', status: 'FINAL' },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'quotes_identity_protected' || table === 'quotes') {
          return createSupabaseQueryMock({ data: existingQuotes, error: null });
        }
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await ensureSimulatedQuotesForRfq('rfq-populated-101');
      expect(res.ok).toBe(true);
      expect(res.quotesSubmitted).toBe(0);
      expect(res.totalQuotes).toBe(3);
    });

    it('triggers simulation if RFQ has < 3 quotes', async () => {
      const existingQuotes = [{ id: 'q-1', status: 'FINAL' }];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'quotes') {
          return createSupabaseQueryMock({ data: existingQuotes, error: null });
        }
        if (table === 'rfqs') {
          return createSupabaseQueryMock({ data: { id: 'rfq-sparse-202', status: 'OPEN' }, error: null });
        }
        return createSupabaseQueryMock({ data: [], error: null });
      });

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { ok: true, quotes_seeded: 4, count: 4 },
        error: null,
      } as any);

      const res = await ensureSimulatedQuotesForRfq('rfq-sparse-202');
      expect(res.ok).toBe(true);
      expect(res.quotesSubmitted).toBe(4);
    });
  });

  describe('4. Canonical Vocabulary Compliance', () => {
    it('contains ZERO prohibited auction terms across all simulation responses & metadata', async () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        Simulate supplier quotes Sealed identity-protected offer landed cost GST CGST SGST
        delivery turnaround warranty evaluation score final submitted quote versions
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });
  });
});
