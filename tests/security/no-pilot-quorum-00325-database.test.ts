import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, createAnonClient, isLocalSupabaseReachable, signInAs } from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';
import { deleteFixtureRequirements } from '../helpers/fixture-teardown';
import type { SupabaseClient } from '@supabase/supabase-js';

let service: SupabaseClient;
let up = false;
const requirementIds: string[] = [];
const serviceAreaIds: string[] = [];

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (up) service = createServiceClient();
});

afterAll(async () => {
  if (up && requirementIds.length > 0) await deleteFixtureRequirements(requirementIds);
  if (up && serviceAreaIds.length > 0) {
    await service.from('supplier_service_areas').delete().in('id', serviceAreaIds);
  }
});

describe('00325 minimum quote behavior (REAL DATABASE)', () => {
  it('continues supplier discovery below quorum and rejects award until final quotes meet quorum', async (ctx) => {
    if (!up) ctx.skip('BLOCKED: local disposable Supabase API is unavailable');

    const { data: buyerProfile, error: profileError } = await service
      .from('profiles').select('id').eq('email', DEMO.logins.qaCommittee).single();
    expect(profileError).toBeNull();
    expect(buyerProfile?.id).toBeTruthy();

    const { data: suppliers, error: suppliersError } = await service
      .from('suppliers')
      .select('id,categories,source_ref')
      .eq('status', 'ACTIVE')
      .is('source_ref', null);
    expect(suppliersError).toBeNull();
    const { data: categories, error: categoriesError } = await service
      .from('requirement_categories')
      .select('id,code');
    expect(categoriesError).toBeNull();
    const categoryCodes = new Set(categories?.map((row) => row.code));
    const supplier = suppliers?.find((row) =>
      Array.isArray(row.categories) && row.categories.some((code) => categoryCodes.has(code)));
    expect(supplier).toBeTruthy();
    const category = categories?.find((row) => supplier!.categories.includes(row.code));
    expect(category).toBeTruthy();
    const { data: serviceArea, error: serviceAreaError } = await service
      .from('supplier_service_areas')
      .insert({
        supplier_id: supplier!.id,
        city: 'Pilot Fixture City',
        pincode: '599999',
        is_primary: true,
      })
      .select('id')
      .single();
    expect(serviceAreaError).toBeNull();
    serviceAreaIds.push(serviceArea!.id);

    const { data: requirement, error: requirementError } = await service.from('requirements').insert({
      organization_id: DEMO.orgs.qaCommunity,
      created_by: buyerProfile!.id,
      requirement_type: 'SERVICE',
      title: '00325 below-quorum fixture',
      description: 'Disposable minimum quote behavior test',
      category_id: category!.id,
      delivery_city: 'Pilot Fixture City',
      delivery_pincode: '599999',
    }).select('id').single();
    expect(requirementError).toBeNull();
    requirementIds.push(requirement!.id);

    const { data: rfq, error: rfqError } = await service.from('rfqs').insert({
      requirement_id: requirement!.id,
      organization_id: DEMO.orgs.qaCommunity,
      created_by: buyerProfile!.id,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: '00325 below-quorum fixture',
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: 2,
      quote_deadline: new Date(Date.now() + 86_400_000).toISOString(),
      bid_deadline: new Date(Date.now() + 86_400_000).toISOString(),
    }).select('id').single();
    expect(rfqError).toBeNull();

    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.qaCommittee, 'password');
    const { error: discoveryError } = await buyer.rpc('discover_and_invite_for_rfq', {
      p_rfq_id: rfq!.id,
      p_network: 'OTP_REGISTERED',
    });
    expect(discoveryError).toBeNull();
    const { count: invitationCount, error: invitationError } = await service
      .from('rfq_invitations').select('id', { count: 'exact', head: true }).eq('rfq_id', rfq!.id);
    expect(invitationError).toBeNull();
    expect(invitationCount).toBeGreaterThan(0);

    const { error: waiverError } = await service.from('rfqs')
      .update({ min_quotes_waived: true }).eq('id', rfq!.id);
    expect(waiverError?.message ?? '').toMatch(/PILOT_QUORUM_WAIVER_DISABLED/i);

    const { data: invitation, error: firstInviteError } = await service
      .from('rfq_invitations').select('id,supplier_id').eq('rfq_id', rfq!.id).limit(1).single();
    expect(firstInviteError).toBeNull();
    const { data: quote, error: quoteError } = await service.from('quotes').insert({
      rfq_id: rfq!.id,
      supplier_id: invitation!.supplier_id,
      invitation_id: invitation!.id,
      status: 'DRAFT',
      current_version: 0,
    }).select('id').single();
    expect(quoteError).toBeNull();
    const { error: awardError } = await service.from('awards').insert({
      rfq_id: rfq!.id,
      quote_id: quote!.id,
      awarded_by: buyerProfile!.id,
      justification: { reason: 'below-quorum test' },
    });
    expect(awardError?.message ?? '').toMatch(/PILOT_QUORUM_REQUIRED/i);
  });
});
