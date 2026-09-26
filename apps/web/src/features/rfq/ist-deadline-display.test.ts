import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FEATURES = resolve(__dirname, '..');

describe('quote deadlines and governance timestamps render in IST (issue 19)', () => {
  it.each([
    ['rfq/components/ActiveRfqHeaderBanner.tsx', 'formatDateTimeIST(rfq.quoteDeadline)'],
    ['rfq/components/ActiveRfqExtendDeadlineModal.tsx', 'formatDateTimeIST(selectedDeadline)'],
    ['requirement/pages/RfqReviewPublishPage.tsx', 'formatDateTimeIST(currentDeadline || rfq.quoteDeadline)'],
    ['requirement/api/rfq-lifecycle.ts', 'formatDateIST(deadlineDate)'],
    ['governance/components/WeightedTallyTable.tsx', 'formatDateTimeIST(summary.votesLockedAt)'],
    ['governance/components/MultiTierApprovalGatePanel.tsx', 'formatDateIST(stage.approvedAt)'],
    ['fulfillment/components/DisputeResolutionDrawer.tsx', 'formatDateTimeIST(data.sla_deadline)'],
    ['fulfillment/components/TamperEvidentContractViewer.tsx', 'formatDateIST(contract.supplierSignedAt)'],
  ])('%s uses %s', (rel, call) => {
    const src = readFileSync(resolve(FEATURES, rel), 'utf8');
    expect(src).toContain(call);
    expect(src).not.toMatch(/\.(toLocaleDateString|toLocaleTimeString)\(|Date\([^)]*\)\.toLocaleString\(/);
  });
});
