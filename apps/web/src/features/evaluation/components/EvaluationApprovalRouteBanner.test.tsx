import React from 'react';
import { describe, expect, it } from 'vitest';
import { EvaluationApprovalRouteBanner } from './EvaluationApprovalRouteBanner';
import type { ApprovalRouteEvaluation } from '@otp/domain';

describe('EvaluationApprovalRouteBanner Component', () => {
  const sampleEvaluation: ApprovalRouteEvaluation = {
    requiredApprovalLevel: 'TIER_2_DEPT_HEAD',
    requiredTierLevels: ['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD'],
    requiredApprovers: 1,
    votingRequired: true,
    quorumRequired: true,
    delegationAllowed: true,
    executiveGate: false,
    policyVersion: 2,
    evaluationReason: 'Procurement amount ₹12,00,000 routes to Tier 2 Dept Head.',
    applicableTiers: [
      {
        tierLevel: 'TIER_1_MANAGER',
        tierName: 'Tier 1: Team Manager',
        minAmount: 0,
        maxAmount: 500000,
        requiredApproverRoles: ['MANAGER'],
        minApproversRequired: 1,
      },
      {
        tierLevel: 'TIER_2_DEPT_HEAD',
        tierName: 'Tier 2: Department Head / VP',
        minAmount: 500000,
        maxAmount: 2500000,
        requiredApproverRoles: ['VP'],
        minApproversRequired: 1,
      },
    ],
    policySnapshot: {
      id: 'pol-01',
      organizationId: 'org-01',
      policyName: 'Test Policy',
      isActive: true,
      tiers: [],
      preventSelfApproval: true,
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    evaluatedAt: new Date().toISOString(),
  };

  it('instantiates cleanly with tier 2 route props', () => {
    const element = React.createElement(EvaluationApprovalRouteBanner, {
      evaluation: sampleEvaluation,
      procurementAmount: 1200000,
    });

    expect(element).toBeDefined();
    expect(element.props.evaluation?.requiredApprovalLevel).toBe('TIER_2_DEPT_HEAD');
    expect(element.props.evaluation?.executiveGate).toBe(false);
    expect(element.props.evaluation?.delegationAllowed).toBe(true);
    expect(element.props.procurementAmount).toBe(1200000);
  });

  it('instantiates with executive gate active for tier 3 routes', () => {
    const execEvaluation: ApprovalRouteEvaluation = {
      ...sampleEvaluation,
      requiredApprovalLevel: 'TIER_3_EXECUTIVE',
      executiveGate: true,
      delegationAllowed: false,
    };

    const element = React.createElement(EvaluationApprovalRouteBanner, {
      evaluation: execEvaluation,
      procurementAmount: 4500000,
    });

    expect(element).toBeDefined();
    expect(element.props.evaluation?.requiredApprovalLevel).toBe('TIER_3_EXECUTIVE');
    expect(element.props.evaluation?.executiveGate).toBe(true);
    expect(element.props.evaluation?.delegationAllowed).toBe(false);
  });
});
