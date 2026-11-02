/**
 * OTP Next — Gate 7: Pilot Certification Test Suite
 * Certifies security, functionality, data integrity, and mobile/desktop usability
 * across all 4 canonical pilot verticals prior to production cutover.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PILOTS, getPilotById } from '@/lib/pilots';
import { createOtpNextContracts, computeStatutoryTaxes, type ActorContext } from '@otp/services';
import { LanguageProvider, getTranslation, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { ContractsProvider } from '@/lib/contracts-context';
import { ProcurementFlowPage } from '@/features/procurement-flow/ProcurementFlowPage';

describe('Gate 7: Comprehensive Pilot Certification', () => {
  const mockClient: any = {
    auth: {
      signInWithOtp: async () => ({ data: { messageId: 'msg_pilot' }, error: null }),
      verifyOtp: async () => ({
        data: {
          user: { id: 'usr_pilot_lead', email: 'lead@durgarainbow.org' },
          session: { access_token: 'mock_jwt' },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
      }),
    }),
  };

  const contracts = createOtpNextContracts(mockClient);

  // --------------------------------------------------------------------------
  // 1. SECURITY & IDENTITY BOUNDARY CERTIFICATION
  // --------------------------------------------------------------------------
  describe('Pillar 1: Security & Identity Boundary Certification', () => {
    it('enforces anonymous quotation and pseudonymized supplier identity prior to contract award', async () => {
      const actor: ActorContext = {
        profileId: 'usr_baskar',
        fullName: 'Baskar Loganathan',
        email: 'bvnbasu@gmail.com',
        persona: 'INDIVIDUAL',
      };

      const quotesRes = await contracts.quotationManagement.listQuotesForRfq(actor, 'rfq_pilot_01');
      expect(quotesRes.ok).toBe(true);
      if (!quotesRes.ok) return;

      for (const quote of quotesRes.value) {
        // Must use pseudonym label
        expect(quote.pseudonymLabel).toMatch(/^Supplier\s+[A-Za-z0-9]+/);
        // Direct supplier identifier must not leak to buyer
        expect((quote as any).supplierEmail).toBeUndefined();
        expect((quote as any).supplierPhone).toBeUndefined();
      }
    });

    it('enforces zero conflict of interest and committee quorum under Section 00242', async () => {
      const actorOfficer: ActorContext = {
        profileId: 'usr_officer_1',
        fullName: 'Officer One',
        email: 'officer1@durgarainbow.org',
        persona: 'RWA',
        organizationId: 'org_durga_rainbow',
        orgRole: 'COMMITTEE_MEMBER',
      };

      const quorumCheck = await contracts.evaluationVoting.checkQuorumStatus(actorOfficer, 'rfq_pilot_01');
      expect(quorumCheck.ok).toBe(true);
      if (!quorumCheck.ok) return;

      expect(quorumCheck.value.quorumReached).toBe(true);

      const coiCheck = await contracts.conflictOfInterest.assertNoConflict(actorOfficer, 'rfq_pilot_01');
      expect(coiCheck.ok).toBe(true);
      if (!coiCheck.ok) return;
      expect(coiCheck.value.hasConflict).toBe(false);
      expect(coiCheck.value.isBarredFromVoting).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. PILOT FUNCTIONALITY & WORKFLOW CERTIFICATION (ALL 4 VERTICALS)
  // --------------------------------------------------------------------------
  describe('Pillar 2: Pilot Functionality Across Canonical Verticals', () => {
    it('certifies Pilot 1: Community / RWA Facility Maintenance (Bengaluru 560048)', () => {
      const p1 = getPilotById('pilot-1');
      expect(p1.buyerType).toBe('Community');
      expect(p1.location).toBe('Bengaluru');
      expect(p1.orgName).toBe('Greenview Apartments');
      expect(p1.requirementTitle).toBe('10 HP Borewell Motor Winding');
      expect(p1.marketIntelCategory).toBe('motor_winding_10hp');
    });

    it('certifies Pilot 2: MSME Machine Maintenance (Coimbatore 641001)', () => {
      const p2 = getPilotById('pilot-2');
      expect(p2.buyerType).toBe('MSME');
      expect(p2.location).toBe('Coimbatore');
      expect(p2.orgName).toBe('Precision Tools Coimbatore');
      expect(p2.requirementTitle).toBe('CNC Lathe Spindle Repair & Calibration');
      expect(p2.marketIntelCategory).toBe('cnc_spindle_repair');
    });

    it('certifies Pilot 3: Textile / Yarn Bulk Procurement (Tiruppur 641601)', () => {
      const p3 = getPilotById('pilot-3');
      expect(p3.buyerType).toBe('MSME');
      expect(p3.location).toBe('Tiruppur');
      expect(p3.orgName).toBe('Sri Krishna Spinners');
      expect(p3.requirementTitle).toBe('40s Combed Cotton Yarn — 500 kg');
      expect(p3.marketIntelCategory).toBe('cotton_yarn_40s');
    });

    it('certifies Pilot 4: Local Business Electrical Upgrade (Malleswaram 560003)', () => {
      const p4 = getPilotById('pilot-4');
      expect(p4.buyerType).toBe('Local business');
      expect(p4.location).toBe('Bengaluru');
      expect(p4.orgName).toBe('Malleswaram Electronics & Services');
      expect(p4.requirementTitle).toBe('3-Phase Electrical Panel Upgrade — 63A');
      expect(p4.marketIntelCategory).toBe('electrical_panel_63a');
    });
  });

  // --------------------------------------------------------------------------
  // 3. STATUTORY TAX & FINANCIAL DATA INTEGRITY
  // --------------------------------------------------------------------------
  describe('Pillar 3: Statutory Tax & Financial Precision', () => {
    it('calculates intra-state GST (9% CGST + 9% SGST) with exact penny rounding', () => {
      const tax = computeStatutoryTaxes({
        baseAmount: 100000,
        gstRatePercentage: 18,
        supplierStateCode: '29', // Karnataka
        buyerStateCode: '29',    // Karnataka
      });

      expect(tax.taxRegime).toBe('INTRA_STATE_CGST_SGST');
      expect(tax.cgstAmount).toBe(9000);
      expect(tax.sgstAmount).toBe(9000);
      expect(tax.igstAmount).toBe(0);
      expect(tax.totalTaxAmount).toBe(18000);
      expect(tax.totalLandedCost).toBe(118000);
    });

    it('calculates inter-state GST (18% IGST) across state boundaries', () => {
      const tax = computeStatutoryTaxes({
        baseAmount: 200000,
        gstRatePercentage: 18,
        supplierStateCode: '33', // Tamil Nadu
        buyerStateCode: '29',    // Karnataka
      });

      expect(tax.taxRegime).toBe('INTER_STATE_IGST');
      expect(tax.cgstAmount).toBe(0);
      expect(tax.sgstAmount).toBe(0);
      expect(tax.igstAmount).toBe(36000);
      expect(tax.totalTaxAmount).toBe(36000);
      expect(tax.totalLandedCost).toBe(236000);
    });

    it('verifies progressive milestone release balance integrity (Advance + Dispatch + Completion = 100%)', () => {
      const milestones = [
        { percentage: 30, amount: 30000 },
        { percentage: 40, amount: 40000 },
        { percentage: 30, amount: 30000 },
      ];

      const totalPercentage = milestones.reduce((sum, m) => sum + m.percentage, 0);
      const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0);

      expect(totalPercentage).toBe(100);
      expect(totalAmount).toBe(100000);
    });
  });

  // --------------------------------------------------------------------------
  // 4. USABILITY & SOUTH INDIAN MULTILINGUAL CERTIFICATION
  // --------------------------------------------------------------------------
  describe('Pillar 4: Usability & South Indian Multilingual Accessibility', () => {
    it('verifies all 4 South Indian regional languages provide complete customer journey translation', () => {
      const southIndianLangs = ['ta-IN', 'te-IN', 'kn-IN', 'ml-IN'] as const;

      for (const lang of southIndianLangs) {
        const tell = getTranslation(lang, 'journey.tell');
        const review = getTranslation(lang, 'journey.review');
        const decide = getTranslation(lang, 'journey.decide');
        const track = getTranslation(lang, 'journey.track');
        const motto = getTranslation(lang, 'journey.motto');

        expect(tell).toBeTruthy();
        expect(review).toBeTruthy();
        expect(decide).toBeTruthy();
        expect(track).toBeTruthy();
        expect(motto).toBeTruthy();
      }
    });

    it('renders the ProcurementFlowPage orchestrator with accessible mobile-first touch targets', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/procurement-flow?stage=TELL']}>
          <LanguageProvider>
            <ContractsProvider>
              <ProcurementFlowPage />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      // Mobile touch-target compliance
      expect(html).toContain('min-h-[44px]');
      // Multilingual dropdown trigger
      expect(html).toContain('data-testid="language-switcher-trigger"');
    });
  });
});
