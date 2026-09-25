import { describe, it, expect } from 'vitest';
import {
  LandingPage,
  AboutPage,
  PricingPage,
  FaqPage,
  SiteLayout,
  SiteHeader,
  RequirementPrompt,
  IdentityProtectedComparisonPreview,
  AUDIENCES,
  PILLARS,
  PHASES,
  LIFECYCLE_GROUPS,
  SUPPLIER_CHANNELS,
  GENERAL_FAQS,
  BUYER_FAQS,
  SUPPLIER_FAQS,
} from '@/features/site';
import {
  LoginPage,
  SignupPage,
  ResetPasswordPage,
  LegalPage,
  BuyerRegisterForm,
  SupplierRegisterForm,
  GstinAutofillField,
  PanAutofillField,
  RwaRegistrationAgreementModal,
  SignupSuccess,
  QuickRegisterModal,
  BUYER_COPY,
  SUPPLIER_COPY,
  sideFromParam,
  sideParam,
} from '@/features/portal';
import { SUBSCRIPTION_TIERS } from '@/features/subscription';

describe('Phase 3 Public Experience & Authentication Screens (Screens 31–40)', () => {
  describe('Screens 31–33: Public Landing, How It Works & Product Overview', () => {
    it('exports all flagship landing and about page components', () => {
      expect(LandingPage).toBeDefined();
      expect(AboutPage).toBeDefined();
      expect(SiteLayout).toBeDefined();
      expect(SiteHeader).toBeDefined();
      expect(RequirementPrompt).toBeDefined();
      expect(IdentityProtectedComparisonPreview).toBeDefined();
    });

    it('contains all 4 architectural pillars for identity protection and governance', () => {
      expect(PILLARS).toHaveLength(4);
      const pillarTitles = PILLARS.map((p) => p.title);
      expect(pillarTitles).toContain('Identity-Protected Sourcing');
      expect(pillarTitles).toContain('Time-Bound Procurement');
      expect(pillarTitles).toContain('Comparable Evaluation');
      expect(pillarTitles).toContain('Governed Decisions');
    });

    it('defines 3 canonical buyer audiences matching core buyer personas', () => {
      expect(AUDIENCES).toHaveLength(3);
      const audienceNames = AUDIENCES.map((a) => a.name);
      expect(audienceNames).toContain('Individual');
      expect(audienceNames).toContain('MSME');
      expect(audienceNames).toContain('Community / RWA');
    });

    it('organizes the procurement lifecycle into Source, Decide, and Deliver groups', () => {
      expect(LIFECYCLE_GROUPS).toHaveLength(3);
      expect(LIFECYCLE_GROUPS[0]?.name).toBe('Source');
      expect(LIFECYCLE_GROUPS[1]?.name).toBe('Decide');
      expect(LIFECYCLE_GROUPS[2]?.name).toBe('Deliver');
    });

    it('defines 4 time-bound enforcement phases with decision-triggered award', () => {
      expect(PHASES).toHaveLength(4);
      expect(PHASES[3]?.window).toContain('Triggered by the decision');
    });

    it('defines multi-channel supplier sourcing routes with status badges', () => {
      expect(SUPPLIER_CHANNELS.length).toBeGreaterThanOrEqual(4);
      const liveChannels = SUPPLIER_CHANNELS.filter((c) => c.status === 'LIVE');
      expect(liveChannels.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Screens 34–36: Mobile Auth & Multi-Step Registration', () => {
    it('exports all mobile authentication and registration components', () => {
      expect(LoginPage).toBeDefined();
      expect(SignupPage).toBeDefined();
      expect(BuyerRegisterForm).toBeDefined();
      expect(typeof BuyerRegisterForm).toBe('function');
      expect(SupplierRegisterForm).toBeDefined();
      expect(GstinAutofillField).toBeDefined();
      expect(PanAutofillField).toBeDefined();
      expect(RwaRegistrationAgreementModal).toBeDefined();
      expect(SignupSuccess).toBeDefined();
      expect(QuickRegisterModal).toBeDefined();
    });

    it('supports 1-tap side switching between Buyer and Supplier', () => {
      expect(BUYER_COPY.side).toBe('BUYER');
      expect(SUPPLIER_COPY.side).toBe('SUPPLIER');
      expect(sideFromParam('buyer')).toBe('BUYER');
      expect(sideFromParam('supplier')).toBe('SUPPLIER');
      expect(sideFromParam('seller')).toBe('SUPPLIER');
      expect(sideParam('BUYER')).toBe('buyer');
      expect(sideParam('SUPPLIER')).toBe('supplier');
    });

    it('contains buyer value propositions emphasizing sealed evaluation and verified suppliers', () => {
      expect(BUYER_COPY.propositions.length).toBeGreaterThanOrEqual(3);
      const titles = BUYER_COPY.propositions.map((p) => p.title);
      expect(titles).toContain('Raise a request');
      expect(titles).toContain('Verified suppliers');
      expect(titles).toContain('L1–L3 quote comparison');
    });

    it('contains supplier value propositions emphasizing 0 lead fees and transparent quotes', () => {
      expect(SUPPLIER_COPY.propositions.length).toBeGreaterThanOrEqual(3);
      const titles = SUPPLIER_COPY.propositions.map((p) => p.title);
      expect(titles).toContain('Direct commercial leads');
      expect(titles).toContain('Transparent quoting');
      expect(titles).toContain('Work order tracking');
    });
  });

  describe('Screens 37–40: Pricing, FAQs, Password Recovery & Legal Pages', () => {
    it('exports all pricing, FAQ, reset password, and legal page components', () => {
      expect(PricingPage).toBeDefined();
      expect(FaqPage).toBeDefined();
      expect(ResetPasswordPage).toBeDefined();
      expect(LegalPage).toBeDefined();
    });

    it('configures transparent prepaid subscription tiers with annual discounts', () => {
      expect(SUBSCRIPTION_TIERS.TIER_1_MSME).toBeDefined();
      expect(SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE).toBeDefined();
      expect(SUBSCRIPTION_TIERS.TIER_1_MSME.yearlySavings).toBeGreaterThan(0);
      expect(SUBSCRIPTION_TIERS.TIER_2_ENTERPRISE.yearlySavings).toBeGreaterThan(0);
    });

    it('provides comprehensive FAQs for General, Buyer, and Supplier audiences', () => {
      expect(GENERAL_FAQS.length).toBeGreaterThanOrEqual(5);
      expect(BUYER_FAQS.length).toBeGreaterThanOrEqual(4);
      expect(SUPPLIER_FAQS.length).toBeGreaterThanOrEqual(4);

      // Verify direct settlement guarantee is explicitly stated
      const paymentFaq = BUYER_FAQS.find((f) => /money|payment/i.test(f.question));
      expect(paymentFaq).toBeDefined();
      expect(paymentFaq?.answer).toMatch(/directly|no payment passes/i);
    });
  });

  describe('Canonical Procurement Vocabulary Scanner Invariant', () => {
    it('enforces ZERO forbidden auction/reverse-auction or obfuscation terms in copy structures', () => {
      const prohibitedTerms = /\b(bid|bids|bidder|bidders|bidding|blind)\b/i;

      const checkedStrings = [
        ...PILLARS.flatMap((p) => [p.title, p.body]),
        ...AUDIENCES.flatMap((a) => [a.name, a.body]),
        ...LIFECYCLE_GROUPS.flatMap((g) => [g.name, g.body, ...g.stages]),
        ...PHASES.flatMap((p) => [p.title, p.window]),
        ...SUPPLIER_CHANNELS.flatMap((c) => [c.name, c.description ?? '']),
        ...BUYER_COPY.propositions.flatMap((p) => [p.title, p.body]),
        ...SUPPLIER_COPY.propositions.flatMap((p) => [p.title, p.body]),
        ...GENERAL_FAQS.flatMap((f) => [f.question, f.answer]),
        ...BUYER_FAQS.flatMap((f) => [f.question, f.answer]),
        ...SUPPLIER_FAQS.flatMap((f) => [f.question, f.answer]),
      ];

      checkedStrings.forEach((str) => {
        const match = str.match(prohibitedTerms);
        expect(
          match,
          `Prohibited procurement vocabulary "${match?.[0]}" found in text: "${str}"`,
        ).toBeNull();
      });
    });
  });
});
