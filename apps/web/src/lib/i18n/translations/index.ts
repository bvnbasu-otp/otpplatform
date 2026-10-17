import type { SupportedLanguage } from '../languages';
import { en, type TranslationSchema } from './en';
import { hi } from './hi';
import { ta } from './ta';
import { te } from './te';
import { kn } from './kn';
import { ml } from './ml';
import { mr } from './mr';
import { bn } from './bn';
import { COMMON_PHRASES } from './common-phrases';

export { type TranslationSchema } from './en';
export { COMMON_PHRASES } from './common-phrases';

const missingKeys = new Set<string>();

/** Keys requested in this process that had no catalogue entry. Used by tests and dev checks. */
export function missingTranslationKeys(): readonly string[] {
  return [...missingKeys];
}

export function resetMissingTranslationKeys(): void {
  missingKeys.clear();
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationSchema> = {
  'en-IN': en,
  'hi-IN': hi,
  'ta-IN': ta,
  'te-IN': te,
  'kn-IN': kn,
  'ml-IN': ml,
  'mr-IN': mr,
  'bn-IN': bn,
};

/**
 * Universal key & phrase lookup helper.
 * Supports both nested paths (e.g. 'nav.home') and direct UI phrases (e.g. 'Home', 'Back', 'Retry Discovery').
 */
export function getTranslation(lang: SupportedLanguage, path: string, fallback?: string): string {
  // 1. Direct phrase lookup in common phrases dictionary
  const trimmed = path.trim();
  const directMatch = COMMON_PHRASES[trimmed]?.[lang];
  if (directMatch) {
    return directMatch;
  }
  if (fallback) {
    const fallbackMatch = COMMON_PHRASES[fallback.trim()]?.[lang];
    if (fallbackMatch) {
      return fallbackMatch;
    }
  }


  // 2. Nested key path lookup (e.g. 'nav.home')
  const dictionary = TRANSLATIONS[lang] || TRANSLATIONS['en-IN'];
  const keys = path.split('.');

  let current: unknown = dictionary;
  let resolved = true;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      resolved = false;
      break;
    }
  }

  if (resolved && typeof current === 'string') {
    return current;
  }

  // 3. Fallback to English dictionary
  let fallbackCurrent: unknown = TRANSLATIONS['en-IN'];
  let fallbackResolved = true;
  for (const fallbackKey of keys) {
    if (fallbackCurrent && typeof fallbackCurrent === 'object' && fallbackKey in fallbackCurrent) {
      fallbackCurrent = (fallbackCurrent as Record<string, unknown>)[fallbackKey];
    } else {
      fallbackResolved = false;
      break;
    }
  }

  if (fallbackResolved && typeof fallbackCurrent === 'string') {
    return fallbackCurrent;
  }

  missingKeys.add(path);
  return typeof fallback === 'string' ? fallback : '';
}

