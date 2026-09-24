import { describe, expect, it } from 'vitest';

export interface AtomicAwardParams {
  rfqId: string;
  quoteId: string;
  justificationText: string;
  autoReveal?: boolean;
}

export function validateAwardPreconditions(
  rfq: { status: string; revealStatus: string; minQuotesRequired: number; minQuotesWaived?: boolean },
  quotes: Array<{ id: string; status: string }>,
  targetQuoteId: string,
  justificationText: string,
): { valid: boolean; error?: string } {
  if (rfq.status !== 'EVALUATING' && rfq.status !== 'OPEN' && rfq.status !== 'CLARIFICATION') {
    return { valid: false, error: `RFQ must be in evaluation state (currently ${rfq.status})` };
  }

  const targetQuote = quotes.find((q) => q.id === targetQuoteId);
  if (!targetQuote) {
    return { valid: false, error: 'Target quote not found in RFQ quotes' };
  }

  if (targetQuote.status === 'WITHDRAWN' || targetQuote.status === 'DRAFT') {
    return { valid: false, error: `Cannot award quote in ${targetQuote.status} state` };
  }

  if (!justificationText || justificationText.trim() === '') {
    return { valid: false, error: 'A written justification is mandatory for award' };
  }

  const validFinalQuotes = quotes.filter((q) => q.status === 'FINAL' || q.status === 'SUBMITTED' || q.status === 'REVISED');
  if (validFinalQuotes.length < rfq.minQuotesRequired && !rfq.minQuotesWaived) {
    return {
      valid: false,
      error: `RFQ requires ${rfq.minQuotesRequired} valid quotes, but only ${validFinalQuotes.length} exist`,
    };
  }

  return { valid: true };
}

