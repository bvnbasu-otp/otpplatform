/**
 * OTP Platform: Client-Side Instant DOM Page Translator Engine
 *
 * Scans, translates, and preserves DOM text nodes across the entire application
 * for any of the 8 supported Indian regional languages without network lag.
 *
 * Uses WeakMap tracking to ensure zero text corruption and flawless switching
 * back to English or between regional languages.
 */

import type { SupportedLanguage } from './languages';
import { COMMON_PHRASES } from './translations/common-phrases';

const originalTextMap = new WeakMap<Node, string>();
const originalAttrMap = new WeakMap<Element, Record<string, string>>();

let activeObserver: MutationObserver | null = null;
let currentActiveLanguage: SupportedLanguage = 'en-IN';

// Elements to ignore during DOM traversal
const IGNORE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
]);

/**
 * Translates a given text node if it matches an entry in COMMON_PHRASES.
 */
function translateTextNode(node: Node, lang: SupportedLanguage): void {
  const currentVal = node.nodeValue;
  if (!currentVal) return;

  const trimmed = currentVal.trim();
  if (!trimmed || trimmed.length <= 1) return;

  // Retrieve original text or store it
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

  // Exact phrase match
  const translation = COMMON_PHRASES[originalTrimmed]?.[lang];
  if (translation) {
    const leadingWhitespace = original.match(/^\s*/)?.[0] ?? '';
    const trailingWhitespace = original.match(/\s*$/)?.[0] ?? '';
    node.nodeValue = `${leadingWhitespace}${translation}${trailingWhitespace}`;
    return;
  }

  // Common prefix / pattern matching (e.g., "Stage 2/6: Quoting", "Target: 3 Quotes", "📍Bengaluru • 560048")
  for (const [phrase, transObj] of Object.entries(COMMON_PHRASES)) {
    if (originalTrimmed.includes(phrase) && transObj[lang] && phrase.length >= 4) {
      const translated = originalTrimmed.replace(phrase, transObj[lang]);
      const leading = original.match(/^\s*/)?.[0] ?? '';
      const trailing = original.match(/\s*$/)?.[0] ?? '';
      node.nodeValue = `${leading}${translated}${trailing}`;
      return;
    }
  }
}

/**
 * Translates placeholder and title attributes on interactive elements.
 */
function translateElementAttributes(el: Element, lang: SupportedLanguage): void {
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

/**
 * Recursively traverses a DOM subtree and translates qualifying text nodes and attributes.
 */
function walkAndTranslate(root: Node, lang: SupportedLanguage): void {
  // Node.TEXT_NODE = 3, Node.ELEMENT_NODE = 1
  if (root.nodeType === 3) {
    translateTextNode(root, lang);
    return;
  }

  if (root.nodeType === 1) {
    const el = root as Element;
    if (IGNORE_TAGS.has(el.tagName)) return;
    if (el.getAttribute('data-no-translate') === 'true') return;

    translateElementAttributes(el, lang);

    let child = root.firstChild;
    while (child) {
      walkAndTranslate(child, lang);
      child = child.nextSibling;
    }
  }
}

/**
 * Applies full DOM translation across the active webpage.
 */
export function applyDomPageTranslation(language: SupportedLanguage): void {
  if (typeof document === 'undefined') return;

  currentActiveLanguage = language;
  const root = document.body || document.documentElement;
  if (!root) return;

  walkAndTranslate(root, language);

  // Setup / tear down dynamic mutation observer
  if (language === 'en-IN') {
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }
  } else {
    if (!activeObserver && typeof MutationObserver !== 'undefined') {
      let timeoutId: any = null;
      activeObserver = new MutationObserver((mutations) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              for (let i = 0; i < mutation.addedNodes.length; i++) {
                const node = mutation.addedNodes[i];
                if (node) walkAndTranslate(node, currentActiveLanguage);
              }
            } else if (mutation.type === 'characterData' && mutation.target) {
              translateTextNode(mutation.target, currentActiveLanguage);
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
  }
}
