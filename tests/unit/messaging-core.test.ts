/**
 * The messaging core, tested without a database or a provider account.
 *
 * These cover the parts that decide what a supplier meant and what we say back.
 * They are unit tests because the pieces are pure: authority lives in the
 * database, so nothing here can be tested by "did it let me in".
 */

import { describe, expect, it } from 'vitest';

import {
  CONFIRMATION_THRESHOLD,
  RuleBasedQuoteParser,
} from '../../supabase/functions/_shared/messaging/parser.ts';
import {
  isE164,
  maskPhone,
  normalizePhone,
} from '../../supabase/functions/_shared/messaging/phone.ts';
import {
  NotificationPolicyViolation,
  assertPayloadIsSendable,
  formatAmount,
  renderOutcomeReply,
  renderQuoteAcknowledgement,
  renderRfqNotification,
} from '../../supabase/functions/_shared/messaging/templates.ts';
import { MockMessagingProvider } from '../../supabase/functions/_shared/messaging/providers/mock.ts';
import { TwilioMessagingProvider } from '../../supabase/functions/_shared/messaging/providers/twilio.ts';
import { MetaWhatsAppProvider } from '../../supabase/functions/_shared/messaging/providers/meta.ts';
import {
  MessagingConfigError,
  resolveProvider,
} from '../../supabase/functions/_shared/messaging/providers/resolve.ts';
import { hmacSha1Base64, hmacSha256Hex } from '../../supabase/functions/_shared/messaging/crypto.ts';

const parser = new RuleBasedQuoteParser();
const ctx = { channel: 'WHATSAPP' as const, appUrl: 'https://app.otp.test' };

describe('phone normalisation', () => {
  it('accepts the shapes a supplier actually types', () => {
    for (const input of [
      '+919876543210',
      '919876543210',
      '9876543210',
      '09876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      '00919876543210',
      'whatsapp:+919876543210',
      '919876543210@c.us',
    ]) {
      expect(normalizePhone(input), input).toBe('+919876543210');
    }
  });

  it('keeps international numbers as given', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
    expect(normalizePhone('+442071838750')).toBe('+442071838750');
  });

  it('returns null rather than guessing', () => {
    // A wrong guess routes someone else's bid to this supplier, so refusing is
    // the safe answer for anything that is not clearly a number.
    for (const input of ['', '   ', 'call me', '12345', '+0123456789', null, undefined]) {
      expect(normalizePhone(input as string), String(input)).toBeNull();
    }
  });

  it('masks all but the country and operator prefix', () => {
    expect(maskPhone('+919876543210')).toBe('+9198765•••••');
    expect(isE164('+919876543210')).toBe(true);
    expect(isE164('9876543210')).toBe(false);
  });
});

