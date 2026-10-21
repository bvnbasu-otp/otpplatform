/**
 * OTP Platform: Client-Side Instant DOM Page Translator Engine
 *
 * Translates exact catalogue phrases only. Substring replacement is not used:
 * it corrupts supplier names, addresses, PO numbers, and other stored values
 * that happen to contain a UI phrase.
 *
 * A generation counter drops in-flight observer work when the signed-in
 * identity changes, so one account's translation cannot land on the next.
 */

import type { SupportedLanguage } from './languages';
import { COMMON_PHRASES } from './translations/common-phrases';

const originalTextMap = new WeakMap<Node, string>();
const originalAttrMap = new WeakMap<Element, Record<string, string>>();

let activeObserver: MutationObserver | null = null;
let observerTimer: ReturnType<typeof setTimeout> | null = null;
let currentActiveLanguage: SupportedLanguage = 'en-IN';
let translationGeneration = 0;

const PROTECTED_SELECTOR = '[data-no-translate="true"], [data-otp-canonical="true"]';

const IGNORE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
]);

function isProtectedElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (IGNORE_TAGS.has(el.tagName)) return true;
  if (typeof el.getAttribute === 'function') {
    if (el.getAttribute('data-no-translate') === 'true') return true;
    if (el.getAttribute('data-otp-canonical') === 'true') return true;
  }
  if (typeof el.closest === 'function' && el.closest(PROTECTED_SELECTOR)) return true;
  return false;
}

function translateTextNode(node: Node, lang: SupportedLanguage): void {
  const currentVal = node.nodeValue;
  if (!currentVal) return;

  const trimmed = currentVal.trim();
  if (!trimmed || trimmed.length <= 1) return;

  let original = originalTextMap.get(node);
  if (!original) {
    original = currentVal;
    originalTextMap.set(node, original);
  }

  const originalTrimmed = original.trim();

  if (lang === 'en-IN') {
    if (node.nodeValue !== original) {
      node.nodeValue = original;
    }
    return;
  }

  const translation = COMMON_PHRASES[originalTrimmed]?.[lang];
  if (!translation) return;

  const leadingWhitespace = original.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = original.match(/\s*$/)?.[0] ?? '';
  node.nodeValue = `${leadingWhitespace}${translation}${trailingWhitespace}`;
}

function translateElementAttributes(el: Element, lang: SupportedLanguage): void {
  if (typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
  const attrsToTranslate = ['placeholder', 'title', 'aria-label'];
  let stored = originalAttrMap.get(el);
  if (!stored) {
    stored = {};
    for (const attr of attrsToTranslate) {
      const val = el.getAttribute(attr);
      if (val) stored[attr] = val;
    }
    originalAttrMap.set(el, stored);
  }

  for (const [attr, origVal] of Object.entries(stored)) {
    if (lang === 'en-IN') {
      el.setAttribute(attr, origVal);
    } else {
      const trans = COMMON_PHRASES[origVal.trim()]?.[lang];
      if (trans) {
        el.setAttribute(attr, trans);
      }
    }
  }
}

function walkAndTranslate(root: Node, lang: SupportedLanguage): void {
  if (root.nodeType === 3) {
    const parent = (root as Text).parentElement ?? null;
    if (isProtectedElement(parent)) return;
    translateTextNode(root, lang);
    return;
  }

  if (root.nodeType === 1) {
    const el = root as Element;
    if (IGNORE_TAGS.has(el.tagName)) return;
    if (typeof el.getAttribute === 'function') {
      if (el.getAttribute('data-no-translate') === 'true') return;
      if (el.getAttribute('data-otp-canonical') === 'true') return;
    }

    translateElementAttributes(el, lang);

    let child = root.firstChild;
    while (child) {
      walkAndTranslate(child, lang);
      child = child.nextSibling;
      if (!child) break;
    }
  }
}

function disconnectObserver(): void {
  if (observerTimer) {
    clearTimeout(observerTimer);
    observerTimer = null;
  }
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }
}

/**
 * Drops queued translation work and restores English originals.
 * Call this when the authenticated identity changes.
 */
export function resetDomPageTranslation(): number {
  translationGeneration += 1;
  disconnectObserver();
  currentActiveLanguage = 'en-IN';
  if (typeof document !== 'undefined') {
    const root = document.body || document.documentElement;
    if (root) walkAndTranslate(root, 'en-IN');
  }
  return translationGeneration;
}

export function currentTranslationGeneration(): number {
  return translationGeneration;
}

export function applyDomPageTranslation(language: SupportedLanguage): void {
  if (typeof document === 'undefined') return;

  const generation = translationGeneration;
  currentActiveLanguage = language;
  const root = document.body || document.documentElement;
  if (!root) return;

  walkAndTranslate(root, language);

  if (language === 'en-IN') {
    disconnectObserver();
    return;
  }

  if (!activeObserver && typeof MutationObserver !== 'undefined') {
    activeObserver = new MutationObserver((mutations) => {
      const scheduledGeneration = translationGeneration;
      if (observerTimer) clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        if (scheduledGeneration !== translationGeneration) return;
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              const node = mutation.addedNodes[i];
              if (node && scheduledGeneration === translationGeneration) {
                walkAndTranslate(node, currentActiveLanguage);
              }
            }
          } else if (mutation.type === 'characterData' && mutation.target) {
            if (scheduledGeneration === translationGeneration) {
              translateTextNode(mutation.target, currentActiveLanguage);
            }
          }
        }
      }, 50);
    });

    activeObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (generation !== translationGeneration) {
    disconnectObserver();
  }
}
