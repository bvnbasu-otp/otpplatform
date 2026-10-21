import { beforeEach, describe, expect, it } from 'vitest';
import { COMMON_PHRASES } from '../translations/common-phrases';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../languages';
import {
  accountLanguageStorageKey,
  ANONYMOUS_LANGUAGE_SESSION_KEY,
  clearAnonymousLanguage,
  clearLegacyGlobalLanguage,
  readAccountLanguage,
  readAnonymousLanguage,
  writeLanguagePreference,
} from '../language-account';
import { LANGUAGE_STORAGE_KEY } from '../languages';
import {
  applyDomPageTranslation,
  currentTranslationGeneration,
  resetDomPageTranslation,
} from '../dom-page-translator';

describe('account-scoped language preference', () => {
  const local = new Map<string, string>();
  const session = new Map<string, string>();

  beforeEach(() => {
    local.clear();
    session.clear();
    const storage = (store: Map<string, string>) => ({
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => store.clear(),
    });
    (globalThis as { window?: unknown }).window = {
      localStorage: storage(local),
      sessionStorage: storage(session),
    };
  });

  it('keeps each account preference separate and ignores the legacy global key', () => {
    local.set(LANGUAGE_STORAGE_KEY, 'hi-IN');
    writeLanguagePreference('user-a', 'ta-IN');
    writeLanguagePreference('user-b', 'kn-IN');

    expect(readAccountLanguage('user-a')).toBe('ta-IN');
    expect(readAccountLanguage('user-b')).toBe('kn-IN');
    expect(readAccountLanguage('user-c')).toBe('en-IN');
    expect(local.has(accountLanguageStorageKey('user-a'))).toBe(true);
    expect(readAnonymousLanguage()).toBe('en-IN');
  });

  it('clears the anonymous session and the legacy key on identity reset', () => {
    writeLanguagePreference(null, 'ml-IN');
    expect(session.get(ANONYMOUS_LANGUAGE_SESSION_KEY)).toBe('ml-IN');
    expect(readAnonymousLanguage()).toBe('ml-IN');

    local.set(LANGUAGE_STORAGE_KEY, 'bn-IN');
    clearAnonymousLanguage();
    clearLegacyGlobalLanguage();
    expect(readAnonymousLanguage()).toBe('en-IN');
    expect(local.has(LANGUAGE_STORAGE_KEY)).toBe(false);
  });
});

describe('DOM translator isolation', () => {
  it('translates an exact phrase and leaves surrounding procurement text unchanged', () => {
    const previousObserver = globalThis.MutationObserver;
    // The fake nodes are not a live document. Skip the observer for this assertion.
    (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver = undefined;
    const exact = { nodeType: 3, nodeValue: 'Orders', parentElement: null } as unknown as Text;
    const mixed = {
      nodeType: 3,
      nodeValue: 'Orders for Sunrise Residency PO-2026-0001',
      parentElement: null,
    } as unknown as Text;
    const body = {
      nodeType: 1,
      tagName: 'BODY',
      firstChild: exact,
      getAttribute: () => null,
      setAttribute: () => undefined,
    };
    (exact as { nextSibling?: unknown }).nextSibling = mixed;
    (globalThis as { document?: unknown }).document = { body };

    applyDomPageTranslation('hi-IN');
    expect(exact.nodeValue).toBe(COMMON_PHRASES.Orders?.['hi-IN']);
    expect(mixed.nodeValue).toBe('Orders for Sunrise Residency PO-2026-0001');

    applyDomPageTranslation('en-IN');
    expect(exact.nodeValue).toBe('Orders');
    globalThis.MutationObserver = previousObserver;
  });

  it('bumps the generation so a later identity does not keep the previous pass', () => {
    const before = currentTranslationGeneration();
    const after = resetDomPageTranslation();
    expect(after).toBeGreaterThan(before);
    expect(currentTranslationGeneration()).toBe(after);
  });
});

describe('translation coverage is partial outside English', () => {
  it('counts catalogue phrases and does not claim the other seven languages are complete', () => {
    const phrases = Object.keys(COMMON_PHRASES);
    expect(phrases.length).toBeGreaterThan(0);
    const coverage = SUPPORTED_LANGUAGES.map((language) => {
      const filled = phrases.filter((phrase) => {
        const value = COMMON_PHRASES[phrase]?.[language.code as SupportedLanguage];
        return typeof value === 'string' && value.trim().length > 0;
      }).length;
      return { code: language.code, filled, total: phrases.length };
    });

    const english = coverage.find((row) => row.code === 'en-IN');
    expect(english?.filled).toBe(english?.total);
    for (const row of coverage.filter((item) => item.code !== 'en-IN')) {
      expect(row.filled).toBeGreaterThan(0);
    }
    expect(SUPPORTED_LANGUAGES).toHaveLength(8);
  });
});
