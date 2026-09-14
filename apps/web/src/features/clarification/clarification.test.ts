import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchClarificationMessagesForBuyer,
  fetchClarificationMessagesForSupplier,
  postClarificationMessage,
  fetchRfqStatus,
  closeClarificationForEvaluation,
} from './api/clarification';
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

vi.mock('@/features/auth/user-role', () => ({
  fetchCurrentProfile: vi.fn().mockResolvedValue({
    profileId: 'p-1',
    email: 'buyer@test.com',
    fullName: 'Test Buyer',
  }),
}));

describe('Clarification Feature Module Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and maps masked clarification messages for buyer correctly', async () => {
    const mockRows = [
      {
        message_id: 'msg-1',
        invitation_id: 'inv-1',
        anonymous_label: 'Supplier A',
        author_side: 'SUPPLIER',
        author_display: 'Supplier A',
        body: 'Can we deliver in batches?',
        created_at: '2026-09-10T12:00:00Z',
      },
    ];

    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain);

    const result = await fetchClarificationMessagesForBuyer('rfq-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.anonymousLabel).toBe('Supplier A');
      expect(result.messages[0]?.authorSide).toBe('SUPPLIER');
      expect(result.messages[0]?.body).toBe('Can we deliver in batches?');
    }
  });

  it('fetches clarification messages for supplier with direct unmasked thread', async () => {
    const mockRows = [
      {
        message_id: 'msg-2',
        invitation_id: 'inv-1',
        author_side: 'BUYER',
        author_display: 'Procurement Officer',
        body: 'Yes, batch deliveries are permitted.',
        created_at: '2026-09-10T12:30:00Z',
      },
    ];

    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain);

    const result = await fetchClarificationMessagesForSupplier('rfq-1', 'inv-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.authorSide).toBe('BUYER');
      expect(result.messages[0]?.body).toContain('batch deliveries');
    }
  });

  it('posts clarification message via supabase insert', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const chain: any = {
      insert: mockInsert,
    };
    vi.mocked(supabase.from).mockReturnValue(chain);

    const res = await postClarificationMessage(
      'rfq-1',
      'inv-1',
      'Will the payment terms be Net 30?',
      'SUPPLIER',
    );

    expect(res.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith({
      rfq_id: 'rfq-1',
      invitation_id: 'inv-1',
      author_profile_id: 'p-1',
      author_side: 'SUPPLIER',
      body: 'Will the payment terms be Net 30?',
    });
  });

  it('fetches RFQ status accurately', async () => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { status: 'CLARIFICATION', min_quotes_required: 3 },
        error: null,
      }),
    };
    vi.mocked(supabase.from).mockReturnValue(chain);

    const res = await fetchRfqStatus('rfq-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe('CLARIFICATION');
      expect(res.minQuotesRequired).toBe(3);
    }
  });

  it('transitions RFQ from clarification to evaluation via rpc', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any);

    const res = await closeClarificationForEvaluation('rfq-1');
    expect(res.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('close_clarification_for_evaluation', {
      p_rfq_id: 'rfq-1',
    });
  });
});
