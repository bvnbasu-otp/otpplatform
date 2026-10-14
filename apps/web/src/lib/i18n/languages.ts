/**
 * Supported Indian Languages for OTP Platform
 * Covers 8 major Indian languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali.
 */

export type SupportedLanguage =
  | 'en-IN'
  | 'hi-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'mr-IN'
  | 'bn-IN';

export interface LanguageMeta {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  shortLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    code: 'en-IN',
    name: 'English (India)',
    nativeName: 'English',
    flag: '🇮🇳',
    shortLabel: 'EN',
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    shortLabel: 'HI',
  },
  {
    code: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    flag: '🇮🇳',
    shortLabel: 'TA',
  },
  {
    code: 'te-IN',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    flag: '🇮🇳',
    shortLabel: 'TE',
  },
  {
    code: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    flag: '🇮🇳',
    shortLabel: 'KN',
  },
  {
    code: 'ml-IN',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    flag: '🇮🇳',
    shortLabel: 'ML',
  },
  {
    code: 'mr-IN',
    name: 'Marathi',
    nativeName: 'मराठी',
    flag: '🇮🇳',
    shortLabel: 'MR',
  },
  {
    code: 'bn-IN',
    name: 'Bengali',
    nativeName: 'বাংলা',
    flag: '🇮🇳',
    shortLabel: 'BN',
  },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en-IN';
export const LANGUAGE_STORAGE_KEY = 'otp_language_pref';

export function isSupportedLanguage(code: unknown): code is SupportedLanguage {
  return typeof code === 'string' && SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

export function getLanguageMeta(code: SupportedLanguage): LanguageMeta {
  const meta = SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
  return meta ?? (SUPPORTED_LANGUAGES[0] as LanguageMeta);
}
