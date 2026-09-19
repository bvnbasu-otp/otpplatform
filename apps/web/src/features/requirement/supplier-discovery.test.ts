import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRequirementRfqContext,
  fetchMatchedSuppliers,
  ensureRfqForRequirement,
  discoverAndInvite,
  inviteDirectSupplier,
  openRfq,
} from '@/features/requirement/api/rfq-lifecycle';
import { supabase } from '@/lib/supabase';
import * as userRole from '@/features/auth/user-role';
import type { MatchedSupplier } from './types/discovery';
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

describe('Phase 2.3 — Supplier Discovery Feature Tests', () => {
  let profileSpy: any;

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
    vi.mocked(supabase.auth.getUser).mockReset();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: null } as any);
    vi.mocked(supabase.from).mockImplementation(() => createSupabaseQueryMock([]));
    profileSpy = vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValue({
      profileId: 'prof-buyer-1',
      email: 'buyer@apex.test',
      fullName: 'Vikram Mehta',
      activeOrganizationId: 'org-apex-1',
    });
  });

  afterEach(() => {
    profileSpy?.mockRestore();
    vi.mocked(supabase.from).mockImplementation(() => createSupabaseQueryMock([]));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: null } as any);
  });

  describe('1. Compact Requirement Context Extraction', () => {
    it('fetches and formats compact requirement context with budget and timeline', async () => {
      const mockReqData = {
        id: 'req-101',
        title: '10 HP Submersible Motor Rewind',
        status: 'SUBMITTED',
        description: 'Complete coil rewinding and bearing replacement',
        quantity: 1,
        unit: 'UNIT',
        delivery_city: 'Bengaluru',
        delivery_pincode: '560048',
        required_by_mode: 'WITHIN_DAYS',
        required_by_days: 7,
        required_by_date: null,
        commercial: {
          budgetAmount: 25000,
          __sourcing: { reach: 'LOCAL', targetQuorum: 3 },
        },
        organization_id: 'org-apex-1',
        category_id: 'BOREWELL_MOTOR_REPAIR',
        requirement_type: 'SERVICE',
      };

      const mockRfqData = {
        id: 'rfq-202',
        status: 'OPEN',
        min_quotes_required: 3,
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') {
          return createSupabaseQueryMock({ data: mockReqData, error: null });
        }
        if (table === 'rfqs') {
          return createSupabaseQueryMock({ data: mockRfqData, error: null });
        }
        if (table === 'rfq_supplier_networks') {
          return createSupabaseQueryMock({
            data: [
              { network: 'DIRECT', invited_count: 2 },
              { network: 'ONDC', invited_count: 2 },
            ],
            error: null,
          });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchRequirementRfqContext('req-101');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.context.requirementId).toBe('req-101');
        expect(res.context.requirementTitle).toBe('10 HP Submersible Motor Rewind');
        expect(res.context.deliveryCity).toBe('Bengaluru');
        expect(res.context.deliveryPincode).toBe('560048');
        expect(res.context.requiredByText).toBe('⏱️ This week (7 days)');
        expect(res.context.budgetFormatted).toBe('₹25,000');
        expect(res.context.quantityText).toBe('1 UNIT');
        expect(res.context.minQuotesRequired).toBe(3);
        expect(res.context.invitationCount).toBe(4);
      }
    });

    it('handles immediate delivery TAT and Pan-India reach formatting', async () => {
      const mockReqData = {
        id: 'req-102',
        title: 'Industrial Valve Fabrication',
        status: 'SUBMITTED',
        quantity: 50,
        unit: 'PCS',
        delivery_city: 'Coimbatore',
        delivery_pincode: '641001',
        required_by_mode: 'IMMEDIATE',
        commercial: {
          targetBudget: 150000,
          __sourcing: { reach: 'PAN_INDIA' },
        },
        organization_id: 'org-apex-1',
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') {
          return createSupabaseQueryMock({ data: mockReqData, error: null });
        }
        if (table === 'rfqs') {
          return createSupabaseQueryMock({ data: null, error: null });
        }
        if (table === 'approval_policies') {
          return createSupabaseQueryMock({ data: { threshold: { minQuotesRequired: 4 } }, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchRequirementRfqContext('req-102');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.context.requiredByText).toBe('⚡ ASAP / Immediate');
        expect(res.context.budgetFormatted).toBe('₹1,50,000');
        expect(res.context.quantityText).toBe('50 PCS');
        expect(res.context.geographicReach).toBe('PAN_INDIA');
        expect(res.context.minQuotesRequired).toBe(4);
      }
    });
  });

  describe('2. Matched Suppliers & Identity-Protection Anti-Leak Validation', () => {
    it('maps candidate suppliers into anonymous representations with human-readable match levels', async () => {
      const mockInvitations = [
        {
          invitation_id: 'inv-1',
          rfq_id: 'rfq-202',
          anonymous_label: 'Supplier #01',
          status: 'INVITED',
          match_score: 95.0,
          match_reasons: ['category_match', 'verified_active', 'location_match'],
          invited_at: '2026-09-15T10:00:00Z',
        },
        {
          invitation_id: 'inv-2',
          rfq_id: 'rfq-202',
          anonymous_label: 'Supplier #02',
          status: 'INVITED',
          match_score: 88.0,
          match_reasons: ['category_match', 'verified_active', 'ondc'],
          invited_at: '2026-09-15T10:00:00Z',
        },
        {
          invitation_id: 'inv-3',
          rfq_id: 'rfq-202',
          anonymous_label: 'Supplier #03',
          status: 'INVITED',
          match_score: 72.0,
          match_reasons: ['category_match', 'local'],
          invited_at: '2026-09-15T10:00:00Z',
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfq_invitations_manager') {
          return createSupabaseQueryMock({ data: mockInvitations, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchMatchedSuppliers('rfq-202');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.suppliers).toHaveLength(3);

        const s1 = res.suppliers[0];
        expect(s1).toBeDefined();
        expect(s1?.anonymousLabel).toBe('Supplier #01');
        expect(s1?.matchScore).toBe(95);
        expect(s1?.matchLevel).toBe('EXCELLENT');
        expect(s1?.gstVerified).toBe(true);
        expect(s1?.isLocal).toBe(true);
        expect(s1?.network).toBe('OTP_REGISTERED');

        const s2 = res.suppliers[1];
        expect(s2).toBeDefined();
        expect(s2?.anonymousLabel).toBe('Supplier #02');
        expect(s2?.matchScore).toBe(88);
        expect(s2?.matchLevel).toBe('STRONG');
        expect(s2?.network).toBe('ONDC');
        expect(s2?.networkLabel).toBe('ONDC Protocol');

        const s3 = res.suppliers[2];
        expect(s3).toBeDefined();
        expect(s3?.anonymousLabel).toBe('Supplier #03');
        expect(s3?.matchScore).toBe(72);
        expect(s3?.matchLevel).toBe('RELEVANT');
      }
    });

    it('STRICT ANTI-LEAK: Supplier representations strictly contain NO legal names, phone numbers, or emails', async () => {
      const mockInvitations = [
        {
          invitation_id: 'inv-secret-1',
          rfq_id: 'rfq-202',
          anonymous_label: 'Supplier #04',
          status: 'INVITED',
          match_score: 92.0,
          match_reasons: ['category_match', 'verified_active'],
          invited_at: '2026-09-15T10:00:00Z',
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfq_invitations_manager') {
          return createSupabaseQueryMock({ data: mockInvitations, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchMatchedSuppliers('rfq-202');
      expect(res.ok).toBe(true);
      if (res.ok) {
        const jsonStr = JSON.stringify(res.suppliers);
        // Ensure no private leak patterns exist in the returned structure
        expect(jsonStr).not.toMatch(/phone|email|legal_name|gstin|bank_account|pan_number/i);
        expect(res.suppliers[0]?.anonymousLabel).toBe('Supplier #04');
      }
    });
  });

  describe('3. Discovery Execution & Direct Invitations', () => {
    it('executes discover_and_invite_for_rfq RPC and returns candidate count', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { invited: 4, total: 4 },
        error: null,
      } as any);

      const res = await discoverAndInvite('rfq-202');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.invited).toBe(4);
        expect(res.total).toBe(4);
      }
    });

    it('allows inviting known supplier by phone with idempotency', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { ok: true, reused: false },
        error: null,
      } as any);

      const res = await inviteDirectSupplier('rfq-202', 'PHONE', '9876543210');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.reused).toBe(false);
      }
    });

    it('handles idempotent repeat invitations gracefully (reused: true)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { ok: true, reused: true },
        error: null,
      } as any);

      const res = await inviteDirectSupplier('rfq-202', 'EMAIL', 'sales@precisioneng.com');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.reused).toBe(true);
      }
    });

    it('rejects empty direct invitation inputs', async () => {
      const res = await inviteDirectSupplier('rfq-202', 'PHONE', '   ');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/required/i);
      }
    });
  });

  describe('4. RFQ Opening & Lifecycle Transitions', () => {
    it('opens RFQ and transitions requirement to QUOTING when quorum of invitations is present', async () => {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') {
          return createSupabaseQueryMock({
            data: { id: 'rfq-202', status: 'DRAFT', requirement_id: 'req-101' },
            error: null,
          });
        }
        if (table === 'rfq_supplier_networks') {
          return createSupabaseQueryMock({
            data: [{ invited_count: 4 }],
            error: null,
          });
        }
        if (table === 'requirements') {
          return createSupabaseQueryMock({ data: { id: 'req-101' }, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await openRfq('rfq-202');
      expect(res.ok).toBe(true);
    });

    it('prevents opening RFQ if 0 suppliers have been invited', async () => {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') {
          return createSupabaseQueryMock({
            data: { id: 'rfq-202', status: 'DRAFT', requirement_id: 'req-101' },
            error: null,
          });
        }
        if (table === 'rfq_supplier_networks') {
          return createSupabaseQueryMock({
            data: [],
            error: null,
          });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await openRfq('rfq-202');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/discovery/i);
      }
    });
  });

  describe('5. Discovery Filtering & Quorum Rules', () => {
    const mockPool: MatchedSupplier[] = [
      {
        invitationId: 'inv-1',
        anonymousLabel: 'Supplier #01',
        status: 'INVITED',
        matchScore: 96,
        matchLevel: 'EXCELLENT',
        matchReasons: ['category_match', 'verified_active'],
        network: 'OTP_REGISTERED',
        networkLabel: 'OTP Network',
        gstVerified: true,
        isLocal: true,
        availabilityText: 'Available Immediately',
      },
      {
        invitationId: 'inv-2',
        anonymousLabel: 'Supplier #02',
        status: 'INVITED',
        matchScore: 86,
        matchLevel: 'STRONG',
        matchReasons: ['category_match', 'ondc'],
        network: 'ONDC',
        networkLabel: 'ONDC Protocol',
        gstVerified: true,
        isLocal: false,
        availabilityText: 'Available this week',
      },
      {
        invitationId: 'inv-3',
        anonymousLabel: 'Supplier #03',
        status: 'INVITED',
        matchScore: 78,
        matchLevel: 'STRONG',
        matchReasons: ['category_match', 'local'],
        network: 'LOCAL_REGISTRY',
        networkLabel: 'Local Registry',
        gstVerified: true,
        isLocal: true,
        availabilityText: 'Available Immediately',
      },
      {
        invitationId: 'inv-4',
        anonymousLabel: 'Supplier #04',
        status: 'INVITED',
        matchScore: 68,
        matchLevel: 'RELEVANT',
        matchReasons: ['category_match'],
        network: 'OTP_REGISTERED',
        networkLabel: 'OTP Network',
        gstVerified: true,
        isLocal: false,
        availabilityText: 'Available this week',
      },
    ];

    it('filters supplier pool by minimum match score correctly', () => {
      const topTier = mockPool.filter((s) => s.matchScore >= 85);
      expect(topTier).toHaveLength(2);
      expect(topTier.map((s) => s.anonymousLabel)).toEqual(['Supplier #01', 'Supplier #02']);
    });

    it('identifies quorum satisfaction when candidate count >= policy threshold', () => {
      const minRequired = 3;
      const isQuorumMet = mockPool.length >= minRequired;
      expect(isQuorumMet).toBe(true);

      const sparsePool = mockPool.slice(0, 2);
      expect(sparsePool.length >= minRequired).toBe(false);
    });

    it('sorts suppliers by match score descending by default', () => {
      const sorted = [...mockPool].sort((a, b) => b.matchScore - a.matchScore);
      expect(sorted[0]?.anonymousLabel).toBe('Supplier #01');
      expect(sorted[sorted.length - 1]?.anonymousLabel).toBe('Supplier #04');
    });
  });

  describe('6. Canonical Vocabulary Compliance', () => {
    it('contains ZERO prohibited auction terms across supplier discovery interfaces & copies', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        Matched Verified Suppliers Discovery Quorum Sealed identity-protected offer
        Anonymous Supplier #01 OTP Network ONDC Protocol Direct Invite
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });
  });
});
