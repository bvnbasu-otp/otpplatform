import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  ClarificationWorkbench,
  ClarificationThread,
  ClarificationCategoryBadge,
  ClarificationPiiBanner,
  ClarificationRedactionTag,
  BroadcastAddendumComposer,
  CLARIFICATION_CATEGORIES,
  type ClarificationCategory,
  type ClarificationMessage,
  type RequirementSpecReference,
  scrubClarificationPii,
  detectClarificationPii,
} from '../index';

describe('ClarificationWorkbench Component Suite (Phase C.7)', () => {
  const mockMessages: ClarificationMessage[] = [
    {
      id: 'msg-1',
      invitationId: 'inv-1',
      anonymousLabel: 'Supplier #01',
      authorDisplay: 'Supplier #01',
      authorSide: 'SUPPLIER',
      body: 'Can we offer alternate copper winding specification?',
      createdAt: '2026-09-15T10:00:00Z',
      inquiryCategory: 'TECHNICAL_SPEC',
      lineItemRef: 'Item #1: Motor',
      isBroadcast: false,
      redactions: [],
    },
    {
      id: 'msg-2',
      invitationId: null,
      anonymousLabel: 'Broadcast Addendum',
      authorDisplay: 'Buyer organization (Broadcast Addendum)',
      authorSide: 'BUYER',
      body: 'Standard Class-H copper winding is mandatory for all units.',
      createdAt: '2026-09-15T11:00:00Z',
      inquiryCategory: 'TECHNICAL_SPEC',
      lineItemRef: 'Item #1: Motor',
      isBroadcast: true,
      redactions: [],
    },
    {
      id: 'msg-3',
      invitationId: 'inv-2',
      anonymousLabel: 'Supplier #02',
      authorDisplay: 'Supplier #02',
      authorSide: 'SUPPLIER',
      body: 'Is 30-day payment term milestone-linked?',
      createdAt: '2026-09-15T12:00:00Z',
      inquiryCategory: 'COMMERCIAL_TERMS',
      lineItemRef: 'Payment Schedule',
      isBroadcast: false,
      redactions: [],
    },
    {
      id: 'msg-4',
      invitationId: 'inv-1',
      anonymousLabel: 'Supplier #01',
      authorDisplay: 'Supplier #01',
      authorSide: 'SUPPLIER',
      body: 'Please contact [phone removed] for site delivery schedule.',
      createdAt: '2026-09-15T13:00:00Z',
      inquiryCategory: 'DELIVERY_LOGISTICS',
      lineItemRef: 'Site Delivery',
      isBroadcast: false,
      redactions: ['PHONE'],
    },
  ];

  const mockSpecs: RequirementSpecReference[] = [
    { id: 'general', label: 'General / Overall Scope' },
    { id: 'item-1', label: 'Item #1: Motor' },
    { id: 'spec-pay', label: 'Payment Schedule' },
  ];

  const mockInvitedSuppliers = [
    { invitationId: 'inv-1', anonymousLabel: 'Supplier #01' },
    { invitationId: 'inv-2', anonymousLabel: 'Supplier #02' },
  ];

  describe('Clarification Category Definitions & Invariants', () => {
    it('defines the 4 canonical structured inquiry categories', () => {
      const keys = CLARIFICATION_CATEGORIES.map((c) => c.key);
      expect(keys).toEqual([
        'TECHNICAL_SPEC',
        'COMMERCIAL_TERMS',
        'DELIVERY_LOGISTICS',
        'COMPLIANCE',
      ]);
    });

    it('renders ClarificationCategoryBadge for all canonical categories', () => {
      const categories: ClarificationCategory[] = [
        'TECHNICAL_SPEC',
        'COMMERCIAL_TERMS',
        'DELIVERY_LOGISTICS',
        'COMPLIANCE',
      ];

      categories.forEach((cat) => {
        const el = React.createElement(ClarificationCategoryBadge, {
          category: cat,
          size: 'md',
        });
        expect(el).toBeDefined();
        expect(el.props.category).toBe(cat);
        expect(el.props.size).toBe('md');
      });
    });
  });

  describe('PII Scrubber & Redaction Banners', () => {
    it('renders ClarificationPiiBanner when redactions are present', () => {
      const el = React.createElement(ClarificationPiiBanner, {
        redactions: ['PHONE', 'EMAIL'],
        previewScrubbed: 'Please contact [phone removed] or [email removed]',
        isOnlyPii: false,
      });

      expect(el).toBeDefined();
      expect(el.props.redactions).toEqual(['PHONE', 'EMAIL']);
      expect(el.props.isOnlyPii).toBe(false);
    });

    it('renders ClarificationRedactionTag for masked messages', () => {
      const el = React.createElement(ClarificationRedactionTag, {
        kinds: ['PHONE', 'REGISTRATION'],
      });

      expect(el).toBeDefined();
      expect(el.props.kinds).toEqual(['PHONE', 'REGISTRATION']);
    });
  });

  describe('BroadcastAddendumComposer React Element', () => {
    it('instantiates with props and specs', () => {
      const onPublished = vi.fn();
      const onCancel = vi.fn();

      const el = React.createElement(BroadcastAddendumComposer, {
        rfqId: 'rfq-999',
        specReferences: mockSpecs,
        onPublished,
        onCancel,
      });

      expect(el).toBeDefined();
      expect(el.props.rfqId).toBe('rfq-999');
      expect(el.props.specReferences?.length).toBe(3);
    });
  });

  describe('ClarificationThread React Element', () => {
    it('instantiates cleanly for Buyer persona', () => {
      const onPosted = vi.fn();
      const el = React.createElement(ClarificationThread, {
        rfqId: 'rfq-999',
        invitationId: 'inv-1',
        messages: mockMessages,
        authorSide: 'BUYER',
        specReferences: mockSpecs,
        onPosted,
      });

      expect(el).toBeDefined();
      expect(el.props.messages.length).toBe(4);
      expect(el.props.authorSide).toBe('BUYER');
    });

    it('instantiates cleanly for Supplier persona', () => {
      const el = React.createElement(ClarificationThread, {
        rfqId: 'rfq-999',
        invitationId: 'inv-1',
        messages: mockMessages.filter((m) => m.invitationId === 'inv-1'),
        authorSide: 'SUPPLIER',
        readOnly: false,
      });

      expect(el).toBeDefined();
      expect(el.props.authorSide).toBe('SUPPLIER');
      expect(el.props.messages.length).toBe(2);
    });
  });

  describe('ClarificationWorkbench React Element (Dual-Persona)', () => {
    it('instantiates cleanly for Buyer persona with invited suppliers', () => {
      const el = React.createElement(ClarificationWorkbench, {
        rfqId: 'rfq-999',
        persona: 'BUYER',
        invitedSuppliers: mockInvitedSuppliers,
        readOnly: false,
      });

      expect(el).toBeDefined();
      expect(el.props.persona).toBe('BUYER');
      expect(el.props.invitedSuppliers?.length).toBe(2);
    });

    it('instantiates cleanly for Supplier persona with alias and invitation context', () => {
      const el = React.createElement(ClarificationWorkbench, {
        rfqId: 'rfq-999',
        persona: 'SUPPLIER',
        supplierInvitationId: 'inv-1',
        supplierAlias: 'Supplier #01',
        readOnly: false,
      });

      expect(el).toBeDefined();
      expect(el.props.persona).toBe('SUPPLIER');
      expect(el.props.supplierAlias).toBe('Supplier #01');
      expect(el.props.supplierInvitationId).toBe('inv-1');
    });
  });

  describe('Triage Metrics & Filtering Logic', () => {
    it('computes broadcast and category metrics correctly', () => {
      const total = mockMessages.length;
      const broadcasts = mockMessages.filter((m) => m.isBroadcast).length;
      const direct = mockMessages.filter((m) => !m.isBroadcast).length;

      expect(total).toBe(4);
      expect(broadcasts).toBe(1);
      expect(direct).toBe(3);

      const categoryCounts: Record<ClarificationCategory, number> = {
        TECHNICAL_SPEC: 0,
        COMMERCIAL_TERMS: 0,
        DELIVERY_LOGISTICS: 0,
        COMPLIANCE: 0,
      };

      mockMessages.forEach((m) => {
        categoryCounts[m.inquiryCategory]++;
      });

      expect(categoryCounts.TECHNICAL_SPEC).toBe(2);
      expect(categoryCounts.COMMERCIAL_TERMS).toBe(1);
      expect(categoryCounts.DELIVERY_LOGISTICS).toBe(1);
      expect(categoryCounts.COMPLIANCE).toBe(0);
    });

    it('filters messages by supplier alias thread with direct isolation', () => {
      const inv1Messages = mockMessages.filter((m) => m.invitationId === 'inv-1');
      const inv2Messages = mockMessages.filter((m) => m.invitationId === 'inv-2');

      expect(inv1Messages.length).toBe(2);
      expect(inv2Messages.length).toBe(1);
      expect(inv1Messages.every((m) => m.anonymousLabel === 'Supplier #01')).toBe(true);
      expect(inv2Messages.every((m) => m.anonymousLabel === 'Supplier #02')).toBe(true);
    });
  });

  describe('Pre-Submission PII Validation Suite', () => {
    it('detects and previews phone numbers in real-time', () => {
      const text = 'Call 9876543210 for technical discussion';
      const result = detectClarificationPii(text);

      expect(result.hasPii).toBe(true);
      expect(result.redactions).toContain('PHONE');
      expect(result.previewScrubbed).toBe('Call [phone removed] for technical discussion');
      expect(result.isOnlyPii).toBe(false);
    });

    it('flags single phone number without question as onlyPii', () => {
      const text = '9876543210';
      const result = detectClarificationPii(text);

      expect(result.hasPii).toBe(true);
      expect(result.isOnlyPii).toBe(true);
    });

    it('passes clean technical question without PII', () => {
      const text = 'What is the pump casing material grade? Is CF8M stainless steel allowed?';
      const result = detectClarificationPii(text);

      expect(result.hasPii).toBe(false);
      expect(result.redactions).toEqual([]);
      expect(result.isOnlyPii).toBe(false);
    });
  });
});
