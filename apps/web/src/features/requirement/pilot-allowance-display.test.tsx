import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { evaluatePilotRfqAllowance } from '@otp/domain';
import { PilotAllowanceText, PILOT_ALLOWANCE_PENDING_TEXT } from './components/PilotAllowanceText';
import { RfqPublishConfirmationModal } from './components/RfqPublishConfirmationModal';

describe('Pilot allowance display uses the enforcement source of truth', () => {
  it('renders the exact canonical label from evaluatePilotRfqAllowance', () => {
    const allowance = evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: 1, now: '2026-09-26T10:00:00Z' });
    const html = renderToStaticMarkup(<PilotAllowanceText allowance={allowance} />);
    expect(html).toContain('Pilot Allowance: 2 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)');
  });

  it('shows an honest pending state instead of a guessed number', () => {
    const html = renderToStaticMarkup(<PilotAllowanceText allowance={null} />);
    expect(html).toContain(PILOT_ALLOWANCE_PENDING_TEXT);
    expect(html).not.toMatch(/\d of 3/);
  });

  it('publish confirmation shows the live count, not a hard-coded "1 of 3"', () => {
    const allowance = evaluatePilotRfqAllowance({ rfqsPublishedThisMonth: 3, now: '2026-09-26T10:00:00Z' });
    const html = renderToStaticMarkup(
      <RfqPublishConfirmationModal
        pilotAllowance={allowance}
        isOpen
        onClose={() => {}}
        onConfirm={async () => {}}
        supplierCount={3}
        deadlineDisplay="30 Sep 2026, 18:00 IST"
        requirementTitle="Cement"
        isBusy={false}
      />,
    );
    expect(html).toContain('Pilot Allowance: 0 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)');
    expect(html).not.toContain('1 of 3');
  });

  it('no requirement surface hard-codes an allowance count', () => {
    for (const rel of ['components/RfqPublishConfirmationModal.tsx', 'pages/RequirementDetailPage.tsx', 'pages/RfqReviewPublishPage.tsx']) {
      const src = readFileSync(resolve(__dirname, rel), 'utf8');
      expect(src, rel).not.toMatch(/\d of 3 RFQs remaining/);
    }
  });
});
