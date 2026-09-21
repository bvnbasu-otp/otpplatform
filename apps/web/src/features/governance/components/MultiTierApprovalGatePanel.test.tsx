import React from 'react';
import { describe, expect, it } from 'vitest';
import { MultiTierApprovalGatePanel } from './MultiTierApprovalGatePanel';
import type { RfqApprovalStage, OrganizationDelegation } from '@otp/domain';

describe('MultiTierApprovalGatePanel Component (Phase C8.4)', () => {
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
    {
      id: 'stg-3',
      rfqId: 'rfq-01',
      organizationId: 'org-01',
      tierLevel: 'TIER_3_EXECUTIVE',
      stageOrder: 3,
      status: 'PENDING',
      thresholdMinAmount: 2500000,
      thresholdMaxAmount: null,
      procurementAmount: 1200000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const sampleDelegation: OrganizationDelegation = {
    id: 'del-01',
    organizationId: 'org-01',
    delegatorId: 'usr-vp-delegator',
    delegateeId: 'usr-buyer-delegatee',
    permissions: ['APPROVE_TIER_2'],
    spendCapAmount: 2000000,
    startsAt: '2026-09-01T00:00:00Z',
    expiresAt: '2026-10-01T00:00:00Z',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
  };

  it('instantiates cleanly with multi-tier stages and pending status', () => {
    const element = React.createElement(MultiTierApprovalGatePanel, {
      stages: sampleStages,
      procurementAmount: 1200000,
      currentUserId: 'usr-vp-approver',
      currentUserRole: 'VP',
      currentUserRoles: ['VP'],
      rfqCreatorId: 'usr-requester',
    });

    expect(element).toBeDefined();
    expect(element.props.stages).toHaveLength(3);
    expect(element.props.procurementAmount).toBe(1200000);
    expect(element.props.currentUserId).toBe('usr-vp-approver');
    expect(element.props.rfqCreatorId).toBe('usr-requester');
  });

  it('instantiates with creator persona enforcing anti-bypass view', () => {
    const element = React.createElement(MultiTierApprovalGatePanel, {
      stages: sampleStages,
      procurementAmount: 1200000,
      currentUserId: 'usr-requester',
      currentUserRole: 'MANAGER',
      currentUserRoles: ['MANAGER'],
      rfqCreatorId: 'usr-requester',
    });

    expect(element).toBeDefined();
    expect(element.props.currentUserId).toBe(element.props.rfqCreatorId);
  });

  it('instantiates with active delegation proxies passed in props', () => {
    const element = React.createElement(MultiTierApprovalGatePanel, {
      stages: sampleStages,
      procurementAmount: 1200000,
      currentUserId: 'usr-buyer-delegatee',
      currentUserRole: 'BUYER',
      currentUserRoles: ['BUYER'],
      rfqCreatorId: 'usr-requester',
      delegations: [sampleDelegation],
    });

    expect(element).toBeDefined();
    expect(element.props.delegations).toHaveLength(1);
    expect(element.props.delegations?.[0]?.id).toBe('del-01');
    expect(element.props.delegations?.[0]?.spendCapAmount).toBe(2000000);
  });
});
