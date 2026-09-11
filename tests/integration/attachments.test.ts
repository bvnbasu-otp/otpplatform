/**
 * Attachments, from the sessions that actually read them.
 *
 * The interesting failures here are not upload errors, they are leaks and
 * silences: a filename that names the bidder, a filename that names the buyer,
 * or a drawing that quietly never reaches the suppliers being asked to price
 * the job it describes.
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
import { DEMO, findBlindLeaks } from '../helpers/demo-fixtures';

type Client = ReturnType<typeof createAnonClient>;

let up = false;
const createdRequirements: string[] = [];
const createdAttachments: string[] = [];

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

afterEach(async () => {
  const service = createServiceClient();
  if (createdAttachments.length > 0) {
    await service.from('attachments').delete().in('id', createdAttachments);
    createdAttachments.length = 0;
  }
  if (createdRequirements.length > 0) {
    await service.from('requirements').delete().in('id', createdRequirements);
    createdRequirements.length = 0;
  }
});

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

async function profileId(client: Client) {
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data } = await client
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user!.id)
    .single();
  return data!.id as string;
}

async function attach(
  client: Client,
  args: {
    scope: 'REQUIREMENT' | 'QUOTE';
    requirementId?: string;
    quoteId?: string;
    kind: string;
    filename: string;
  },
) {
  const { data, error } = await client.rpc('create_attachment_slot', {
    p_scope: args.scope,
    p_requirement_id: args.requirementId ?? null,
    p_quote_id: args.quoteId ?? null,
    p_kind: args.kind,
    p_original_filename: args.filename,
    p_content_type: 'application/pdf',
    p_size_bytes: 2048,
    p_duration_seconds: null,
  });

  if (error) return { error };

  const slot = data as { attachment_id: string; storage_path: string; display_name: string };
  createdAttachments.push(slot.attachment_id);
  return { slot };
}

/** A published requirement of the buyer's own, so the RFQ side is real. */
async function publishedRequirement(client: Client) {
  const { data: subcategory } = await client
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data: draft, error } = await client
    .from('requirements')
    .insert({
      organization_id: DEMO.orgs.sunrise,
      created_by: await profileId(client),
      requirement_type: 'SERVICE',
      status: 'DRAFT',
      title: 'Motor rewinding with drawing',
      description: '12.5 HP submersible motor, rewinding needed',
      category_id: subcategory!.category_id,
      subcategory_id: subcategory!.id,
      requirement_mode: 'REPAIR_MAINTENANCE',
      attributes: { motor_hp: 12.5 },
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();

  if (error) throw new Error(`draft insert failed: ${error.message}`);
  createdRequirements.push(draft!.id);
  return draft!.id as string;
}

describe('naming is assigned by the server, not the uploader', () => {
  it('gives a requirement file a neutral display name and an id-only path', async () => {
    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const requirementId = await publishedRequirement(buyer);

    const { slot, error } = await attach(buyer, {
      scope: 'REQUIREMENT',
      requirementId,
      kind: 'DRAWING',
      filename: 'Sunrise Residency pump room layout.pdf',
    });

    expect(error).toBeUndefined();
    expect(slot!.display_name).toBe('Drawing 1');
    // A path is the one part of a file a signed URL always shows.
    expect(slot!.storage_path).toBe(`requirements/${requirementId}/${slot!.attachment_id}`);
    expect(slot!.storage_path).not.toMatch(/sunrise/i);
  });

  it('numbers files of the same kind in the order they arrive', async () => {
    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const requirementId = await publishedRequirement(buyer);

    const first = await attach(buyer, {
      scope: 'REQUIREMENT',
      requirementId,
      kind: 'DRAWING',
      filename: 'a.pdf',
    });
    const second = await attach(buyer, {
      scope: 'REQUIREMENT',
      requirementId,
      kind: 'DRAWING',
      filename: 'b.pdf',
    });
    const note = await attach(buyer, {
      scope: 'REQUIREMENT',
      requirementId,
      kind: 'VOICE_NOTE',
      filename: 'c.webm',
    });

    expect(first.slot!.display_name).toBe('Drawing 1');
    expect(second.slot!.display_name).toBe('Drawing 2');
    // Numbering is per kind, so a voice note starts again at one.
    expect(note.slot!.display_name).toBe('Voice note 1');
  });

  it('refuses a file from an organization that does not own the requirement', async () => {
    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const requirementId = await publishedRequirement(buyer);

    const outsider = await sessionFor(DEMO.logins.kovaiOwner);
    const { error } = await attach(outsider, {
      scope: 'REQUIREMENT',
      requirementId,
      kind: 'DOCUMENT',
      filename: 'nosy.pdf',
    });

    expect(error).not.toBeUndefined();
  });
});

describe('a drawing attached before publish still reaches the suppliers', () => {
  it('links the file to the RFQ created afterwards', async () => {
    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const requirementId = await publishedRequirement(buyer);

    // The ordinary case: the buyer attaches the drawing while the requirement
    // is still a draft, so there is no RFQ to point at yet.
    const { slot } = await attach(buyer, {
      scope: 'REQUIREMENT',
      requirementId,
      kind: 'DRAWING',
      filename: 'pump layout.pdf',
    });

    const service = createServiceClient();
    const { data: beforePublish } = await service
      .from('attachments')
      .select('rfq_id')
      .eq('id', slot!.attachment_id)
      .single();

    expect(beforePublish!.rfq_id).toBeNull();

    const { data: published, error } = await buyer.rpc('publish_requirement', {
      p_requirement_id: requirementId,
    });
    expect(error).toBeNull();

    const { data: afterPublish } = await service
      .from('attachments')
      .select('rfq_id')
      .eq('id', slot!.attachment_id)
      .single();

    expect(afterPublish!.rfq_id).toBe((published as { rfqId: string }).rfqId);
  });
});

describe('what an invited supplier sees of the buyer’s files', () => {
  it('shows the drawing without the filename or the uploader', async () => {
    const service = createServiceClient();

    // The seeded motor RFQ already has an invited supplier.
    const { data: slotRow, error: insertError } = await service
      .from('attachments')
      .insert({
        scope: 'REQUIREMENT',
        requirement_id: DEMO.requirements.motor,
        original_filename: 'Sunrise Residency borewell drawing.pdf',
        storage_path: 'pending',
        content_type: 'application/pdf',
        size_bytes: 4096,
        kind: 'DRAWING',
        uploaded_by: (
          await service
            .from('profiles')
            .select('id')
            .eq('email', DEMO.logins.sunriseManager)
            .single()
        ).data!.id,
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();
    createdAttachments.push(slotRow!.id);

    const supplier = await sessionFor(DEMO.logins.motorSupplier);
    const { data: shared, error } = await supplier
      .from('requirement_attachments_shared')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(error).toBeNull();
    expect(shared!.length).toBeGreaterThan(0);

    const row = shared!.find((r) => r.attachment_id === slotRow!.id);
    expect(row).toBeDefined();
    expect(row!.display_name).toMatch(/^Drawing \d+$/);
    // The filename names the apartment complex; that is the buyer's identity.
    expect(findBlindLeaks(row as Record<string, unknown>)).toEqual([]);
  });

  it('lets the invited supplier actually open the file, not just see that it exists', async () => {
    const buyer = await sessionFor(DEMO.logins.sunriseManager);
    const service = createServiceClient();

    // Attach to the seeded motor RFQ's requirement, which already has invited
    // suppliers, and put real bytes behind it.
    const { data: slot } = await buyer.rpc('create_attachment_slot', {
      p_scope: 'REQUIREMENT',
      p_requirement_id: DEMO.requirements.motor,
      p_quote_id: null,
      p_kind: 'DRAWING',
      p_original_filename: 'Sunrise Residency borewell.pdf',
      p_content_type: 'application/pdf',
      p_size_bytes: 5,
      p_duration_seconds: null,
    });

    const reserved = slot as { attachment_id: string; storage_path: string };
    createdAttachments.push(reserved.attachment_id);

    const { error: uploadError } = await service.storage
      .from('otp-attachments')
      .upload(reserved.storage_path, new Blob(['bytes'], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
      });
    expect(uploadError).toBeNull();

    const supplier = await sessionFor(DEMO.logins.motorSupplier);

    // The metadata row itself stays hidden at table level — which is exactly
    // why the storage policy cannot check it inline and asks a SECURITY
    // DEFINER function instead.
    const { data: hidden } = await supplier
      .from('attachments')
      .select('id')
      .eq('id', reserved.attachment_id);
    expect(hidden ?? []).toEqual([]);

    const { data: signed, error } = await supplier.storage
      .from('otp-attachments')
      .createSignedUrl(reserved.storage_path, 60);

    // The metadata view says the drawing exists; storage has to agree, or the
    // supplier is being shown a file they can never read.
    expect(error).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();

    const stranger = await sessionFor(DEMO.logins.yarnSupplier);
    const { data: denied } = await stranger.storage
      .from('otp-attachments')
      .createSignedUrl(reserved.storage_path, 60);

    expect(denied?.signedUrl).toBeFalsy();

    await service.storage.from('otp-attachments').remove([reserved.storage_path]);
  });

  it('keeps the buyer’s files away from a supplier who was never invited', async () => {
    const outsider = await sessionFor(DEMO.logins.yarnSupplier);

    const { data } = await outsider
      .from('requirement_attachments_shared')
      .select('attachment_id')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(data ?? []).toEqual([]);
  });
});

/** Attaches a file to some quote on an RFQ, as that bidder would have. */
async function attachToFirstQuote(rfqId: string, filename: string) {
  const service = createServiceClient();

  const { data: quotes } = await service
    .from('quotes')
    .select('id, supplier_id')
    .eq('rfq_id', rfqId)
    .order('created_at');

  // Not every seeded supplier has a login, and uploaded_by has to be a real
  // profile belonging to the bidder for the row to mean anything.
  const { data: supplierUsers } = await service
    .from('supplier_users')
    .select('supplier_id, profile_id')
    .in('supplier_id', (quotes ?? []).map((q) => q.supplier_id as string));

  const owner = (supplierUsers ?? [])[0];
  if (!owner) throw new Error(`no supplier login among bidders on ${rfqId}`);

  const quote = (quotes ?? []).find((q) => q.supplier_id === owner.supplier_id)!;

  const { data: row, error } = await service
    .from('attachments')
    .insert({
      scope: 'QUOTE',
      quote_id: quote.id,
      original_filename: filename,
      storage_path: 'pending',
      content_type: 'application/pdf',
      size_bytes: 1024,
      kind: 'DOCUMENT',
      uploaded_by: owner.profile_id,
    })
    .select('id')
    .single();

  if (error) throw new Error(`quote attachment insert failed: ${error.message}`);
  createdAttachments.push(row!.id);
  return row!.id as string;
}

describe('what the buyer sees of bidder files', () => {
  it('withholds the filename while the RFQ is blind', async () => {
    const attachmentId = await attachToFirstQuote(
      DEMO.rfqs.cnc,
      'Kovai Precision quotation.pdf',
    );

    const buyer = await sessionFor(DEMO.logins.kovaiOwner);
    const { data: blind, error } = await buyer
      .from('quote_attachments_blind')
      .select('*')
      .eq('attachment_id', attachmentId)
      .single();

    expect(error).toBeNull();
    expect(blind!.display_name).toBe('Document 1');
    expect(blind!.anonymous_label).toBeTruthy();
    // The filename names the bidder outright.
    expect(findBlindLeaks(blind as Record<string, unknown>)).toEqual([]);
  });

  it('returns the real filename once the award is revealed', async () => {
    // The yarn scenario is seeded past reveal.
    const attachmentId = await attachToFirstQuote(
      DEMO.rfqs.yarn,
      'Tirupur Combed Yarn quotation.pdf',
    );

    const buyer = await sessionFor(DEMO.logins.lakshmiManager);

    const { data: revealed, error } = await buyer
      .from('quote_attachments_revealed')
      .select('display_name, original_filename, business_name')
      .eq('attachment_id', attachmentId)
      .single();

    expect(error).toBeNull();
    expect(revealed!.display_name).toBe('Document 1');
    expect(revealed!.original_filename).toBe('Tirupur Combed Yarn quotation.pdf');
    expect(revealed!.business_name).toBeTruthy();

    // And the blind view stops carrying it, so one RFQ cannot be read both ways.
    const { data: stillBlind } = await buyer
      .from('quote_attachments_blind')
      .select('attachment_id')
      .eq('attachment_id', attachmentId);

    expect(stillBlind ?? []).toEqual([]);
  });

  it('keeps bidder files away from an unrelated organization', async () => {
    const attachmentId = await attachToFirstQuote(DEMO.rfqs.cnc, 'quotation.pdf');

    const outsider = await sessionFor(DEMO.logins.bharathiOwner);
    const { data } = await outsider
      .from('quote_attachments_blind')
      .select('attachment_id')
      .eq('attachment_id', attachmentId);

    expect(data ?? []).toEqual([]);
  });
});