describe('parsing a quote', () => {
  it('reads the documented format with full confidence', () => {
    const parsed = parser.parse('QUOTE RFQ-7K29AB 8500');
    expect(parsed.command).toBe('QUOTE');
    expect(parsed.rfqReference).toBe('RFQ-7K29AB');
    expect(parsed.amount).toBe(8500);
    expect(parsed.confidence).toBe(1);
  });

  it('reads the formats suppliers actually send', () => {
    const cases: Array<[string, number]> = [
      ['quote rfq-7k29ab 8500', 8500],
      ['RFQ-7K29AB Rs 8,500', 8500],
      ['Price for RFQ 7K29AB is ₹8500 per kg', 8500],
      ['OTP-RFQ-7K29AB 8500', 8500],
      ['my rate RFQ-7K29AB 8500.50', 8500.5],
      ['QUOTE RFQ-7K29AB 1,25,000', 125000],
    ];

    for (const [body, amount] of cases) {
      const parsed = parser.parse(body);
      expect(parsed.rfqReference, body).toBe('RFQ-7K29AB');
      expect(parsed.amount, body).toBe(amount);
    }
  });

  it('picks up the unit when they price per something', () => {
    expect(parser.parse('QUOTE RFQ-7K29AB 8500 per kg').unit).toBe('kg');
    expect(parser.parse('QUOTE RFQ-7K29AB 8500/unit').unit).toBe('unit');
    expect(parser.parse('QUOTE RFQ-7K29AB 8500').unit).toBeNull();
  });

  it('never reads the reference digits as the price', () => {
    // RFQ-123456 would otherwise be a very cheap bid.
    const parsed = parser.parse('QUOTE RFQ-123456 8500');
    expect(parsed.rfqReference).toBe('RFQ-123456');
    expect(parsed.amount).toBe(8500);
  });

  it('corrects look-alike characters, which the alphabet makes safe', () => {
    // The reference alphabet has no O, I, L or U, so mapping them can only fix
    // a typo and can never corrupt a code that was already valid.
    const parsed = parser.parse('QUOTE RFQ-7K29OB 8500');
    expect(parsed.rfqReference).toBe('RFQ-7K290B');
    expect(parsed.warnings.join(' ')).toMatch(/look-alike/);
  });

  it('lowers confidence when it had to interpret rather than read', () => {
    const shorthand = parser.parse('QUOTE RFQ-7K29AB 8.5k');
    expect(shorthand.amount).toBe(8500);
    expect(shorthand.confidence).toBeLessThan(1);

    const ambiguous = parser.parse('RFQ-7K29AB 8500 for 20 bags');
    expect(ambiguous.amount).toBe(8500);
    expect(ambiguous.confidence).toBeLessThan(1);

    const noReference = parser.parse('my price is 8500');
    expect(noReference.rfqReference).toBeNull();
    expect(noReference.confidence).toBeLessThan(CONFIRMATION_THRESHOLD);
  });

  it('reports no amount instead of inventing one', () => {
    const parsed = parser.parse('QUOTE RFQ-7K29AB will send price tomorrow');
    expect(parsed.command).toBe('UNKNOWN');
    expect(parsed.amount).toBeNull();
  });

  it('recognises a supplier passing on the work', () => {
    const parsed = parser.parse('NO RFQ-7K29AB');
    expect(parsed.command).toBe('DECLINE');
    expect(parsed.rfqReference).toBe('RFQ-7K29AB');
  });

  it('honours STOP even when the message also carries a price', () => {
    // Consent to be messaged is not conditional on the rest of the message.
    const parsed = parser.parse('STOP QUOTE RFQ-7K29AB 8500');
    expect(parsed.command).toBe('STOP');
    expect(parsed.amount).toBeNull();
  });

  it('handles HELP and START', () => {
    expect(parser.parse('HELP').command).toBe('HELP');
    expect(parser.parse('?').command).toBe('HELP');
    expect(parser.parse('START').command).toBe('START');
  });

  it('recognises every opt-out phrasing carriers require', () => {
    // Carriers hold you to STOP, but real suppliers may also send
    // UNSUBSCRIBE, CANCEL or "OPT OUT". If any of these stopped being
    // interpreted as opt-out, the platform would ignore consent and become
    // a spam source. This test locks in the set.
    for (const body of ['STOP', 'stop', 'Stop please', 'UNSUBSCRIBE', 'unsubscribe now',
      'CANCEL', 'cancel', 'OPT OUT', 'opt out', 'OPTOUT']) {
      expect(parser.parse(body).command, body).toBe('STOP');
    }
  });

  it('recognises every opt-in phrasing that undoes a STOP', () => {
    for (const body of ['START', 'start', 'Start again', 'RESUME', 'resume',
      'SUBSCRIBE', 'subscribe', 'OPT IN', 'opt in', 'OPTIN']) {
      expect(parser.parse(body).command, body).toBe('START');
    }
  });

  it('recognises every help phrasing, including the single "?"', () => {
    for (const body of ['HELP', 'help', 'Help me', 'INFO', 'info', '?', '??', 'H', 'h']) {
      expect(parser.parse(body).command, body).toBe('HELP');
    }
  });

  it('treats an empty message as unreadable, not as a zero bid', () => {
    expect(parser.parse('').command).toBe('UNKNOWN');
    expect(parser.parse('   ').amount).toBeNull();
  });
});

