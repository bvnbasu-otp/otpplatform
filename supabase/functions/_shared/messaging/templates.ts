/**
 * The words we send suppliers.
 *
 * Kept in one file for two reasons. The obvious one is consistency. The
 * important one is that every outbound message is a chance to leak the buyer's
 * identity, and a single place to look is a place that can actually be reviewed
 * - a template built ad hoc from "whatever row we had handy" is how a buyer's
 * name ends up in an SMS.
 *
 * The allow-list below is a second lock on the same door: the database function
 * supplier_rfq_message_payload already decides what a supplier may know. This
 * refuses to render anything else, so a future change to that function that
 * widens the payload fails loudly here instead of quietly reaching a supplier.
 */

import type { MessagingChannel } from './types.ts';

/** Every field a template is allowed to read. Anything else is a bug. */
const ALLOWED_PAYLOAD_FIELDS = new Set([
  'publicRef',
  'alias',
  'title',
  'category',
  'subcategory',
  'quantity',
  'unit',
  'location',
  'requiredByDays',
  'requiredByDate',
  'quoteDeadline',
  'minQuotes',
  'buyerDisplay',
  'isDemo',
]);

/**
 * Fields that must never appear, named explicitly so the failure message says
 * what went wrong rather than "unexpected key".
 */
const FORBIDDEN_PAYLOAD_FIELDS = [
  'organizationId', 'organization_id', 'buyerName', 'buyer_name',
  'buyerId', 'buyer_id', 'createdBy', 'created_by', 'contactName',
  'contactEmail', 'contactPhone', 'contact_phone', 'address',
  'budget', 'budgetMin', 'budgetMax', 'evaluationWeights', 'committee',
  'supplierId', 'supplier_id', 'businessName', 'business_name',
];

export interface RfqMessagePayload {
  publicRef: string;
  alias?: string;
  title?: string;
  category?: string;
  subcategory?: string;
  quantity?: number | string;
  unit?: string;
  location?: string;
  requiredByDays?: number;
  requiredByDate?: string;
  quoteDeadline?: string;
  minQuotes?: number;
  buyerDisplay?: string;
  isDemo?: boolean;
}

export class NotificationPolicyViolation extends Error {
  constructor(field: string) {
    super(`Supplier notification payload must not contain "${field}"`);
    this.name = 'NotificationPolicyViolation';
  }
}

/**
 * Throws rather than filtering. A payload carrying a buyer's name means
 * something upstream is wrong, and quietly stripping it would let that keep
 * happening unnoticed.
 */
export function assertPayloadIsSendable(
  payload: Record<string, unknown>,
): asserts payload is RfqMessagePayload & Record<string, unknown> {
  for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
    if (field in payload) throw new NotificationPolicyViolation(field);
  }
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_PAYLOAD_FIELDS.has(key)) throw new NotificationPolicyViolation(key);
  }
  if (!payload.publicRef) {
    throw new Error('Supplier notification payload must carry the RFQ reference');
  }
}

export interface TemplateContext {
  channel: MessagingChannel;
  /** Base URL for magic links, e.g. https://app.otp.example. */
  appUrl: string;
}

export interface RenderedMessage {
  templateId: string;
  body: string;
}

const CURRENCY_LABEL: Record<string, string> = { INR: 'Rs. ', USD: '$' };

export function formatAmount(amount: number, currency = 'INR'): string {
  const symbol = CURRENCY_LABEL[currency] ?? `${currency} `;
  // Indian grouping, because the suppliers reading this count in lakhs.
  const grouped = currency === 'INR'
    ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  return `${symbol}${grouped}`;
}

