/**
 * Phone numbers, in one shape.
 *
 * Inbound routing finds a supplier by exact string match on E.164, so a number
 * stored or received in any other shape is a supplier who silently cannot bid.
 * That failure is invisible — the message just goes unmatched — which is why
 * normalisation is one function used by every path rather than a regex repeated
 * at each call site.
 */

/** India, because that is where the suppliers are. Bare 10-digit input assumes it. */
const DEFAULT_COUNTRY_CODE = '91';

const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Returns E.164 or null. Null means "we cannot safely guess", never a fallback:
 * a wrong guess routes a bid to the wrong supplier.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!raw) return null;

  let value = raw.trim();

  // WhatsApp addresses arrive as whatsapp:+919876543210 or 919876543210@c.us.
  value = value.replace(/^whatsapp:/i, '').replace(/@[a-z.]+$/i, '');

  const hadPlus = value.startsWith('+') || value.startsWith('00');
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) return null;

  let national = digits;

  if (value.startsWith('00')) {
    national = digits.slice(2);
  } else if (!hadPlus) {
    // 0 is India's trunk prefix and is not part of the international number.
    if (national.startsWith('0')) national = national.replace(/^0+/, '');

    if (national.length === 10) {
      national = defaultCountryCode + national;
    } else if (national.length === 11 && national.startsWith('0')) {
      national = defaultCountryCode + national.slice(1);
    }
  }

  const candidate = `+${national}`;
  return isE164(candidate) ? candidate : null;
}

/**
 * For logs and demo screens: +919876543210 becomes +91 98765 •••••.
 * A number that reaches a log is a number that can reach a supplier, so the
 * readable part is only enough to tell two suppliers apart.
 */
export function maskPhone(e164: string): string {
  if (!isE164(e164)) return '•••';
  const tail = e164.slice(-5);
  return `${e164.slice(0, e164.length - 5)}${'•'.repeat(tail.length)}`;
}
