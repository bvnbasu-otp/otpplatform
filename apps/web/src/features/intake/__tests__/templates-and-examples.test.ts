import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  TemplatesAndExamplesModal,
  CANONICAL_TEMPLATES,
  CANONICAL_EXAMPLES,
} from '../components/TemplatesAndExamplesModal';

describe('TemplatesAndExamplesModal & Buyer Confirmation Authority Suite', () => {
  it('exports component and canonical templates/examples', () => {
    expect(TemplatesAndExamplesModal).toBeDefined();
    expect(CANONICAL_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(CANONICAL_EXAMPLES.length).toBeGreaterThanOrEqual(3);
  });

  describe('Canonical Templates Data Model', () => {
    it('verifies every template contains required fields and non-locked defaults', () => {
      for (const tmpl of CANONICAL_TEMPLATES) {
        expect(tmpl.id).toBeDefined();
        expect(tmpl.title.length).toBeGreaterThan(10);
        expect(tmpl.category).toBeDefined();
        expect(tmpl.subcategory).toBeDefined();
        expect(['BUY', 'SERVICE', 'REPAIR', 'RATE_CONTRACT']).toContain(tmpl.mode);
        expect(tmpl.defaultUnit).toBeDefined();
        expect(typeof tmpl.suggestedQuantity).toBe('number');
        expect(Object.keys(tmpl.specifications).length).toBeGreaterThan(0);
      }
    });

    it('ensures no template contains sealed or prohibited terminology', () => {
      const serialized = JSON.stringify(CANONICAL_TEMPLATES).toLowerCase();
      expect(serialized).not.toContain('bid');
      expect(serialized).not.toContain('bidder');
      expect(serialized).not.toContain('bidding');
      expect(serialized).not.toContain('blind');
    });
  });

  describe('Canonical Examples Data Model', () => {
    it('verifies real-world case studies have verified benchmarks and takeaways', () => {
      for (const ex of CANONICAL_EXAMPLES) {
        expect(ex.id).toBeDefined();
        expect(ex.title.length).toBeGreaterThan(10);
        expect(ex.location).toBeDefined();
        expect(ex.benchmarkPriceRange).toContain('₹');
        expect(ex.turnaroundDays).toBeGreaterThan(0);
        expect(ex.keyTakeaway.length).toBeGreaterThan(20);
      }
    });
  });

  describe('Modal Component Instantiation', () => {
    it('instantiates React element without errors', () => {
      const element = React.createElement(TemplatesAndExamplesModal, {
        isOpen: true,
        onClose: vi.fn(),
        onSelectTemplate: vi.fn(),
      });
      expect(element).toBeDefined();
      expect(element.type).toBe(TemplatesAndExamplesModal);
    });
  });
});
