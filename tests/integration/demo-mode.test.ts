/**
 * The demo framework, from the screens that drive it.
 *
 * Two things must hold. The demo has to be described by the database rather
 * than by the client: which accounts exist, which scenarios exist, and whether
 * demo mode is on at all. And the presenter's board must stay inside the same
 * blind-evaluation rules as everything else — it may say "four bids", never
 * whose.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO, BLIND_FORBIDDEN_FIELDS } from '../helpers/demo-fixtures';

type Client = ReturnType<typeof createAnonClient>;

let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (up) {
    await setDemoMode(true);
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

afterAll(async () => {
  if (!up) return;
  // Any test that turned demo mode off must not leave it off for the next file.
  await createServiceClient()
    .from('demo_settings')
    .update({ demo_mode_enabled: true })
    .eq('id', true);
});

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

async function setDemoMode(enabled: boolean): Promise<void> {
  await createServiceClient()
    .from('demo_settings')
    .update({ demo_mode_enabled: enabled })
    .eq('id', true);
}

describe('what the login screen can know before anyone signs in', () => {
  it('offers the demo accounts to an unauthenticated visitor', async () => {
    const anon = createAnonClient();

    const { data, error } = await anon
      .from('demo_login_options')
      .select('email, label, persona, buyer_type_label, voting_power, scenario_code')
      .order('sort_order');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(10);

    const personas = new Set(data!.map((r) => r.persona));
    expect(personas).toContain('SUPPLIER');
    expect(personas).toContain('COMMITTEE');
  });

  it('carries no credential material whatsoever', async () => {
    const anon = createAnonClient();

    const { data } = await anon.from('demo_login_options').select('*').limit(1);
    const keys = Object.keys(data![0]);

    expect(keys.some((k) => /password|secret|token|hash/i.test(k))).toBe(false);
  });

  it('states the voting power of each buyer seat, and none for a supplier', async () => {
    const anon = createAnonClient();

    const { data } = await anon
      .from('demo_login_options')
      .select('persona, buyer_type, voting_power');

    const community = data!.find((r) => r.buyer_type === 'COMMUNITY');
    const enterprise = data!.find((r) => r.buyer_type === 'ENTERPRISE');
    const individual = data!.find((r) => r.buyer_type === 'INDIVIDUAL');

    expect(Number(community!.voting_power)).toBe(3);
    expect(Number(enterprise!.voting_power)).toBe(4);
    expect(Number(individual!.voting_power)).toBe(1);

    for (const row of data!.filter((r) => r.persona === 'SUPPLIER')) {
      expect(row.voting_power).toBeNull();
    }
  });

  it('reports demo mode to an unauthenticated visitor', async () => {
    const anon = createAnonClient();

    const { data, error } = await anon.rpc('demo_status');

    expect(error).toBeNull();
    expect((data as { enabled: boolean }).enabled).toBe(true);
    expect((data as { run_id: string }).run_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('withdraws the account list the moment demo mode is switched off', async () => {
    await setDemoMode(false);
    try {
      const anon = createAnonClient();

      const { data: status } = await anon.rpc('demo_status');
      expect((status as { enabled: boolean }).enabled).toBe(false);

      const { data } = await anon.from('demo_login_options').select('email');
      expect(data ?? []).toEqual([]);
    } finally {
      await setDemoMode(true);
    }
  });
});

describe('who the signed-in user is, in demo terms', () => {
  it('tells a community secretary the weight their committee carries', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { data, error } = await client.rpc('my_demo_context');
    const ctx = data as Record<string, unknown>;

    expect(error).toBeNull();
    expect(ctx.signed_in).toBe(true);
    expect(ctx.side).toBe('BUYER');
    expect(ctx.buyer_type).toBe('COMMUNITY');
    expect(ctx.buyer_type_label).toBe('Community / RWA');
    expect(Number(ctx.voting_power)).toBe(3);
    expect(ctx.is_demo).toBe(true);
  });

  it('gives an enterprise procurement head the heaviest seat', async () => {
    const client = await sessionFor(DEMO.logins.lakshmiManager);

    const { data } = await client.rpc('my_demo_context');
    const ctx = data as Record<string, unknown>;

    expect(ctx.buyer_type).toBe('ENTERPRISE');
    expect(Number(ctx.voting_power)).toBe(4);
  });

  it('matches the power the vote trigger actually stamps', async () => {
    const service = createServiceClient();

    const { data: votes } = await service
      .from('committee_votes')
      .select('voting_power, buyer_type')
      .eq('rfq_id', DEMO.rfqs.motor)
      .limit(1);

    const client = await sessionFor(DEMO.logins.sunriseCommittee);
    const { data } = await client.rpc('my_demo_context');
    const ctx = data as Record<string, unknown>;

    expect(votes![0].buyer_type).toBe(ctx.buyer_type);
    expect(Number(votes![0].voting_power)).toBe(Number(ctx.voting_power));
  });

  it('shows a supplier login as the supplier side, with no buying organization', async () => {
    const client = await sessionFor(DEMO.logins.motorSupplier);

    const { data } = await client.rpc('my_demo_context');
    const ctx = data as Record<string, unknown>;

    expect(ctx.side).toBe('SUPPLIER');
    expect(ctx.organization_id).toBeNull();
    expect(ctx.buyer_type).toBeNull();
  });
});

describe('the presenter board', () => {
  it('lists every staged scenario with where it has actually got to', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { data, error } = await client
      .from('demo_scenario_board')
      .select('*')
      .order('sort_order');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(5);

    const byCode = new Map(data!.map((r) => [r.code, r]));

    // Each scenario was seeded to demonstrate a different point in the arc.
    expect(byCode.get(DEMO.scenarios.motor)!.actual_stage).toBe('EVALUATION');
    expect(byCode.get(DEMO.scenarios.cnc)!.actual_stage).toBe('AWARDED');
    expect(byCode.get(DEMO.scenarios.yarn)!.actual_stage).toBe('REVEALED');
  });

  it('reports counts that agree with the underlying rows', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    const service = createServiceClient();

    const { data: board } = await client
      .from('demo_scenario_board')
      .select('suppliers_invited, quotes_received, members_voted, weight_cast')
      .eq('code', DEMO.scenarios.motor)
      .single();

    const { count: invited } = await service
      .from('rfq_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(Number(board!.suppliers_invited)).toBe(invited);
    expect(Number(board!.quotes_received)).toBeGreaterThan(0);
    expect(Number(board!.members_voted)).toBeGreaterThan(0);

    // Weight is the sum of each voting member's power, not a head count.
    expect(Number(board!.weight_cast)).toBeGreaterThanOrEqual(
      Number(board!.members_voted),
    );
  });

  it('counts one vote per member however often they changed their mind', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    const service = createServiceClient();

    const { data: board } = await client
      .from('demo_scenario_board')
      .select('members_voted')
      .eq('code', DEMO.scenarios.motor)
      .single();

    const { data: votes } = await service
      .from('committee_votes')
      .select('profile_id')
      .eq('rfq_id', DEMO.rfqs.motor);

    const distinct = new Set(votes!.map((v) => v.profile_id)).size;
    expect(Number(board!.members_voted)).toBe(distinct);
  });

  it('names no supplier, alias or amount anywhere in the board', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { data } = await client.from('demo_scenario_board').select('*');

    for (const row of data!) {
      const leaks = BLIND_FORBIDDEN_FIELDS.filter(
        (key) => key in row && (row as Record<string, unknown>)[key] != null,
      );
      expect(leaks).toEqual([]);
    }

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('Bidder ');
    expect(serialized).not.toContain('quote_id');
  });

  it('hides the board from a tenant that is not part of the demo', async () => {
    const service = createServiceClient();

    // A real organization in the same database, with demo tagging off.
    const { data: real } = await service
      .from('profiles')
      .select('id, email:auth_user_id')
      .eq('is_demo', false)
      .limit(1);

    expect(real!.length).toBe(1);

    const client = await sessionFor('manager@greenview.test');
    const { data } = await client.from('demo_scenario_board').select('code');

    expect(data ?? []).toEqual([]);
  });

  it('hides the board entirely when demo mode is off', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    await setDemoMode(false);

    try {
      const { data } = await client.from('demo_scenario_board').select('code');
      expect(data ?? []).toEqual([]);
    } finally {
      await setDemoMode(true);
    }
  });
});

describe('the staging window stays shut outside staging', () => {
  it('does not give a demo buyer any reach into another demo organization', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    // Kovai Precision is a different demo organization. Membership is what
    // gates this, and the staging window must not have leaked it open.
    const { data } = await client
      .from('rfqs')
      .select('id')
      .eq('id', DEMO.rfqs.cnc);

    expect(data ?? []).toEqual([]);
  });

  it('still refuses a scenario belonging to another organization outside a reset', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await client.rpc('discover_and_invite_for_rfq', {
      p_rfq_id: DEMO.rfqs.cnc,
      p_limit: 3,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/access denied/i);
  });

  it('refuses to stage a scenario for a login that is not part of the demo', async () => {
    const client = await sessionFor('manager@greenview.test');

    const { error } = await client.rpc('demo_stage_scenario', {
      p_code: DEMO.scenarios.motor,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/demo account or a platform admin/i);
  });

  it('refuses to stage anything when demo mode is off', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    await setDemoMode(false);

    try {
      const { error } = await client.rpc('demo_stage_scenario', {
        p_code: DEMO.scenarios.motor,
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/demo mode is off/i);
    } finally {
      await setDemoMode(true);
    }
  });
});

describe('the reset action', () => {
  it('refuses to run at all when demo mode is off', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);
    await setDemoMode(false);

    try {
      const { error } = await client.rpc('demo_reset', { p_restage: false });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/demo mode is off/i);
    } finally {
      await setDemoMode(true);
    }
  });

  it('refuses a login that is not part of the demo', async () => {
    const client = await sessionFor('manager@greenview.test');

    const { error } = await client.rpc('demo_reset', { p_restage: false });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/demo account or a platform admin/i);
  });

  it('rebuilds the scenarios and hands back a new run id', async () => {
    const client = await sessionFor(DEMO.logins.sunriseManager);

    const { data: before } = await client.rpc('demo_status');
    const { data: result, error } = await client.rpc('demo_reset', { p_restage: true });

    expect(error).toBeNull();

    const outcome = result as Record<string, unknown>;
    expect(outcome.run_id).not.toBe((before as { run_id: string }).run_id);
    expect(Number(outcome.rfqs_reset)).toBeGreaterThan(0);

    // Restaging puts the board back where the seed left it, which is the whole
    // promise of the button.
    const { data: board } = await client
      .from('demo_scenario_board')
      .select('code, actual_stage, target_stage');

    for (const row of board!) {
      expect(row.actual_stage).toBe(row.target_stage);
    }
  });
});
