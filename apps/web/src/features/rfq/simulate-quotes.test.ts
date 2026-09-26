import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { simulateQuotesForRfq, ensureSimulatedQuotesForRfq } from '@/features/rfq/api/simulate-quotes';
import {
  isSyntheticQuoteGenerationAllowed,
  SYNTHETIC_QUOTES_DISABLED_MESSAGE,
} from '@/features/rfq/api/synthetic-quote-guard';
import { supabase } from '@/lib/supabase';
import * as evaluationApi from '@/features/evaluation/api/fetch-quote-evaluations';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const SYNTHETIC_RPCS = [
  'seed_simulated_quotes_for_rfq',
  'auto_submit_pilot_quotes',
  'demo_simulate_quotes',
  'demo_generate_quotes',
];
const QUOTE_TABLES = ['quotes', 'quote_versions', 'rfq_invitations'];

function recordCalls(rfqRow: Record<string, unknown> | null) {
  const rpcCalls: string[] = [];
  const tableCalls: string[] = [];
  vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
    rpcCalls.push(fn);
    return Promise.resolve({ data: { ok: true, quotes_submitted: 4, total_quotes: 4 }, error: null });
  }) as any);
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    tableCalls.push(table);
    if (table === 'rfqs') return createSupabaseQueryMock({ data: rfqRow, error: null });
    return createSupabaseQueryMock({ data: [], error: null });
  }) as any);
  return { rpcCalls, tableCalls };
}

describe('Simulated quotes are demo-only and fail closed', () => {
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
    vi.unstubAllEnvs();
  });

  describe('REAL PILOT RFQ = ZERO SYNTHETIC QUOTES', () => {
    it('makes zero synthetic RPC calls and zero quote-table access when the demo flag is absent', async () => {
      vi.stubEnv('VITE_DEMO_MODE', '');
      const { rpcCalls, tableCalls } = recordCalls({ id: 'rfq-real-1', is_demo: false });

      const a = await simulateQuotesForRfq('rfq-real-1', { force: true });
      const b = await ensureSimulatedQuotesForRfq('rfq-real-1');
      const c = await ensureSimulatedQuotesForRfq('rfq-real-1', { isDemo: true });

      expect(a.ok).toBe(false);
      expect(a.error).toBe(SYNTHETIC_QUOTES_DISABLED_MESSAGE);
      expect(b.quotesSubmitted).toBe(0);
      expect(c.quotesSubmitted).toBe(0);
      expect(rpcCalls.filter((f) => SYNTHETIC_RPCS.includes(f))).toEqual([]);
      expect(tableCalls.filter((t) => QUOTE_TABLES.includes(t))).toEqual([]);
      expect(recomputeSpy).not.toHaveBeenCalled();
    });

    it('refuses a real (non-demo) RFQ even on a demo build', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');
      for (const row of [{ id: 'r', is_demo: false }, { id: 'r', is_demo: null }, { id: 'r' }, null]) {
        const { rpcCalls, tableCalls } = recordCalls(row);
        const res = await simulateQuotesForRfq('r', { force: true });
        expect(res.ok).toBe(false);
        expect(rpcCalls).toEqual([]);
        expect(tableCalls.filter((t) => QUOTE_TABLES.includes(t))).toEqual([]);
      }
    });

    it('treats ambiguous flag values as off', async () => {
      for (const flag of ['1', 'TRUE', 'yes', 'false']) {
        vi.stubEnv('VITE_DEMO_MODE', flag);
        const { rpcCalls } = recordCalls({ id: 'r', is_demo: true });
        const res = await simulateQuotesForRfq('r');
        expect(res.ok).toBe(false);
        expect(rpcCalls).toEqual([]);
      }
    });

    it('client module has no direct quote insert fallback and never calls auto_submit_pilot_quotes', () => {
      const src = readFileSync(resolve(__dirname, 'api/simulate-quotes.ts'), 'utf8');
      expect(src).not.toMatch(/\.from\(\s*'quotes'\s*\)/);
      expect(src).not.toMatch(/\.from\(\s*'quote_versions'\s*\)/);
      expect(src).not.toMatch(/rpc\(\s*'auto_submit_pilot_quotes'/);
    });

    it('buyer screens no longer auto top-up empty RFQs with simulated quotes', () => {
      for (const file of ['hooks/use-identity-protected-quotes.ts', 'api/fetch-active-rfq-monitoring.ts']) {
        const src = readFileSync(resolve(__dirname, file), 'utf8');
        expect(src).not.toMatch(/ensureSimulatedQuotesForRfq|simulateQuotesForRfq/);
      }
    });
  });

  describe('guard truth table', () => {
    it('allows only demo build AND demo RFQ', () => {
      expect(isSyntheticQuoteGenerationAllowed({ demoBuildFlag: true, rfqIsDemo: true })).toBe(true);
      expect(isSyntheticQuoteGenerationAllowed({ demoBuildFlag: true, rfqIsDemo: false })).toBe(false);
      expect(isSyntheticQuoteGenerationAllowed({ demoBuildFlag: false, rfqIsDemo: true })).toBe(false);
      expect(isSyntheticQuoteGenerationAllowed({ demoBuildFlag: true, rfqIsDemo: null })).toBe(false);
      expect(isSyntheticQuoteGenerationAllowed({ demoBuildFlag: true, rfqIsDemo: 'true' })).toBe(false);
      expect(isSyntheticQuoteGenerationAllowed({ demoBuildFlag: undefined, rfqIsDemo: undefined })).toBe(false);
    });
  });

  describe('demo RFQ on a demo build', () => {
    it('seeds via seed_simulated_quotes_for_rfq exactly once and recomputes evaluations', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');
      const { rpcCalls } = recordCalls({ id: 'rfq-demo-123', is_demo: true });
      const res = await simulateQuotesForRfq('rfq-demo-123');
      expect(res.ok).toBe(true);
      expect(res.quotesSubmitted).toBe(4);
      expect(rpcCalls).toEqual(['seed_simulated_quotes_for_rfq']);
      expect(recomputeSpy).toHaveBeenCalledWith('rfq-demo-123');
    });

    it('reports failure instead of false success when the server refuses', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');
      recordCalls({ id: 'rfq-demo-9', is_demo: true });
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Access denied' } } as any);
      const res = await simulateQuotesForRfq('rfq-demo-9');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Access denied');
      expect(recomputeSpy).not.toHaveBeenCalled();
    });

    it('ensureSimulatedQuotesForRfq skips seeding when a demo RFQ already has 3 quotes', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');
      const rpcCalls: string[] = [];
      vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
        rpcCalls.push(fn);
        return Promise.resolve({ data: null, error: null });
      }) as any);
      vi.mocked(supabase.from).mockImplementation(((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: { id: 'd', is_demo: true }, error: null });
        return createSupabaseQueryMock({ data: [{ quote_id: '1' }, { quote_id: '2' }, { quote_id: '3' }], error: null });
      }) as any);
      const res = await ensureSimulatedQuotesForRfq('d', { isDemo: true });
      expect(res.totalQuotes).toBe(3);
      expect(rpcCalls).toEqual([]);
    });
  });

  describe('Canonical Vocabulary Compliance', () => {
    it('contains ZERO prohibited auction terms in simulator messages', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      for (const term of prohibitedTerms) {
        expect(new RegExp(`\\b${term}\\b`, 'i').test(SYNTHETIC_QUOTES_DISABLED_MESSAGE)).toBe(false);
      }
    });
  });
});
