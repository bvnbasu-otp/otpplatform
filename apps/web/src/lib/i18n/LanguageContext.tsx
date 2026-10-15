import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  isSupportedLanguage,
  type LanguageMeta,
  type SupportedLanguage,
} from './languages';
import { getTranslation, type TranslationSchema } from './translations';
import { applyDomPageTranslation } from './dom-page-translator';
import { triggerPageTranslation } from './google-translate-service';

export interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (path: string, fallback?: string) => string;
  languages: LanguageMeta[];
  currentMeta: LanguageMeta;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function resolveInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(resolveInitialLanguage);

  const setLanguage = useCallback((newLang: SupportedLanguage) => {
    if (!isSupportedLanguage(newLang)) return;
    setLanguageState(newLang);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
    } catch {
      // Ignore storage write errors
    }
    // Set document language attribute for accessibility and trigger translation
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLang.split('-')[0] || 'en';
      applyDomPageTranslation(newLang);
      triggerPageTranslation(newLang);

      // Automated real-time reload for full application translation without manual refresh
      try {
        if (
          typeof window !== 'undefined' &&
          typeof window.location?.reload === 'function' &&
          !import.meta.env?.VITEST
        ) {
          window.location.reload();
        }
      } catch {
        // Fallback gracefully
      }
    }
  }, []);


  // Update HTML lang attribute and trigger full-page translations on mount or language change
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language.split('-')[0] || 'en';
      applyDomPageTranslation(language);
      triggerPageTranslation(language);
    }
  }, [language]);

  const t = useCallback(
    (path: string, fallback?: string) => getTranslation(language, path, fallback),
    [language],
  );

  const currentMeta = useMemo(() => getLanguageMeta(language), [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
      currentMeta,
    }),
    [language, setLanguage, t, currentMeta],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback if rendered outside LanguageProvider
    return {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      t: (path: string, fallback?: string) => getTranslation(DEFAULT_LANGUAGE, path, fallback),
      languages: SUPPORTED_LANGUAGES,
      currentMeta: getLanguageMeta(DEFAULT_LANGUAGE),
    };
  }
  return context;
}
