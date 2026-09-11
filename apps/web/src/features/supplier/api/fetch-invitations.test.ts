import { describe, expect, it } from 'vitest';
import { toDetail, toInvitation, type IdentityProtectedRfqRow } from './fetch-invitations';

function row(overrides: Partial<IdentityProtectedRfqRow> = {}): IdentityProtectedRfqRow {
  return {
    rfq_id: 'rfq-1',
    public_ref: 'ENQ-2026-0042',
    title: 'Rewind 7.5 HP submersible motor',
    description: 'Motor pulled out last week, winding burnt.',
    status: 'OPEN',
    sourcing_mode: 'IDENTITY_PROTECTED',
    quote_deadline: '2026-09-01T00:00:00Z',
    min_quotes_required: 3,
    invitation_id: 'inv-1',
    my_alias: 'Supplier QK7T',
    my_invitation_status: 'INVITED',
    invited_at: '2026-08-24T10:00:00Z',
    category: 'Electrical & Motors',
    subcategory: 'Motor rewinding',
    requirement_mode: 'REPAIR_MAINTENANCE',
    quantity: '1',
    unit: 'unit',
    attributes: { hp: 7.5 },
    quality: {},
    commercial: {},
    required_by_mode: 'WITHIN_DAYS',
    required_by_days: 5,
    required_by_date: null,
    fulfilment_mode: 'SUPPLIER_ONSITE',
    delivery_city: 'Coimbatore',
    evaluation_weights: { price: 50, delivery_time: 30, warranty: 20 },
    buyer_display_name: 'Identity protected',
    ...overrides,
  };
}

describe('supplier identity-protected RFQ mapping', () => {
  it('flags an anonymous buyer without inventing a name', () => {
    const invitation = toInvitation(row());
    expect(invitation.buyerDisplayName).toBe('Identity protected');
    expect(invitation.buyerAnonymous).toBe(true);
  });

  it('treats a named buyer as identified', () => {
    const invitation = toInvitation(row({ buyer_display_name: 'Greenview Apartments' }));
    expect(invitation.buyerAnonymous).toBe(false);
    expect(invitation.buyerDisplayName).toBe('Greenview Apartments');
  });

  it('carries the public reference a supplier can quote over the phone', () => {
    expect(toInvitation(row()).publicRef).toBe('ENQ-2026-0042');
  });

  it('gives the supplier its own alias, not another supplier label', () => {
    expect(toInvitation(row()).anonymousLabel).toBe('Supplier QK7T');
  });

  it('coerces numeric quantity that arrives as a string', () => {
    expect(toDetail(row({ quantity: '2.5' })).quantity).toBe(2.5);
    expect(toDetail(row({ quantity: null })).quantity).toBeNull();
  });

  it('defaults absent json blocks to empty objects so screens need no guards', () => {
    const detail = toDetail(
      row({ attributes: null, quality: null, commercial: null, evaluation_weights: null }),
    );
    expect(detail.attributes).toEqual({});
    expect(detail.quality).toEqual({});
    expect(detail.commercial).toEqual({});
    expect(detail.evaluationWeights).toEqual({});
  });

  it('shows the supplier what will decide the award', () => {
    expect(toDetail(row()).evaluationWeights).toEqual({
      price: 50,
      delivery_time: 30,
      warranty: 20,
    });
  });

  it('never surfaces a buyer org id or contact through the detail mapping', () => {
    const detail = toDetail(row());
    const keys = Object.keys(detail);
    expect(keys.some((k) => /buyerOrg|orgId|contact|email|phone/i.test(k))).toBe(false);
  });
});