describe('what a supplier may be told', () => {
  const payload = {
    publicRef: 'RFQ-7K29AB',
    alias: 'Bidder 4F2A',
    title: 'Turmeric finger - 5000 kg',
    category: 'Agriculture & Commodities',
    quantity: 5000,
    unit: 'kg',
    location: 'Erode',
    quoteDeadline: '2026-09-01T10:00:00.000Z',
    buyerDisplay: 'IDENTITY PROTECTED',
  };

  it('renders the enquiry without naming the buyer', () => {
    const message = renderRfqNotification(payload, ctx);
    expect(message.body).toContain('RFQ-7K29AB');
    expect(message.body).toContain('Erode');
    expect(message.body).toContain('IDENTITY PROTECTED');
    expect(message.body).toContain('QUOTE RFQ-7K29AB');
  });

  it('keeps the SMS version inside two segments', () => {
    const message = renderRfqNotification(payload, { ...ctx, channel: 'SMS' });
    expect(message.body.length).toBeLessThanOrEqual(320);
    expect(message.body).toContain('RFQ-7K29AB');
  });

  it('refuses a payload carrying the buyer, rather than stripping it', () => {
    // Loudly, because a payload with a buyer's name in it means something
    // upstream widened what suppliers are told, and silence would hide that.
    expect(() => renderRfqNotification({ ...payload, buyerName: 'Sunrise Residency' }, ctx))
      .toThrow(NotificationPolicyViolation);
    expect(() => renderRfqNotification({ ...payload, budget: 500000 }, ctx))
      .toThrow(NotificationPolicyViolation);
    expect(() => renderRfqNotification({ ...payload, committee: ['a'] }, ctx))
      .toThrow(NotificationPolicyViolation);
  });

  it('refuses anything not on the allow-list at all', () => {
    expect(() => assertPayloadIsSendable({ ...payload, somethingNew: 1 }))
      .toThrow(NotificationPolicyViolation);
  });
});

describe('the acknowledgement', () => {
  it('always echoes the price we recorded', () => {
    // This is the safety net for a misparse: the supplier sees the wrong number
    // and texts the right one.
    const message = renderQuoteAcknowledgement(
      { publicRef: 'RFQ-7K29AB', amount: 8500, magicLinkToken: 'tok123' },
      ctx,
    );
    expect(message.body).toContain('Rs. 8,500');
    expect(message.body).toContain('RFQ-7K29AB');
    expect(message.body).toContain('https://app.otp.test/q/tok123');
  });

  it('says plainly that an indicative price is not a submitted quote', () => {
    const message = renderQuoteAcknowledgement(
      { publicRef: 'RFQ-7K29AB', amount: 8500 },
      ctx,
    );
    expect(message.body.toLowerCase()).toContain('not a submitted quote');
  });

  it('asks for a check when the parse was uncertain', () => {
    const confident = renderQuoteAcknowledgement(
      { publicRef: 'RFQ-7K29AB', amount: 8500 },
      ctx,
    );
    const unsure = renderQuoteAcknowledgement(
      { publicRef: 'RFQ-7K29AB', amount: 8500, lowConfidence: true },
      ctx,
    );
    expect(confident.body).not.toContain('wrong');
    expect(unsure.body).toContain('wrong');
  });

  it('names a revision as a revision', () => {
    const message = renderQuoteAcknowledgement(
      { publicRef: 'RFQ-7K29AB', amount: 8200, version: 2 },
      ctx,
    );
    expect(message.templateId).toBe('quote_ack_revised');
    expect(message.body).toContain('Updated');
  });

  it('formats rupees the way the reader counts them', () => {
    expect(formatAmount(125000)).toBe('Rs. 1,25,000');
    expect(formatAmount(8500, 'USD')).toBe('$8,500');
  });
});

describe('replies that must not leak', () => {
  it('says the same thing for an unknown reference and an uninvited supplier', () => {
    // Otherwise this endpoint becomes a way to enumerate live tenders.
    const notFound = renderOutcomeReply('RFQ_NOT_FOUND', ctx, { reference: 'RFQ-7K29AB' });
    const notInvited = renderOutcomeReply('NOT_INVITED', ctx, { reference: 'RFQ-7K29AB' });
    expect(notFound?.templateId).toBe(notInvited?.templateId);
    expect(notFound?.body).toBe(notInvited?.body);
  });

  it('stays silent on duplicates and floods', () => {
    // A retried webhook has already been answered; answering again sends the
    // supplier a second text for one message.
    expect(renderOutcomeReply('DUPLICATE', ctx)).toBeNull();
    expect(renderOutcomeReply('RATE_LIMITED', ctx)).toBeNull();
  });

  it('answers the conversational outcomes', () => {
    expect(renderOutcomeReply('HELP', ctx)?.body).toContain('QUOTE RFQ-XXXXXX');
    expect(renderOutcomeReply('OPTED_OUT', ctx)?.body).toContain('not receive');
    expect(renderOutcomeReply('DECLINED', ctx, { reference: 'RFQ-7K29AB' })?.body)
      .toContain('RFQ-7K29AB');
  });

  it('teaches STOP inside every HELP reply', () => {
    // Carrier compliance: an automatic reply to HELP must tell the recipient
    // how to opt out. If the STOP keyword ever drops off the HELP body, the
    // account can lose its A2P registration on carrier audits.
    const help = renderOutcomeReply('HELP', ctx);
    expect(help?.body).toMatch(/\bSTOP\b/);
  });
});

