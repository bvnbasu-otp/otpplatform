import React from 'react';
import { describe, it, expect } from 'vitest';
import { BuyerSourcingCockpitCard } from './components/BuyerSourcingCockpitCard';

describe('BuyerSourcingCockpitCard (MSME Governance Adaptation)', () => {
  it('instantiates cleanly for MSME Primary role', () => {
    const element = React.createElement(BuyerSourcingCockpitCard, {
      orgRole: 'PRIMARY',
      organizationName: 'Apex Precision Engineering Pvt Ltd',
      activeRfqsCount: 4,
      pendingVotesCount: 2,
      settledOrdersCount: 12,
    });

    expect(element).toBeDefined();
    expect(element.props.orgRole).toBe('PRIMARY');
    expect(element.props.organizationName).toBe('Apex Precision Engineering Pvt Ltd');
  });

  it('instantiates cleanly for MSME Operations Manager role', () => {
    const element = React.createElement(BuyerSourcingCockpitCard, {
      orgRole: 'MANAGER',
      organizationName: 'Apex Precision Engineering Pvt Ltd',
      activeRfqsCount: 2,
      pendingVotesCount: 1,
      settledOrdersCount: 5,
    });

    expect(element).toBeDefined();
    expect(element.props.orgRole).toBe('MANAGER');
  });
});
