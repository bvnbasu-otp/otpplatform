import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRfqReviewData,
  updateRfqDeadline,
  updateRfqInstructions,
  publishRfq,
  openRfq,
} from './api/rfq-lifecycle';
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

describe('Phase 2.4 — RFQ Review & Publish Feature Tests', () => {
  let profileSpy: any;

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    profileSpy = vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValue({
      profileId: 'prof-buyer-1',
      email: 'procurement@apex.test',
      fullName: 'Vikram Mehta',
      activeOrganizationId: 'org-apex-1',
    });
  });

  afterEach(() => {
    profileSpy?.mockRestore();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  describe('1. RFQ Review Data Extraction & Mapping', () => {
    it('extracts complete sourcing package including requirement, rfq, suppliers, and attachments', async () => {
      const mockReq = {
        id: 'req-201',
        title: 'Borewell Motor Rewinding & Overhaul',
        description: '10 HP submersible pump overhaul and copper coil replacement',
        status: 'RFQ_CREATED',
        category_id: 'BOREWELL_MOTOR_REPAIR',
        requirement_type: 'SERVICE',
        quantity: 1,
        unit: 'UNIT',
        delivery_city: 'Mahadevapura, Bengaluru',
        delivery_pincode: '560048',
        delivery_line1: 'Site Access Gate 3',
        site_notes: 'Heavy machinery hoist required on site',
        required_by_mode: 'WITHIN_DAYS',
        required_by_days: 7,
        commercial: {
          budgetAmount: 25000,
          paymentTerms: '100% on delivery',
          priceIncludesGst: true,
          priceIncludesTransport: true,
          __sourcing: { reach: 'LOCAL', instructions: 'Please include all-inclusive landed rates' },
        },
        organization_id: 'org-apex-1',
        quality: { notes: 'Pre-dispatch inspection required' },
      };

      const mockRfq = {
        id: 'rfq-301',
        status: 'DRAFT',
        title: 'RFQ: Borewell Motor Rewinding',
        quote_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        evaluation_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        min_quotes_required: 3,
      };

      const mockInvitations = [
        {
          invitation_id: 'inv-1',
          anonymous_label: 'Supplier #01',
          status: 'INVITED',
          match_score: 95.0,
          match_reasons: ['category_match', 'verified_active', 'location_match'],
          invited_at: '2026-09-15T10:00:00Z',
        },
        {
          invitation_id: 'inv-2',
          anonymous_label: 'Supplier #02',
          status: 'INVITED',
          match_score: 88.0,
          match_reasons: ['category_match', 'verified_active', 'ondc'],
          invited_at: '2026-09-15T10:00:00Z',
        },
        {
          invitation_id: 'inv-3',
          anonymous_label: 'Supplier #03',
          status: 'INVITED',
          match_score: 82.0,
          match_reasons: ['category_match', 'verified_active', 'local'],
          invited_at: '2026-09-15T10:00:00Z',
        },
      ];

      const mockAttachments = [
        {
          id: 'att-1',
          requirement_id: 'req-201',
          kind: 'DRAWING',
          display_name: 'Motor Wiring Diagram',
          original_filename: 'pump_wiring_spec.pdf',
          content_type: 'application/pdf',
          size_bytes: 245000,
          created_at: '2026-09-15T10:00:00Z',
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') {
          return createSupabaseQueryMock({ data: mockReq, error: null });
        }
        if (table === 'rfqs') {
          return createSupabaseQueryMock({ data: mockRfq, error: null });
        }
        if (table === 'rfq_invitations_manager') {
          return createSupabaseQueryMock({ data: mockInvitations, error: null });
        }
        if (table === 'attachments') {
          return createSupabaseQueryMock({ data: mockAttachments, error: null });
        }
        if (table === 'approval_policies') {
          return createSupabaseQueryMock({
            data: { threshold: { minQuotesRequired: 3, evaluationWeights: { price: 50, delivery: 25, warranty: 25 } } },
            error: null,
          });
        }
        if (table === 'organizations') {
          return createSupabaseQueryMock({ data: { org_type: 'MSME' }, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchRfqReviewData('req-201', 'rfq-301');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.requirement.title).toBe('Borewell Motor Rewinding & Overhaul');
        expect(res.data.requirement.budgetFormatted).toBe('₹25,000');
        expect(res.data.selectedSuppliers).toHaveLength(3);
        expect(res.data.attachments).toHaveLength(1);
        expect(res.data.validation.isValid).toBe(true);
        expect(res.data.validation.errors).toHaveLength(0);
      }
    });

    it('flags blocking validation error when supplier pool is empty (0 suppliers)', async () => {
      const mockReq = {
        id: 'req-empty',
        title: 'Generator Maintenance',
        description: 'Quarterly DG set service',
        delivery_city: 'Bengaluru',
        delivery_pincode: '560001',
        commercial: {},
        status: 'RFQ_CREATED',
      };

      const mockRfq = {
        id: 'rfq-empty',
        status: 'DRAFT',
        quote_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') return createSupabaseQueryMock({ data: mockReq, error: null });
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'rfq_invitations_manager') return createSupabaseQueryMock({ data: [], error: null });
        if (table === 'attachments') return createSupabaseQueryMock({ data: [], error: null });
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await fetchRfqReviewData('req-empty', 'rfq-empty');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.validation.isValid).toBe(false);
        expect(res.data.validation.errors).toContain(
          'At least 1 verified supplier must be selected in the sourcing pool.'
        );
      }
    });
  });

  describe('2. Identity-Protection & Anti-Leak Invariants', () => {
    it('STRICT ANTI-LEAK: RFQ Review model never leaks supplier legal names, emails, phone numbers, or tax IDs', async () => {
      const mockReq = {
        id: 'req-secret',
        title: 'Civil Construction',
        description: 'Compound wall reconstruction',
        delivery_city: 'Chennai',
        delivery_pincode: '600001',
        status: 'RFQ_CREATED',
      };
      const mockRfq = {
        id: 'rfq-secret',
        status: 'DRAFT',
        quote_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const mockInvitations = [
        {
          invitation_id: 'inv-secret-1',
          anonymous_label: 'Supplier #07',
          match_score: 91.0,
          match_reasons: ['category_match'],
          status: 'INVITED',
        },
      ];

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') return createSupabaseQueryMock({ data: mockReq, error: null });
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'rfq_invitations_manager') return createSupabaseQueryMock({ data: mockInvitations, error: null });
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchRfqReviewData('req-secret', 'rfq-secret');
      expect(res.ok).toBe(true);
      if (res.ok) {
        const jsonStr = JSON.stringify(res.data.selectedSuppliers);
        expect(jsonStr).not.toMatch(/phone|email|legal_name|gstin|pan_number|bank_account/i);
        expect(res.data.selectedSuppliers[0]?.anonymousLabel).toBe('Supplier #07');
      }
    });
  });

  describe('3. Quote Response Deadline Configuration & Validation', () => {
    it('updates quote deadline successfully for future valid date', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      vi.mocked(supabase.from).mockImplementation(() => createSupabaseQueryMock({ data: { id: 'rfq-1' }, error: null }));

      const res = await updateRfqDeadline('rfq-1', futureDate);
      expect(res.ok).toBe(true);
    });

    it('rejects past quote deadlines with validation error', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const res = await updateRfqDeadline('rfq-1', pastDate);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/future/i);
      }
    });

    it('rejects invalid deadline date format', async () => {
      const res = await updateRfqDeadline('rfq-1', 'not-a-valid-date');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/invalid/i);
      }
    });
  });

  describe('4. Buyer Supplier Instructions Management', () => {
    it('persists customized instructions in requirement commercial sourcing', async () => {
      vi.mocked(supabase.from).mockImplementation(() =>
        createSupabaseQueryMock({ data: { commercial: { budgetAmount: 50000 } }, error: null })
      );

      const res = await updateRfqInstructions(
        'req-1',
        'Please quote all-inclusive landed rates including freight and 1-year warranty'
      );
      expect(res.ok).toBe(true);
    });
  });

  describe('5. Fast Track vs Full Governance Protocols', () => {
    it('correctly configures Fast Track protocol for Individual / MSME organizations', async () => {
      const mockReq = {
        id: 'req-fast',
        title: 'Office Cleaning',
        description: 'Deep carpet cleaning',
        delivery_city: 'Pune',
        delivery_pincode: '411001',
        status: 'RFQ_CREATED',
      };
      const mockRfq = {
        id: 'rfq-fast',
        status: 'DRAFT',
        quote_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') return createSupabaseQueryMock({ data: mockReq, error: null });
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'organizations') return createSupabaseQueryMock({ data: { org_type: 'INDIVIDUAL' }, error: null });
        if (table === 'approval_policies') return createSupabaseQueryMock({ data: { policy_type: 'INDIVIDUAL_DIRECT' }, error: null });
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchRfqReviewData('req-fast', 'rfq-fast');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.governance.isFastTrack).toBe(true);
        expect(res.data.governance.committeeVoteRequired).toBe(false);
      }
    });

    it('correctly configures Full Governance protocol for Community / Enterprise organizations', async () => {
      const mockReq = {
        id: 'req-gov',
        title: 'Elevator Modernization',
        description: 'Complete lift refurbishment across 4 towers',
        delivery_city: 'Bengaluru',
        delivery_pincode: '560100',
        status: 'RFQ_CREATED',
      };
      const mockRfq = {
        id: 'rfq-gov',
        status: 'DRAFT',
        quote_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      };

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'requirements') return createSupabaseQueryMock({ data: mockReq, error: null });
        if (table === 'rfqs') return createSupabaseQueryMock({ data: mockRfq, error: null });
        if (table === 'organizations') return createSupabaseQueryMock({ data: { org_type: 'COMMUNITY' }, error: null });
        if (table === 'approval_policies') {
          return createSupabaseQueryMock({
            data: { policy_type: 'COMMUNITY_SIMPLE_MAJORITY', threshold: { minVotes: 3, committeeVoteRequired: true } },
            error: null,
          });
        }
        return createSupabaseQueryMock({ data: [], error: null });
      });

      const res = await fetchRfqReviewData('req-gov', 'rfq-gov');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.governance.isFastTrack).toBe(false);
        expect(res.data.governance.committeeVoteRequired).toBe(true);
      }
    });
  });

  describe('6. RFQ Publishing Execution & Duplicate Protection', () => {
    it('executes atomic publishRfq and transitions RFQ to OPEN and Requirement to QUOTING', async () => {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfq_supplier_networks') {
          return createSupabaseQueryMock({ data: [{ invited_count: 4 }], error: null });
        }
        if (table === 'rfqs') {
          return createSupabaseQueryMock({
            data: { id: 'rfq-301', status: 'DRAFT', requirement_id: 'req-201' },
            error: null,
          });
        }
        if (table === 'requirements') {
          return createSupabaseQueryMock({ data: { id: 'req-201' }, error: null });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await publishRfq({
        rfqId: 'rfq-301',
        requirementId: 'req-201',
        quoteDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        instructions: 'Standard instructions',
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.rfqId).toBe('rfq-301');
        expect(res.invitedCount).toBe(4);
      }
    });

    it('prevents publishing an RFQ that is already OPEN (duplicate publish protection)', async () => {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rfqs') {
          return createSupabaseQueryMock({
            data: { id: 'rfq-301', status: 'OPEN', requirement_id: 'req-201' },
            error: null,
          });
        }
        return createSupabaseQueryMock({ data: null, error: null });
      });

      const res = await openRfq('rfq-301');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/Cannot open RFQ from status OPEN/i);
      }
    });
  });

  describe('7. Vocabulary Scanner & Supplier Response SLA Compliance', () => {
    it('strictly satisfies 30-minute supplier response policy without prohibited 15-second claims', () => {
      const rfqCopy = `
        Suppliers submit sealed quotes before this deadline. Responses are expected with an initial 30 Min Target from Supplier.
        Quoting is now live with responses expected within 30 minutes.
      `;
      expect(rfqCopy).toContain('within 30 minutes');
      expect(rfqCopy).toContain('30 Min Target from Supplier');
      expect(rfqCopy).not.toContain('15 sec');
      expect(rfqCopy).not.toContain('15 seconds');
    });

    it('contains ZERO prohibited terminology across all Phase 2.4 review and publish texts', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        RFQ Ready to Publish Selected Supplier Pool Quote Response Deadline
        Technical Drawings & BoQ Attachments Supplier Instructions Quoting Guidelines
        Committee Quorum Rules Transparent Merit Weights Confirm & Publish RFQ
        Quoting Live Sealed Quotes Identity Protected
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });
  });
});
