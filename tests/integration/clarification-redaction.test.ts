/**
 * The masked thread, and the participants who would unmask it themselves.
 *
 * Everything else in this schema protects identity from the other side. The Q&A
 * thread is the one place where a supplier can hand their identity over
 * voluntarily — "call me on 98765 43210" — and every salted alias and blind
 * comparison view stops meaning anything for that enquiry.
 *
 * The interesting half of this file is not the numbers that get removed. It is the
 * numbers that must not: this is a negotiation thread, so it is full of prices,
 * quantities, model numbers and pin codes, and a redaction that eats a price is a
 * worse feature than no redaction at all. Both halves are asserted here, and the
 * two are the same rule seen from either side.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

type Client = ReturnType<typeof createAnonClient>;

let service: ReturnType<typeof createServiceClient>;

let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (up) {
    service = createServiceClient();
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

const HOUR = 3_600_000;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const created: string[] = [];

afterEach(async () => {
  if (!up) return;
  for (const id of created.splice(0)) {
    const { error } = await service.from('requirements').delete().eq('id', id);
    if (error) {
      throw new Error(`redaction fixture teardown failed: ${error.message}`);
    }
  }
});

interface Thread {
  rfqId: string;
  invitationId: string;
}

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data!.id as string;
}

/**
 * A per-RFQ alias of the same shape the allocator produces.
 *
 * Random rather than fixed for the reason 00022 gives: a label repeated across
 * enquiries is a join key back to the supplier.
 */