function formatDeadline(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/**
 * The enquiry itself.
 *
 * SMS is kept inside two segments; WhatsApp gets the fuller version. Both say
 * the same things and neither says who is buying.
 */
export function renderRfqNotification(
  payload: Record<string, unknown>,
  ctx: TemplateContext,
): RenderedMessage {
  assertPayloadIsSendable(payload);

  const what = [payload.title, payload.subcategory ?? payload.category]
    .filter(Boolean)
    .join(' - ');
  const quantity = payload.quantity
    ? `${payload.quantity}${payload.unit ? ` ${payload.unit}` : ''}`
    : null;
  const deadline = formatDeadline(payload.quoteDeadline);
  const prefix = payload.isDemo ? '[DEMO] ' : '';

  if (ctx.channel === 'SMS') {
    const lines = [
      `${prefix}OTP enquiry ${payload.publicRef}: ${what}`,
      quantity ? `Qty ${quantity}` : null,
      payload.location ? `at ${payload.location}` : null,
      deadline ? `by ${deadline}` : null,
      `Reply: QUOTE ${payload.publicRef} <price>`,
    ].filter(Boolean);
    return { templateId: 'rfq_notification_sms', body: lines.join('. ') };
  }

  const lines = [
    `${prefix}*New enquiry on OTP - ${payload.publicRef}*`,
    '',
    `*What:* ${what}`,
    quantity ? `*Quantity:* ${quantity}` : null,
    payload.location ? `*Where:* ${payload.location}` : null,
    deadline ? `*Quote by:* ${deadline}` : null,
    `*Buyer:* ${payload.buyerDisplay ?? 'Identity protected'}`,
    '',
    `Reply with your price to quote, for example:`,
    `QUOTE ${payload.publicRef} 8500`,
    '',
    'You are quoting against other suppliers. Nobody sees your price except the buying committee, and they see it without your name.',
  ].filter((line) => line !== null);

  return { templateId: 'rfq_notification_whatsapp', body: lines.join('\n') };
}

export interface AcknowledgementInput {
  publicRef: string;
  amount: number;
  currency?: string;
  /** Present when the price replaced an earlier one. */
  version?: number;
  magicLinkToken?: string | null;
  /** Below the threshold the supplier is nudged to check the figure. */
  lowConfidence?: boolean;
  isDemo?: boolean;
}

/**
 * The acknowledgement, which is also the safety net.
 *
 * It always echoes the amount we recorded. That is what makes a parser mistake
 * recoverable: the supplier sees the wrong number and texts the right one,
 * rather than losing a job to a misread decimal point.
 */
export function renderQuoteAcknowledgement(
  input: AcknowledgementInput,
  ctx: TemplateContext,
): RenderedMessage {
  const amount = formatAmount(input.amount, input.currency ?? 'INR');
  const prefix = input.isDemo ? '[DEMO] ' : '';
  const link = input.magicLinkToken
    ? `${ctx.appUrl.replace(/\/$/, '')}/q/${input.magicLinkToken}`
    : null;

  const revised = (input.version ?? 1) > 1;
  const opening = revised
    ? `${prefix}Updated: ${amount} recorded for ${input.publicRef}.`
    : `${prefix}Got it. ${amount} recorded for ${input.publicRef}.`;

  const lines = [
    opening,
    input.lowConfidence
      ? 'If that price is wrong, reply with the correct figure.'
      : null,
    // Said plainly, because an indicative price that the supplier believes is a
    // submitted quote is worse than no quote at all.
    'This is an indicative price, not a submitted quote.',
    link ? `Complete it here (expires in 48h): ${link}` : null,
  ].filter(Boolean) as string[];

  return {
    templateId: revised ? 'quote_ack_revised' : 'quote_ack',
    body: ctx.channel === 'SMS' ? lines.join(' ') : lines.join('\n'),
  };
}

/** Machine outcomes from ingest_supplier_message, and what we say about each. */
export type IngestOutcome =
  | 'ACCEPTED'
  | 'DECLINED'
  | 'HELP'
  | 'OPTED_OUT'
  | 'OPTED_IN'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'UNKNOWN_SENDER'
  | 'SUPPLIER_SUSPENDED'
  | 'UNPARSEABLE'
  | 'INVALID_AMOUNT'
  | 'RFQ_NOT_FOUND'
  | 'NOT_INVITED'
  | 'RFQ_CLOSED'
  | 'DEADLINE_PASSED';

/**
 * Replies for everything that is not an accepted quote.
 *
 * Note what UNKNOWN_SENDER and NOT_INVITED have in common: neither confirms
 * that a reference exists. Telling an unknown number "that enquiry is open"
 * would turn this endpoint into a way to enumerate live tenders.
 */
export function renderOutcomeReply(
  outcome: IngestOutcome,
  ctx: TemplateContext,
  detail: { reference?: string | null } = {},
): RenderedMessage | null {
  const ref = detail.reference ?? 'that enquiry';

  switch (outcome) {
    case 'HELP':
      return renderHelp(ctx);

    case 'OPTED_OUT':
      return renderOptOutConfirmation();

    case 'OPTED_IN':
      return renderOptInConfirmation();

    case 'DECLINED':
      return renderDeclineAcknowledgement(detail.reference ?? null);

    // Silence is correct here. A retried webhook has already been answered, and
    // answering twice means the supplier gets two texts for one message.
    case 'DUPLICATE':
    case 'RATE_LIMITED':
    case 'BAD_REQUEST':
      return null;

    case 'UNKNOWN_SENDER':
      return {
        templateId: 'unknown_sender',
        body: 'This number is not registered with OTP. To submit quotes on enquiries, register at '
          + `${ctx.appUrl.replace(/\/$/, '')}/seller`,
      };

    case 'SUPPLIER_SUSPENDED':
      return {
        templateId: 'supplier_suspended',
        body: 'Your OTP account cannot submit quotes at the moment. Please contact support.',
      };

    case 'UNPARSEABLE':
      return {
        templateId: 'unparseable',
        body: 'Sorry, we could not read that. Reply in this format: QUOTE RFQ-XXXXXX 8500',
      };

    case 'INVALID_AMOUNT':
      return {
        templateId: 'invalid_amount',
        body: 'That price does not look right. Reply with the amount in rupees, '
          + 'for example: QUOTE RFQ-XXXXXX 8500',
      };

    case 'RFQ_NOT_FOUND':
    case 'NOT_INVITED':
      // One message for both, deliberately: the supplier learns nothing about
      // whether the reference is real.
      return {
        templateId: 'no_such_enquiry',
        body: `We could not find an open enquiry for you matching ${ref}. `
          + 'Check the reference in the message we sent you.',
      };

    case 'RFQ_CLOSED':
      return {
        templateId: 'rfq_closed',
        body: `${ref} is no longer taking quotes. We will message you when the next one matches.`,
      };

    case 'DEADLINE_PASSED':
      return {
        templateId: 'deadline_passed',
        body: `The deadline for ${ref} has passed, so we could not record your price.`,
      };

    case 'ACCEPTED':
      return null;
  }
}

export function renderHelp(ctx: TemplateContext): RenderedMessage {
  return {
    templateId: 'help',
    body: [
      'OTP - how to quote by message:',
      'QUOTE RFQ-XXXXXX 8500 - send your price',
      'Reply again with a new price to change it',
      'NO RFQ-XXXXXX - pass on an enquiry',
      'STOP - stop receiving enquiries',
      `More: ${ctx.appUrl.replace(/\/$/, '')}/seller`,
    ].join('\n'),
  };
}

export function renderOptOutConfirmation(): RenderedMessage {
  return {
    templateId: 'opt_out',
    body: 'You will not receive further OTP enquiries on this number. '
      + 'Reply START to turn them back on.',
  };
}

export function renderOptInConfirmation(): RenderedMessage {
  return {
    templateId: 'opt_in',
    body: 'You will receive OTP enquiries on this number again.',
  };
}

export function renderDeclineAcknowledgement(
  reference: string | null,
): RenderedMessage {
  return {
    templateId: 'decline_ack',
    body: reference
      ? `Noted - you have passed on ${reference}. We will keep sending you other enquiries.`
      : 'Noted. Please include the enquiry reference next time, for example: NO RFQ-XXXXXX',
  };
}
