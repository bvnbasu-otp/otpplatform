/**
 * The messaging-body redactor, applied to the shapes a supplier actually types.
 *
 * The clarification thread was the first surface that let free text through
 * (see 00042). The WhatsApp/SMS gateway is the second: a supplier answering an
 * invitation on their phone will sign off with a name, a wa.me link, a GSTIN
 * on the letterhead, an "or call me on 98…" appended out of habit. Every one
 * of those defeats the salted alias for that enquiry.
 *
 * The redactor itself is shared with 00042. This file exercises
 * public.redact_message_body — the wrapper 00046 adds so any messaging-facing
 * surface has one obvious way to call it — against the specific inputs that
 * matter for supplier messages. The harder half is the negative side: prices,
 * quantities and RFQ references must survive, or the redactor is worse than
 * useless.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

let up = false;
const service = createServiceClient();

async function redact(body: string): Promise<{ body: string; kinds: string[] }> {
  const { data, error } = await service.rpc('redact_message_body', { p_body: body });
  if (error) throw new Error(`redact_message_body failed: ${error.message}`);
  const result = data as { body: string; kinds: string[] };
  return { body: result.body, kinds: result.kinds ?? [] };
}

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

describe('redacting a supplier message body', () => {
  it('removes a phone appended to a valid quote line', async () => {
    // The commonest leak: the supplier types the price the way the invitation
    // asked, then adds a phone number "in case you want to talk".
    const { body, kinds } = await redact('QUOTE RFQ-7K29AB 8500 — call me on 98765 43210');
    expect(body).toContain('RFQ-7K29AB');
    expect(body).toContain('8500');
    expect(body).not.toMatch(/98765/);
    expect(body).toContain('[phone removed]');
    expect(kinds).toContain('PHONE');
  });

  it('removes a wa.me link even without any phone-shaped digits', async () => {
    // A wa.me URL is a phone number wearing a URL. If this survived, the
    // alias-only comparison view would be readable from a link on the invite
    // trail.
    const { body, kinds } = await redact('Ping me at wa.me/919876543210 for a call.');
    expect(body).not.toMatch(/wa\.me/);
    expect(body).toContain('[handle removed]');
    expect(kinds).toContain('HANDLE');
  });

  it('removes an email signature line', async () => {
    const { body, kinds } = await redact(
      'Regards,\nRaj Sharma\nSharma Motors\nraj@sharma.co.in',
    );
    expect(body).not.toMatch(/@sharma\.co\.in/);
    expect(body).toContain('[email removed]');
    expect(kinds).toContain('EMAIL');
  });

  it('removes a GSTIN in a signature', async () => {
    const { body, kinds } = await redact('GST 29ABCDE1234F1Z5. Best price 8500.');
    expect(body).not.toMatch(/29ABCDE1234F1Z5/);
    expect(body).toContain('[registration removed]');
    expect(kinds).toContain('REGISTRATION');
    // The price on the same line has to make it through.
    expect(body).toContain('8500');
  });

  it('preserves two prices written the same shape as a phone number', async () => {
    // "45000 32000" is two amounts under negotiation. If this became a phone,
    // the negotiation record is corrupted and the supplier is worse off than
    // if no redaction had run at all.
    const { body, kinds } = await redact('Best I can do is 45000 32000 depending on load.');
    expect(body).toContain('45000');
    expect(body).toContain('32000');
    expect(kinds).not.toContain('PHONE');
  });

  it('preserves an RFQ reference with digits and dashes', async () => {
    // Public refs read like phone numbers to a lazy regex. This one has to
    // survive because the acknowledgement is built around it.
    const { body } = await redact('Bidding RFQ-7K29AB — my price is 8500');
    expect(body).toContain('RFQ-7K29AB');
    expect(body).toContain('8500');
  });

  it('reports every kind of PII removed, so the caller can label the placeholders', async () => {
    // The FAQ answer promises identity protection "on every route in", which
    // depends on the surface being able to explain why a placeholder appeared.
    const { body, kinds } = await redact(
      'Call me on +91 98765 43210, mail raj@sharma.co.in, or wa.me/919876543211',
    );
    expect(body).not.toMatch(/98765/);
    expect(body).not.toMatch(/@sharma\.co\.in/);
    expect(body).not.toMatch(/wa\.me/);
    expect(kinds).toEqual(expect.arrayContaining(['EMAIL', 'HANDLE', 'PHONE']));
  });

  it('leaves a plain body alone and reports no redactions', async () => {
    // Over-eager redaction is the failure mode 00042 warned against. A plain
    // clarification of a specification must arrive unchanged.
    const { body, kinds } = await redact('Confirming 20 kg per bag, 12 bags total.');
    expect(body).toBe('Confirming 20 kg per bag, 12 bags total.');
    expect(kinds).toEqual([]);
  });

  it('handles a NULL body without failing', async () => {
    // A provider that delivers an empty payload must not crash the caller.
    const { body, kinds } = await redact(null as unknown as string);
    expect(body).toBeNull();
    expect(kinds).toEqual([]);
  });
});
