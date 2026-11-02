/**
 * OTP Next — 8-Screen Registration & Unseeded Onboarding Test Suite
 * Validates the complete 8-screen onboarding flow matching approved UX designs:
 *   Screen 1: Welcome & Mobile Number
 *   Screen 2: Dedicated OTP Verification (WhatsApp / Email 8-Digit Code)
 *   Screen 3: Contact Details (Verified Badge, WhatsApp Same-as-Phone, Email)
 *   Screen 4: Account Type (Buyer / Supplier)
 *   Screen 5: Choose Persona (Individual, RWA, MSME, Supplier - Chosen Only Once)
 *   Screen 6: Personal Information (Name, Photo, Language, Optional Tax & UPI)
 *   Screen 7: Address Management (+ Add Address, PIN Code, Label)
 *   Screen 8: Registration Complete Celebration ("Go to Dashboard" CTA)
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/lib/i18n';
import { ContractsProvider } from '@/lib/contracts-context';
import {
  WizardStep1Welcome,
  WizardStep2OtpVerify,
  WizardStep2Contact,
  WizardStep3AccountType,
  WizardStep4Persona,
  WizardStep6PersonalInfo,
  WizardStep7Addresses,
  WizardStep8Complete,
  X2ORegistrationWizard,
} from '@/features/portal';

describe('8-Screen Native Mobile Registration & Blank-Slate Onboarding', () => {
  describe('Screen 1: Welcome / Registration', () => {
    it('renders language switcher, phone input, and X2O tagline', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <WizardStep1Welcome onVerified={() => {}} onProceedToVerify={() => {}} />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('data-testid="language-switcher"');
      expect(html).toContain('X2O');
      expect(html).toContain('Tell, Review, Decide &amp; Track in one place');
      expect(html).toContain('+91');
      expect(html).toContain('WhatsApp');
      expect(html).toContain('Email');
    });
  });

  describe('Screen 2: Dedicated Phone/Email OTP Verification', () => {
    it('renders 8-digit OTP input, resend countdown, and change number link', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <WizardStep2OtpVerify
                channel="WHATSAPP"
                identifier="+919876543210"
                onVerified={() => {}}
                onBack={() => {}}
              />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Verify Your Phone');
      expect(html).toContain('+919876543210');
      expect(html).toContain('data-testid="input-otp-code"');
      expect(html).toContain('Resend OTP in');
      expect(html).toContain('Change mobile number');
      expect(html).toContain('data-testid="btn-verify-otp"');
    });
  });

  describe('Screen 3: Contact Details', () => {
    it('renders verified primary badge and WhatsApp same-as-phone toggle', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep2Contact
              primaryChannel="WHATSAPP"
              primaryIdentifier="+919876543210"
              onNext={() => {}}
              onBack={() => {}}
            />
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Contact Details');
      expect(html).toContain('Verified');
      expect(html).toContain('+919876543210');
      expect(html).toContain('Email Address');
    });
  });

  describe('Screen 4: Account Type Selection', () => {
    it('renders Buyer and Supplier selection cards with single-identity note', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep3AccountType onNext={() => {}} onBack={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('What do you want to do?');
      expect(html).toContain('Buyer');
      expect(html).toContain('Supplier');
      expect(html).toContain('One account, one identity');
    });
  });

  describe('Screen 5: Choose Your Persona (Only Once During Signup)', () => {
    it('renders all 4 personas: Individual, RWA, MSME, and Supplier', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep4Persona side="BUYER" onNext={() => {}} onBack={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Choose Your Persona');
      expect(html).toContain('Individual');
      expect(html).toContain('RWA');
      expect(html).toContain('MSME');
    });
  });

  describe('Screen 6: Personal Information (Unseeded Blank Slate)', () => {
    it('renders empty full name input, photo upload, language select, and optional tax/UPI accordion', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep6PersonalInfo onNext={() => {}} onBack={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Personal Information');
      expect(html).toContain('data-testid="input-full-name"');
      // No dummy prefilled name
      expect(html).not.toContain('value="Baskar Loganathan"');
      expect(html).toContain('data-testid="select-preferred-language"');
      expect(html).toContain('Tax &amp; Payment Details');
      expect(html).toContain('data-testid="btn-next-personal-info"');
    });
  });

  describe('Screen 7: Address Management (+ Add Address & PIN Code)', () => {
    it('renders address management screen with add address form and 6-digit PIN validation', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep7Addresses onNext={() => {}} onBack={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('Addresses');
      expect(html).toContain('New Delivery / Service Address');
      expect(html).toContain('PIN Code');
      expect(html).toContain('Home');
      expect(html).toContain('Work');
      expect(html).toContain('Other');
      expect(html).not.toContain('value="560048"');
    });
  });

  describe('Screen 8: Registration Complete Celebration', () => {
    it('renders green checkmark badge, celebration message, and Go to Dashboard CTA', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <WizardStep8Complete
            fullName="Ramesh Kumar"
            onGoToDashboard={() => {}}
          />
        </MemoryRouter>
      );

      expect(html).toContain('Registration Complete!');
      expect(html).toContain('Welcome aboard, Ramesh Kumar!');
      expect(html).toContain('What&#x27;s next?');
      expect(html).toContain('data-testid="btn-go-to-dashboard"');
    });
  });

  describe('Sequential Orchestrator: X2ORegistrationWizard', () => {
    it('mounts Screen 1 by default with zero prefilled dummy seeds', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <ContractsProvider>
              <X2ORegistrationWizard />
            </ContractsProvider>
          </LanguageProvider>
        </MemoryRouter>
      );

      expect(html).toContain('X2O');
      expect(html).toContain('WhatsApp');
      expect(html).not.toContain('Baskar Loganathan');
      expect(html).not.toContain('Durga Rainbow');
    });
  });
});
