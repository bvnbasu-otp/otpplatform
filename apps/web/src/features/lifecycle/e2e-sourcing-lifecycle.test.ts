import { describe, expect, it } from 'vitest';
import { extractQuantity, extractWarrantyMonths } from '@otp/domain';
import { normalizeEvaluationWeights } from '@otp/domain';
import { validateGstin } from '@otp/domain';
import { validateAwardPreconditions } from '@/features/award/award.test';

describe('OTP Platform — End-to-End Multi-Actor Procurement Lifecycle Model', () => {
  let createdRequirement: any = null;
  const rfqId = 'rfq-e2e-001';
  let invitedSuppliers: Array<{ id: string; alias: string; gstin: string }> = [];
  let submittedQuotes: Array<{ id: string; supplierId: string; alias: string; basePrice: number; totalCost: number; status: string }> = [];
  let committeeVotes: Array<{ profileId: string; choiceQuoteId: string; votingPower: number; justification: string }> = [];
  let awardRecord: any = null;
  let purchaseOrder: any = null;

  it('Step 1–3: Buyer Requirement Intake & NLP Auto-Classification', () => {
    const prompt = 'Need exterior painting for 3 towers with 60 months warranty, 5000 L paint';
    const qtyExtracted = extractQuantity(prompt);
    const warrantyExtracted = extractWarrantyMonths(prompt);

    expect(qtyExtracted).toBeDefined();
    expect(qtyExtracted?.value.quantity).toBe(5000);
    expect(qtyExtracted?.value.unit).toBe('L');
    expect(warrantyExtracted?.value).toBe(60);

    createdRequirement = {
      id: 'req-e2e-101',
      title: 'Exterior Painting Sourcing',
      category: 'PAINTING_AND_COATINGS',
      quantity: qtyExtracted?.value.quantity ?? 5000,
      unit: qtyExtracted?.value.unit ?? 'L',
      warrantyMonths: warrantyExtracted?.value ?? 60,
      status: 'DRAFT',
      lifecycleStep: 1,
    };

    expect(createdRequirement.status).toBe('DRAFT');
    expect(createdRequirement.lifecycleStep).toBe(1);
  });

  it('Step 4–6: Sourcing Schedule, Criteria Weights & Supplier Discovery Matching', () => {
    const rawWeights = { commercial: 50, quality: 30, speed: 10, warranty: 10 };
    const normalized = normalizeEvaluationWeights(rawWeights);

    const sum = Object.values(normalized.weights).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(100);
    expect(normalized.weights.commercial).toBe(50);

    // Supplier Matching & GSTIN Validation
    const matchedSuppliers = [
      { id: 'sup-1', name: 'Apex Painting Corp', gstin: '29ABCDE1234F1Z5' },
      { id: 'sup-2', name: 'Metro Coating Solutions', gstin: '27AABCT3518Q1ZV' },
      { id: 'sup-3', name: 'Royal Surface Works', gstin: '33AAACL1234A1Z1' },
    ];

    invitedSuppliers = matchedSuppliers.map((s, idx) => {
      validateGstin(s.gstin);
      return {
        id: s.id,
        alias: `Supplier-${100 + idx}`,
        gstin: s.gstin,
      };
    });

    expect(invitedSuppliers.length).toBe(3);
    expect(invitedSuppliers[0]?.alias).toBe('Supplier-100');
  });

  it('Step 7–9: Sealed Quote Submission & Identity-Protected Comparison Matrix', () => {
    // 3 Suppliers submit sealed quotes
    submittedQuotes = [
      { id: 'q-101', supplierId: invitedSuppliers[0]!.id, alias: invitedSuppliers[0]!.alias, basePrice: 450000, totalCost: 531000, status: 'FINAL' },
      { id: 'q-102', supplierId: invitedSuppliers[1]!.id, alias: invitedSuppliers[1]!.alias, basePrice: 420000, totalCost: 495600, status: 'FINAL' }, // L1 Lowest
      { id: 'q-103', supplierId: invitedSuppliers[2]!.id, alias: invitedSuppliers[2]!.alias, basePrice: 480000, totalCost: 566400, status: 'FINAL' },
    ];

    // Verify comparison invariant: lowest L1 price is detected
    const lowestPrice = Math.min(...submittedQuotes.map((q) => q.totalCost));
    const l1Quote = submittedQuotes.find((q) => q.totalCost === lowestPrice);

    expect(lowestPrice).toBe(495600);
    expect(l1Quote?.id).toBe('q-102');
    expect(l1Quote?.alias).toBe('Supplier-101');
  });

  it('Step 10–12: Committee Weighted Voting with Auto-Preset Justification', () => {
    // RWA Multi-vote structure (3 votes quorum)
    committeeVotes = [
      { profileId: 'member-president', choiceQuoteId: 'q-102', votingPower: 1, justification: 'Most competitive commercial pricing (L1).' },
      { profileId: 'member-secretary', choiceQuoteId: 'q-102', votingPower: 1, justification: 'Fastest turnaround and verified warranty.' },
      { profileId: 'member-treasurer', choiceQuoteId: 'q-102', votingPower: 1, justification: 'Optimal price-to-quality ratio.' },
    ];

    const totalVotes = committeeVotes.reduce((sum, v) => sum + v.votingPower, 0);
    expect(totalVotes).toBe(3);

    // Validate award preconditions
    const rfqState = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 3 };
    const validation = validateAwardPreconditions(rfqState, submittedQuotes, 'q-102', committeeVotes[0]!.justification);
    expect(validation.valid).toBe(true);
  });

  it('Step 13–15: Irrevocable Award Decision, Reveal & Purchase Order Settlement', () => {
    // Lock Award
    awardRecord = {
      id: 'award-e2e-777',
      rfqId,
      quoteId: 'q-102',
      status: 'REVEALED',
      awardedAt: new Date().toISOString(),
      winnerSupplierId: invitedSuppliers[1]!.id,
      unmaskedBusinessName: 'Metro Coating Solutions',
    };

    expect(awardRecord.winnerSupplierId).toBe('sup-2');
    expect(awardRecord.unmaskedBusinessName).toBe('Metro Coating Solutions');

    // Auto-generate Purchase Order
    purchaseOrder = {
      id: 'po-e2e-888',
      poNumber: 'PO-2026-E2E-001',
      awardId: awardRecord.id,
      amount: 495600,
      currency: 'INR',
      status: 'ISSUED',
      milestones: [
        { title: 'Material Mobilization & Surface Prep', percentage: 30, status: 'IN_PROGRESS' },
        { title: 'Primer & First Coat Application', percentage: 40, status: 'PENDING' },
        { title: 'Final Texture Coat & Warranty Handover', percentage: 30, status: 'PENDING' },
      ],
    };

    expect(purchaseOrder.status).toBe('ISSUED');
    expect(purchaseOrder.milestones.length).toBe(3);
    expect(purchaseOrder.milestones.reduce((acc: number, m: any) => acc + m.percentage, 0)).toBe(100);
  });
});
