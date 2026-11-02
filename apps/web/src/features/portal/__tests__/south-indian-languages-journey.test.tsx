import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  LanguageProvider,
  getTranslation,
  type SupportedLanguage,
  SUPPORTED_LANGUAGES,
} from '@/lib/i18n';
import { WizardStep1Welcome } from '../components/wizard/WizardStep1Welcome';
import { WizardStep3AccountType } from '../components/wizard/WizardStep3AccountType';
import { WizardStep4Persona } from '../components/wizard/WizardStep4Persona';

describe('Gate 4 & Gate 5: South Indian Languages & Customer Journey Integration', () => {
  const southIndianLanguages: { code: SupportedLanguage; name: string; nativeName: string }[] = [
    { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം' },
  ];

  describe('1. South Indian Languages Registry & Parity', () => {
    it('all four South Indian languages are registered in SUPPORTED_LANGUAGES', () => {
      const registeredCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(registeredCodes).toContain('ta-IN');
      expect(registeredCodes).toContain('te-IN');
      expect(registeredCodes).toContain('kn-IN');
      expect(registeredCodes).toContain('ml-IN');
    });

    it('provides native script journey phrases (TELL → REVIEW → DECIDE → TRACK) in all South Indian languages', () => {
      // Tamil
      expect(getTranslation('ta-IN', 'journey.tell')).toContain('சொல்லுங்கள்');
      expect(getTranslation('ta-IN', 'journey.review')).toContain('மதிப்பாய்வு');
      expect(getTranslation('ta-IN', 'journey.decide')).toContain('முடிவு');
      expect(getTranslation('ta-IN', 'journey.track')).toContain('பின்தொடரவும்');

      // Telugu
      expect(getTranslation('te-IN', 'journey.tell')).toContain('చెప్పండి');
      expect(getTranslation('te-IN', 'journey.review')).toContain('సమీక్షించండి');
      expect(getTranslation('te-IN', 'journey.decide')).toContain('నిర్ణయించండి');
      expect(getTranslation('te-IN', 'journey.track')).toContain('ట్రాక్ చేయండి');

      // Kannada
      expect(getTranslation('kn-IN', 'journey.tell')).toContain('ತಿಳಿಸಿ');
      expect(getTranslation('kn-IN', 'journey.review')).toContain('ಪರಿಶೀಲಿಸಿ');
      expect(getTranslation('kn-IN', 'journey.decide')).toContain('ನಿರ್ಧರಿಸಿ');
      expect(getTranslation('kn-IN', 'journey.track')).toContain('ಟ್ರ್ಯಾಕ್ ಮಾಡಿ');

      // Malayalam
      expect(getTranslation('ml-IN', 'journey.tell')).toContain('പറയൂ');
      expect(getTranslation('ml-IN', 'journey.review')).toContain('അവലോകനം ചെയ്യൂ');
      expect(getTranslation('ml-IN', 'journey.decide')).toContain('തീരുമാനിക്കൂ');
      expect(getTranslation('ml-IN', 'journey.track')).toContain('ട്രാക്ക് ചെയ്യൂ');
    });

    it('provides native script persona descriptions in all South Indian languages', () => {
      for (const lang of southIndianLanguages) {
        expect(getTranslation(lang.code, 'personas.buyerTitle')).toBeTruthy();
        expect(getTranslation(lang.code, 'personas.supplierTitle')).toBeTruthy();
        expect(getTranslation(lang.code, 'personas.individualTitle')).toBeTruthy();
        expect(getTranslation(lang.code, 'personas.rwaTitle')).toBeTruthy();
        expect(getTranslation(lang.code, 'personas.msmeTitle')).toBeTruthy();
      }
    });
  });

  describe('2. Registration Wizard Rendering with Language Switching', () => {
    it('renders WizardStep1Welcome with language switcher and journey badges', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep1Welcome onVerified={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );

      // Language Switcher present
      expect(html).toContain('data-testid="language-switcher"');
      // Journey stages present
      expect(html).toContain('Tell');
      expect(html).toContain('Review');
      expect(html).toContain('Decide');
      expect(html).toContain('Track');
      // Channels present
      expect(html).toContain('WhatsApp');
      expect(html).toContain('Email');
    });

    it('renders WizardStep3AccountType and WizardStep4Persona with persona cards', () => {
      const htmlStep3 = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep3AccountType onNext={() => {}} onBack={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );
      expect(htmlStep3).toContain('Buyer');
      expect(htmlStep3).toContain('Supplier');

      const htmlStep4 = renderToStaticMarkup(
        <MemoryRouter>
          <LanguageProvider>
            <WizardStep4Persona side="BUYER" onNext={() => {}} onBack={() => {}} />
          </LanguageProvider>
        </MemoryRouter>
      );
      expect(htmlStep4).toContain('Individual');
      expect(htmlStep4).toContain('RWA');
      expect(htmlStep4).toContain('MSME');
    });
  });
});
