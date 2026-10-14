import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  getLanguageMeta,
  getTranslation,
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

  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = mockLocalStorage;
    (globalThis as any).window = { localStorage: mockLocalStorage };
    (globalThis as any).document = {
      documentElement: { lang: 'en' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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
});
