import { describe, expect, it } from 'vitest';
import { PIN_ONLY_WARMING_CATEGORY } from '@otp/domain';
import {
  classifySupplierTrust,
  isEligibleRfqInvitationTarget,
  planRfqInvitations,
} from './rfq-invitation-targeting';

const pin = '560048';

describe('RFQ invitation targeting', () => {
  it('keeps the same PIN on different categories and subcategories apart', () => {
    const electrical = {
      categories: ['Electrical & Power', 'Wiring'],
      servicePins: [pin],
    };
    const furniture = {
      categories: ['Office Furniture & Fixtures', 'Office Chairs'],
      servicePins: [pin],
    };
    const wiring = isEligibleRfqInvitationTarget(electrical, {
      category: 'Electrical & Power',
      subcategory: 'Wiring',
      location: { pinCode: pin, city: 'Bengaluru' },
    });
    const chairs = isEligibleRfqInvitationTarget(furniture, {
      category: 'Office Furniture & Fixtures',
      subcategory: 'Office Chairs',
      location: { pinCode: pin, city: 'Bengaluru' },
    });
    const cross = isEligibleRfqInvitationTarget(furniture, {
      category: 'Electrical & Power',
      subcategory: 'Wiring',
      location: { pinCode: pin, city: 'Bengaluru' },
    });

    expect(wiring.eligible).toBe(true);
    expect(chairs.eligible).toBe(true);
    expect(cross).toEqual({ eligible: false, reason: 'subcategory_mismatch' });
  });

  it('selects a supplier only when subcategory and declared coverage match', () => {
    const eligible = isEligibleRfqInvitationTarget(
      {
        capability: {
          categories: ['Office Chairs'],
          serviceArea: { pinCode: pin, city: 'Bengaluru' },
        },
        otpRegistered: true,
      },
      { category: 'Office Furniture', subcategory: 'Office Chairs', location: { pinCode: pin } },
    );
    const otherPin = isEligibleRfqInvitationTarget(
      {
        capability: {
          categories: ['Office Chairs'],
          serviceArea: { pinCode: '600001', city: 'Chennai' },
        },
      },
      { category: 'Office Furniture', subcategory: 'Office Chairs', location: { pinCode: pin, city: 'Bengaluru' } },
    );
    expect(eligible.eligible).toBe(true);
    expect(otherPin).toEqual({ eligible: false, reason: 'coverage_mismatch' });
  });

  it('requires declared service coverage that includes the delivery location', () => {
    const request = {
      category: 'Electrical & Power',
      subcategory: 'Wiring',
      location: { pinCode: pin, city: 'Bengaluru' },
    };
    const taxonomy = { categories: ['Electrical & Power', 'Wiring'] };

    expect(isEligibleRfqInvitationTarget(taxonomy, request)).toEqual({
      eligible: false,
      reason: 'no_declared_coverage',
    });
    expect(
      isEligibleRfqInvitationTarget(
        { ...taxonomy, servicePins: [], serviceCities: [], capability: { serviceArea: { pinCode: ' ', city: '', pins: [] } } },
        request,
      ),
    ).toEqual({ eligible: false, reason: 'no_declared_coverage' });

    expect(isEligibleRfqInvitationTarget({ ...taxonomy, servicePins: [pin] }, request)).toEqual({
      eligible: true,
      reason: 'category_subcategory_and_coverage',
    });
    expect(isEligibleRfqInvitationTarget({ ...taxonomy, serviceCities: ['bengaluru'] }, request).eligible).toBe(true);

    expect(isEligibleRfqInvitationTarget({ ...taxonomy, servicePins: ['600001'], serviceCities: ['Chennai'] }, request)).toEqual({
      eligible: false,
      reason: 'coverage_mismatch',
    });
    expect(
      isEligibleRfqInvitationTarget({ ...taxonomy, servicePins: [pin] }, { ...request, location: null }),
    ).toEqual({ eligible: false, reason: 'coverage_mismatch' });
  });

  it('does not invite from a PIN match, empty taxonomy, or PIN-only warming', () => {
    const request = {
      category: 'Electrical & Power',
      subcategory: 'Wiring',
      location: { pinCode: pin, city: 'Bengaluru' },
    };
    expect(isEligibleRfqInvitationTarget({ servicePins: [pin] }, request).eligible).toBe(false);
    expect(isEligibleRfqInvitationTarget({ categories: [], servicePins: [pin] }, request).reason).toBe(
      'missing_or_pin_only_taxonomy',
    );
    expect(
      isEligibleRfqInvitationTarget(
        { categories: ['Electrical & Power', 'Wiring'], servicePins: [pin] },
        { ...request, category: PIN_ONLY_WARMING_CATEGORY, subcategory: undefined },
      ).reason,
    ).toBe('pin_only_warming_is_not_an_invitation');
    expect(
      isEligibleRfqInvitationTarget(
        { categories: [PIN_ONLY_WARMING_CATEGORY], servicePins: [pin] },
        { category: 'Electrical & Power', location: { pinCode: pin } },
      ).eligible,
    ).toBe(false);
  });

  it('excludes an ineligible category and a cross-tenant supplier', () => {
    expect(
      isEligibleRfqInvitationTarget(
        { categories: ['Plumbing'], servicePins: [pin], tenantId: 'org-buyer' },
        { category: 'Electrical & Power', organizationId: 'org-buyer', location: { pinCode: pin } },
      ).reason,
    ).toBe('category_mismatch');
    expect(
      isEligibleRfqInvitationTarget(
        { categories: ['Electrical & Power'], servicePins: [pin], tenantId: 'org-other' },
        { category: 'Electrical & Power', organizationId: 'org-buyer', location: { pinCode: pin } },
      ).reason,
    ).toBe('cross_tenant');
  });

  it('does not duplicate invitations, respects quota, and does not mark them delivered', () => {
    const first = planRfqInvitations(['sup-a', 'sup-b', 'sup-a'], [], 2);
    expect(first.map((row) => row.supplierKey)).toEqual(['sup-a', 'sup-b']);
    expect(first.every((row) => row.invitationStatus === 'CREATED' && row.deliveryStatus === 'NOT_DISPATCHED')).toBe(true);

    const retry = planRfqInvitations(['sup-a', 'sup-b', 'sup-c'], ['sup-a', 'sup-b'], 5);
    expect(retry).toEqual([
      { supplierKey: 'sup-c', invitationStatus: 'CREATED', deliveryStatus: 'NOT_DISPATCHED' },
    ]);

    expect(planRfqInvitations(['sup-d'], [], 0)).toEqual([]);
  });

  it('keeps external discovery, OTP registration, and GST verification distinct', () => {
    expect(classifySupplierTrust({ categories: ['Wiring'] })).toBe('EXTERNAL_DISCOVERY');
    expect(classifySupplierTrust({ otpRegistered: true, categories: ['Wiring'] })).toBe('OTP_REGISTERED');
    expect(classifySupplierTrust({ gstinVerified: true, otpRegistered: true })).toBe('GST_VERIFIED');
    expect(classifySupplierTrust({ claimedTier: 'DISCOVERED_IN_AREA' })).not.toBe('GST_VERIFIED');
    expect(classifySupplierTrust({ claimedTier: 'OTP_REGISTERED' })).not.toBe('GST_VERIFIED');
  });
});
