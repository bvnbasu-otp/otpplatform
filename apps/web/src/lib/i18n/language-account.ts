import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  type SupportedLanguage,
} from './languages';

/** Session-only preference for a signed-out browser tab. Never shared across accounts. */
export const ANONYMOUS_LANGUAGE_SESSION_KEY = 'otp_language_session';

export function accountLanguageStorageKey(accountId: string): string {
  return `${LANGUAGE_STORAGE_KEY}:${accountId}`;
}

function readStorage(storage: Storage | undefined, key: string): SupportedLanguage | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(key);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write errors.
  }
}

function removeStorage(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage delete errors.
  }
}

function localStore(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

function sessionStore(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.sessionStorage;
}

/**
 * Signed-out language. Reads the tab session only.
 * The legacy global localStorage key is intentionally ignored so one account
 * cannot seed the next account.
 */
export function readAnonymousLanguage(): SupportedLanguage {
  return readStorage(sessionStore(), ANONYMOUS_LANGUAGE_SESSION_KEY) ?? DEFAULT_LANGUAGE;
}

export function readAccountLanguage(accountId: string): SupportedLanguage {
  if (!accountId) return DEFAULT_LANGUAGE;
  return readStorage(localStore(), accountLanguageStorageKey(accountId)) ?? DEFAULT_LANGUAGE;
}

export function writeLanguagePreference(accountId: string | null, language: SupportedLanguage): void {
  if (!isSupportedLanguage(language)) return;
  if (accountId) {
    writeStorage(localStore(), accountLanguageStorageKey(accountId), language);
    return;
  }
  writeStorage(sessionStore(), ANONYMOUS_LANGUAGE_SESSION_KEY, language);
}

export function clearAnonymousLanguage(): void {
  removeStorage(sessionStore(), ANONYMOUS_LANGUAGE_SESSION_KEY);
}

/** Drops the legacy unscoped key so it cannot be inherited by the next identity. */
export function clearLegacyGlobalLanguage(): void {
  removeStorage(localStore(), LANGUAGE_STORAGE_KEY);
}
