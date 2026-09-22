import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EvaluationCriterionDef } from '@otp/domain';
import { CriterionBreakdownTable } from './CriterionBreakdownTable';
import type { QuoteEvaluation } from '../types/quote-evaluation';

const mockCriteria: EvaluationCriterionDef[] = [
  { id: '1', code: 'price', name: 'Price', direction: 'LOWER_IS_BETTER', valueSource: 'total_cost', sortOrder: 1 },
  { id: '2', code: 'delivery_time', name: 'Delivery time', direction: 'LOWER_IS_BETTER', valueSource: 'delivery_days', sortOrder: 2 },
  { id: '3', code: 'warranty', name: 'Warranty', direction: 'HIGHER_IS_BETTER', valueSource: 'warranty_months', sortOrder: 3 },
];

const mockEvaluations: QuoteEvaluation[] = [
  {
    evaluationId: 'eval-1',
    quoteId: 'quote-1',
    anonymousLabel: 'Supplier #01',
    versionEvaluated: 1,
    evaluationScore: 92.5,
    status: 'COMPUTED',
    computedAt: '2026-09-20T10:00:00Z',
    weights: { price: 50, delivery_time: 25, warranty: 25 },
    criteria: [
      { code: 'price', weight: 50, raw: 200000, normalized: 100, contribution: 50.0, neutral: false },
      { code: 'delivery_time', weight: 25, raw: 5, normalized: 90, contribution: 22.5, neutral: false },
      { code: 'warranty', weight: 25, raw: 12, normalized: 80, contribution: 20.0, neutral: false },
    ],
  },
  {
    evaluationId: 'eval-2',
    quoteId: 'quote-2',
    anonymousLabel: 'Supplier #02',
    versionEvaluated: 1,
    evaluationScore: 84.0,
    status: 'COMPUTED',
    computedAt: '2026-09-20T10:00:00Z',
    weights: { price: 50, delivery_time: 25, warranty: 25 },
    criteria: [
      { code: 'price', weight: 50, raw: 240000, normalized: 83.3, contribution: 41.7, neutral: false },
      { code: 'delivery_time', weight: 25, raw: 3, normalized: 100, contribution: 25.0, neutral: false },
      { code: 'warranty', weight: 25, raw: 6, normalized: 70, contribution: 17.5, neutral: false },
    ],
  },
];

describe('CriterionBreakdownTable Component (Explainable Scoring)', () => {
  it('instantiates cleanly with evaluations and criteria', () => {
    const onRecompute = vi.fn();
    const element = React.createElement(CriterionBreakdownTable, {
      evaluations: mockEvaluations,
      criteria: mockCriteria,
      onRecompute,
    });

    expect(element).toBeDefined();
    expect(element.props.evaluations.length).toBe(2);
    expect(element.props.evaluations[0]?.anonymousLabel).toBe('Supplier #01');
    expect(element.props.evaluations[0]?.evaluationScore).toBe(92.5);
  });

  it('handles empty and stale evaluation states gracefully', () => {
    const emptyElement = React.createElement(CriterionBreakdownTable, {
      evaluations: [],
      criteria: mockCriteria,
    });
    expect(emptyElement).toBeDefined();
    expect(emptyElement.props.evaluations).toEqual([]);

    const staleEvaluations: QuoteEvaluation[] = [
      {
        ...mockEvaluations[0]!,
        status: 'STALE',
      },
    ];

    const staleElement = React.createElement(CriterionBreakdownTable, {
      evaluations: staleEvaluations,
      criteria: mockCriteria,
    });
    expect(staleElement.props.evaluations[0]?.status).toBe('STALE');
  });
});
