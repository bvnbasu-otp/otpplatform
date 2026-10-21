import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  isSupportedLanguage,
  type LanguageMeta,
  type SupportedLanguage,
} from './languages';
import { getTranslation } from './translations';
import { applyDomPageTranslation, resetDomPageTranslation } from './dom-page-translator';
import {
  clearAnonymousLanguage,
  clearLegacyGlobalLanguage,
  readAccountLanguage,
  readAnonymousLanguage,
  writeLanguagePreference,
} from './language-account';

export interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  /** Scope the saved preference to an authenticated account, or clear it on logout. */
  bindAccount: (accountId: string | null) => void;
  t: (path: string, fallback?: string) => string;
  languages: LanguageMeta[];
  currentMeta: LanguageMeta;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(readAnonymousLanguage);
  /** undefined = auth has not reported an identity yet. null = signed out. */
  const accountRef = useRef<string | null | undefined>(undefined);

  const applyLanguage = useCallback((next: SupportedLanguage) => {
    setLanguageState(next);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next.split('-')[0] || 'en';
      applyDomPageTranslation(next);
    }
  }, []);

  const setLanguage = useCallback((newLang: SupportedLanguage) => {
    if (!isSupportedLanguage(newLang)) return;
    writeLanguagePreference(accountRef.current ?? null, newLang);
    applyLanguage(newLang);
  }, [applyLanguage]);

  const bindAccount = useCallback((accountId: string | null) => {
    const next = accountId || null;
    const previous = accountRef.current;
    if (previous === next) return;

    const hadAccount = typeof previous === 'string' && previous.length > 0;
    accountRef.current = next;

    if (next) {
      resetDomPageTranslation();
      clearLegacyGlobalLanguage();
      clearAnonymousLanguage();
      applyLanguage(readAccountLanguage(next));
      return;
    }

    if (hadAccount) {
      resetDomPageTranslation();
      clearLegacyGlobalLanguage();
      clearAnonymousLanguage();
      applyLanguage(DEFAULT_LANGUAGE);
    }
  }, [applyLanguage]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language.split('-')[0] || 'en';
      applyDomPageTranslation(language);
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
      bindAccount,
      t,
      languages: SUPPORTED_LANGUAGES,
      currentMeta,
    }),
    [language, setLanguage, bindAccount, t, currentMeta],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      bindAccount: () => {},
      t: (path: string, fallback?: string) => getTranslation(DEFAULT_LANGUAGE, path, fallback),
      languages: SUPPORTED_LANGUAGES,
      currentMeta: getLanguageMeta(DEFAULT_LANGUAGE),
    };
  }
  return context;
}
