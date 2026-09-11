/**
 * Turning a text message into a bid.
 *
 * A supplier typing on a phone at a work site will not follow a format. The job
 * here is to read what they plausibly meant, say what we understood, and be
 * clear about how sure we are — never to guess silently.
 *
 * Two rules shape everything below:
 *
 *   1. This parser is on the untrusted side of the trust boundary. Whatever it
 *      returns is re-validated in the database. It cannot authorise anything;
 *      it can only propose an interpretation.
 *
 *   2. Ambiguity is reported, not resolved. Low confidence changes the words we
 *      reply with — the acknowledgement always echoes the price we recorded, so
 *      a misreading is visible to the supplier and correctable by texting again.
 */

export type MessagingCommand =
  | 'QUOTE'
  | 'DECLINE'
  | 'HELP'
  | 'STOP'
  | 'START'
  | 'UNKNOWN';

export interface ParsedMessage {
  command: MessagingCommand;
  /** Canonical RFQ reference, e.g. RFQ-7K29AB. Null if none was found. */
  rfqReference: string | null;
  amount: number | null;
  currency: string | null;
  /** "kg", "unit", "day" — whatever they said they were pricing. */
  unit: string | null;
  /** 0..1. Below CONFIRMATION_THRESHOLD the reply asks them to confirm. */
  confidence: number;
  /** Human-readable reasons confidence was reduced. Logged, never sent. */
  warnings: string[];
}

/**
 * The seam for a better parser.
 *
 * When a model-based parser replaces the rules below it implements this and
 * nothing else changes: the gateway still re-validates, the templates still
 * echo, and the confidence score still drives the wording. Anything that needs
 * to be true of a parse is enforced downstream, so a smarter parser cannot
 * become a security hole.
 */
export interface MessagingQuoteParser {
  parse(body: string): ParsedMessage;
}

export const CONFIRMATION_THRESHOLD = 0.6;

/** The RFQ reference alphabet excludes I, L, O and U, so these can only be typos. */
const CONFUSABLE: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

/** The alphabet public_ref is generated from: no I, L, O or U. */
const REF_BODY = /^[0-9A-HJKMNP-TV-Z]{6}$/;
/**
 * Matched loosely and validated after correction, so "RFQ-7K29OB" is recognised
 * as the prefixed reference it obviously is rather than falling through to the
 * weaker bare-code path.
 */
const REF_PATTERN = /\b(?:OTP[-\s]*)?RFQ[-\s]*([0-9A-Z]{6})\b/i;
/** A bare six-character code, accepted only when it is not the price. */
const BARE_REF_PATTERN = /\b([0-9A-Z]{6})\b/gi;

const CURRENCY_SYMBOLS: Record<string, string> = {
  '₹': 'INR',
  rs: 'INR',
  'rs.': 'INR',
  inr: 'INR',
  '$': 'USD',
  usd: 'USD',
};

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

const UNIT_WORDS = [
  'unit', 'units', 'piece', 'pieces', 'pc', 'pcs', 'nos', 'no',
  'kg', 'kgs', 'gram', 'grams', 'quintal', 'ton', 'tonne', 'tonnes',
  'litre', 'litres', 'liter', 'liters', 'metre', 'metres', 'meter', 'meters',
  'sqft', 'ft', 'day', 'days', 'month', 'months', 'hour', 'hours',
  'set', 'sets', 'box', 'boxes', 'bag', 'bags', 'roll', 'rolls',
  'visit', 'visits', 'job', 'lot', 'total',
];

