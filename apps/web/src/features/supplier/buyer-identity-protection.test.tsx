import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { findSupplierFacingBuyerIdentityLeaks } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import {
  SUPPLIER_RFQ_DETAIL_COLUMNS,
  SUPPLIER_RFQ_LIST_COLUMNS,
  fetchSupplierInvitations,
  fetchSupplierRfq,
  toDetail,
  type IdentityProtectedRfqRow,
} from './api/fetch-invitations';
import { SupplierRequirementPanel } from './components/SupplierRequirementPanel';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const BUYER_ORG = 'Greenview Apartments RWA';
const BUYER_PERSON = 'Ramesh Iyer';
const BUYER_EMAIL = 'secretary@greenview-rwa.in';
const BUYER_PHONE = '9845012345';
const BUYER_STREET = '14 Sarjapur Main Road';
const BUYER_GSTIN = '29ABCDE1234F1Z5';

const LEAK_STRINGS = [BUYER_ORG, 'Greenview', BUYER_PERSON, BUYER_EMAIL, BUYER_PHONE, BUYER_STREET, BUYER_GSTIN];

const BUYER_IDENTITY_COLUMNS = [
  'buyer_display_name',
  'buyer_type',
  'organization',
  'org_',
  'created_by',
  'contact',
  'email',
  'phone',
  'address',
  'gstin',
  'tax_registration',
  'awarded_by',
];

/**
 * A row as a compromised or widened view could return it: the real buyer name
 * in buyer_display_name (which rfqs_supplier_masked does today for OPEN_RFQ),
 * raw identity columns, and contact details typed into free text and JSON.
 */
function leakyRow(): IdentityProtectedRfqRow & Record<string, unknown> {
  return {
    rfq_id: 'rfq-leak-1',
    public_ref: 'ENQ-2026-0101',
    title: 'Supply of OPC 53 cement',
    description: `40 bags of OPC 53 grade cement for tower B. Call ${BUYER_PHONE} or mail ${BUYER_EMAIL}.`,
    status: 'OPEN',
    sourcing_mode: 'OPEN_RFQ',
    quote_deadline: new Date(Date.now() + 3 * 86400000).toISOString(),
    min_quotes_required: 3,
    invitation_id: 'inv-leak-1',
    my_alias: 'Supplier #01',
    my_invitation_status: 'VIEWED',
    invited_at: '2026-09-20T08:00:00Z',
    category: 'Construction Materials',
    subcategory: 'Cement',
    requirement_mode: null,
    quantity: '40',
    unit: 'bags',
    attributes: {
      cement_grade: 'OPC 53',
      bag_weight_kg: 50,
      site: { line1: BUYER_STREET, city: 'Coimbatore' },
    },
    quality: { bis_certified: true, contact_person: BUYER_PERSON },
    commercial: {
      payment_terms: 'Net 15',
      billing: { gstin: BUYER_GSTIN, contact_email: BUYER_EMAIL },
    },
    required_by_mode: 'WITHIN_DAYS',
    required_by_days: 5,
    required_by_date: null,
    fulfilment_mode: 'SUPPLIER_DELIVERY',
    delivery_city: 'Coimbatore',
    evaluation_weights: { price: 70, delivery_time: 30 },
    buyer_display_name: BUYER_ORG,
    buyer_type: 'COMMUNITY',
    organization_id: 'org-greenview',
    created_by: 'profile-ramesh',
    contact_person: BUYER_PERSON,
    contact_phone: BUYER_PHONE,
    contact_email: BUYER_EMAIL,
    delivery_address_snapshot: { line1: BUYER_STREET, city: 'Coimbatore', pincode: '641001' },
  } as unknown as IdentityProtectedRfqRow & Record<string, unknown>;
}

function expectNoBuyerIdentity(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const leak of LEAK_STRINGS) {
    expect(serialized).not.toContain(leak);
  }
  expect(findSupplierFacingBuyerIdentityLeaks(value)).toEqual([]);
}

describe('Supplier RFQ APIs never pass buyer identity to the supplier UI pre-award', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it('requests no buyer identity column from rfqs_supplier_masked (list and detail)', () => {
    for (const columns of [SUPPLIER_RFQ_LIST_COLUMNS, SUPPLIER_RFQ_DETAIL_COLUMNS]) {
      const requested = columns.split(',').map((c) => c.trim());
      for (const column of requested) {
        for (const forbidden of BUYER_IDENTITY_COLUMNS) {
          expect(column).not.toContain(forbidden);
        }
      }
    }
  });

  it('fetchSupplierRfq reads the masked view with the safe column list and strips a leaky row', async () => {
    const chain = createSupabaseQueryMock(leakyRow());
    vi.mocked(supabase.from).mockReturnValue(chain);

    const result = await fetchSupplierRfq('rfq-leak-1');

    expect(supabase.from).toHaveBeenCalledWith('rfqs_supplier_masked');
    expect(chain.select).toHaveBeenCalledWith(SUPPLIER_RFQ_DETAIL_COLUMNS);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.rfq) throw new Error('expected an RFQ');

    expect(result.rfq.buyerDisplayName).toBe('Identity protected');
    expect(result.rfq.buyerAnonymous).toBe(true);
    expectNoBuyerIdentity(result.rfq);

    // Everything needed to quote survives.
    expect(result.rfq.quantity).toBe(40);
    expect(result.rfq.unit).toBe('bags');
    expect(result.rfq.deliveryCity).toBe('Coimbatore');
    expect(result.rfq.attributes.cement_grade).toBe('OPC 53');
    expect(result.rfq.commercial.payment_terms).toBe('Net 15');
    expect(result.rfq.description).toContain('40 bags of OPC 53 grade cement');
  });

  it('fetchSupplierInvitations strips a leaky row for every inbox entry', async () => {
    const chain = createSupabaseQueryMock([leakyRow(), { ...leakyRow(), rfq_id: 'rfq-leak-2' }]);
    vi.mocked(supabase.from).mockReturnValue(chain);

    const result = await fetchSupplierInvitations();

    expect(supabase.from).toHaveBeenCalledWith('rfqs_supplier_masked');
    expect(chain.select).toHaveBeenCalledWith(SUPPLIER_RFQ_LIST_COLUMNS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected invitations');
    expect(result.invitations).toHaveLength(2);
    for (const invitation of result.invitations) {
      expect(invitation.buyerDisplayName).toBe('Identity protected');
      expectNoBuyerIdentity(invitation);
    }
  });
});

describe('Supplier RFQ view renders only what is needed to quote', () => {
  it('renders qty, spec, city and deadline but no buyer name, email, phone, street or GSTIN', () => {
    const rfq = toDetail(leakyRow());
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SupplierRequirementPanel rfq={rfq} />
      </MemoryRouter>,
    );

    for (const leak of LEAK_STRINGS) {
      expect(markup).not.toContain(leak);
    }
    expect(markup).toContain('40 bags');
    expect(markup).toContain('OPC 53');
    expect(markup).toContain('Coimbatore');
    expect(markup).toContain('Supply of OPC 53 cement');
    expect(markup).toContain('Quotes Close:');
    expect(markup).toContain('Identity protected');
  });
});
