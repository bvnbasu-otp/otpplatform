import { describe, it, expect } from 'vitest';
import {
  CANONICAL_INDIAN_PROCUREMENT_STANDARDS,
  SupplierTruthfulVerificationStage,
  VERIFICATION_STAGE_DESCRIPTIONS,
  DEFAULT_SUPPLIER_REFRESH_POLICY,
  DEFAULT_PROVIDER_BUDGET_CONFIGS,
  IndianProcurementStandardsEvaluator,
} from '../index';

describe('R2-07 Indian Procurement Standards & Supplier Network Refresh Policy', () => {
  describe('1. Canonical Indian Procurement Standards Catalog', () => {
    it('contains authoritative BIS, CPWD, BEE, and FSSAI standards', () => {
      const authorities = CANONICAL_INDIAN_PROCUREMENT_STANDARDS.map((s) => s.authority);
      expect(authorities).toContain('BIS');
      expect(authorities).toContain('CPWD');
      expect(authorities).toContain('BEE');
      expect(authorities).toContain('FSSAI');

      const is694 = CANONICAL_INDIAN_PROCUREMENT_STANDARDS.find((s) => s.code === 'IS 694');
      expect(is694).toBeDefined();
      expect(is694?.mandatoryForTenders).toBe(true);
      expect(is694?.minConfidenceBoost).toBe(15);
    });

    it('evaluates explicit BIS electrical certification with confidence boost', () => {
      const result = IndianProcurementStandardsEvaluator.evaluateCompliance({
        category: 'Electrical & Wiring',
        declaredStandards: ['IS 694'],
        itemDescription: '1100V copper insulated industrial wires',
      });

      expect(result.totalConfidenceBoost).toBeGreaterThanOrEqual(15);
      expect(result.matchedStandards.some((m) => m.standard.code === 'IS 694' && m.isMatched)).toBe(true);
      expect(result.isMandatoryCompliant).toBe(true);
    });

    it('evaluates FSSAI standard for food catering vertical', () => {
      const result = IndianProcurementStandardsEvaluator.evaluateCompliance({
        category: 'Food, Catering & Hospitality',
        declaredStandards: ['FSSAI LICENSE / REGISTRATION'],
      });

      expect(result.matchedStandards.some((m) => m.standard.authority === 'FSSAI' && m.isMatched)).toBe(true);
      expect(result.totalConfidenceBoost).toBeGreaterThanOrEqual(20);
    });
  });

  describe('2. Truthful 5-Tier Verification Lifecycle Stages', () => {
    it('enforces 5 distinct truthful verification stages', () => {
      const stages = Object.values(SupplierTruthfulVerificationStage);
      expect(stages).toHaveLength(5);
      expect(stages).toContain('DISCOVERED_IN_AREA');
      expect(stages).toContain('DETAILS_AVAILABLE');
      expect(stages).toContain('OTP_REGISTERED');
      expect(stages).toContain('OTP_VERIFIED');
      expect(stages).toContain('GST_VERIFIED');
    });

    it('never permits un-registered external discovery to claim verified status', () => {
      const discoveredDesc = VERIFICATION_STAGE_DESCRIPTIONS.DISCOVERED_IN_AREA;
      expect(discoveredDesc.isExternallySourced).toBe(true);
      expect(discoveredDesc.canQuoteWithoutClaim).toBe(false);
      expect(discoveredDesc.badgeLabel).toBe('Discovered in Area');

      const verifiedDesc = VERIFICATION_STAGE_DESCRIPTIONS.OTP_VERIFIED;
      expect(verifiedDesc.isExternallySourced).toBe(false);
      expect(verifiedDesc.canQuoteWithoutClaim).toBe(true);
      expect(verifiedDesc.badgeLabel).toBe('OTP Verified');
    });
  });

  describe('3. Configurable 30-Day Refresh Policy & Provider Budgets', () => {
    it('sets default freshness window to 30 days', () => {
      expect(DEFAULT_SUPPLIER_REFRESH_POLICY.freshnessWindowDays).toBe(30);
      expect(DEFAULT_SUPPLIER_REFRESH_POLICY.enableOnboardingPreWarm).toBe(true);
    });

    it('configures provider budgets with emergency reserves and buyer-demand reserves', () => {
      const googleBudget = DEFAULT_PROVIDER_BUDGET_CONFIGS.GOOGLE_PLACES;
      expect(googleBudget).toBeDefined();
      expect(googleBudget?.dailyRequestLimit).toBe(1500);
      expect(googleBudget?.emergencyReserveBuffer).toBe(200);
      expect(googleBudget?.buyerDemandReserveBuffer).toBe(300);
      expect(googleBudget?.proactiveDiscoveryBudget).toBe(500);
      expect(googleBudget?.maxCallsPerLocationCategory).toBe(3);
    });
  });
});
