import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  X2ORegistrationWizard,
  WizardProgress,
  WizardStep1Welcome,
  WizardStep2Contact,
  WizardStep3AccountType,
  WizardStep4Persona,
  WizardStep5Individual,
  WizardStep5RWA,
  WizardStep5MSME,
  WizardStep5Supplier,
} from '@/features/portal';
import { AUTH_OTP_CODE_MAX_LENGTH, WHATSAPP_OTP_DIGITS } from '@otp/domain';

describe('X2O 10-Screen Mobile Registration & Dashboard Flow (Screens 1–10)', () => {
  describe('Invariants 1–6: Wizard Infrastructure Exports & Definitions', () => {
    it('1. exports X2ORegistrationWizard from @/features/portal', () => {
      expect(X2ORegistrationWizard).toBeDefined();
      expect(typeof X2ORegistrationWizard).toBe('function');
    });

    it('2. exports WizardStep1Welcome and it is a function', () => {
      expect(WizardStep1Welcome).toBeDefined();
      expect(typeof WizardStep1Welcome).toBe('function');
    });

    it('3. exports WizardStep2Contact and it is a function', () => {
      expect(WizardStep2Contact).toBeDefined();
      expect(typeof WizardStep2Contact).toBe('function');
    });

    it('4. exports WizardStep3AccountType and it is a function', () => {
      expect(WizardStep3AccountType).toBeDefined();
      expect(typeof WizardStep3AccountType).toBe('function');
    });

    it('5. exports WizardStep4Persona and it is a function', () => {
      expect(WizardStep4Persona).toBeDefined();
      expect(typeof WizardStep4Persona).toBe('function');
    });

    it('6. exports Individual, RWA, MSME, and Supplier Step 5 components', () => {
      expect(WizardStep5Individual).toBeDefined();
      expect(typeof WizardStep5Individual).toBe('function');
      expect(WizardStep5RWA).toBeDefined();
      expect(typeof WizardStep5RWA).toBe('function');
      expect(WizardStep5MSME).toBeDefined();
      expect(typeof WizardStep5MSME).toBe('function');
      expect(WizardStep5Supplier).toBeDefined();
      expect(typeof WizardStep5Supplier).toBe('function');
    });
  });

  describe('Invariants 7–8: 8-digit OTP & Multi-channel Verification', () => {
    it('7. uses AUTH_OTP_CODE_MAX_LENGTH (8) for OTP inputs', () => {
      expect(AUTH_OTP_CODE_MAX_LENGTH).toBe(8);
      expect(WHATSAPP_OTP_DIGITS).toBe(8);

      const step1Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep1Welcome.tsx'),
        'utf8'
      );
      expect(step1Src).toContain('AUTH_OTP_CODE_MAX_LENGTH');
      expect(step1Src).toContain('isCompleteAuthOtpCode');
      expect(step1Src).toContain('normalizeAuthOtpCodeInput');
    });

    it('8. supports WHATSAPP and EMAIL verification channels in WizardStep1Welcome', () => {
      const step1Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep1Welcome.tsx'),
        'utf8'
      );
      expect(step1Src).toContain('WHATSAPP');
      expect(step1Src).toContain('EMAIL');
      expect(step1Src).toContain('invokeEdgeFunction');
      expect(step1Src).toContain('otp-dispatch');
      expect(step1Src).toContain('verify_profile_verification_otp');
      expect(step1Src).toContain('signInWithOtp');
      expect(step1Src).toContain('verifyOtp');
      expect(step1Src).toContain('contracts.identityAuth');
    });
  });

  describe('Invariants 9–11: Brand identity in Screen 1 (Welcome)', () => {
    it('9. contains brand string X2O in WizardStep1Welcome source', () => {
      const step1Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep1Welcome.tsx'),
        'utf8'
      );
      expect(step1Src).toContain('X2O');
    });

    it('10. contains tagline "Tell, Review, Decide" in WizardStep1Welcome source', () => {
      const step1Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep1Welcome.tsx'),
        'utf8'
      );
      expect(step1Src).toContain('Tell, Review, Decide');
    });

    it('11. contains buying modes "Buy_Items" in WizardStep1Welcome source', () => {
      const step1Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep1Welcome.tsx'),
        'utf8'
      );
      expect(step1Src).toContain('Buy_Items');
    });
  });

  describe('Invariant 12: Screen 9 Dashboard Enhancement', () => {
    it('12. DashboardPage source contains "Good morning" greeting and 6-grid quick actions', () => {
      const dashboardSrc = readFileSync(
        resolve(__dirname, '../../pages/DashboardPage.tsx'),
        'utf8'
      );
      expect(dashboardSrc).toContain('Good morning');
      expect(dashboardSrc).toContain('screen-9-mobile-header');
      expect(dashboardSrc).toContain('screen-9-quick-actions');
      expect(dashboardSrc).toContain('Find what you need, when you need it');
      expect(dashboardSrc).toContain('Create RFQ');
      expect(dashboardSrc).toContain('My Requirements');
      expect(dashboardSrc).toContain('My Quotes');
      expect(dashboardSrc).toContain('My Orders');
      expect(dashboardSrc).toContain('Notifications');
      expect(dashboardSrc).toContain('Profile');
    });
  });

  describe('Screens 2–8: Registration Wizard Progression & Personas', () => {
    it('Screen 2 (Contact Details) enforces verified primary badge and explicit consent', () => {
      const step2Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep2Contact.tsx'),
        'utf8'
      );
      expect(step2Src).toContain('Contact Details');
      expect(step2Src).toContain('Verified');
      expect(step2Src).toContain('transactional updates on WhatsApp and email');
    });

    it('Screen 3 (Account Type) offers Buyer and Supplier selection cards', () => {
      const step3Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep3AccountType.tsx'),
        'utf8'
      );
      expect(step3Src).toContain('What do you want to do?');
      expect(step3Src).toContain('Buyer');
      expect(step3Src).toContain('Supplier');
      expect(step3Src).toContain('One account, one identity');
    });

    it('Screen 4 (Persona Selection) handles Individual, RWA, MSME, and Supplier', () => {
      const step4Src = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep4Persona.tsx'),
        'utf8'
      );
      expect(step4Src).toContain('Choose Your Persona');
      expect(step4Src).toContain('Individual');
      expect(step4Src).toContain('RWA / Apartment Assn.');
      expect(step4Src).toContain('MSME / Business');
      expect(step4Src).toContain('Supplier / Service Provider');
    });

    it('Screen 5 (Individual) binds EULA and calls submitSignupRequest', () => {
      const step5IndivSrc = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep5Individual.tsx'),
        'utf8'
      );
      expect(step5IndivSrc).toContain('Individual Profile');
      expect(step5IndivSrc).toContain('RegistrationFrozenAgreementPanel');
      expect(step5IndivSrc).toContain('submitSignupRequest');
    });

    it('Screen 6 (RWA) captures community details and role in association', () => {
      const step6RwaSrc = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep5RWA.tsx'),
        'utf8'
      );
      expect(step6RwaSrc).toContain('Association Profile');
      expect(step6RwaSrc).toContain('YOUR ROLE IN THE ASSOCIATION');
      expect(step6RwaSrc).toContain('Resident Owner');
      expect(step6RwaSrc).toContain('Committee Member');
      expect(step6RwaSrc).toContain('Estate / Facility Mgr');
    });

    it('Screen 7 (MSME) binds business registration and statutory tax fields', () => {
      const step7MsmeSrc = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep5MSME.tsx'),
        'utf8'
      );
      expect(step7MsmeSrc).toContain('Business Profile');
      expect(step7MsmeSrc).toContain('PanAutofillField');
      expect(step7MsmeSrc).toContain('GstinAutofillField');
      expect(step7MsmeSrc).toContain('submitSignupRequest');
    });

    it('Screen 8 (Supplier) displays type chips, documents status, and verification stepper', () => {
      const step8SuppSrc = readFileSync(
        resolve(__dirname, 'components/wizard/WizardStep5Supplier.tsx'),
        'utf8'
      );
      expect(step8SuppSrc).toContain('Supplier Profile');
      expect(step8SuppSrc).toContain('SUPPLIER TYPE');
      expect(step8SuppSrc).toContain('DOCUMENTS');
      expect(step8SuppSrc).toContain('VERIFICATION STATUS');
      expect(step8SuppSrc).toContain('Submitted');
      expect(step8SuppSrc).toContain('Verifying');
      expect(step8SuppSrc).toContain('Verified');
      expect(step8SuppSrc).toContain('Active');
      expect(step8SuppSrc).toContain('Your identity stays hidden from buyers until an award is made');
    });
  });
});
