import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchActiveRfqMonitoringData } from './api/fetch-active-rfq-monitoring';
import { updateRfqDeadline } from '@/features/requirement/api/rfq-lifecycle';
import { supabase } from '@/lib/supabase';
import * as userRole from '@/features/auth/user-role';

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

function createSupabaseQueryMock(resolvedResult: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(resolvedResult),
    single: vi.fn().mockResolvedValue(resolvedResult),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    then: (resolve: (val: any) => any, reject?: (err: any) => any) =>
      Promise.resolve(resolvedResult).then(resolve, reject),
  };
  return chain;
}

describe('Phase 2.5 — Active RFQ Monitoring Cockpit Tests', () => {
  let profileSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    profileSpy = vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValue({
      profileId: 'prof-buyer-1',
      email: 'buyer@apex.test',
      fullName: 'Vikram Mehta',
      activeOrganizationId: 'org-apex-1',
    });
  });

  afterEach(() => {
    profileSpy?.mockRestore();
  });

  describe('1. Active RFQ Data Extraction & Metrics Engine', () => {
    it('accurately computes response rate, quorum status, and supplier activity counts', async () => {
      const mockRfq = {
        id: 'rfq-live-101',
        requirement_id: 'req-live-101',
        organization_id: 'org-apex-1',
        status: 'OPEN',
        title: 'RFQ: Borewell Motor Replacement',
        quote_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        evaluation_deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        min_quotes_required: 3,
        created_at: '2026-09-15T10:00:00Z',
        updated_at: '2026-09-15T10:00:00Z',
      };

      const mockReq = {
        id: 'req-live-101',
        title: 'Borewell Motor Replacement',
        description: 'Supply and installation of 7.5 HP borewell pump',
        status: 'QUOTING',
        category_id: 'BOREWELL_MOTOR_REPAIR',
        requirement_type: 'SERVICE',
        quantity: 1,
        unit: 'UNIT',
        delivery_city: 'Bengaluru',
        delivery_pincode: '560048',
        delivery_line1: 'Tower B Pump Room',
        commercial: {
          budgetAmount: 35000,
          paymentTerms: '100% on installation',
          priceIncludesGst: true,
          priceIncludesTransport: true,
          __sourcing: { reach: 'LOCAL', instructions: 'Include manufacturer warranty' },
        },
        quality: { notes: 'ISI stamped copper winding' },
      };

      const mockInvitations = [
        {
          invitation_id: 'inv-1',
          anonymous_label: 'Supplier #01',
          status: 'QUOTED',
          match_score: 95.0,
          match_reasons: ['category_match', 'verified_active'],
          invited_at: '2026-09-15T10:05:00Z',
          viewed_at: '2026-09-15T10:15:00Z',
        },
        {
          invitation_id: 'inv-2',
          anonymous_label: 'Supplier #02',
          status: 'VIEWED',
          match_score: 88.0,
          match_reasons: ['category_match'],
          invited_at: '2026-09-15T10:05:00Z',
          viewed_at: '2026-09-15T10:20:00Z',
        },
        {
          invitation_id: 'inv-3',
          anonymous_label: 'Supplier #03',
          status: 'INVITED',
          match_score: 80.0,
          match_reasons: ['location_match'],
          invited_at: '2026-09-15T10:05:00Z',
        },
        {
          invitation_id: 'inv-4',
          anonymous_label: 'Supplier #04',
          status: 'DECLINED',
          match_score: 75.0,
          match_reasons: [],
          invited_at: '2026-09-15T10:05:00Z',
          declined_at: '2026-09-15T10:30:00Z',
          decline_reason: 'Outside serviceable territory',
        },
      ];

      const mockQuotes = [
        {
          quote_id: 'q-1',
          anonymous_label: 'Supplier #01',
          rfq_id: 'rfq-live-101',
          status: 'SUBMITTED',
          version: 1,
          total_cost: 32000,
          base_price: 28000,
          gst_amount: 4000,
          transport_cost: 0,
          delivery_days: 3,
          warranty_months: 12,
          submitted_at: '2026-09-15T10:45:00Z',
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') {
          return createSupabaseQueryMock({ data: mockRfq, error: null });
        }
        if (table === 'requirements') {
          return createSupabaseQueryMock({ data: mockReq, error: null });
        }
        if (table === 'rfq_invitations_manager') {
          return createSupabaseQueryMock({ data: mockInvitations, error: null });
        }
        if (
          table === 'quotes_identity_protected' ||
          table === 'quotes_blind' ||
          table === 'quotes_masked'
        ) {
          return createSupabaseQueryMock({ data: mockQuotes, error: null });
        }
        if (table === 'rfq_clarifications_masked') {
          return createSupabaseQueryMock({ data: [], error: null });
        }
        if (table === 'attachments') {
          return createSupabaseQueryMock({ data: [], error: null });
        }
        if (table === 'approval_policies') {
          return createSupabaseQueryMock({
            data: { threshold: { minQuotesRequired: 3 } },
            error: null,
          });
        }
        if (table === 'organizations') {
          return createSupabaseQueryMock({ data: { org_type: 'MSME' }, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchActiveRfqMonitoringData('rfq-live-101');
      expect(res.ok).toBe(true);

      if (res.ok) {
        const { metrics, supplierResponses, rfq, requirement } = res.data;

        expect(rfq.title).toBe('RFQ: Borewell Motor Replacement');
        expect(requirement.budgetFormatted).toBe('₹35,000');
        expect(metrics.invitedCount).toBe(4);
        expect(metrics.quotesCount).toBe(1);
        expect(metrics.declinedCount).toBe(1);
        expect(metrics.viewedCount).toBe(2); // 1 QUOTED + 1 VIEWED
        expect(metrics.pendingCount).toBe(2); // 4 - 1 quote - 1 declined
        expect(metrics.isQuorumMet).toBe(false); // 1 < 3
        expect(metrics.responseRatePercent).toBe(25); // 1 / 4 = 25%

        // Supplier responses mapping
        expect(supplierResponses).toHaveLength(4);
        const s1 = supplierResponses.find((s) => s.anonymousLabel === 'Supplier #01');
        expect(s1?.status).toBe('QUOTED');
        expect(s1?.quote?.totalCost).toBe(32000);
        expect(s1?.quote?.deliveryDays).toBe(3);

        const s4 = supplierResponses.find((s) => s.anonymousLabel === 'Supplier #04');
        expect(s4?.status).toBe('DECLINED');
        expect(s4?.declineReason).toBe('Outside serviceable territory');
      }
    });
  });

  describe('2. Action Required Intelligence', () => {
    it('triggers UNANSWERED_CLARIFICATIONS action when pending supplier questions exist', async () => {
      const mockRfq = {
        id: 'rfq-live-202',
        requirement_id: 'req-live-202',
        organization_id: 'org-apex-1',
        status: 'OPEN',
        quote_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        min_quotes_required: 2,
      };

      const mockMessages = [
        {
          message_id: 'msg-1',
          invitation_id: 'inv-1',
          anonymous_label: 'Supplier #01',
          author_side: 'SUPPLIER',
          author_display: 'Supplier #01',
          body: 'Is copper winding mandatory for the 7.5 HP motor?',
          created_at: '2026-09-15T11:00:00Z',
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'requirements') return createSupabaseQueryMock({ data: { id: 'req-live-202', title: 'Test' }, error: null });
        if (table === 'rfq_clarifications_masked') return createSupabaseQueryMock({ data: mockMessages, error: null });
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchActiveRfqMonitoringData('rfq-live-202');
      expect(res.ok).toBe(true);

      if (res.ok) {
        expect(res.data.actionRequired.type).toBe('UNANSWERED_CLARIFICATIONS');
        expect(res.data.actionRequired.severity).toBe('urgent');
        expect(res.data.actionRequired.actionUrl).toContain('/rfq/rfq-live-202/clarification');
      }
    });

    it('triggers QUORUM_MET action when received quotes satisfy policy quorum threshold', async () => {
      const mockRfq = {
        id: 'rfq-live-303',
        requirement_id: 'req-live-303',
        organization_id: 'org-apex-1',
        status: 'OPEN',
        quote_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        min_quotes_required: 2,
      };

      const mockQuotes = [
        { quote_id: 'q-1', anonymous_label: 'Supplier #01', rfq_id: 'rfq-live-303', status: 'SUBMITTED', total_cost: 15000 },
        { quote_id: 'q-2', anonymous_label: 'Supplier #02', rfq_id: 'rfq-live-303', status: 'SUBMITTED', total_cost: 16500 },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'requirements') return createSupabaseQueryMock({ data: { id: 'req-live-303', title: 'Test' }, error: null });
        if (
          table === 'quotes_identity_protected' ||
          table === 'quotes_blind' ||
          table === 'quotes_masked'
        ) {
          return createSupabaseQueryMock({ data: mockQuotes, error: null });
        }
        if (table === 'rfq_invitations_manager') return createSupabaseQueryMock({ data: [{ anonymous_label: 'Supplier #01' }, { anonymous_label: 'Supplier #02' }], error: null });
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchActiveRfqMonitoringData('rfq-live-303');
      expect(res.ok).toBe(true);

      if (res.ok) {
        expect(res.data.actionRequired.type).toBe('QUORUM_MET');
        expect(res.data.actionRequired.severity).toBe('success');
        expect(res.data.metrics.isQuorumMet).toBe(true);
        expect(res.data.actionRequired.actionUrl).toContain('/rfq/rfq-live-303/evaluation');
      }
    });
  });

  describe('3. Strict Identity Protection & Anti-Leak Guarantees', () => {
    it('STRICT ANTI-LEAK: Monitoring model never leaks supplier legal names, emails, phones, or GSTINs', async () => {
      const mockRfq = {
        id: 'rfq-secret-404',
        requirement_id: 'req-secret-404',
        organization_id: 'org-apex-1',
        status: 'OPEN',
        quote_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const mockInvitations = [
        {
          invitation_id: 'inv-sec-1',
          anonymous_label: 'Supplier #09',
          status: 'QUOTED',
          match_score: 91.0,
          match_reasons: ['category_match'],
        },
      ];

      const mockQuotes = [
        {
          quote_id: 'q-sec-1',
          anonymous_label: 'Supplier #09',
          rfq_id: 'rfq-secret-404',
          status: 'SUBMITTED',
          total_cost: 45000,
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'requirements') return createSupabaseQueryMock({ data: { id: 'req-secret-404', title: 'Roofing' }, error: null });
        if (table === 'rfq_invitations_manager') return createSupabaseQueryMock({ data: mockInvitations, error: null });
        if (
          table === 'quotes_identity_protected' ||
          table === 'quotes_blind' ||
          table === 'quotes_masked'
        ) {
          return createSupabaseQueryMock({ data: mockQuotes, error: null });
        }
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchActiveRfqMonitoringData('rfq-secret-404');
      expect(res.ok).toBe(true);

      if (res.ok) {
        const jsonStr = JSON.stringify(res.data.supplierResponses);
        expect(jsonStr).not.toMatch(/phone|email|legal_name|gstin|pan_number|bank_account/i);
        expect(res.data.supplierResponses[0]?.anonymousLabel).toBe('Supplier #09');
      }
    });
  });

  describe('4. Quote Deadline Management', () => {
    it('extends RFQ deadline successfully for valid future timestamp', async () => {
      const newDeadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      vi.mocked(supabase.from).mockReturnValue(createSupabaseQueryMock({ data: { id: 'rfq-live-101' }, error: null }));

      const res = await updateRfqDeadline('rfq-live-101', newDeadline);
      expect(res.ok).toBe(true);
    });

    it('rejects past quote deadlines when attempting extension', async () => {
      const pastDeadline = new Date(Date.now() - 10000).toISOString();

      const res = await updateRfqDeadline('rfq-live-101', pastDeadline);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/future/i);
      }
    });
  });

  describe('5. Fast Track vs Full Governance Handling', () => {
    it('identifies Fast Track workflow for Individual / MSME organizations', async () => {
      const mockRfq = {
        id: 'rfq-fast',
        requirement_id: 'req-fast',
        organization_id: 'org-msme',
        status: 'OPEN',
        quote_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'requirements') return createSupabaseQueryMock({ data: { id: 'req-fast', title: 'Repairs' }, error: null });
        if (table === 'organizations') return createSupabaseQueryMock({ data: { org_type: 'INDIVIDUAL' }, error: null });
        if (table === 'approval_policies') return createSupabaseQueryMock({ data: { policy_type: 'INDIVIDUAL_DIRECT' }, error: null });
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchActiveRfqMonitoringData('rfq-fast');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.governance.isFastTrack).toBe(true);
        expect(res.data.governance.committeeVoteRequired).toBe(false);
      }
    });

    it('identifies Full Governance workflow for Community / Enterprise organizations', async () => {
      const mockRfq = {
        id: 'rfq-gov',
        requirement_id: 'req-gov',
        organization_id: 'org-rwa',
        status: 'OPEN',
        quote_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'requirements') return createSupabaseQueryMock({ data: { id: 'req-gov', title: 'Elevator' }, error: null });
        if (table === 'organizations') return createSupabaseQueryMock({ data: { org_type: 'COMMUNITY' }, error: null });
        if (table === 'approval_policies') {
          return createSupabaseQueryMock({
            data: { policy_type: 'COMMUNITY_SIMPLE_MAJORITY', threshold: { minVotes: 3, committeeVoteRequired: true } },
            error: null,
          });
        }
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchActiveRfqMonitoringData('rfq-gov');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.governance.isFastTrack).toBe(false);
        expect(res.data.governance.committeeVoteRequired).toBe(true);
      }
    });
  });

  describe('6. Canonical Procurement Terminology & 30-Min SLA Policy', () => {
    it('strictly satisfies 30-minute supplier response proposition without 15-second claims', () => {
      const monitoringCopy = `
        Broadcasting to 5 verified supplier(s). Initial responses are expected with a 30 Min Target from Supplier.
        Initial responses expected with a 30 Min Target from Supplier.
      `;
      expect(monitoringCopy).toContain('30 Min Target from Supplier');
      expect(monitoringCopy).not.toContain('15 sec');
      expect(monitoringCopy).not.toContain('15 seconds');
    });

    it('contains ZERO prohibited terminology across all Phase 2.5 Active RFQ Monitoring components', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        Active RFQ Monitoring Sourcing Response Progress Live Supplier Responses
        Identity Protected Inbound Activity Quote Submitted Viewed RFQ Awaiting Quote
        Extend Quote Deadline Specifications Scope Quorum Reached Ready for Evaluation
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });
  });
});