export class RuleBasedQuoteParser implements MessagingQuoteParser {
  parse(body: string): ParsedMessage {
    const warnings: string[] = [];
    const text = (body ?? '').trim();

    if (text.length === 0) {
      return empty('UNKNOWN', ['Empty message']);
    }

    const upper = text.toUpperCase();

    // Opt-out first and unconditionally. A supplier saying STOP has said it
    // however the rest of the message reads, and honouring that is not
    // negotiable — a message that also contains a price is still a STOP.
    if (/^(STOP|UNSUBSCRIBE|OPT\s*OUT|CANCEL)\b/.test(upper)) {
      return { ...empty('STOP', []), confidence: 1 };
    }

    if (/^(START|RESUME|SUBSCRIBE|OPT\s*IN)\b/.test(upper)) {
      return { ...empty('START', []), confidence: 1 };
    }

    // "?" is matched without a word boundary, because there is no word
    // character next to it for \b to anchor against.
    if (/^(HELP|INFO)\b/.test(upper) || upper === 'H' || /^\?+$/.test(upper)) {
      return { ...empty('HELP', []), confidence: 1 };
    }

    const reference = this.#extractReference(upper, warnings);

    if (/\b(NO|NOT INTERESTED|DECLINE|PASS|SKIP|CANT|CANNOT|CAN'T)\b/.test(upper)
        && !/\d/.test(upper.replace(reference?.matched ?? '', ''))) {
      return {
        command: 'DECLINE',
        rfqReference: reference?.value ?? null,
        amount: null,
        currency: null,
        unit: null,
        confidence: reference ? 0.9 : 0.4,
        warnings: reference ? warnings : [...warnings, 'Decline without a reference'],
      };
    }

    const hadKeyword = /\b(QUOTE|QUOTING|PRICE|RATE|BID|OFFER)\b/.test(upper);
    const money = this.#extractAmount(text, reference?.matched ?? null, warnings);

    if (!money) {
      return {
        command: 'UNKNOWN',
        rfqReference: reference?.value ?? null,
        amount: null,
        currency: null,
        unit: null,
        confidence: 0,
        warnings: [...warnings, 'No amount found'],
      };
    }

    if (!reference) warnings.push('No RFQ reference found');
    if (!hadKeyword) warnings.push('No QUOTE keyword');

    let confidence = 1;
    if (!reference) confidence -= 0.5;
    if (!hadKeyword) confidence -= 0.1;
    if (reference?.corrected) confidence -= 0.1;
    if (reference?.bare) confidence -= 0.15;
    if (money.multiplierApplied) confidence -= 0.2;
    if (money.ambiguous) confidence -= 0.25;

    return {
      command: 'QUOTE',
      rfqReference: reference?.value ?? null,
      amount: money.amount,
      currency: money.currency,
      unit: money.unit,
      confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(2)))),
      warnings: [...warnings, ...money.warnings],
    };
  }

  #extractReference(
    upper: string,
    warnings: string[],
  ): { value: string; matched: string; corrected: boolean; bare: boolean } | null {
    const explicit = upper.match(REF_PATTERN);

    if (explicit?.[1]) {
      const { code, corrected } = canonicaliseCode(explicit[1]);
      if (REF_BODY.test(code)) {
        if (corrected) warnings.push('Corrected look-alike characters in the reference');
        return { value: `RFQ-${code}`, matched: explicit[0], corrected, bare: false };
      }
    }

    // A bare six-character code, but only if it contains a letter. Six digits on
    // their own are far more likely to be the price than a reference.
    for (const match of upper.matchAll(BARE_REF_PATTERN)) {
      const candidate = match[1];
      if (!candidate || !/[A-Z]/.test(candidate)) continue;
      const { code, corrected } = canonicaliseCode(candidate);
      if (!REF_BODY.test(code)) continue;
      warnings.push('Reference recognised without an RFQ prefix');
      if (corrected) warnings.push('Corrected look-alike characters in the reference');
      return { value: `RFQ-${code}`, matched: match[0], corrected, bare: true };
    }

    return null;
  }

  #extractAmount(
    text: string,
    referenceMatch: string | null,
    warnings: string[],
  ): {
    amount: number;
    currency: string | null;
    unit: string | null;
    multiplierApplied: boolean;
    ambiguous: boolean;
    warnings: string[];
  } | null {
    // The reference is removed first so its digits are never read as a price.
    const haystack = referenceMatch
      ? text.replace(new RegExp(escapeRegExp(referenceMatch), 'i'), ' ')
      : text;

    const local: string[] = [];
    const numberPattern =
      /(?:(₹|Rs\.?|INR|\$|USD)\s*)?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|cr|crores?)?/gi;

    const candidates: Array<{
      amount: number;
      currency: string | null;
      multiplierApplied: boolean;
      index: number;
      end: number;
    }> = [];

    for (const match of haystack.matchAll(numberPattern)) {
      const [whole, symbol, digits, suffix] = match;
      if (!digits) continue;

      const base = Number(digits.replace(/,/g, ''));
      if (!Number.isFinite(base)) continue;

      const multiplier = suffix ? MULTIPLIERS[suffix.toLowerCase()] ?? 1 : 1;

      candidates.push({
        amount: base * multiplier,
        currency: symbol ? CURRENCY_SYMBOLS[symbol.toLowerCase()] ?? null : null,
        multiplierApplied: multiplier !== 1,
        index: match.index ?? 0,
        end: (match.index ?? 0) + whole.length,
      });
    }

    if (candidates.length === 0) return null;

    // A currency symbol is the supplier pointing at the price, so it wins over
    // position. Otherwise take the first number: "quote 8500 for 20 units"
    // states the price before the quantity.
    const chosen = candidates.find((c) => c.currency !== null) ?? candidates[0]!;

    // More than one plausible price is exactly the case where echoing the
    // interpretation back matters, so it is recorded as ambiguity rather than
    // resolved by a cleverer rule.
    const ambiguous = candidates.filter((c) => c.amount !== chosen.amount).length > 0;
    if (ambiguous) local.push('More than one number in the message');
    if (chosen.multiplierApplied) local.push('Interpreted a shorthand multiplier');

    return {
      amount: chosen.amount,
      currency: chosen.currency,
      unit: extractUnit(haystack.slice(chosen.end)),
      multiplierApplied: chosen.multiplierApplied,
      ambiguous,
      warnings: local,
    };
  }
}

/**
 * Maps look-alike characters onto the reference alphabet. Because that alphabet
 * has no I, L, O or U, this can correct a typo but can never corrupt a code that
 * was already right.
 */
function canonicaliseCode(raw: string): { code: string; corrected: boolean } {
  let corrected = false;
  const code = raw
    .toUpperCase()
    .split('')
    .map((ch) => {
      const mapped = CONFUSABLE[ch];
      if (mapped) {
        corrected = true;
        return mapped;
      }
      return ch;
    })
    .join('');
  return { code, corrected };
}

function extractUnit(tail: string): string | null {
  const match = tail.match(/^\s*(?:per|\/|a|each)?\s*([a-z]+)/i);
  const word = match?.[1]?.toLowerCase();
  if (!word) return null;
  return UNIT_WORDS.includes(word) ? word : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function empty(command: MessagingCommand, warnings: string[]): ParsedMessage {
  return {
    command,
    rfqReference: null,
    amount: null,
    currency: null,
    unit: null,
    confidence: 0,
    warnings,
  };
}

export const defaultQuoteParser: MessagingQuoteParser = new RuleBasedQuoteParser();
