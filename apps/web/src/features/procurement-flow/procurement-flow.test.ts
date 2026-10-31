/**
 * OTP Next — Core Procurement Flows Integration Tests
 * Validates the complete 4-stage pipeline: TELL → REVIEW → DECIDE → TRACK
 */

import { describe, it, expect } from 'vitest';
import { createOtpNextContracts, computeStatutoryTaxes } from '@otp/services';
import type { ActorContext } from '@otp/services';

describe('OTP Next — Core Procurement Flow (TELL → REVIEW → DECIDE → TRACK)', () => {
  const mockClient: any = {
    auth: {
      signInWithOtp: async () => ({ data: { messageId: 'msg_test' }, error: null }),
      verifyOtp: async () => ({
        data: {
          user: { id: 'usr_baskar', email: 'bvnbasu@gmail.com' },
          session: { access_token: 'mock_jwt' },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
      }),
    }),
  };

  const contracts = createOtpNextContracts(mockClient);

  const actorIndividual: ActorContext = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'INDIVIDUAL',
  };

  const actorRwaOfficer: ActorContext = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_MEMBER',
  };

  const actorEstateManager: ActorContext = {
    profileId: 'usr_estate_mgr',
    fullName: 'Estate Manager',
    email: 'estate@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'ESTATE_MANAGER',
  };

  // STAGE 1: TELL
  it('loads 17 categories and creates RFQ draft pre-filling Durga Rainbow 560048', async () => {
    const catRes = await contracts.taxonomyCategories.listAuthoritativeCategories();
    expect(catRes.ok).toBe(true);
    if (!catRes.ok) return;
    expect(catRes.value.length).toBe(17);

    const addrRes = await contracts.addressManagement.listAddresses(actorIndividual);
    expect(addrRes.ok).toBe(true);
    if (!addrRes.ok) return;
    expect(addrRes.value[0]?.pincode).toBe('560048');

    const draftRes = await contracts.rfqLifecycle.createRfqDraft(actorIndividual, {
      title: 'DG Set Annual Maintenance',
      categoryId: 'cat_dg_set_maintenance',
      deliveryAddressId: addrRes.value[0]?.addressId || '',
      items: [
        { itemDescription: 'Routine Filter Replacements', quantity: 2, uom: 'Sets', targetUnitBudget: 22000 },
      ],
    });
    expect(draftRes.ok).toBe(true);
    if (!draftRes.ok) return;
    expect(draftRes.value.status).toBe('DRAFT');
    expect(draftRes.value.items.length).toBe(1);
  });

  // STAGE 2: REVIEW
  it('protects supplier identity with pseudonyms and validates Smart Merit 100% sum', async () => {
    const quotesRes = await contracts.quotationManagement.listQuotesForRfq(actorIndividual, 'rfq_tell_01');
    expect(quotesRes.ok).toBe(true);
    if (!quotesRes.ok) return;
    expect(quotesRes.value[0]?.pseudonymLabel).toMatch(/^Supplier\s+/);

    const validWeights = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
      rfqId: 'rfq_tell_01',
      weights: {
        priceWeightPercentage: 60,
        deliveryWeightPercentage: 20,
        warrantyWeightPercentage: 10,
        ratingWeightPercentage: 10,
      },
    });
    expect(validWeights.ok).toBe(true);

    const invalidWeights = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
      rfqId: 'rfq_tell_01',
      weights: {
        priceWeightPercentage: 50,
        deliveryWeightPercentage: 20,
        warrantyWeightPercentage: 10,
        ratingWeightPercentage: 10, // Sum = 90%
      },
    });
    expect(invalidWeights.ok).toBe(false);
  });

  // STAGE 3: DECIDE
  it('enforces RWA quorum and bars Estate Manager from voting', async () => {
    const tallyRes = await contracts.evaluationVoting.getVotingTally(actorRwaOfficer, 'rfq_tell_01', 'quote_alpha');
    expect(tallyRes.ok).toBe(true);
    if (!tallyRes.ok) return;
    expect(tallyRes.value.quorumReached).toBe(true);

    const estateAttempt = await contracts.evaluationVoting.castVote(actorEstateManager, {
      rfqId: 'rfq_tell_01',
      quoteId: 'quote_alpha',
      decision: 'APPROVE',
    });
    expect(estateAttempt.ok).toBe(false);
  });

  // STAGE 4: TRACK
  it('unmasks verified counterparty coordinates and validates multi-state tax breakdown', async () => {
    const revealRes = await contracts.awardReveal.executeAtomicReveal(actorIndividual, 'award_01');
    expect(revealRes.ok).toBe(true);
    if (!revealRes.ok) return;
    expect(revealRes.value.supplier.businessName).toContain('Apex Industrial Solutions');
    expect(revealRes.value.supplier.gstin).toBe('29AABCU9603R1ZM');

    // Intra-state (KA to KA)
    const intraTax = computeStatutoryTaxes({
      buyerStateCode: '29',
      supplierStateCode: '29',
      baseAmount: 100000,
      gstRatePercentage: 18,
    });
    expect(intraTax.taxRegime).toBe('INTRA_STATE_CGST_SGST');
    expect(intraTax.cgstAmount).toBe(9000);
    expect(intraTax.sgstAmount).toBe(9000);
    expect(intraTax.igstAmount).toBe(0);

    // Inter-state (TN 33 to KA 29)
    const interTax = computeStatutoryTaxes({
      buyerStateCode: '29',
      supplierStateCode: '33',
      baseAmount: 100000,
      gstRatePercentage: 18,
    });
    expect(interTax.taxRegime).toBe('INTER_STATE_IGST');
    expect(interTax.igstAmount).toBe(18000);

    // SEZ Zero-Rated with LUT
    const sezTax = computeStatutoryTaxes({
      buyerStateCode: '29',
      supplierStateCode: '29',
      isSezUnit: true,
      lutReferenceNumber: 'LUT-2026-SEZ',
      baseAmount: 100000,
    });
    expect(sezTax.taxRegime).toBe('SEZ_ZERO_RATED');
    expect(sezTax.totalTaxAmount).toBe(0);
    expect(sezTax.totalLandedCost).toBe(100000);
  });
});
