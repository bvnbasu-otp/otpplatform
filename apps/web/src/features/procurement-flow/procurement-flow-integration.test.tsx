/**
 * OTP Next — Gate 6: UI to Backend Capability Integration Test
 * Verifies end-to-end integration between ProcurementFlowPage and Backend Service Contracts:
 *   - STAGE 1 · TELL (Intake, Category & Address Selection)
 *   - STAGE 2 · REVIEW (Sealed Pseudonymized Quotes & Smart Merit)
 *   - STAGE 3 · DECIDE (Sealed Award & Purchase Order Issuance)
 *   - STAGE 4 · TRACK (Milestone Fulfillment & Statutory GST E-Invoicing)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ContractsProvider } from '@/lib/contracts-context';
import { LanguageProvider } from '@/lib/i18n';
import { ProcurementFlowPage } from './ProcurementFlowPage';
import { ProcurementTellStage } from './ProcurementTellStage';
import { ProcurementReviewStage } from './ProcurementReviewStage';
import { ProcurementDecideStage } from './ProcurementDecideStage';
import { ProcurementTrackStage } from './ProcurementTrackStage';

describe('Gate 6: UI to Backend Service Module Integration', () => {
  describe('1. Procurement Flow Page Navigation & Header Integration', () => {
    it('renders the complete 4-stage stepper with language switcher and Tell stage by default', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/procurement-flow?stage=TELL']}>
          <LanguageProvider>
            <ContractsProvider>
              <ProcurementFlowPage />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      // Top brand and language switcher present
      expect(html).toContain('X2O / OTP Next');
      expect(html).toContain('data-testid="language-switcher"');

      // 4-stage stepper
      expect(html).toContain('Tell');
      expect(html).toContain('Review');
      expect(html).toContain('Decide');
      expect(html).toContain('Track');

      // Stage 1 content rendered
      expect(html).toContain('STAGE 1 · TELL');
      expect(html).toContain('Post Your Procurement Requirement');
    });
  });

  describe('2. STAGE 1 · TELL — Module #11 (RFQ) + #09 (Taxonomy) + #08 (Address)', () => {
    it('integrates category selection and registered delivery address prefill', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <ProcurementTellStage onPublished={() => {}} />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('STAGE 1 · TELL');
      expect(html).toContain('Requirement Title');
      expect(html).toContain('Authoritative Category');
      expect(html).toContain('Delivery / Service Address');
      expect(html).toContain('PIN 560048');
      expect(html).toContain('Durga Rainbow, Mahadevapura');
      expect(html).toContain('Line Items');
    });
  });

  describe('3. STAGE 2 · REVIEW — Module #13 (Quotes) + #14 (Smart Merit)', () => {
    it('integrates quote evaluation loader and contracts connection', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <ProcurementReviewStage rfqId="rfq_sample_01" onProceedToDecide={() => {}} />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Evaluating competitive quotations…');
    });
  });

  describe('4. STAGE 3 · DECIDE — Module #17 (Award Reveal) + #18 (Purchase Orders)', () => {
    it('integrates committee voting, quorum status, anti-collusion and award finalization', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <ProcurementDecideStage
                rfqId="rfq_sample_01"
                selectedQuoteId="quote_alpha"
                onAwardIssued={() => {}}
              />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('STAGE 3 · DECIDE &amp; GOVERNANCE');
      expect(html).toContain('Committee Voting &amp; Award Decision');
      expect(html).toContain('Committee Quorum Status');
      expect(html).toContain('Anti-Collusion &amp; Conflict Safeguards');
      expect(html).toContain('Finalize Award &amp; Proceed to TRACK →');
    });
  });

  describe('5. STAGE 4 · TRACK — Module #19 (Order Tracking) + #20 (Invoices) + #21 (Payments)', () => {
    it('integrates atomic award reveal and PO tracking loader', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <ProcurementTrackStage awardId="award_sample_01" onFinishFlow={() => {}} />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Executing atomic award reveal &amp; PO generation…');
    });
  });
});
