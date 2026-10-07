/**
 * REAL DATABASE security tests for migrations 00216 + 00217 (local Supabase only).
 * Classification: REAL DATABASE when supabase is up; skipped otherwise.
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
  SEED,
} from '../helpers/supabase-local';

let dbUp = false;

describe('00216/00217 — live database security (REAL DATABASE)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!dbUp) ctx.skip();
  });

  it('anon EXECUTE allowlist is exactly eleven public bootstrap RPCs', async () => {
    const service = createServiceClient();
    const { data, error } = await service.rpc('admin_run_diagnostic_query' as never, {
      p_query: `SELECT routine_name FROM information_schema.routine_privileges
        WHERE routine_schema='public' AND grantee='anon' AND privilege_type='EXECUTE'
        ORDER BY 1`,
    } as never);
    if (error) {
      const anon = createAnonClient();
      const probes = [
        'submit_signup_request',
        'verify_profile_verification_otp',
        'verify_whatsapp_password_reset',
        'platform_heartbeat',
        'service_categories',
        'served_cities',
        'get_maintenance_status',
        'redeem_supplier_magic_link',
        'messaging_quote_context',
        'submit_messaging_quote',
        'complete_supplier_onboarding_atomic',
      ] as const;
      for (const fn of probes) {
        const { error: e } = await anon.rpc(fn as 'platform_heartbeat', fn === 'submit_signup_request' ? { p_payload: {} } : ({} as never));
        expect(e?.message ?? '').not.toMatch(/permission denied for function/i);
      }
      const { error: blocked } = await anon.rpc('credit_buyer_settlement_reward_atomic' as never, {
        p_org_id: SEED.greenviewOrg,
        p_platform_fee_tx_id: null,
        p_base_amount: 9999,
      } as never);
      expect(blocked?.message ?? '').toMatch(/permission denied|Could not find/i);
      return;
    }
    const rows = (data as { routine_name: string }[]) ?? [];
    expect(rows.map((r) => r.routine_name)).toEqual([
      'complete_supplier_onboarding_atomic',
      'get_maintenance_status',
      'messaging_quote_context',
      'platform_heartbeat',
      'redeem_supplier_magic_link',
      'served_cities',
      'service_categories',
      'submit_messaging_quote',
      'submit_signup_request',
      'verify_profile_verification_otp',
      'verify_whatsapp_password_reset',
    ]);
  });

  it('anon cannot call wallet credit, award, PO, org appoint, wallet subscription', async () => {
    const anon = createAnonClient();
    const cases: { fn: string; args: Record<string, unknown> }[] = [
      {
        fn: 'credit_buyer_settlement_reward_atomic',
        args: { p_org_id: SEED.greenviewOrg, p_platform_fee_tx_id: null, p_base_amount: 100 },
      },
      {
        fn: 'lock_and_reveal_award_atomic',
        args: { p_rfq_id: SEED.borewellRfq, p_quote_id: SEED.quoteA, p_justification: 'x', p_auto_reveal: false },
      },
      { fn: 'create_purchase_order_from_award', args: { p_award_id: '00000000-0000-0000-0000-000000000099' } },
      {
        fn: 'appoint_org_role_atomic',
        args: {
          p_organization_id: SEED.greenviewOrg,
          p_person_id: '00000000-0000-0000-0000-000000000099',
          p_role_id: 'PRESIDENT',
          p_role_name: 'President',
        },
      },
      {
        fn: 'apply_wallet_credits_to_subscription_atomic',
        args: { p_org_id: SEED.greenviewOrg, p_tier: 'INDIVIDUAL', p_cycle: 'MONTHLY', p_credits_to_apply: 1 },
      },
      {
        fn: 'process_subscription_payment',
        args: {
          p_organization_id: SEED.greenviewOrg,
          p_tier: 'INDIVIDUAL',
          p_cycle: 'MONTHLY',
          p_amount: 1,
          p_payment_ref: 'FAKE',
        },
      },
      { fn: 'get_organization_wallet', args: { p_org_id: SEED.greenviewOrg } },
      { fn: 'reveal_award', args: { p_award_id: '00000000-0000-0000-0000-000000000099' } },
      { fn: 'demo_status', args: {} },
    ];

    for (const { fn, args } of cases) {
      const { error } = await anon.rpc(fn as 'platform_heartbeat', args as never);
      expect(error, fn).toBeTruthy();
      expect(error?.message ?? '').toMatch(/permission denied|Could not find the function/i);
    }
  });

  it('anon can call public signup helpers and heartbeat', async () => {
    const anon = createAnonClient();
    const { error: hb } = await anon.rpc('platform_heartbeat');
    expect(hb).toBeNull();

    const { error: catErr } = await anon.rpc('service_categories');
    expect(catErr).toBeNull();

    const { error: cityErr } = await anon.rpc('served_cities');
    expect(cityErr).toBeNull();
  });

  it('authenticated buyer cannot mint wallet credit without platform fee tx id', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');
    const deniedArgs = {
      p_org_id: SEED.greenviewOrg,
      p_platform_fee_tx_id: null,
      p_base_amount: 50000,
      p_fee_rate: 0.5,
      p_reward_share_rate: 20,
    };
    const { error } = await client.rpc('credit_buyer_settlement_reward_atomic', deniedArgs);
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(
      /permission denied for function (?:public\.)?credit_buyer_settlement_reward_atomic/i,
    );

    // 00250 leaves EXECUTE with service_role, so the 00216 body still rejects a missing fee.
    const service = createServiceClient();
    const { error: bodyError } = await service.rpc('credit_buyer_settlement_reward_atomic', deniedArgs);
    expect(bodyError).toBeTruthy();
    expect(bodyError?.message ?? '').toMatch(/platform_fee_tx_id is required|WALLET-REWARD-FEE/i);
  });

  it('authenticated buyer cannot activate subscription with arbitrary wallet amount', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');
    const { error } = await client.rpc('apply_wallet_credits_to_subscription_atomic', {
      p_org_id: SEED.greenviewOrg,
      p_tier: 'INDIVIDUAL',
      p_cycle: 'MONTHLY',
      p_credits_to_apply: 1,
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(/catalog amount|Wallet redemption must equal/i);
  });

  it('authenticated non-member cannot credit wallet for another org (wrong org fee)', async () => {
    const client = createAnonClient();
    await signInAs(client, 'manager@greenview.test');
    const fakeFeeId = '00000000-0000-4000-8000-000000000099';
    const deniedArgs = {
      p_org_id: SEED.greenviewOrg,
      p_platform_fee_tx_id: fakeFeeId,
    };
    const { error } = await client.rpc('credit_buyer_settlement_reward_atomic', deniedArgs);
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(
      /permission denied for function (?:public\.)?credit_buyer_settlement_reward_atomic/i,
    );

    // 00250 leaves EXECUTE with service_role, so the 00216 body still rejects a missing or foreign fee.
    const service = createServiceClient();
    const { error: bodyError } = await service.rpc('credit_buyer_settlement_reward_atomic', deniedArgs);
    expect(bodyError).toBeTruthy();
    expect(bodyError?.message ?? '').toMatch(/not found|does not belong/i);
  });

  it('COI-declared voter cannot cast committee vote (REAL DATABASE)', async () => {
    const service = createServiceClient();
    const client = createAnonClient();
    await signInAs(client, 'committee1@greenview.test');
    const profileId = 'b0000000-0000-4000-8000-000000000002';

    await service.from('conflict_of_interest_declarations').upsert({
      rfq_id: SEED.borewellRfq,
      profile_id: profileId,
      status: 'DECLARED_CONFLICT',
      description: 'db test recusal',
    });
    const { error } = await client.rpc('cast_committee_vote', {
      p_rfq_id: SEED.borewellRfq,
      p_recommended_quote_id: SEED.quoteA,
      p_choice: 'RECOMMEND',
      p_comment: 'should fail coi',
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(/Conflict of Interest|COI/i);

    await service
      .from('conflict_of_interest_declarations')
      .delete()
      .eq('rfq_id', SEED.borewellRfq)
      .eq('profile_id', profileId);
  });
});

describe('deploy-migrations.ts safety (UNIT / process)', () => {
  it('dry-run without DB exits 0 and does not require DATABASE_URL', async () => {
    const { spawnSync } = await import('node:child_process');
    const tsx = `${process.cwd()}/node_modules/tsx/dist/cli.mjs`;
    const res = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--dry-run'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: '', DIRECT_URL: '', SUPABASE_DB_URL: '', CI: '' },
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toMatch(/DRY-RUN/i);
    expect(res.stdout + res.stderr).not.toMatch(/Applying \d+ pending migrations sequentially/i);
  });

  it('deploy without credentials exits non-zero in CI mode', async () => {
    const { spawnSync } = await import('node:child_process');
    const tsx = `${process.cwd()}/node_modules/tsx/dist/cli.mjs`;
    const res = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: '', CI: 'true', GITHUB_ACTIONS: 'true' },
      encoding: 'utf8',
    });
    expect(res.status).not.toBe(0);
    const out = res.stdout + res.stderr;
    expect(out).toMatch(/CI deploy requires DATABASE_URL/i);
    expect(out).not.toMatch(/SUCCESS: Applied/i);
  });
});
