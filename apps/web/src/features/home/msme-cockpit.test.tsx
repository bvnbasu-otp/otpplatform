import React from 'react';
import { describe, it, expect } from 'vitest';
import { BuyerSourcingCockpitCard } from './components/BuyerSourcingCockpitCard';

describe('BuyerSourcingCockpitCard (MSME Governance Adaptation)', () => {
  it('instantiates cleanly for MSME Primary role', () => {
    const element = React.createElement(BuyerSourcingCockpitCard, {
      role: 'PRIMARY',
      businessName: 'Apex Precision Engineering Pvt Ltd',
      stats: {
        activeRfqsCount: 4,
        quotesUnderReviewCount: 8,
        pendingApprovalsCount: 2,
        activePosCount: 3,
        draftRfqsCount: 1,
        completedPurchasesCount: 12,
        totalSpendYtd: 4500000,
      },
    });

    expect(element).toBeDefined();
    expect(element.props.role).toBe('PRIMARY');
    expect(element.props.businessName).toBe('Apex Precision Engineering Pvt Ltd');
  });

  it('instantiates cleanly for MSME Operations Manager role', () => {
    const element = React.createElement(BuyerSourcingCockpitCard, {
      role: 'MANAGER',
      businessName: 'Apex Precision Engineering Pvt Ltd',
      stats: {
        activeRfqsCount: 2,
        quotesUnderReviewCount: 3,
        pendingApprovalsCount: 1,
        activePosCount: 2,
        draftRfqsCount: 0,
        completedPurchasesCount: 5,
        totalSpendYtd: 1200000,
      },
    });

    expect(element).toBeDefined();
    expect(element.props.role).toBe('MANAGER');
  });
});
