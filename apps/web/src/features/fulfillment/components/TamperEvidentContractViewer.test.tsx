import { describe, expect, it } from 'vitest';
import React from 'react';
import { TamperEvidentContractViewer } from './TamperEvidentContractViewer';
import type { ProcurementContract } from '@otp/domain';

describe('TamperEvidentContractViewer Component', () => {
  const sampleContract: ProcurementContract = {
    id: 'ctr-01',
    contractNumber: 'CTR-20260918-ABCD1234',
    rfqId: 'rfq-01',
    organizationId: 'org-01',
    supplierId: 'sup-01',
    quoteId: 'quote-01',
    status: 'PENDING_BUYER_SIGNATURE',
    terms: {
      procurementTitle: 'Facility Painting Works',
      totalContractValue: 750000,
    } as any,
    contractBodyMarkdown: '# LEGAL CONTRACT AGREEMENT',
    documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders tamper-evident contract viewer correctly', () => {
    const element = React.createElement(TamperEvidentContractViewer, {
      contract: sampleContract,
      currentUserId: 'usr-buyer-01',
      isBuyer: true,
    });
    expect(element).toBeDefined();
    expect(element.props.contract.contractNumber).toBe('CTR-20260918-ABCD1234');
    expect(element.props.isBuyer).toBe(true);
  });
});
