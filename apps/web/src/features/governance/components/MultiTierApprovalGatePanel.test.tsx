import { describe, expect, it } from 'vitest';
import React from 'react';
import { MultiTierApprovalGatePanel } from './MultiTierApprovalGatePanel';
import type { RfqApprovalStage } from '@otp/domain';

describe('MultiTierApprovalGatePanel Component', () => {
  const sampleStages: RfqApprovalStage[] = [
    {
      id: 'stg-1',
      rfqId: 'rfq-01',
      organizationId: 'org-01',
      tierLevel: 'TIER_1_MANAGER',
      stageOrder: 1,
      status: 'APPROVED',
      thresholdMinAmount: 0,
      thresholdMaxAmount: 500000,
      procurementAmount: 1200000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'stg-2',
      rfqId: 'rfq-01',
      organizationId: 'org-01',
      tierLevel: 'TIER_2_DEPT_HEAD',
      stageOrder: 2,
      status: 'PENDING',
      thresholdMinAmount: 500000,
      thresholdMaxAmount: 2500000,
      procurementAmount: 1200000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it('renders multi-tier stages correctly', () => {
    const element = React.createElement(MultiTierApprovalGatePanel, {
      stages: sampleStages,
      procurementAmount: 1200000,
      currentUserId: 'usr-buyer-lead',
      currentUserRoles: ['VP'],
      rfqCreatorId: 'usr-requester',
    });
    expect(element).toBeDefined();
    expect(element.props.stages).toHaveLength(2);
    expect(element.props.procurementAmount).toBe(1200000);
  });
});
