/**
 * PII & Anti-De-anonymization Scrubber
 *
 * Pre-validates and redacts direct contact identifiers before transmission to preserve
 * strict identity-protected evaluation guarantees.
 *
 * Order of operation matches PostgreSQL trigger private.redact_contact_details():
 * 1. Email addresses -> [email removed]
 * 2. Links & URLs -> [link removed]
 * 3. Social & messaging handles (wa.me, etc.) -> [handle removed]
 * 4. Phone numbers (standard 10-13 digits, +91, spaced Indian format with contact intent) -> [phone removed]
 * 5. Registrations (GSTIN 15-chars, PAN when labelled) -> [registration removed]
 *
 * Crucially preserves technical terms, model numbers, pin codes, prices, and quantities.
 */

export interface ScrubResult {
  scrubbedText: string;
  redactions: string[];
  hasPii: boolean;
  onlyPii: boolean;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const LINK_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;
const HANDLE_REGEX = /(wa\.me\/\d+|@[a-zA-Z0-9_.]{3,}|(instagram|facebook|linkedin|telegram|t)\.me?\/[^\s]+)/gi;

const PHONE_STRUCTURED_REGEX = /(\+\d{1,3}[\s().-]*\d[\d\s().-]{7,}\d|\d{10,13}|\d{2,4}[\s.-]\d{3,4}[\s.-]\d{4}|\d{2,3}[\s.-]\d{5}[\s.-]\d{5}|\d{5}[.-]\d{5})/g;

const CONTACT_INTENT_WORDS = /(call|phone|mobile|whats\s?app|ping|reach|contact|number|dial|ring|cell|direct)/i;
const PHONE_SPACED_REGEX = /\d{5}\s\d{5}|\d{4}\s\d{6}/g;

const REGISTRATION_REGEX = /(\d{2}[a-zA-Z]{5}\d{4}[a-zA-Z][a-zA-Z0-9]{3}|(pan|gst|gstin|tin)[\s:.\-no]*[a-zA-Z0-9]{10,15})/gi;

export function scrubClarificationPii(input: string): ScrubResult {
  if (!input) {
    return {
      scrubbedText: '',
      redactions: [],
      hasPii: false,
      onlyPii: false,
    };
  }

  let text = input;
  const kinds: string[] = [];

  // 1. Email addresses
  const textBeforeEmail = text;
  text = text.replace(EMAIL_REGEX, '[email removed]');
  if (text !== textBeforeEmail) {
    kinds.push('EMAIL');
  }

  // 2. Links
  const textBeforeLink = text;
  text = text.replace(LINK_REGEX, '[link removed]');
  if (text !== textBeforeLink) {
    kinds.push('LINK');
  }

  // 3. Handles & wa.me
  const textBeforeHandle = text;
  text = text.replace(HANDLE_REGEX, '[handle removed]');
  if (text !== textBeforeHandle) {
    kinds.push('HANDLE');
  }

  // 4. Structured Phone Numbers
  const textBeforePhone = text;
  text = text.replace(PHONE_STRUCTURED_REGEX, '[phone removed]');
  if (text !== textBeforePhone) {
    kinds.push('PHONE');
  }

  // 5. Spaced Phone Numbers (if other PII detected or contact intent words present)
  if (kinds.length > 0 || CONTACT_INTENT_WORDS.test(text)) {
    const textBeforeSpaced = text;
    text = text.replace(PHONE_SPACED_REGEX, '[phone removed]');
    if (text !== textBeforeSpaced && !kinds.includes('PHONE')) {
      kinds.push('PHONE');
    }
  }

  // 6. Registrations (GSTIN / PAN)
  const textBeforeReg = text;
  text = text.replace(REGISTRATION_REGEX, '[registration removed]');
  if (text !== textBeforeReg) {
    kinds.push('REGISTRATION');
  }

  const hasPii = kinds.length > 0;

  // Check if surviving content contains any alphanumeric characters outside placeholders
  const strippedPlaceholders = text
    .replace(/\[(email|link|handle|phone|registration) removed\]/g, '')
    .trim();

  const onlyPii = hasPii && !/[a-zA-Z0-9]/.test(strippedPlaceholders);

  return {
    scrubbedText: text,
    redactions: kinds,
    hasPii,
    onlyPii,
  };
}

export function detectClarificationPii(input: string): {
  hasPii: boolean;
  redactions: string[];
  previewScrubbed: string;
  isOnlyPii: boolean;
} {
  const res = scrubClarificationPii(input);
  return {
    hasPii: res.hasPii,
    redactions: res.redactions,
    previewScrubbed: res.scrubbedText,
    isOnlyPii: res.onlyPii,
  };
}
