/**
 * Job roles, and the one property that makes them safe to add.
 *
 * A role narrows. It never widens. Everything in this file is an attempt to make
 * the schema break that rule: a read-only auditor trying to write, a committee
 * title with no committee assignment trying to vote, a supplier account trying to
 * title itself Procurement Lead, an account trying to re-title itself after
 * onboarding. Each of those has to fail, and the ones that fail for the RIGHT
 * reason matter as much as the ones that fail at all — a vote refused because the
 * title lacks the permission is a different bug from a vote refused because the
 * person was never on the committee.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

type Client = ReturnType<typeof createAnonClient>;

let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

async function contextFor(email: string): Promise<Record<string, any>> {
  const client = await sessionFor(email);
  const { data, error } = await client.rpc('my_role_context');
  expect(error).toBeNull();
  return data as Record<string, any>;
}

describe('the catalogue of roles', () => {
  it('offers only the roles that belong to the side being asked about', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { data: buyer } = await client.rpc('role_catalog', { p_side: 'BUYER' });
    const { data: supplier } = await client.rpc('role_catalog', { p_side: 'SUPPLIER' });

    const buyerCodes = (buyer as any[]).map((r) => r.code);
    const supplierCodes = (supplier as any[]).map((r) => r.code);

    expect(buyerCodes).toContain('PROCUREMENT_LEAD');
    expect(buyerCodes).toContain('GENERAL_AUDITOR');
    expect(buyerCodes).not.toContain('SUPPLIER_FOUNDER');
    expect(supplierCodes).toContain('SUPPLIER_FOUNDER');
    expect(supplierCodes).not.toContain('PROCUREMENT_LEAD');
  });

  it('is readable before there is a session, so the registration form can offer it', async () => {
    const anon = createAnonClient();

    const { data, error } = await anon.rpc('role_catalog', { p_side: 'BUYER' });

    expect(error).toBeNull();
    expect((data as any[]).length).toBeGreaterThan(3);
  });

  it('gives every role a way to read, because a role that cannot read is a deactivation', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    const { data } = await client.rpc('role_catalog');

    for (const role of data as any[]) {
      expect(role.permissions, `${role.code} cannot read`).toContain('READ');
    }
  });
});

describe('what an account is told about itself', () => {
  it('reports the side, the active role and the structural facts separately', async () => {
    const context = await contextFor(DEMO.logins.sunriseCommittee);

    expect(context.signedIn).toBe(true);
    expect(context.side).toBe('BUYER');
    expect(context.activeRole.code).toBe('COMMITTEE_MEMBER');
    // The role grants the permission; the assignment grants the vote. Both are
    // reported, because the interface has to be able to tell them apart.
    expect(context.activeRole.permissions).toContain('VOTE');
    expect(context.committeeRfqCount).toBeGreaterThan(0);
    expect(context.organizationName).toBeTruthy();
  });

  it('resolves a supplier account to the supplier side', async () => {
    const context = await contextFor(DEMO.logins.motorSupplier);

    expect(context.side).toBe('SUPPLIER');
    expect(context.supplierId).toBe(DEMO.suppliers.aquaPrime);
    expect(context.activeRole.code).toBe('SUPPLIER_FOUNDER');
  });

  it('asks for onboarding when an account has a side but no role', async () => {
    // member2 is seeded deliberately without a role, so this state can be shown.
    const context = await contextFor('member2@sunrise.test');

    expect(context.needsOnboarding).toBe(true);
    expect(context.roles).toEqual([]);
    expect(context.activeRole).toBeNull();
  });

  it('does not ask an administrator to pick a job title', async () => {
    const context = await contextFor(DEMO.logins.admin);

    expect(context.isPlatformAdmin).toBe(true);
    expect(context.needsOnboarding).toBe(false);
  });

  it('says nothing at all to a caller with no session', async () => {
    const { data } = await createAnonClient().rpc('my_role_context');

    expect((data as any).signedIn).toBe(false);
    expect((data as any).roles).toBeUndefined();
  });
});

describe('choosing a role', () => {
  it('refuses a role from the other side of the market', async () => {
    const client = await sessionFor('member2@sunrise.test');

    const { error } = await client.rpc('assign_my_role', { p_code: 'SUPPLIER_FOUNDER' });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/supplier portal/i);
  });

  it('refuses a role that does not exist', async () => {
    const client = await sessionFor('member2@sunrise.test');

    const { error } = await client.rpc('assign_my_role', { p_code: 'CHIEF_OF_VIBES' });

    expect(error).not.toBeNull();
  });

  it('will not let an account re-title itself once it holds a role', async () => {
    const client = await sessionFor(DEMO.logins.sunriseCommittee);

    const { error } = await client.rpc('assign_my_role', { p_code: 'PROCUREMENT_LEAD' });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already has a role/i);
  });

  it('assigns the chosen role, makes it active and records it, then leaves it fixed', async () => {
    const service = createServiceClient();
    const client = await sessionFor('member2@sunrise.test');

    try {
      const { data, error } = await client.rpc('assign_my_role', {
        p_code: 'PROPERTY_OWNER',
      });

      expect(error).toBeNull();
      expect((data as any).activeRole.code).toBe('PROPERTY_OWNER');
      expect((data as any).needsOnboarding).toBe(false);

      const { data: events } = await service
        .from('audit_events')
        .select('event_type, payload')
        .eq('event_type', 'profile.role_assigned')
        .order('occurred_at', { ascending: false })
        .limit(1);

      expect(events![0]!.payload).toMatchObject({ role: 'PROPERTY_OWNER', self: true });
    } finally {
      // Put the un-roled account back, because the onboarding gate is the only
      // way to demonstrate itself and another file may depend on it.
      const { data: profile } = await service
        .from('profiles')
        .select('id')
        .eq('email', 'member2@sunrise.test')
        .single();

      await service.from('profiles').update({ active_role_code: null }).eq('id', profile!.id);
      await service.from('profile_roles').delete().eq('profile_id', profile!.id);
    }
  });
});

describe('switching between roles held', () => {
  it('changes what the account may do, not only what it sees', async () => {
    // The secretary runs sourcing and also holds a read-only auditor hat.
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { data: before } = await client.rpc('my_role_context');
    expect((before as any).activeRole.code).toBe('FACILITY_MANAGER');
    expect((before as any).activeRole.permissions).toContain('WRITE');

    try {
      const { data: after, error } = await client.rpc('switch_active_role', {
        p_code: 'GENERAL_AUDITOR',
      });

      expect(error).toBeNull();
      expect((after as any).activeRole.code).toBe('GENERAL_AUDITOR');
      expect((after as any).activeRole.permissions).toEqual(['READ']);

      // And the narrowing is real: the same session can no longer write.
      const { error: writeError } = await client.from('requirements').insert({
        organization_id: DEMO.orgs.sunrise,
        title: 'Auditor should not be able to raise this',
        description: 'A read-only role must not be able to create work.',
        created_by: (before as any).profileId,
      });

      expect(writeError).not.toBeNull();
      expect(writeError!.message).toMatch(/role does not allow|insufficient/i);
    } finally {
      await client.rpc('switch_active_role', { p_code: 'FACILITY_MANAGER' });
    }
  });

  it('refuses a role the account does not hold', async () => {
    const client = await sessionFor(DEMO.logins.sunriseCommittee);

    const { error } = await client.rpc('switch_active_role', { p_code: 'GENERAL_AUDITOR' });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/do not hold/i);
  });

  it('cannot be forced by writing the column directly', async () => {
    const client = await sessionFor(DEMO.logins.sunriseCommittee);
    const context = await contextFor(DEMO.logins.sunriseCommittee);

    const { error } = await client
      .from('profiles')
      .update({ active_role_code: 'PROCUREMENT_LEAD' })
      .eq('id', context.profileId);

    // Either the policy refuses the update or the trigger refuses the value.
    // Both are correct; what must not happen is the role changing.
    const after = await contextFor(DEMO.logins.sunriseCommittee);
    expect(after.activeRole.code).toBe('COMMITTEE_MEMBER');
    if (error === null) {
      expect(after.roles.map((r: any) => r.code)).not.toContain('PROCUREMENT_LEAD');
    }
  });
});

describe('a title cannot widen access', () => {
  it('does not give a committee title a vote on an enquiry it was never assigned to', async () => {
    const service = createServiceClient();

    // Kovai's partner is titled COMMITTEE_MEMBER, which carries VOTE. The enquiry
    // belongs to Sunrise, so no assignment exists and none can be implied.
    const client = await sessionFor(DEMO.logins.kovaiPartner);

    const { data: quote } = await service
      .from('quotes')
      .select('id')
      .eq('rfq_id', DEMO.rfqs.motor)
      .limit(1)
      .maybeSingle();

    if (!quote) return;

    const { error } = await client.rpc('cast_committee_vote', {
      p_rfq_id: DEMO.rfqs.motor,
      p_recommended_quote_id: quote.id,
      p_choice: 'RECOMMEND',
      p_comment: 'A title from another organisation is not a seat on this committee',
    });

    expect(error).not.toBeNull();
    // Refused for the structural reason, not because the RPC could not be found.
    expect(error!.message).toMatch(/committee|not authorized|access denied/i);
  });

  it('leaves the existing organisation checks in force underneath the role', async () => {
    // A procurement lead at one organisation is still nothing at another.
    const client = await sessionFor(DEMO.logins.lakshmiManager);

    const { error } = await client.from('requirements').insert({
      organization_id: DEMO.orgs.sunrise,
      title: 'Cross-organisation requirement',
      description: 'The role permits writing; the membership does not permit it here.',
    });

    expect(error).not.toBeNull();
  });
});

describe('read-only roles', () => {
  it('lets an auditor read the audit trail they exist to read', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    try {
      await client.rpc('switch_active_role', { p_code: 'GENERAL_AUDITOR' });

      const { data, error } = await client
        .from('audit_events')
        .select('event_type')
        .limit(5);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    } finally {
      await client.rpc('switch_active_role', { p_code: 'FACILITY_MANAGER' });
    }
  });
});

describe('administrative assignment', () => {
  it('is refused to someone who is not a platform administrator', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    const context = await contextFor(DEMO.logins.sunriseCommittee);

    const { error } = await client.rpc('admin_assign_profile_role', {
      p_profile_id: context.profileId,
      p_code: 'FINANCE_APPROVER',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/administrator/i);
  });

  it('records who granted a role, so an auditor can ask who decided', async () => {
    const service = createServiceClient();
    const admin = await sessionFor(DEMO.logins.admin);
    const target = await contextFor(DEMO.logins.sunriseCommittee2);

    try {
      const { error } = await admin.rpc('admin_assign_profile_role', {
        p_profile_id: target.profileId,
        p_code: 'FINANCE_APPROVER',
      });

      expect(error).toBeNull();

      const { data } = await service
        .from('profile_roles')
        .select('role_code, assigned_by')
        .eq('profile_id', target.profileId)
        .eq('role_code', 'FINANCE_APPROVER')
        .single();

      expect(data!.assigned_by).not.toBeNull();
    } finally {
      await service
        .from('profile_roles')
        .delete()
        .eq('profile_id', target.profileId)
        .eq('role_code', 'FINANCE_APPROVER');
    }
  });
});

describe('the role a person picked while registering', () => {
  it('is kept with the registration and is not a grant of anything', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const email = `role.signup.${Date.now()}@example.test`;

    const { data, error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Role Capture Test Society',
        contact_first_name: 'Asha',
        contact_last_name: 'Rao',
        email,
        phone: '9876500011',
        buyer_type: 'COMMUNITY',
        role_code: 'FINANCE_APPROVER',
      },
    });

    expect(error).toBeNull();
    expect((data as any).reference).toMatch(/^REG-/);

    const { data: row } = await service
      .from('signup_requests')
      .select('role_code, status')
      .eq('email', email)
      .single();

    expect(row!.role_code).toBe('FINANCE_APPROVER');
    // Still only a request. Nothing about choosing a role advances verification.
    expect(row!.status).toBe('PENDING');

    await service.from('signup_requests').delete().eq('email', email);
  });

  it('drops a role belonging to the other side rather than losing the registration', async () => {
    const anon = createAnonClient();
    const service = createServiceClient();
    const email = `role.mismatch.${Date.now()}@example.test`;

    const { error } = await anon.rpc('submit_signup_request', {
      p_request: {
        side: 'BUYER',
        business_name: 'Mismatched Role Society',
        contact_first_name: 'Ravi',
        contact_last_name: 'Kumar',
        email,
        phone: '9876500012',
        buyer_type: 'MSME',
        role_code: 'SUPPLIER_FOUNDER',
      },
    });

    expect(error).toBeNull();

    const { data: row } = await service
      .from('signup_requests')
      .select('role_code')
      .eq('email', email)
      .single();

    expect(row!.role_code).toBeNull();

    await service.from('signup_requests').delete().eq('email', email);
  });
});
