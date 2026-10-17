import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  getLanguageMeta,
  getTranslation,
  missingTranslationKeys,
  resetMissingTranslationKeys,
  TRANSLATIONS,
  LanguageProvider,
  useLanguage,
} from '../index';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';


describe('OTP Multilingual (i18n) Engine', () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };

  let cookieStore = '';

  beforeEach(() => {
    store.clear();
    cookieStore = '';
    (globalThis as any).localStorage = mockLocalStorage;
    (globalThis as any).window = {
      localStorage: mockLocalStorage,
      location: { hostname: 'localhost' },
    };
    (globalThis as any).document = {
      documentElement: { lang: 'en' },
      body: {
        nodeType: 1,
        tagName: 'BODY',
        firstChild: null,
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        getAttribute: vi.fn(),
        setAttribute: vi.fn(),
      },
      head: {
        appendChild: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getElementById: vi.fn().mockReturnValue(null),
      querySelector: vi.fn().mockReturnValue(null),
      createElement: (tag: string) => ({
        tagName: tag.toUpperCase(),
        nodeType: 1,
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        firstChild: null,
      }),
      createTextNode: (text: string) => ({
        nodeType: 3,
        nodeValue: text,
      }),
      get cookie() {
        return cookieStore;
      },
      set cookie(val: string) {
        if (val.includes('expires=Thu, 01 Jan 1970')) {
          cookieStore = '';
        } else {
          cookieStore = val;
        }
      },
    };
  });

  describe('1. Supported Languages Metadata', () => {
    it('defines exactly 8 Indian regional languages', () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(8);
      const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(codes).toEqual([
        'en-IN',
        'hi-IN',
        'ta-IN',
        'te-IN',
        'kn-IN',
        'ml-IN',
        'mr-IN',
        'bn-IN',
      ]);
    });

    it('validates supported language codes correctly', () => {
      expect(isSupportedLanguage('en-IN')).toBe(true);
      expect(isSupportedLanguage('hi-IN')).toBe(true);
      expect(isSupportedLanguage('ta-IN')).toBe(true);
      expect(isSupportedLanguage('te-IN')).toBe(true);
      expect(isSupportedLanguage('kn-IN')).toBe(true);
      expect(isSupportedLanguage('ml-IN')).toBe(true);
      expect(isSupportedLanguage('mr-IN')).toBe(true);
      expect(isSupportedLanguage('bn-IN')).toBe(true);
      expect(isSupportedLanguage('fr-FR')).toBe(false);
      expect(isSupportedLanguage(null)).toBe(false);
    });

    it('retrieves metadata with fallback to default', () => {
      const meta = getLanguageMeta('ta-IN');
      expect(meta.name).toBe('Tamil');
      expect(meta.nativeName).toBe('தமிழ்');
      expect(meta.shortLabel).toBe('TA');

      const fallbackMeta = getLanguageMeta('invalid' as any);
      expect(fallbackMeta.code).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('2. Translation Dictionaries Parity', () => {
    it('has complete translation keys across all 8 languages without empty values', () => {
      const enDict = TRANSLATIONS['en-IN'];
      const requiredSections = ['nav', 'action', 'sourcing', 'intake', 'status', 'language'] as const;

      for (const lang of SUPPORTED_LANGUAGES) {
        const dict = TRANSLATIONS[lang.code];
        expect(dict).toBeDefined();

        for (const section of requiredSections) {
          expect(dict[section]).toBeDefined();
          const enKeys = Object.keys(enDict[section]);

          for (const key of enKeys) {
            const val = (dict[section] as Record<string, string>)[key];
            expect(val, `Missing or empty key [${section}.${key}] in ${lang.code}`).toBeTruthy();
            expect(typeof val).toBe('string');
          }
        }
      }
    });

    it('resolves nested keys accurately with fallback', () => {
      expect(getTranslation('hi-IN', 'nav.home')).toBe('होम');
      expect(getTranslation('ta-IN', 'nav.orders')).toBe('ஆர்டர்கள்');
      expect(getTranslation('te-IN', 'action.confirm')).toBe('ధృవీకరించండి');
      expect(getTranslation('kn-IN', 'action.saveDraft')).toBe('ಕರಡು ಉಳಿಸಿ');
      expect(getTranslation('ml-IN', 'status.open')).toBe('കോട്ടേഷനുകൾക്കായി തുറന്നിരിക്കുന്നു');
      expect(getTranslation('mr-IN', 'status.draft')).toBe('मसुदा (Draft)');
      expect(getTranslation('bn-IN', 'action.continue')).toBe('এগিয়ে যান →');

      // Non-existent key falls back to English or fallback argument
      expect(getTranslation('hi-IN', 'non.existent.key', 'Default')).toBe('Default');
    });

    it('detects a missing key without presenting that key as translated legal text', () => {
      resetMissingTranslationKeys();
      const shown = getTranslation('hi-IN', 'legal.customerEula.body');
      expect(shown).toBe('');
      expect(shown).not.toBe('legal.customerEula.body');
      expect(missingTranslationKeys()).toContain('legal.customerEula.body');
    });
  });

  describe('3. LanguageProvider & Context Hook', () => {
    function TestConsumer() {
      const { language, currentMeta, t } = useLanguage();
      return (
        <div>
          <span data-testid="current-lang">{language}</span>
          <span data-testid="current-native">{currentMeta.nativeName}</span>
          <span data-testid="translated-home">{t('nav.home')}</span>
        </div>
      );
    }

    it('initializes with default language in static markup', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>,
      );

      expect(html).toContain('en-IN');
      expect(html).toContain('English');
      expect(html).toContain('Home');
    });

    it('stores the anonymous preference without reloading the page', () => {
      const source = readFileSync(new URL('../LanguageContext.tsx', import.meta.url), 'utf8');
      expect(source).toContain('localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang)');
      expect(source).not.toContain('location.reload');
    });

    it('reads initial preference from localStorage', () => {
      mockLocalStorage.setItem(LANGUAGE_STORAGE_KEY, 'kn-IN');
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>,
      );

      expect(html).toContain('kn-IN');
      expect(html).toContain('ಕನ್ನಡ');
      expect(html).toContain('ಮುಖಪುಟ');
    });
  });

  describe('4. LanguageSwitcher Component', () => {
    it('renders compact trigger button', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <LanguageSwitcher placement="header" />
        </LanguageProvider>,
      );

      expect(html).toContain('data-testid="language-switcher-trigger"');
      expect(html).toContain('EN');
    });

    it('renders full menu variant with all 8 buttons', () => {
      const html = renderToStaticMarkup(
        <LanguageProvider>
          <LanguageSwitcher variant="full" placement="menu" />
        </LanguageProvider>,
      );

      expect(html).toContain('data-testid="language-switcher-full"');
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(html).toContain(`data-testid="lang-btn-${lang.code}"`);
        expect(html).toContain(lang.nativeName);
      }
    });
  });

  describe('5. Full-Page Translation Engines', () => {
    it('translates DOM text nodes directly matching procurement phrases', async () => {
      const { applyDomPageTranslation } = await import('../dom-page-translator');

      const container = document.createElement('div') as any;
      const textNode = document.createTextNode('Requirement Specification') as any;
      container.firstChild = textNode;
      (document.body as any).firstChild = container;

      // Translate to Tamil
      applyDomPageTranslation('ta-IN');
      expect(textNode.nodeValue?.trim()).toBe('தேவை விவரக்குறிப்பு');

      // Translate to Hindi
      applyDomPageTranslation('hi-IN');
      expect(textNode.nodeValue?.trim()).toBe('आवश्यकता विवरण');

      // Restore to English
      applyDomPageTranslation('en-IN');
      expect(textNode.nodeValue?.trim()).toBe('Requirement Specification');
    });

    it('sets googtrans cookie on regional language selection and clears on English', async () => {
      const { triggerPageTranslation } = await import('../google-translate-service');

      // Select Tamil
      triggerPageTranslation('ta-IN');
      expect(document.cookie).toContain('googtrans=/en/ta');

      // Select English
      triggerPageTranslation('en-IN');
      expect(document.cookie).not.toContain('googtrans=/en/ta');
    });
  });
});
