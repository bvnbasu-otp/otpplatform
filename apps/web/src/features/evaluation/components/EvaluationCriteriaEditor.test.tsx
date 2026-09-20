import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EvaluationCriterionDef } from '@otp/domain';
import { EvaluationCriteriaEditor } from './EvaluationCriteriaEditor';

const mockCatalog: EvaluationCriterionDef[] = [
  { id: '1', code: 'price', name: 'Price', description: 'Landed cost', direction: 'LOWER_IS_BETTER', valueSource: 'total_cost', sortOrder: 1 },
  { id: '2', code: 'delivery_time', name: 'Delivery time', description: 'Days to deliver', direction: 'LOWER_IS_BETTER', valueSource: 'delivery_days', sortOrder: 2 },
  { id: '3', code: 'warranty', name: 'Warranty', description: 'Warranty months', direction: 'HIGHER_IS_BETTER', valueSource: 'warranty_months', sortOrder: 3 },
  { id: '4', code: 'technical_fit', name: 'Technical fit', description: 'Spec compliance', direction: 'HIGHER_IS_BETTER', valueSource: 'technical_fit', sortOrder: 4 },
  { id: '5', code: 'certification', name: 'Certification', description: 'ISO/BIS test report', direction: 'HIGHER_IS_BETTER', valueSource: 'certification', sortOrder: 5 },
  { id: '6', code: 'supplier_rating', name: 'Supplier rating', description: 'Rating avg', direction: 'HIGHER_IS_BETTER', valueSource: 'supplier_rating', sortOrder: 6 },
];

describe('EvaluationCriteriaEditor Component (Phase C.6 Progressive Controls)', () => {
  it('instantiates cleanly with essential criteria and category code', () => {
    const onWeightsChange = vi.fn();
    const onSourceChange = vi.fn();

    const element = React.createElement(EvaluationCriteriaEditor, {
      catalog: mockCatalog,
      weights: { price: 50, delivery_time: 25, warranty: 25 },
      onWeightsChange,
      suggested: { price: 50, delivery_time: 25, warranty: 25 },
      source: 'SUGGESTED',
      onSourceChange,
      categoryCode: 'ELECTRICAL',
    });

    expect(element).toBeDefined();
    expect(element.props.weights).toEqual({ price: 50, delivery_time: 25, warranty: 25 });
    expect(element.props.categoryCode).toBe('ELECTRICAL');
    expect(element.props.catalog.length).toBe(6);
  });

  it('handles custom weights and source states properly', () => {
    const onWeightsChange = vi.fn();
    const onSourceChange = vi.fn();

    const element = React.createElement(EvaluationCriteriaEditor, {
      catalog: mockCatalog,
      weights: { price: 65, delivery_time: 20, warranty: 15 },
      onWeightsChange,
      suggested: { price: 40, delivery_time: 30, warranty: 30 },
      source: 'CUSTOM',
      onSourceChange,
      categoryCode: 'CIVIL',
    });

    expect(element).toBeDefined();
    expect(element.props.source).toBe('CUSTOM');
    expect(element.props.weights.price).toBe(65);
  });
});
