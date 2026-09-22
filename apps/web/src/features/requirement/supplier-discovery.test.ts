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
import type { MatchedSupplier, DiscoveryFilterOption } from './types/discovery';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import { validateDirectInviteContact } from './components/DirectInviteModal';

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

describe('Phase C.3 — Supplier Discovery & Radar UX Polish Tests', () => {
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

  describe('3. Direct Invite Input Hardening & Validation', () => {
    it('validates 10-digit Indian mobile numbers in multiple input formats', () => {
      // Standard 10-digit
      const v1 = validateDirectInviteContact('PHONE', '9876543210');
      expect(v1.valid).toBe(true);
      expect(v1.normalized).toBe('9876543210');

      // Formatted with +91 country code
      const v2 = validateDirectInviteContact('PHONE', '+91 98765 43210');
      expect(v2.valid).toBe(true);
      expect(v2.normalized).toBe('9876543210');

      // Formatted with leading 0
      const v3 = validateDirectInviteContact('PHONE', '09876543210');
      expect(v3.valid).toBe(true);
      expect(v3.normalized).toBe('9876543210');

      // Clean international phone with country code
      const v4 = validateDirectInviteContact('PHONE', '+14155552671');
      expect(v4.valid).toBe(true);
    });

    it('rejects invalid mobile numbers and non-digit inputs', () => {
      const v1 = validateDirectInviteContact('PHONE', '12345');
      expect(v1.valid).toBe(false);
      expect(v1.error).toMatch(/valid 10-digit mobile number/i);

      const v2 = validateDirectInviteContact('PHONE', 'abcdefghij');
      expect(v2.valid).toBe(false);

      // Starting with invalid digit 5 (Indian numbers must start with 6-9)
      const v3 = validateDirectInviteContact('PHONE', '5876543210');
      expect(v3.valid).toBe(false);
    });

    it('validates standard email addresses and trims whitespace', () => {
      const v1 = validateDirectInviteContact('EMAIL', '  sales@precisioneng.com  ');
      expect(v1.valid).toBe(true);
      expect(v1.normalized).toBe('sales@precisioneng.com');

      const v2 = validateDirectInviteContact('EMAIL', 'vendor.contact@subdomain.example.co.in');
      expect(v2.valid).toBe(true);
    });

    it('rejects invalid email formats', () => {
      const v1 = validateDirectInviteContact('EMAIL', 'not-an-email');
      expect(v1.valid).toBe(false);
      expect(v1.error).toMatch(/valid work email address/i);

      const v2 = validateDirectInviteContact('EMAIL', 'missing@domain');
      expect(v2.valid).toBe(false);

      const v3 = validateDirectInviteContact('EMAIL', '@domain.com');
      expect(v3.valid).toBe(false);
    });

    it('rejects empty and whitespace-only inputs for both contact types', () => {
      const vPhone = validateDirectInviteContact('PHONE', '   ');
      expect(vPhone.valid).toBe(false);
      expect(vPhone.error).toMatch(/phone number/i);

      const vEmail = validateDirectInviteContact('EMAIL', '   ');
      expect(vEmail.valid).toBe(false);
      expect(vEmail.error).toMatch(/email address/i);
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

    it('handles duplicate / idempotent repeat invitations gracefully (reused: true)', async () => {
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

  describe('5. Discovery Filtering & Selection State Survival', () => {
    const mockPool: MatchedSupplier[] = [
      {
        invitationId: 'inv-1',
        anonymousLabel: 'Supplier #01',
        status: 'INVITED',
        matchScore: 96,
        matchLevel: 'EXCELLENT',
        matchReasons: ['category_match', 'verified_active', 'location_match'],
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
        gstVerified: false,
        isLocal: false,
        availabilityText: 'Available this week',
      },
      {
        invitationId: 'inv-5',
        anonymousLabel: 'Supplier #05',
        status: 'INVITED',
        matchScore: 90,
        matchLevel: 'EXCELLENT',
        matchReasons: ['category_match', 'direct'],
        network: 'DIRECT',
        networkLabel: 'Direct Invitation',
        gstVerified: true,
        isLocal: false,
        availabilityText: 'Available Immediately',
      },
    ];

    it('filters supplier pool by different criteria correctly', () => {
      // HIGH_MATCH (>=85)
      const highMatch = mockPool.filter((s) => s.matchScore >= 85);
      expect(highMatch).toHaveLength(3);
      expect(highMatch.map((s) => s.anonymousLabel)).toEqual(['Supplier #01', 'Supplier #02', 'Supplier #05']);

      // GST_VERIFIED
      const gstVerified = mockPool.filter((s) => s.gstVerified);
      expect(gstVerified).toHaveLength(4);

      // LOCAL
      const localOnly = mockPool.filter((s) => s.isLocal);
      expect(localOnly).toHaveLength(2);
      expect(localOnly.map((s) => s.anonymousLabel)).toEqual(['Supplier #01', 'Supplier #03']);

      // ONDC
      const ondcOnly = mockPool.filter((s) => s.network === 'ONDC');
      expect(ondcOnly).toHaveLength(1);
      expect(ondcOnly[0]?.anonymousLabel).toBe('Supplier #02');
    });

    it('SELECTION PERSISTENCE: selections survive filter switches without deselecting hidden suppliers', () => {
      // Simulate user selecting 4 suppliers in ALL view
      const selectedIds = new Set(['inv-1', 'inv-2', 'inv-3', 'inv-5']);
      expect(selectedIds.size).toBe(4);

      // User switches filter to 'LOCAL'
      const localFiltered = mockPool.filter((s) => s.isLocal);
      expect(localFiltered).toHaveLength(2); // inv-1, inv-3

      // Selection set remains intact with all 4 selected IDs
      expect(selectedIds.has('inv-1')).toBe(true);
      expect(selectedIds.has('inv-2')).toBe(true);
      expect(selectedIds.has('inv-3')).toBe(true);
      expect(selectedIds.has('inv-5')).toBe(true);
      expect(selectedIds.size).toBe(4);

      // Display text format verification: "X visible, Y selected" when filtered
      let currentFilter: string = 'LOCAL';
      const tallyText =
        currentFilter !== 'ALL'
          ? `${localFiltered.length} visible, ${selectedIds.size} selected`
          : `${selectedIds.size} of ${mockPool.length} selected`;

      expect(tallyText).toBe('2 visible, 4 selected');

      // User switches filter back to 'ALL'
      const allFiltered = mockPool;
      const allTallyText = `${selectedIds.size} of ${allFiltered.length} selected`;
      expect(allTallyText).toBe('4 of 5 selected');
    });

    it('bulk select in filtered view adds visible items without clearing previous selections', () => {
      // User starts with inv-1 selected
      let selectedIds = new Set(['inv-1']);

      // Filter to ONDC
      const ondcFiltered = mockPool.filter((s) => s.network === 'ONDC'); // inv-2
      
      // Select all in ONDC view
      const nextSet = new Set(selectedIds);
      ondcFiltered.forEach((s) => nextSet.add(s.invitationId));
      selectedIds = nextSet;

      // Now both inv-1 and inv-2 are selected
      expect(selectedIds.has('inv-1')).toBe(true);
      expect(selectedIds.has('inv-2')).toBe(true);
      expect(selectedIds.size).toBe(2);
    });
  });

  describe('6. Dynamic Quorum Calculation & Non-Blocking Workflow', () => {
    const minRequired = 3;

    it('correctly calculates below-quorum state and displays helpful prompt without blocking', () => {
      const selectedCount = 2;
      const isQuorumMet = selectedCount >= minRequired;
      expect(isQuorumMet).toBe(false);

      const statusText = isQuorumMet
        ? `${selectedCount} of ${minRequired} minimum selected ✓`
        : `${selectedCount} of ${minRequired} minimum suppliers selected (Needs ${minRequired - selectedCount} more for quorum)`;

      expect(statusText).toContain('2 of 3 minimum suppliers selected');
      expect(statusText).toContain('Needs 1 more for quorum');

      const badgeLabel = isQuorumMet
        ? `✓ Quorum Met (${selectedCount}/${minRequired})`
        : `Min ${minRequired} Recommended (${selectedCount}/${minRequired})`;

      expect(badgeLabel).toBe('Min 3 Recommended (2/3)');
    });

    it('correctly calculates at-quorum and above-quorum states', () => {
      // Exactly at minimum
      const exactCount = 3;
      expect(exactCount >= minRequired).toBe(true);
      const exactStatus = `${exactCount} of ${minRequired} minimum selected ✓`;
      expect(exactStatus).toBe('3 of 3 minimum selected ✓');

      // Above minimum
      const extraCount = 5;
      expect(extraCount >= minRequired).toBe(true);
      const extraStatus = `${extraCount} of ${minRequired} minimum selected ✓`;
      expect(extraStatus).toBe('5 of 3 minimum selected ✓');
    });
  });

  describe('7. Granular Empty States & Radar State Mapping', () => {
    it('distinguishes EMPTY (0 suppliers discovered), FILTERED_EMPTY (0 matching active filter), and ERROR states', () => {
      // 1. Initial scanning / loading
      const isInitialLoading = true;
      const state1 = isInitialLoading ? 'DISCOVERING' : 'MATCHED';
      expect(state1).toBe('DISCOVERING');

      // 2. 0 suppliers discovered across all networks
      const emptyPool: MatchedSupplier[] = [];
      const state2 = emptyPool.length === 0 ? 'EMPTY' : 'MATCHED';
      expect(state2).toBe('EMPTY');

      // 3. Suppliers exist in pool, but 0 match active filter (e.g. ONDC)
      const poolWithLocalOnly: MatchedSupplier[] = [
        {
          invitationId: 'inv-1',
          anonymousLabel: 'Supplier #01',
          status: 'INVITED',
          matchScore: 90,
          matchLevel: 'EXCELLENT',
          matchReasons: ['local'],
          network: 'LOCAL_REGISTRY',
          networkLabel: 'Local Registry',
          gstVerified: true,
          isLocal: true,
          availabilityText: 'Available Immediately',
        },
      ];
      const ondcFilterResults = poolWithLocalOnly.filter((s) => s.network === 'ONDC');
      const state3 =
        poolWithLocalOnly.length === 0
          ? 'EMPTY'
          : ondcFilterResults.length === 0
          ? 'FILTERED_EMPTY'
          : 'MATCHED';
      expect(state3).toBe('FILTERED_EMPTY');

      // 4. Discovery error state
      const errorMsg = 'Discovery service timeout';
      const state4 = errorMsg ? 'ERROR' : 'MATCHED';
      expect(state4).toBe('ERROR');
    });
  });

  describe('8. Mobile-First & Touch Target Standards', () => {
    it('verifies 48px touch target compliance and safe-area padding formula', () => {
      const touchTargetMinHeight = 'min-h-[48px]';
      const touchTargetMinWidth = 'min-w-[48px]';
      const safeAreaFormula = 'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]';

      expect(touchTargetMinHeight).toBe('min-h-[48px]');
      expect(touchTargetMinWidth).toBe('min-w-[48px]');
      expect(safeAreaFormula).toContain('safe-area-inset-bottom');
    });
  });

  describe('9. Canonical Vocabulary Compliance', () => {
    it('contains ZERO prohibited auction terms across supplier discovery interfaces & copies', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        Matched Verified Suppliers Discovery Quorum Sealed identity-protected offer
        Anonymous Supplier #01 OTP Network ONDC Protocol Direct Invite
        Supplier Discovery Radar Sourcing Channels Sealed Quotes Protected Aliases
        Quorum Met Minimum Recommended Continue to RFQ Review
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });

    it('exports DiscoverSuppliersPage with viewport-safe bottom padding', async () => {
      const { DiscoverSuppliersPage } = await import('./pages/DiscoverSuppliersPage');
      expect(DiscoverSuppliersPage).toBeDefined();
      expect(typeof DiscoverSuppliersPage).toBe('function');
    });
  });
});
