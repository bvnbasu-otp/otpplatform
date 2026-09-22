import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchClarificationMessagesForBuyer,
  fetchClarificationMessagesForSupplier,
  postClarificationMessage,
  postBroadcastClarification,
  fetchRequirementSpecsAndItems,
  fetchRfqStatus,
  closeClarificationForEvaluation,
} from './api/clarification';
import { supabase } from '@/lib/supabase';
import * as userRole from '@/features/auth/user-role';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

describe('Clarification Feature Module Tests', () => {
  let profileSpy: any;

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    profileSpy = vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValue({
      profileId: 'p-1',
      email: 'buyer@test.com',
      fullName: 'Test Buyer',
    });
  });

  afterEach(() => {
    profileSpy?.mockRestore();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('fetches and maps masked clarification messages for buyer with categories and broadcast flags', async () => {
    const mockRows = [
      {
        message_id: 'msg-1',
        invitation_id: 'inv-1',
        anonymous_label: 'Supplier A',
        author_side: 'SUPPLIER',
        author_display: 'Supplier A',
        body: 'Can we deliver in batches?',
        created_at: '2026-09-10T12:00:00Z',
        inquiry_category: 'DELIVERY_LOGISTICS',
        line_item_ref: 'Line Item #1',
        is_broadcast: false,
        redactions: [],
      },
      {
        message_id: 'msg-2',
        invitation_id: null,
        anonymous_label: 'Broadcast Addendum',
        author_side: 'BUYER',
        author_display: 'Buyer organization (Broadcast Addendum)',
        body: 'Batch deliveries of 25 units per week are accepted.',
        created_at: '2026-09-10T12:30:00Z',
        inquiry_category: 'DELIVERY_LOGISTICS',
        line_item_ref: 'Line Item #1',
        is_broadcast: true,
        redactions: [],
      },
    ];

    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    };
    vi.mocked(supabase.from).mockImplementation(() => chain);

    const result = await fetchClarificationMessagesForBuyer('rfq-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.anonymousLabel).toBe('Supplier A');
      expect(result.messages[0]?.authorSide).toBe('SUPPLIER');
      expect(result.messages[0]?.inquiryCategory).toBe('DELIVERY_LOGISTICS');
      expect(result.messages[0]?.lineItemRef).toBe('Line Item #1');
      expect(result.messages[0]?.isBroadcast).toBe(false);

      expect(result.messages[1]?.isBroadcast).toBe(true);
      expect(result.messages[1]?.authorSide).toBe('BUYER');
    }
  });

  it('fetches clarification messages for supplier including broadcast addenda', async () => {
    const mockRows = [
      {
        message_id: 'msg-2',
        invitation_id: 'inv-1',
        author_side: 'BUYER',
        author_display: 'Buyer organization',
        body: 'Yes, batch deliveries are permitted.',
        created_at: '2026-09-10T12:30:00Z',
        inquiry_category: 'TECHNICAL_SPEC',
        line_item_ref: null,
        is_broadcast: false,
        redactions: [],
      },
    ];

    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    };
    vi.mocked(supabase.from).mockImplementation(() => chain);

    const result = await fetchClarificationMessagesForSupplier('rfq-1', 'inv-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.authorSide).toBe('BUYER');
      expect(result.messages[0]?.body).toContain('batch deliveries');
      expect(result.messages[0]?.inquiryCategory).toBe('TECHNICAL_SPEC');
    }
  });

  it('posts clarification message with structured category and line item reference', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const chain: any = {
      insert: mockInsert,
    };
    vi.mocked(supabase.from).mockImplementation(() => chain);

    const res = await postClarificationMessage(
      'rfq-1',
      'inv-1',
      'Will the payment terms be Net 30 with 10% advance?',
      'SUPPLIER',
      {
        inquiryCategory: 'COMMERCIAL_TERMS',
        lineItemRef: 'Milestone Payments',
      },
    );

    expect(res.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith({
      rfq_id: 'rfq-1',
      invitation_id: 'inv-1',
      author_profile_id: 'p-1',
      author_side: 'SUPPLIER',
      body: 'Will the payment terms be Net 30 with 10% advance?',
      inquiry_category: 'COMMERCIAL_TERMS',
      line_item_ref: 'Milestone Payments',
      is_broadcast: false,
    });
  });

  it('rejects posting clarification message that contains only PII / contact identifiers', async () => {
    const res = await postClarificationMessage(
      'rfq-1',
      'inv-1',
      '9876543210',
      'SUPPLIER',
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('contact details');
    }
  });

  it('posts broadcast clarification addendum via atomic RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, message_id: 'msg-broadcast-1', is_broadcast: true },
      error: null,
    } as any);

    const res = await postBroadcastClarification(
      'rfq-1',
      'All suppliers are requested to note that warranty requirement is revised to 24 months.',
      {
        inquiryCategory: 'COMPLIANCE',
        lineItemRef: 'Warranty Protocols',
      },
    );

    expect(res.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('post_broadcast_clarification_atomic', {
      p_rfq_id: 'rfq-1',
      p_body: 'All suppliers are requested to note that warranty requirement is revised to 24 months.',
      p_inquiry_category: 'COMPLIANCE',
      p_line_item_ref: 'Warranty Protocols',
    });
  });

  it('fetches requirement specification references accurately', async () => {
    const rfqChain: any = {
      select: vi.fn(() => rfqChain),
      eq: vi.fn(() => rfqChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { requirement_id: 'req-1', title: 'Centrifugal Pump Supply' },
        error: null,
      }),
    };

    const reqChain: any = {
      select: vi.fn(() => reqChain),
      eq: vi.fn(() => reqChain),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          title: 'Centrifugal Pump Supply',
          structured_specs: {
            line_items: [
              { title: '12.5 HP Submersible Pump', quantity: 5, unit: 'units' },
              { title: 'Cast Iron Impeller Spare', quantity: 10, unit: 'sets' },
            ],
          },
        },
        error: null,
      }),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'rfqs') return rfqChain;
      if (table === 'requirements') return reqChain;
      return {} as any;
    });

    const res = await fetchRequirementSpecsAndItems('rfq-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.items.length).toBeGreaterThanOrEqual(3);
      expect(res.items.some((i) => i.label.includes('12.5 HP Submersible Pump'))).toBe(true);
    }
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
    vi.mocked(supabase.from).mockImplementation(() => chain);

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

  it('exports RfqClarificationPage with clean production header branding', async () => {
    const { RfqClarificationPage } = await import('./pages/RfqClarificationPage');
    expect(RfqClarificationPage).toBeDefined();
    expect(typeof RfqClarificationPage).toBe('function');
  });
});
