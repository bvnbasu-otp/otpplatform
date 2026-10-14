import type { SupportedLanguage } from '../languages';
import { en, type TranslationSchema } from './en';
import { hi } from './hi';
import { ta } from './ta';
import { te } from './te';
import { kn } from './kn';
import { ml } from './ml';
import { mr } from './mr';
import { bn } from './bn';

export { type TranslationSchema } from './en';

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
 * Nested key lookup helper: t('nav.home') -> 'Home'
 */
export function getTranslation(lang: SupportedLanguage, path: string, fallback?: string): string {
  const dictionary = TRANSLATIONS[lang] || TRANSLATIONS['en-IN'];
  const keys = path.split('.');
  
  let current: unknown = dictionary;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      // Fallback to English
      let fallbackCurrent: unknown = TRANSLATIONS['en-IN'];
      for (const fallbackKey of keys) {
        if (fallbackCurrent && typeof fallbackCurrent === 'object' && fallbackKey in fallbackCurrent) {
          fallbackCurrent = (fallbackCurrent as Record<string, unknown>)[fallbackKey];
        } else {
          return fallback ?? path;
        }
      }
      return typeof fallbackCurrent === 'string' ? fallbackCurrent : (fallback ?? path);
    }
  }

  return typeof current === 'string' ? current : (fallback ?? path);
}
