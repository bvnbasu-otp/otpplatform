/**
 * OTP Platform: Integrated Page Translator Engine (Google Website Translation Bridge)
 *
 * Provides seamless full-page translation for MSMEs, suppliers, and enterprise buyers
 * across all 8 supported Indian languages:
 * English (en), Hindi (hi), Tamil (ta), Telugu (te), Kannada (kn),
 * Malayalam (ml), Marathi (mr), Bengali (bn).
 */

import type { SupportedLanguage } from './languages';

const LANG_CODE_MAP: Record<SupportedLanguage, string> = {
  'en-IN': 'en',
  'hi-IN': 'hi',
  'ta-IN': 'ta',
  'te-IN': 'te',
  'kn-IN': 'kn',
  'ml-IN': 'ml',
  'mr-IN': 'mr',
  'bn-IN': 'bn',
};

declare global {
  interface Window {
    google?: any;
    googleTranslateElementInit?: () => void;
    __otpGoogleTranslateInitialized?: boolean;
  }
}

/**
 * Initializes the Google Website Translator element if not already present.
 */
export function initGoogleTranslateWidget(): void {
  if (typeof window === 'undefined') return;

  if (window.__otpGoogleTranslateInitialized) return;

  window.googleTranslateElementInit = () => {
    try {
      if (window.google?.translate?.TranslateElement) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: 'en,hi,ta,te,kn,ml,mr,bn',
            autoDisplay: false,
            layout: window.google.translate.TranslateElement.InlineLayout?.SIMPLE ?? 0,
          },
          'google_translate_element',
        );
        window.__otpGoogleTranslateInitialized = true;
      }
    } catch {
      // Graceful fallback if widget cannot initialize
    }
  };

  // If script not in document, add it
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    if (!document.getElementById('otp-google-translate-script')) {
      const script = document.createElement?.('script');
      if (script) {
        script.id = 'otp-google-translate-script';
        script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        script.async = true;
        script.onerror = () => {
          // Offline or network error: in-memory DOM translator handles translations
        };
        document.head?.appendChild?.(script);
      }
    }
  }
}

/**
 * Sets domain and path cookies for Google Translate and triggers translation.
 */
function setGoogleTransCookie(val: string) {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  document.cookie = `googtrans=${val}; path=/;`;
  if (host && host !== 'localhost') {
    document.cookie = `googtrans=${val}; path=/; domain=.${host};`;
  }
}

function clearGoogleTransCookie() {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  if (host && host !== 'localhost') {
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${host};`;
  }
}

/**
 * Translates the entire page into the specified regional Indian language.
 */
export function triggerPageTranslation(language: SupportedLanguage): void {
  if (typeof window === 'undefined') return;

  const target = LANG_CODE_MAP[language] || 'en';

  if (target === 'en') {
    clearGoogleTransCookie();
    // Reset combo if present
    const combo = typeof document.querySelector === 'function'
      ? document.querySelector<HTMLSelectElement>('.goog-te-combo')
      : null;
    if (combo && combo.value !== 'en') {
      combo.value = 'en';
      combo.dispatchEvent(new Event('change'));
    }
    return;
  }

  // Ensure widget is initialized
  initGoogleTranslateWidget();

  // Set translation cookie (/en/ta, /en/hi, etc.)
  setGoogleTransCookie(`/en/${target}`);

  // Dispatch change to active Google Translate combo
  const tryTriggerCombo = (retries = 5) => {
    const combo = typeof document.querySelector === 'function'
      ? document.querySelector<HTMLSelectElement>('.goog-te-combo')
      : null;
    if (combo) {
      if (combo.value !== target) {
        combo.value = target;
        combo.dispatchEvent(new Event('change'));
      }
    } else if (retries > 0) {
      setTimeout(() => tryTriggerCombo(retries - 1), 300);
    }
  };

  tryTriggerCombo();
}
