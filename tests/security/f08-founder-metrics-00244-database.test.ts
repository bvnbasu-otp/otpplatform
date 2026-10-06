/**
 * F-08 (migration 00244) against the REAL local database.
 *
 *   - get_founder_executive_metrics: suppliers.verified uses the authoritative verified predicate,
 *     completedOrders counts COMPLETED purchase orders only.
 *   - get_founder_google_places_budget_today: founder-only read of the existing google_places_daily_budget counter.
 *   - Founder-only access is intact: non-founders, suppliers and anon are refused.
 *
 * Requires a local Supabase with 00244 applied. Skips otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

const FOUNDER_LOGIN = 'bvnbasu@gmail.com';

let service: ReturnType<typeof createServiceClient>;
let up = false;
let founderReady = false;
let founder: ReturnType<typeof createAnonClient>;
const todayUtc = () => new Date().toISOString().slice(0, 10);
let budgetBackup: { present: boolean; count: number } = { present: false, count: 0 };

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;
  service = createServiceClient();
  founder = createAnonClient();
  try {
    await signInAs(founder, FOUNDER_LOGIN);
    founderReady = true;
  } catch {
    founderReady = false;
  }
  const { data } = await service
    .from('google_places_daily_budget')
    .select('request_count')
    .eq('usage_date', todayUtc())
    .maybeSingle();
  budgetBackup = { present: Boolean(data), count: data?.request_count ?? 0 };
});

afterAll(async () => {
  if (!up) return;
  // Restore exactly what was there before this suite touched today's counter.
  if (budgetBackup.present) {
    await service
      .from('google_places_daily_budget')
      .update({ request_count: budgetBackup.count })
      .eq('usage_date', todayUtc());
  } else {
    await service.from('google_places_daily_budget').delete().eq('usage_date', todayUtc());
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

describe('F-08 get_founder_executive_metrics (00244)', () => {
  it('reports verified suppliers by the authoritative predicate, separate from all suppliers', async (ctx) => {
    if (!founderReady) return ctx.skip();
    const { data, error } = await founder.rpc('get_founder_executive_metrics');
    expect(error).toBeNull();
    const m = data as {
      suppliers: { total: number; verified: number };
      procurement: { completedOrders: number; purchaseOrdersIssued: number };
    };

    const { count: all } = await service.from('suppliers').select('id', { count: 'exact', head: true });
    const { count: verified } = await service
      .from('suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('lifecycle_state', 'VERIFIED')
      .eq('verification_status', 'VERIFIED');
    expect(m.suppliers.total).toBe(all);
    expect(m.suppliers.verified).toBe(verified);
    expect(m.suppliers.verified).toBeLessThan(m.suppliers.total); // the local seed has unverified suppliers
  });

  it('completedOrders counts COMPLETED purchase orders only; issued-or-later keeps the old set', async (ctx) => {
    if (!founderReady) return ctx.skip();
    const { data } = await founder.rpc('get_founder_executive_metrics');
    const m = data as { procurement: { completedOrders: number; purchaseOrdersIssued: number } };

    const count = async (statuses: string[]) => {
      const { count } = await service
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', statuses);
      return count ?? 0;
    };
    expect(m.procurement.completedOrders).toBe(await count(['COMPLETED']));
    expect(m.procurement.purchaseOrdersIssued).toBe(await count(['ISSUED', 'ACCEPTED', 'COMPLETED']));
    expect(m.procurement.completedOrders).toBeLessThanOrEqual(m.procurement.purchaseOrdersIssued);
  });

  it('is refused for non-founders: a buyer manager, a supplier, and anon', async () => {
    for (const login of [DEMO.logins.sunriseManager, DEMO.logins.motorSupplier]) {
      const client = createAnonClient();
      await signInAs(client, login);
      for (const fn of ['get_founder_executive_metrics', 'get_founder_google_places_budget_today']) {
        const res = await client.rpc(fn);
        expect(res.error, `${login} ${fn}`).not.toBeNull();
        expect(res.error!.message).toMatch(/Founder|permission|denied/i);
        expect(res.data).toBeNull();
      }
    }
    for (const fn of ['get_founder_executive_metrics', 'get_founder_google_places_budget_today']) {
      const res = await createAnonClient().rpc(fn);
      expect(res.error, `anon ${fn}`).not.toBeNull();
      expect(res.data).toBeNull();
    }
  });
});

describe('F-08 get_founder_google_places_budget_today (00244)', () => {
  it('returns the persisted counter for the current UTC day (0 when no row), and tracks the real table', async (ctx) => {
    if (!founderReady) return ctx.skip();
    await service.from('google_places_daily_budget').delete().eq('usage_date', todayUtc());
    const empty = await founder.rpc('get_founder_google_places_budget_today');
    expect(empty.error).toBeNull();
    expect(empty.data).toMatchObject({ usageDate: todayUtc(), requestCount: 0, source: 'google_places_daily_budget' });

    // Written only by the existing reservation RPC; the founder read reflects it.
    const reserve = await service.rpc('location_pin_coverage_reserve_google_calls', { p_calls: 3 });
    expect(reserve.error).toBeNull();
    const after = await founder.rpc('get_founder_google_places_budget_today');
    expect(after.error).toBeNull();
    expect((after.data as { requestCount: number }).requestCount).toBe(3);
  });

  it('does not loosen RLS on the counter table: authenticated users cannot read it directly', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);
    const { data } = await buyer.from('google_places_daily_budget').select('*');
    expect(data ?? []).toEqual([]);
  });
});