describe('providers', () => {
  it('mock refuses unsigned webhooks even though it is the demo provider', () => {
    // Absence of a secret means refuse, not allow: the demo provider is still
    // reachable over the internet.
    const noSecret = new MockMessagingProvider();
    const withSecret = new MockMessagingProvider({ sharedSecret: 'shh' });
    const request = {
      method: 'POST',
      url: 'https://x/messaging-inbound',
      headers: { 'x-mock-signature': 'shh' },
      rawBody: '{}',
    };

    return Promise.all([
      expect(noSecret.verify(request)).resolves.toBe(false),
      expect(withSecret.verify(request)).resolves.toBe(true),
      expect(withSecret.verify({ ...request, headers: { 'x-mock-signature': 'no' } }))
        .resolves.toBe(false),
    ]);
  });

  it('mock records what it sent and can be made to fail', async () => {
    const provider = new MockMessagingProvider({ failSendsTo: ['+919000000002'] });

    const ok = await provider.send({ to: '+919000000001', channel: 'SMS', body: 'hi' });
    expect(ok.status).toBe('SENT');
    expect(provider.outbox).toHaveLength(1);

    const failed = await provider.send({ to: '+919000000002', channel: 'SMS', body: 'hi' });
    expect(failed.status).toBe('FAILED');
    expect(failed.failureReason).toBeTruthy();
  });

  it('twilio verifies the signature Twilio actually sends', async () => {
    const authToken = 'test-token';
    const url = 'https://x.functions.supabase.co/messaging-inbound';
    const rawBody = 'Body=QUOTE+RFQ-7K29AB+8500&From=%2B919876543210&MessageSid=SM1';

    // Twilio signs the URL followed by the POST parameters sorted by name.
    const params = new URLSearchParams(rawBody);
    let payload = url;
    for (const key of [...params.keys()].sort()) payload += key + params.get(key);
    const signature = await hmacSha1Base64(authToken, payload);

    const provider = new TwilioMessagingProvider({
      accountSid: 'AC1',
      authToken,
      webhookUrl: url,
    });

    await expect(provider.verify({
      method: 'POST', url, rawBody,
      headers: { 'x-twilio-signature': signature },
    })).resolves.toBe(true);

    await expect(provider.verify({
      method: 'POST', url, rawBody,
      headers: { 'x-twilio-signature': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    })).resolves.toBe(false);

    await expect(provider.verify({ method: 'POST', url, rawBody, headers: {} }))
      .resolves.toBe(false);
  });

  it('twilio separates a message from a delivery receipt', () => {
    const provider = new TwilioMessagingProvider({ accountSid: 'AC1', authToken: 't' });

    const [message] = provider.parse({
      method: 'POST', url: 'https://x', headers: {},
      rawBody: 'Body=QUOTE+RFQ-7K29AB+8500&From=whatsapp%3A%2B919876543210&MessageSid=SM1',
    });
    expect(message?.channel).toBe('WHATSAPP');
    expect(message?.from).toBe('+919876543210');
    expect(message?.externalMessageId).toBe('SM1');

    const receipt = {
      method: 'POST', url: 'https://x', headers: {},
      rawBody: 'MessageStatus=delivered&MessageSid=SM1',
    };
    expect(provider.parse(receipt)).toHaveLength(0);
    expect(provider.parseStatus(receipt)[0]?.status).toBe('DELIVERED');
  });

  it('meta verifies its own signature scheme', async () => {
    const appSecret = 'app-secret';
    const rawBody = JSON.stringify({ entry: [] });
    const signature = await hmacSha256Hex(appSecret, rawBody);

    const provider = new MetaWhatsAppProvider({
      phoneNumberId: '1', accessToken: 't', appSecret,
    });

    await expect(provider.verify({
      method: 'POST', url: 'https://x', rawBody,
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
    })).resolves.toBe(true);

    await expect(provider.verify({
      method: 'POST', url: 'https://x', rawBody,
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
    })).resolves.toBe(false);
  });

  it('meta reads batched text messages and ignores media', () => {
    const provider = new MetaWhatsAppProvider({
      phoneNumberId: '1', accessToken: 't', appSecret: 's',
    });

    const messages = provider.parse({
      method: 'POST', url: 'https://x', headers: {},
      rawBody: JSON.stringify({
        entry: [{
          changes: [{
            value: {
              messages: [
                { id: 'wamid.1', from: '919876543210', type: 'text', text: { body: 'QUOTE RFQ-7K29AB 8500' } },
                // A photo of a handwritten price is not something to guess at.
                { id: 'wamid.2', from: '919876543211', type: 'image', image: {} },
              ],
            },
          }],
        }],
      }),
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.from).toBe('+919876543210');
    expect(messages[0]?.externalMessageId).toBe('wamid.1');
  });

  it('never silently falls back to the mock provider', () => {
    // A production deployment missing credentials must fail, not pretend to work
    // while every enquiry goes nowhere.
    expect(() => resolveProvider({ MESSAGING_PROVIDER: 'TWILIO' }))
      .toThrow(MessagingConfigError);
    expect(() => resolveProvider({ MESSAGING_PROVIDER: 'META' }))
      .toThrow(MessagingConfigError);
    expect(() => resolveProvider({ MESSAGING_PROVIDER: 'CARRIER_PIGEON' }))
      .toThrow(MessagingConfigError);

    expect(resolveProvider({ MESSAGING_PROVIDER: 'MOCK' }).id).toBe('MOCK');
    expect(resolveProvider({
      MESSAGING_PROVIDER: 'TWILIO',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
    }).id).toBe('TWILIO');
  });
});

/**
 * The single-sender contract.
 *
 * The core of what the platform sells is that buyers and suppliers never share
 * a messaging thread: every message a supplier receives comes from an
 * OTP-owned WhatsApp/SMS handset, and every reply lands back at the same one.
 * That is the property this block guards. A provider that lets a caller name
 * the sender per-message, or that could be tricked into sending to a buyer's
 * number by a mis-shaped payload, would defeat the guarantee before any RLS
 * policy was consulted.
 */
describe('single platform sender', () => {
  interface Captured {
    url: string;
    from?: string;
    to?: string;
    body: string;
    method: string;
  }

  function captureFetch(captured: Captured[]): typeof fetch {
    return (async (input: unknown, init: unknown) => {
      const request = init as RequestInit & { body?: BodyInit | null };
      const url = typeof input === 'string' ? input : String(input);

      // Providers may hand fetch either a serialised body (Meta uses JSON) or a
      // URLSearchParams the runtime serialises on send (Twilio uses this). Both
      // paths reach the wire, so both have to be captured.
      let rawBody = '';
      if (typeof request?.body === 'string') {
        rawBody = request.body;
      } else if (request?.body instanceof URLSearchParams) {
        rawBody = request.body.toString();
      }

      const entry: Captured = {
        url,
        method: String(request?.method ?? 'GET'),
        body: rawBody,
      };

      if (rawBody.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawBody);
          entry.to = parsed.to;
        } catch { /* ignore */ }
      } else {
        const params = new URLSearchParams(rawBody);
        entry.from = params.get('From') ?? undefined;
        entry.to = params.get('To') ?? undefined;
      }

      captured.push(entry);

      return new Response(
        JSON.stringify({ sid: 'SM_out', status: 'queued', messages: [{ id: 'wamid.out' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
  }

  it('twilio always sends from the configured platform WhatsApp handset', async () => {
    const captured: Captured[] = [];
    const provider = new TwilioMessagingProvider({
      accountSid: 'AC1',
      authToken: 't',
      smsFrom: '+911111111111',
      whatsappFrom: '+912222222222',
      fetchImpl: captureFetch(captured),
    });

    // Two suppliers, two enquiries — same platform From either way.
    await provider.send({ to: '+919000000001', channel: 'WHATSAPP', body: 'first' });
    await provider.send({ to: '+919000000002', channel: 'WHATSAPP', body: 'second' });

    expect(captured).toHaveLength(2);
    for (const call of captured) {
      expect(call.from).toBe('whatsapp:+912222222222');
      expect(call.to).toMatch(/^whatsapp:\+91900000000[12]$/);
    }
  });

  it('twilio SMS also fixes the sender to the platform SMS handset', async () => {
    const captured: Captured[] = [];
    const provider = new TwilioMessagingProvider({
      accountSid: 'AC1',
      authToken: 't',
      smsFrom: '+911111111111',
      whatsappFrom: '+912222222222',
      fetchImpl: captureFetch(captured),
    });

    await provider.send({ to: '+919000000001', channel: 'SMS', body: 'first' });

    expect(captured[0]?.from).toBe('+911111111111');
    expect(captured[0]?.to).toBe('+919000000001');
  });

  it('twilio refuses to send when the platform handset is not configured', async () => {
    // Failing loudly rather than borrowing whatever number happens to be on the
    // account is what stops a misconfiguration from leaking a real employee's
    // Twilio number as the From.
    const provider = new TwilioMessagingProvider({
      accountSid: 'AC1',
      authToken: 't',
      fetchImpl: () => { throw new Error('should not send without a configured sender'); },
    });

    const receipt = await provider.send({
      to: '+919000000001', channel: 'WHATSAPP', body: 'x',
    });
    expect(receipt.status).toBe('FAILED');
    expect(receipt.failureReason).toMatch(/No Twilio sender configured/);
  });

  it('meta posts through the configured phoneNumberId, not a payload-supplied one', async () => {
    const captured: Captured[] = [];
    const provider = new MetaWhatsAppProvider({
      phoneNumberId: '111222333',
      accessToken: 't',
      appSecret: 's',
      fetchImpl: captureFetch(captured),
    });

    // Even if a payload tried to name a different origin, the URL is derived
    // from the config alone. That is what makes the platform sender the sole
    // origin on Meta.
    await provider.send({ to: '+919000000001', channel: 'WHATSAPP', body: 'first' });
    await provider.send({ to: '+919000000002', channel: 'WHATSAPP', body: 'second' });

    for (const call of captured) {
      expect(call.url).toContain('/111222333/messages');
      // Meta wants recipients without the leading plus, on the platform's own
      // handset only.
      expect(call.to).toMatch(/^91900000000[12]$/);
    }
  });

  it('meta refuses to route non-WhatsApp channels through its WhatsApp handset', async () => {
    const provider = new MetaWhatsAppProvider({
      phoneNumberId: '1', accessToken: 't', appSecret: 's',
      fetchImpl: () => { throw new Error('meta should not send SMS'); },
    });

    const receipt = await provider.send({
      to: '+919000000001',
      channel: 'SMS',
      body: 'x',
    });
    expect(receipt.status).toBe('FAILED');
    expect(receipt.failureReason).toMatch(/WhatsApp only/);
  });

  it('the outbound allow-list rejects every buyer identifier by name', () => {
    // The negative that matters: none of these fields may travel to a supplier
    // in a message, no matter what the upstream row looks like.
    const base = { publicRef: 'RFQ-7K29AB' };
    for (const forbidden of [
      { buyerName: 'Greenview Society' },
      { buyer_name: 'Greenview Society' },
      { buyerId: 'a0000000-0000-4000-8000-000000000001' },
      { organizationId: 'a0000000-0000-4000-8000-000000000001' },
      { contactPhone: '+919000000001' },
      { contactEmail: 'buyer@greenview.test' },
      { address: '5th Cross, Indiranagar, Bengaluru 560038' },
      { budget: 500000 },
      { budgetMin: 300000 },
      { budgetMax: 700000 },
      { evaluationWeights: { price: 0.5 } },
      { committee: ['a', 'b'] },
    ]) {
      expect(() => assertPayloadIsSendable({ ...base, ...forbidden } as never),
        `payload should reject ${Object.keys(forbidden)[0]}`)
        .toThrow(NotificationPolicyViolation);
    }
  });
});