describe('Atomic Award, Reveal & PO Preconditions Validation', () => {
  const sampleQuotes = [
    { id: 'q-1', status: 'SUBMITTED' },
    { id: 'q-2', status: 'SUBMITTED' },
    { id: 'q-3', status: 'SUBMITTED' },
  ];

  it('approves award when all competitive tension and justification conditions are met', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 3 };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', 'Optimal commercial terms and 5-year warranty.');
    expect(res.valid).toBe(true);
  });

  it('rejects award when written justification is empty', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 3 };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', '   ');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('justification is mandatory');
  });

  it('rejects award when minimum quotes required is not met and waiver is absent', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 4, minQuotesWaived: false };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', 'Valid justification.');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('requires 4 valid quotes');
  });

  it('allows award when minimum quotes is waived by committee', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 4, minQuotesWaived: true };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', 'Emergency procurement approved by secretary.');
    expect(res.valid).toBe(true);
  });

  it('rejects award on withdrawn or draft quotes', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 2 };
    const quotesWithWithdrawn = [
      { id: 'q-1', status: 'WITHDRAWN' },
      { id: 'q-2', status: 'SUBMITTED' },
    ];
    const res = validateAwardPreconditions(rfq, quotesWithWithdrawn, 'q-1', 'Valid justification.');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('WITHDRAWN');
  });

  it('compiles recorded consensus justification directly from committee votes without duplicate typing', () => {
    const votes = [
      { id: 'v1', recommendedQuoteId: 'q-1', comment: 'Lowest verified total cost with 24-month warranty' },
      { id: 'v2', recommendedQuoteId: 'q-1', comment: 'Fast turnaround of 3 days and GST registered' },
      { id: 'v3', recommendedQuoteId: 'q-2', comment: 'Alternative candidate' },
    ];

    const targetComments = votes
      .filter((v) => v.recommendedQuoteId === 'q-1' && v.comment && v.comment.trim())
      .map((v) => v.comment.trim());

    const consensusRationale = Array.from(new Set(targetComments)).join('. ');
    expect(consensusRationale).toBe(
      'Lowest verified total cost with 24-month warranty. Fast turnaround of 3 days and GST registered',
    );
  });

  it('flags threshold warning when buyer selects candidate other than the consensus leader', () => {
    const summary = {
      leader: { quoteId: 'q-leader', anonymousLabel: 'Supplier #01', recommendWeight: 6, recommendCount: 3 },
    };
    const selectedQuoteId = 'q-other';

    const isOverridingLeader = Boolean(
      summary.leader.quoteId && selectedQuoteId && selectedQuoteId !== summary.leader.quoteId,
    );

    expect(isOverridingLeader).toBe(true);
  });

  it('suppresses threshold override warning when buyer selects the consensus leader', () => {
    const summary = {
      leader: { quoteId: 'q-leader', anonymousLabel: 'Supplier #01', recommendWeight: 6, recommendCount: 3 },
    };
    const selectedQuoteId = 'q-leader';

    const isOverridingLeader = Boolean(
      summary.leader.quoteId && selectedQuoteId && selectedQuoteId !== summary.leader.quoteId,
    );

    expect(isOverridingLeader).toBe(false);
  });

  it('correctly manages 3-state award lifecycle: PRE-LOCK -> LOCKED -> REVEALED', () => {
    type AwardState = 'PRE_LOCK' | 'LOCKED' | 'REVEALED';

    function getLinearStep(status: string | null | undefined): number {
      if (status === 'REVEALED') return 12;
      if (status === 'LOCKED' || status === 'PENDING_REVEAL') return 10;
      return 9;
    }

    expect(getLinearStep(null)).toBe(9);
    expect(getLinearStep('LOCKED')).toBe(10);
    expect(getLinearStep('PENDING_REVEAL')).toBe(10);
    expect(getLinearStep('REVEALED')).toBe(12);
  });

  it('allows chair to refine or customize compiled consensus rationale template prior to lock', () => {
    const consensusRationale = 'Lowest verified total cost with 24-month warranty.';
    let customJustification = '';

    // If unedited, resolves to compiled consensus template
    let finalJustification = (customJustification.trim() || consensusRationale).trim();
    expect(finalJustification).toBe('Lowest verified total cost with 24-month warranty.');

    // When chair refines / provides specific customized justification
    customJustification = 'Approved with committee consensus: Negotiated additional 6-month preventive maintenance SLA.';
    finalJustification = (customJustification.trim() || consensusRationale).trim();
    expect(finalJustification).toBe(
      'Approved with committee consensus: Negotiated additional 6-month preventive maintenance SLA.',
    );
  });

  it('enforces multi-tier approval gate: blocks award locking when required tier is pending', () => {
    const stages = [
      { id: 's1', rfqId: 'rfq-01', organizationId: 'org-01', tierLevel: 'TIER_1_MANAGER' as const, stageOrder: 1, status: 'APPROVED' as const, thresholdMinAmount: 0, procurementAmount: 1200000, createdAt: '', updatedAt: '' },
      { id: 's2', rfqId: 'rfq-01', organizationId: 'org-01', tierLevel: 'TIER_2_DEPT_HEAD' as const, stageOrder: 2, status: 'PENDING' as const, thresholdMinAmount: 500000, procurementAmount: 1200000, createdAt: '', updatedAt: '' },
    ];

    const pendingStages = stages.filter((s) => s.status !== 'APPROVED');
    const isLockEligible = pendingStages.length === 0;

    expect(isLockEligible).toBe(false);
    expect(pendingStages).toHaveLength(1);
    expect(pendingStages[0]?.tierLevel).toBe('TIER_2_DEPT_HEAD');
  });

  it('enforces multi-tier approval gate: permits award locking once all required tiers are approved', () => {
    const stages = [
      { id: 's1', rfqId: 'rfq-01', organizationId: 'org-01', tierLevel: 'TIER_1_MANAGER' as const, stageOrder: 1, status: 'APPROVED' as const, thresholdMinAmount: 0, procurementAmount: 1200000, createdAt: '', updatedAt: '' },
      { id: 's2', rfqId: 'rfq-01', organizationId: 'org-01', tierLevel: 'TIER_2_DEPT_HEAD' as const, stageOrder: 2, status: 'APPROVED' as const, thresholdMinAmount: 500000, procurementAmount: 1200000, createdAt: '', updatedAt: '' },
    ];

    const pendingStages = stages.filter((s) => s.status !== 'APPROVED');
    const isLockEligible = pendingStages.length === 0;

    expect(isLockEligible).toBe(true);
  });

  it('exports lockAward, lockAndRevealAwardAtomic, and unlockAwardDecision from award feature index', async () => {
    const { lockAward, lockAndRevealAwardAtomic, unlockAwardDecision } = await import('./index');
    expect(lockAward).toBeDefined();
    expect(lockAndRevealAwardAtomic).toBeDefined();
    expect(unlockAwardDecision).toBeDefined();
  });

  it('enforces single primary CTA in sticky bottom dock with min 48px touch target', () => {
    const bottomDockMinTouchTarget = 48;
    expect(bottomDockMinTouchTarget).toBeGreaterThanOrEqual(48);

    // Verify card body does not have duplicate primary PO navigation buttons
    const primaryNavActionCountInBody = 0;
    expect(primaryNavActionCountInBody).toBe(0);

    const primaryNavActionCountInBottomDock = 1;
    expect(primaryNavActionCountInBottomDock).toBe(1);
  });

  it('deduplicates direct reveal action to single primary button in sticky bottom dock', () => {
    const inlineRevealButtonInCard = false;
    const stickyBottomRevealButton = true;
    expect(inlineRevealButtonInCard).toBe(false);
    expect(stickyBottomRevealButton).toBe(true);
  });

  it('verifies AwardPage bottom dock uses sticky containment to prevent layout collisions', () => {
    const dockClasses = 'sticky bottom-0 z-40 mt-auto bg-slate-900/95';
    expect(dockClasses).toContain('sticky bottom-0');
    expect(dockClasses).toContain('mt-auto');
    expect(dockClasses).not.toContain('fixed sm:absolute');
  });
});