function freshAlias(): string {
  return `Bidder ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** An enquiry sitting in its clarification window, with one invited bidder. */
async function makeThread(options: { revealed?: boolean } = {}): Promise<Thread> {
  const creator = await profileIdFor(DEMO.logins.sunriseManager);

  // Classified, because these rows are visible to the engine tests that scan
  // every requirement for a missing subcategory or a type that contradicts the
  // mode, and the files run at the same time.
  const { data: subcategory } = await service
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data: requirement } = await service
    .from('requirements')
    .insert({
      organization_id: DEMO.orgs.sunrise,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: subcategory!.category_id,
      subcategory_id: subcategory!.id,
      status: 'NEGOTIATION',
      title: 'Redaction fixture',
      description: 'Created by tests/integration/clarification-redaction.test.ts',
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();

  created.push(requirement!.id);

  const { data: rfq } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: DEMO.orgs.sunrise,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: 'Redaction fixture',
      created_by: creator,
      buyer_anonymous_to_suppliers: true,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(12 * HOUR),
      revision_deadline: at(24 * HOUR),
    })
    .select('id')
    .single();

  const { data: invitation } = await service
    .from('rfq_invitations')
    .insert({
      rfq_id: rfq!.id,
      supplier_id: DEMO.suppliers.aquaPrime,
      anonymous_label: freshAlias(),
      status: 'INVITED',
    })
    .select('id')
    .single();

  await service.from('rfqs').update({ status: 'CLARIFICATION' }).eq('id', rfq!.id);

  if (options.revealed) {
    await service.from('rfqs').update({ reveal_status: 'REVEALED' }).eq('id', rfq!.id);
  }

  return { rfqId: rfq!.id, invitationId: invitation!.id };
}

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

interface Posted {
  body: string;
  redactions: string[];
  error: string | null;
}

/** Posts as the buyer and reads back what was actually stored. */
async function post(thread: Thread, body: string): Promise<Posted> {
  const buyer = await sessionFor(DEMO.logins.sunriseManager);

  const { data, error } = await buyer
    .from('rfq_clarification_messages')
    .insert({
      rfq_id: thread.rfqId,
      invitation_id: thread.invitationId,
      author_profile_id: await profileIdFor(DEMO.logins.sunriseManager),
      author_side: 'BUYER',
      body,
    })
    .select('body, redactions')
    .single();

  if (error) return { body: '', redactions: [], error: error.message };
  return { body: data!.body, redactions: data!.redactions ?? [], error: null };
}

describe('what gets taken out', () => {
  let thread: Thread;

  beforeEach(async () => {
    if (!up) return;
    thread = await makeThread();
  });

  it('removes an email address', async () => {
    const result = await post(thread, 'Send the datasheet to arun@aquaprime.co.in please');

    expect(result.body).toContain('[email removed]');
    expect(result.body).not.toContain('aquaprime');
    expect(result.redactions).toContain('EMAIL');
  });

  it('removes a link, with or without a scheme', async () => {
    const withScheme = await post(thread, 'Specs at https://aquaprime.example/motor');
    const bare = await post(thread, 'See www.aquaprime.example for the range');

    expect(withScheme.body).toContain('[link removed]');
    expect(withScheme.redactions).toContain('LINK');
    expect(bare.body).toContain('[link removed]');
  });

  it('removes a wa.me link, which is a phone number wearing a URL', async () => {
    const result = await post(thread, 'Reach us on wa.me/919876543210');

    expect(result.body).not.toMatch(/9876543210/);
    expect(result.redactions.length).toBeGreaterThan(0);
  });

  it('removes a social handle', async () => {
    const result = await post(thread, 'We post job photos as @aquaprime_works daily');

    expect(result.body).toContain('[handle removed]');
    expect(result.redactions).toContain('HANDLE');
  });

  it('removes a number written with a country code', async () => {
    const result = await post(thread, 'Our office line is +91 80 4123 7788 during the day');

    expect(result.body).toContain('[phone removed]');
    expect(result.body).not.toMatch(/4123/);
    expect(result.redactions).toContain('PHONE');
  });

  it('removes ten digits run together, which is only ever a number', async () => {
    const result = await post(thread, 'Confirm on 9876543210 by evening');

    expect(result.body).toContain('[phone removed]');
    expect(result.redactions).toContain('PHONE');
  });

  it('removes a punctuated number', async () => {
    const result = await post(thread, 'Landline 080-4123-7788 works too');

    expect(result.body).not.toMatch(/4123/);
    expect(result.redactions).toContain('PHONE');
  });

  it('removes a GST number, which names a business exactly', async () => {
    const result = await post(thread, 'Bill against 29ABCDE1234F1Z5 for the rewinding');

    expect(result.body).toContain('[registration removed]');
    expect(result.redactions).toContain('REGISTRATION');
  });

  it('removes a PAN when it is labelled as one', async () => {
    const result = await post(thread, 'PAN ABCDE1234F is on the invoice');

    expect(result.body).toContain('[registration removed]');
    expect(result.redactions).toContain('REGISTRATION');
  });

  it('records every kind it removed, so the interface can explain the gaps', async () => {
    const result = await post(
      thread,
      'Mail arun@aquaprime.co.in or call 9876543210, specs at https://aquaprime.example',
    );

    expect(new Set(result.redactions)).toEqual(new Set(['EMAIL', 'LINK', 'PHONE']));
  });
});

describe('the ambiguous shape: five digits, a space, five digits', () => {
  let thread: Thread;

  beforeEach(async () => {
    if (!up) return;
    thread = await makeThread();
  });

  it('reads it as a number when the sentence is offering one', async () => {
    const result = await post(thread, 'Please call 98765 43210 to discuss the winding');

    expect(result.body).toContain('[phone removed]');
    expect(result.body).not.toMatch(/98765/);
    expect(result.redactions).toContain('PHONE');
  });

  it('catches WhatsApp as intent, however it is spelt', async () => {
    const spaced = await post(thread, 'Whats app 98765 43210 for photos');
    const joined = await post(thread, 'WhatsApp 91234 56789 for photos');

    expect(spaced.redactions).toContain('PHONE');
    expect(joined.redactions).toContain('PHONE');
  });

  it('reads it as money when the sentence is quoting two figures', async () => {
    const result = await post(
      thread,
      'Rewinding is 45000 32000 for the two motors respectively',
    );

    expect(result.body).toContain('45000');
    expect(result.body).toContain('32000');
    expect(result.redactions).toEqual([]);
  });

  it('treats an address already found as intent, because nobody prices next to an email', async () => {
    const result = await post(
      thread,
      'Write to arun@aquaprime.co.in or try 98765 43210 instead',
    );

    expect(result.body).not.toMatch(/98765/);
    expect(new Set(result.redactions)).toEqual(new Set(['EMAIL', 'PHONE']));
  });
});

describe('what must survive, because this is a negotiation', () => {
  let thread: Thread;

  beforeEach(async () => {
    if (!up) return;
    thread = await makeThread();
  });

  it('leaves a price alone', async () => {
    const result = await post(thread, 'Our revised quote is Rs 42,500 including GST at 18%');

    expect(result.body).toContain('42,500');
    expect(result.redactions).toEqual([]);
  });

  it('leaves quantities and ratings alone', async () => {
    const result = await post(thread, 'Supplying 12 units of 12.5 HP, 1440 RPM, 415 V');

    expect(result.body).toContain('12.5 HP');
    expect(result.body).toContain('1440 RPM');
    expect(result.redactions).toEqual([]);
  });

  it('leaves a model number alone, which is the thing being quoted', async () => {
    const result = await post(thread, 'We propose model CRI4W1200 with a copper winding');

    expect(result.body).toContain('CRI4W1200');
    expect(result.redactions).toEqual([]);
  });

  it('leaves a delivery date and a warranty period alone', async () => {
    const result = await post(thread, 'Delivery by 12-09-2026 with 24 months warranty');

    expect(result.body).toContain('2026');
    expect(result.body).toContain('24 months');
    expect(result.redactions).toEqual([]);
  });

  it('leaves a pin code alone when nobody is being asked to call anyone', async () => {
    const result = await post(thread, 'Site is in the 560095 zone for delivery planning');

    expect(result.body).toContain('560095');
    expect(result.redactions).toEqual([]);
  });

  it('leaves a whole technical answer untouched', async () => {
    const body =
      'Yes, we can do 12.5 HP with copper winding, 1440 RPM, IP55, ' +
      'delivered in 6 days at 43,200 per unit, warranty 18 months.';

    const result = await post(thread, body);

    expect(result.body).toBe(body);
    expect(result.redactions).toEqual([]);
  });
});

describe('a message that was only a contact detail', () => {
  it('is refused, and says why rather than complaining about whitespace', async () => {
    const thread = await makeThread();

    const result = await post(thread, '9876543210');

    expect(result.error).toMatch(/only contact details/i);
  });

  it('is refused even when it is only punctuation around the number', async () => {
    const thread = await makeThread();

    const result = await post(thread, '  9876543210 !!  ');

    expect(result.error).toMatch(/only contact details/i);
  });

  it('is kept when a real question survives beside the number', async () => {
    const thread = await makeThread();

    const result = await post(thread, 'What gauge? Call 9876543210 if easier');

    expect(result.error).toBeNull();
    expect(result.body).toContain('What gauge?');
    expect(result.body).toContain('[phone removed]');
  });
});

describe('both sides, and the moment it stops applying', () => {
  it('redacts the buyer too, because a named buyer changes what bidders quote', async () => {
    const thread = await makeThread();
    const result = await post(thread, 'Call the society office on 9876500000 to arrange access');

    expect(result.body).toContain('[phone removed]');
    expect(result.redactions).toContain('PHONE');
  });

  it('redacts a supplier posting on their own side of the thread', async () => {
    const thread = await makeThread();
    const supplier = await sessionFor(DEMO.logins.motorSupplier);

    const { data, error } = await supplier
      .from('rfq_clarification_messages')
      .insert({
        rfq_id: thread.rfqId,
        invitation_id: thread.invitationId,
        author_profile_id: await profileIdFor(DEMO.logins.motorSupplier),
        author_side: 'SUPPLIER',
        body: 'Happy to explain — reach me on 9876543210 any time',
      })
      .select('body, redactions')
      .single();

    expect(error).toBeNull();
    expect(data!.body).toContain('[phone removed]');
    expect(data!.redactions).toContain('PHONE');
  });

  it('stops once identities are out, because then contact details are the point', async () => {
    const thread = await makeThread({ revealed: true });
    const body = 'Now that we are awarded, call Arun on 9876543210 to fix the site visit';

    const result = await post(thread, body);

    expect(result.body).toBe(body);
    expect(result.redactions).toEqual([]);
  });
});

describe('storage, not presentation', () => {
  it('never stores the identifying text, so no later query or export can find it', async () => {
    const thread = await makeThread();
    await post(thread, 'Call 9876543210 or mail arun@aquaprime.co.in');

    // Read as service_role, straight off the base table: the strongest reader
    // there is, bypassing every policy and view.
    const { data } = await service
      .from('rfq_clarification_messages')
      .select('body')
      .eq('rfq_id', thread.rfqId);

    const stored = data!.map((row) => row.body).join(' ');
    expect(stored).not.toMatch(/9876543210/);
    expect(stored).not.toMatch(/aquaprime/);
  });

  it('tells the buyer\u2019s thread what was removed', async () => {
    const thread = await makeThread();
    await post(thread, 'Call 9876543210 about the winding');

    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const { data, error } = await buyer
      .from('rfq_clarification_blind')
      .select('body, redactions, author_display')
      .eq('rfq_id', thread.rfqId);

    expect(error).toBeNull();
    expect(data![0]!.redactions).toContain('PHONE');
    expect(data![0]!.body).toContain('[phone removed]');
    // And the thread is still masked: no bidder name, only the alias or the org.
    expect(data![0]!.author_display).toBe('Buyer organization');
  });

  it('tells the supplier\u2019s thread the same thing', async () => {
    const thread = await makeThread();
    await post(thread, 'Call 9876543210 about the winding');

    const supplier = await sessionFor(DEMO.logins.motorSupplier);
    const { data } = await supplier
      .from('rfq_clarification_supplier')
      .select('body, redactions')
      .eq('rfq_id', thread.rfqId);

    expect(data![0]!.redactions).toContain('PHONE');
  });

  it('leaves an untouched message with an empty record rather than a null one', async () => {
    const thread = await makeThread();
    const result = await post(thread, 'What is the winding gauge you propose?');

    expect(result.redactions).toEqual([]);
  });
});
