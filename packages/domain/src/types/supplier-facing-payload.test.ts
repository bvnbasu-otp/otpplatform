import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROTECTED_FORBIDDEN_FIELDS,
  SUPPLIER_FACING_FORBIDDEN_BUYER_FIELDS,
  assertIdentityProtectedPayloadSafe,
  assertSupplierFacingPayloadSafe,
  findSupplierFacingBuyerIdentityLeaks,
  stripSupplierFacingBuyerIdentity,
} from './blind-quote';
import { IdentityProtectedViolationError } from '../errors/blind-violation';

const safeSupplierPayload = {
  rfqId: 'rfq-1',
  publicRef: 'ENQ-2026-0042',
  rfqTitle: 'Rewind 7.5 HP motor',
  buyerDisplayName: 'Identity protected',
  deliveryCity: 'Coimbatore',
  quantity: 2,
  attributes: { hp: 7.5, winding: 'Class H' },
  commercial: { payment_terms: 'Net 15' },
};

describe('supplier-facing buyer identity guard', () => {
  it('accepts a payload carrying only what is needed to quote', () => {
    expect(() => assertSupplierFacingPayloadSafe(safeSupplierPayload)).not.toThrow();
    expect(findSupplierFacingBuyerIdentityLeaks(safeSupplierPayload)).toEqual([]);
  });

  it('rejects each forbidden buyer field at the top level', () => {
    for (const field of SUPPLIER_FACING_FORBIDDEN_BUYER_FIELDS) {
      expect(() =>
        assertSupplierFacingPayloadSafe({ ...safeSupplierPayload, [field]: 'leak' }),
      ).toThrow(IdentityProtectedViolationError);
    }
  });

  it('finds buyer identity nested inside free-form spec and commercial JSON', () => {
    const leaky = {
      ...safeSupplierPayload,
      commercial: { billing: { contact_email: 'owner@palmmeadows.in' } },
      attributes: [{ site: { line1: '12 Palm Meadows Road' } }],
    };
    expect(findSupplierFacingBuyerIdentityLeaks(leaky).sort()).toEqual([
      'attributes[0].site.line1',
      'commercial.billing.contact_email',
    ]);
    expect(() => assertSupplierFacingPayloadSafe(leaky)).toThrow(/line1|contact_email/);
  });

  it('covers the server columns that carry buyer identity', () => {
    for (const column of [
      'buyer_display_name',
      'organization_id',
      'created_by',
      'contact_person',
      'contact_phone',
      'contact_email',
      'tax_registration',
      'delivery_address_snapshot',
      'billing_address_snapshot',
    ]) {
      expect(SUPPLIER_FACING_FORBIDDEN_BUYER_FIELDS).toContain(column);
    }
  });

  it('strips buyer identity at every depth without mutating the input', () => {
    const input = {
      hp: 7.5,
      contact_phone: '+91 98450 12345',
      site: { city: 'Bengaluru', address: '12 Palm Meadows Road' },
      list: [{ email: 'a@b.in', grade: 'H' }],
    };
    const stripped = stripSupplierFacingBuyerIdentity(input);
    expect(stripped).toEqual({ hp: 7.5, site: { city: 'Bengaluru' }, list: [{ grade: 'H' }] });
    expect(input.contact_phone).toBe('+91 98450 12345');
    expect(findSupplierFacingBuyerIdentityLeaks(stripped)).toEqual([]);
  });

  it('leaves the buyer-facing supplier guard unchanged', () => {
    expect(IDENTITY_PROTECTED_FORBIDDEN_FIELDS).toContain('business_name');
    expect(() => assertIdentityProtectedPayloadSafe({ business_name: 'Aqua Prime' })).toThrow();
    expect(() => assertIdentityProtectedPayloadSafe({ anonymousLabel: 'Supplier #01' })).not.toThrow();
  });
});
