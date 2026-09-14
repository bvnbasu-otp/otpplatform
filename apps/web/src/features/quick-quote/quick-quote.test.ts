import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  describeQuickQuoteFailure,
  redeemQuickQuoteLink,
  submitQuickQuote,
  type QuickQuoteFailure,
} from './api/quick-quote';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  };
});

describe('Quick Quote Feature Module Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides helpful, human-friendly copy for all quick-quote failure states', () => {
    const failures: QuickQuoteFailure[] = [
      'INVALID',
      'INVALID_SESSION',
      'RFQ_CLOSED',
      'DEADLINE_PASSED',
      'NOT_INVITED',
      'INVALID_AMOUNT',
      'RATE_LIMITED',
      'UNAVAILABLE',
    ];

    for (const failure of failures) {
      const description = describeQuickQuoteFailure(failure);
      expect(description.title).toBeTruthy();
      expect(description.detail).toBeTruthy();
      // Ensure canonical vocabulary compliance
      expect(/\b(bid|bids|bidder|bidders|bidding|blind)\b/i.test(description.title)).toBe(false);
      expect(/\b(bid|bids|bidder|bidders|bidding|blind)\b/i.test(description.detail)).toBe(false);
    }
  });

  it('redeems quick quote link token successfully', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        outcome: 'OK',
        sessionToken: 'sess-token-123',
        publicRef: 'RFQ-2026-001',
        expiresAt: '2026-10-01T00:00:00Z',
      },
      error: null,
    } as any);

    const res = await redeemQuickQuoteLink('link-token-xyz');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.sessionToken).toBe('sess-token-123');
      expect(res.value.reference).toBe('RFQ-2026-001');
    }
  });

  it('handles invalid or expired link token redemption', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        outcome: 'INVALID',
      },
      error: null,
    } as any);

    const res = await redeemQuickQuoteLink('expired-token');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('INVALID');
    }
  });

  it('submits quick quote through authenticated session token', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        outcome: 'OK',
        reference: 'Q-2026-001',
        alias: 'Supplier A',
        version: 1,
        status: 'SUBMITTED',
      },
      error: null,
    } as any);

    const res = await submitQuickQuote('sess-token-123', {
      basePrice: 120000,
      gstAmount: 21600,
      transportCost: 8400,
      deliveryDays: 14,
      warrantyMonths: 12,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.reference).toBe('Q-2026-001');
      expect(res.value.status).toBe('SUBMITTED');
    }
  });
});
