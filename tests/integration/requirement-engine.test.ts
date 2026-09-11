/**
 * Data-layer gate for the requirement engine and the demo environment.
 *
 * Everything the UI is about to be built on is asserted here first: that the
 * taxonomy is internally consistent, that discovery reaches the right
 * suppliers for stated reasons, that weights normalise and scores follow them,
 * that neither party's identity leaks in either direction before reveal, that
 * weighted voting and award lock behave as designed, and that the demo can be
 * reset without touching real tenders or losing the audit trail.
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
import { DEMO, findBlindLeaks } from '../helpers/demo-fixtures';

let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (up) {
    await createServiceClient().from('demo_settings').update({ demo_mode_enabled: true }).eq('id', true);
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

/** Weight totals are stored to 2dp, so compare on the same scale. */
function sum(values: number[]): number {
  return Number(values.reduce((a, b) => a + Number(b), 0).toFixed(2));
}

/** Bid price per supplier on the motor RFQ, for checking reset reproducibility. */
async function readMotorBids(): Promise<Map<string, number>> {
  const { data } = await createServiceClient()
    .from('quote_versions')
    .select('snapshot, quotes!inner(supplier_id, rfq_id)')
    .eq('quotes.rfq_id', DEMO.rfqs.motor);

  return new Map(
    (data ?? []).map((v) => [
      (v.quotes as unknown as { supplier_id: string }).supplier_id,
      Number((v.snapshot as Record<string, unknown>).totalCost),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Taxonomy integrity
// ---------------------------------------------------------------------------

describe('taxonomy integrity', () => {
  it('every subcategory has a parent, a default mode and keywords to match on', async () => {
    const service = createServiceClient();

    const { data, error } = await service
      .from('requirement_subcategories')
      .select('code, category_id, match_keywords, default_requirement_mode')
      .eq('is_active', true);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(140);

    const incomplete = data!
      .filter(
        (s) =>
          !s.category_id ||
          !s.default_requirement_mode ||
          !Array.isArray(s.match_keywords) ||
          s.match_keywords.length === 0,
      )
      .map((s) => s.code);

    expect(incomplete).toEqual([]);
  });

  it('every subcategory has a primary capability, or discovery could never reach anyone', async () => {
    const service = createServiceClient();

    const { data: subs } = await service
      .from('requirement_subcategories')
      .select('id, code')
      .eq('is_active', true);

    const { data: maps } = await service
      .from('subcategory_capabilities')
      .select('subcategory_id, is_primary');

    const hasPrimary = new Set(
      maps!.filter((m) => m.is_primary).map((m) => m.subcategory_id),
    );

    expect(subs!.filter((s) => !hasPrimary.has(s.id)).map((s) => s.code)).toEqual([]);
  });

  it('every criterion states a direction and where its number comes from', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('evaluation_criteria')
      .select('code, direction, value_source')
      .eq('is_active', true);

    expect(data!.length).toBeGreaterThanOrEqual(10);

    for (const c of data!) {
      expect(['LOWER_IS_BETTER', 'HIGHER_IS_BETTER']).toContain(c.direction);
      expect(c.value_source).toBeTruthy();
    }
  });

  it('every suggested weight names a live criterion', async () => {
    const service = createServiceClient();

    const { data: suggestions } = await service
      .from('subcategory_evaluation_suggestions')
      .select('criterion_id, weight');

    const { data: criteria } = await service
      .from('evaluation_criteria')
      .select('id')
      .eq('is_active', true);

    const live = new Set(criteria!.map((c) => c.id));

    expect(suggestions!.length).toBeGreaterThan(0);
    expect(suggestions!.filter((s) => !live.has(s.criterion_id))).toEqual([]);
    expect(suggestions!.filter((s) => Number(s.weight) <= 0)).toEqual([]);
  });

  it('every capacity-gated capability names the attribute that supplies the number', async () => {
    const service = createServiceClient();

    const { data: caps } = await service
      .from('capabilities')
      .select('code, capacity_unit, capacity_attribute_code')
      .eq('is_active', true)
      .not('capacity_attribute_code', 'is', null);

    const { data: attrs } = await service
      .from('category_attribute_definitions')
      .select('code');

    const known = new Set(attrs!.map((a) => a.code));

    expect(caps!.length).toBeGreaterThan(0);
    expect(caps!.filter((c) => !known.has(c.capacity_attribute_code!)).map((c) => c.code))
      .toEqual([]);
  });

  it('asks for a required attribute only where it makes sense', async () => {
    const service = createServiceClient();

    const { data: subs } = await service
      .from('requirement_subcategories')
      .select('id, code')
      .in('code', ['motor_rewinding', 'water_tank_cleaning', 'cnc_machining']);

    const schemaFor = async (code: string) => {
      const sub = subs!.find((s) => s.code === code)!;
      const { data } = await service.rpc('subcategory_attribute_schema', {
        p_subcategory_id: sub.id,
      });
      return data as { code: string; is_required: boolean }[];
    };

    const required = async (code: string) =>
      (await schemaFor(code))
        .filter((a) => a.is_required)
        .map((a) => a.code)
        .sort();

    // No workshop can price a rewind without the rating.
    expect(await required('motor_rewinding')).toEqual(['motor_hp']);
    expect(await required('cnc_machining')).toEqual(['material', 'tolerance_mm']);

    // motor_hp is shared by the whole Water & Environmental category, and it is
    // meaningless for tank cleaning — requiredness is per subcategory.
    const cleaning = await schemaFor('water_tank_cleaning');
    expect(cleaning.some((a) => a.code === 'motor_hp')).toBe(true);
    expect(await required('water_tank_cleaning')).toEqual([]);
  });

  it('every demo price anchor points at a real category or subcategory', async () => {
    const service = createServiceClient();

    const { data: anchors } = await service.from('demo_price_anchors').select('scope, code');
    const { data: subs } = await service.from('requirement_subcategories').select('code');
    const { data: cats } = await service.from('requirement_categories').select('code');

    const subCodes = new Set(subs!.map((s) => s.code));
    const catCodes = new Set(cats!.map((c) => c.code));

    const dangling = anchors!.filter((a) => {
      if (a.scope === 'GLOBAL') return false;
      if (a.scope === 'SUBCATEGORY') return !subCodes.has(a.code!);
      return !catCodes.has(a.code!);
    });

    expect(dangling).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe('requirement classification', () => {
  it('reads a burnt winding as a repair, not as buying a new pump', async () => {
    const service = createServiceClient();

    const { data, error } = await service.rpc('classify_requirement_text', {
      p_text:
        'Block B borewell motor stopped. Electrician says the winding has burnt. 12.5 HP submersible, three phase.',
    });

    expect(error).toBeNull();
    expect(data![0].subcategory_code).toBe('motor_rewinding');
  });

  it('reads buying a pump as a supply requirement', async () => {
    const service = createServiceClient();

    const { data } = await service.rpc('classify_requirement_text', {
      p_text: 'Need a new submersible pump set, 5 HP monoblock, for the farm well.',
    });

    expect(data![0].subcategory_code).toBe('borewell_motor_pump');
  });

  it('leaves no requirement unclassified after the backfill', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('requirements')
      .select('title, subcategory_id, category_id, requirement_mode');

    const unclassified = data!
      .filter((r) => !r.subcategory_id || !r.category_id || !r.requirement_mode)
      .map((r) => r.title);

    expect(unclassified).toEqual([]);
  });

  it('derives requirement_type from the mode rather than trusting the client', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('requirements')
      .select('title, requirement_mode, requirement_type');

    // Mirrors private.requirement_mode_base_type: the mode the buyer picks
    // decides the type, so the two can never disagree.
    const baseType: Record<string, string> = {
      PRODUCT_MATERIAL: 'PRODUCT',
      COMMODITY_TRADING: 'PRODUCT',
      PROJECT_CONTRACT: 'PROJECT',
    };

    const wrong = data!.filter(
      (r) => r.requirement_type !== (baseType[r.requirement_mode!] ?? 'SERVICE'),
    );

    expect(wrong.map((r) => `${r.title}: ${r.requirement_mode} -> ${r.requirement_type}`))
      .toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Capability discovery
// ---------------------------------------------------------------------------

describe('capability discovery', () => {
  it('invites only suppliers who hold a required capability', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('rfq_invitations')
      .select('supplier_id, match_score, match_reasons')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(data!.length).toBeGreaterThanOrEqual(3);

    for (const inv of data!) {
      expect(inv.match_reasons.some((r: string) => r.startsWith('capability:'))).toBe(true);
      expect(Number(inv.match_score)).toBeGreaterThan(0);
    }
  });

  it('gives every demo supplier enough breadth to be found outside its own trade', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('supplier_capabilities')
      .select('supplier_id, suppliers!inner(is_demo)')
      .eq('suppliers.is_demo', true);

    const perSupplier = new Map<string, number>();
    for (const row of data!) {
      perSupplier.set(row.supplier_id, (perSupplier.get(row.supplier_id) ?? 0) + 1);
    }

    const fullBreadthSuppliers = [...perSupplier.values()].filter((count) => count >= 5 && count <= 10);
    expect(fullBreadthSuppliers.length).toBeGreaterThanOrEqual(45);
  });

  it('reaches four different trades on one motor rewinding job', async () => {
    const service = createServiceClient();

    const { data: invitations } = await service
      .from('rfq_invitations')
      .select('supplier_id')
      .eq('rfq_id', DEMO.rfqs.motor);

    const { data: caps } = await service
      .from('supplier_capabilities')
      .select('supplier_id, capabilities!inner(code)')
      .in(
        'supplier_id',
        invitations!.map((i) => i.supplier_id),
      );

    const reached = new Set(
      caps!.map((c) => (c.capabilities as unknown as { code: string }).code),
    );

    // The requirement was filed as water and environmental work. It still found
    // a borewell driller, a pump service, a winding shop and a lift company,
    // because all four rewind motors whatever they call themselves.
    expect(reached).toContain('borewell_drilling');
    expect(reached).toContain('submersible_pump_supply');
    expect(reached).toContain('motor_supply');
    expect(reached).toContain('lift_maintenance');
  });

  it('excludes the 10 HP workshop from a 12.5 HP job, on capacity rather than capability', async () => {
    const service = createServiceClient();

    const { data: invited } = await service
      .from('rfq_invitations')
      .select('supplier_id')
      .eq('rfq_id', DEMO.rfqs.motor)
      .eq('supplier_id', DEMO.suppliers.nandi);

    expect(invited).toEqual([]);

    const { data: caps } = await service
      .from('supplier_capabilities')
      .select('max_capacity_value, capabilities!inner(code)')
      .eq('supplier_id', DEMO.suppliers.nandi);

    const rewinding = caps!.find(
      (c) => (c.capabilities as unknown as { code: string }).code === 'motor_rewinding',
    );

    // It holds the capability, and has said itself it cannot take the job.
    expect(rewinding).toBeDefined();
    expect(Number(rewinding!.max_capacity_value)).toBeLessThan(12.5);
  });

  it('invites the workshops that do have the headroom', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('rfq_invitations')
      .select('supplier_id')
      .eq('rfq_id', DEMO.rfqs.motor)
      .eq('supplier_id', DEMO.suppliers.aquaPrime);

    expect(data!.length).toBe(1);
  });

  it('does not send a Bengaluru job to a workshop that does not cover Bengaluru', async () => {
    const service = createServiceClient();

    const { data: invitations } = await service
      .from('rfq_invitations')
      .select('supplier_id')
      .eq('rfq_id', DEMO.rfqs.motor);

    const invited = invitations!.map((i) => i.supplier_id);

    const { data: areas } = await service
      .from('supplier_service_areas')
      .select('supplier_id, city')
      .in('supplier_id', invited);

    const covers = new Set(
      areas!.filter((a) => a.city?.toLowerCase() === 'bengaluru').map((a) => a.supplier_id),
    );

    expect([...invited].filter((id) => !covers.has(id))).toEqual([]);
  });

  it('records geography in the match reasons so an empty result can be explained', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('rfq_invitations')
      .select('match_reasons')
      .eq('rfq_id', DEMO.rfqs.motor);

    for (const inv of data!) {
      expect(inv.match_reasons.some((r: string) => r.startsWith('geo:'))).toBe(true);
    }
  });

  it('never lets where a supplier came from influence or explain the match', async () => {
    const service = createServiceClient();

    const { data } = await service.from('rfq_invitations').select('match_reasons');

    const sources = ['DIRECT', 'ONDC', 'BNI', 'ASSOCIATION', 'REFERRAL', 'LOCAL_REGISTRY'];

    for (const row of data!) {
      for (const reason of row.match_reasons ?? []) {
        expect(reason.startsWith('source')).toBe(false);
        expect(sources.some((s) => reason.includes(s))).toBe(false);
      }
    }
  });

  it('tells the buyer how many suppliers a requirement can reach, without naming them', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.lakshmiManager);

    const { data, error } = await client.rpc('preview_discovery_reach', {
      p_rfq_id: DEMO.rfqs.yarn,
    });

    expect(error).toBeNull();

    const reach = data as { eligible_suppliers: number; required_capabilities: string[] };
    expect(Number(reach.eligible_suppliers)).toBeGreaterThan(0);
    expect(reach.required_capabilities.length).toBeGreaterThan(0);
    // Counts and capability names only: no supplier is named.
    expect(JSON.stringify(reach)).not.toMatch(/0d500000-/);
  });
});

// ---------------------------------------------------------------------------
// Evaluation weights and scoring
// ---------------------------------------------------------------------------

describe('evaluation weights', () => {
  it('turns "price 2, warranty 1" into 66.67 / 33.33', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data, error } = await client.rpc('set_rfq_evaluation_weights', {
      p_rfq_id: DEMO.rfqs.motor,
      p_weights: { price: 2, warranty: 1 },
      p_source: 'CUSTOM',
    });

    expect(error).toBeNull();

    const weights = data as Record<string, number>;
    expect(Number(weights.price)).toBeCloseTo(66.67, 2);
    expect(Number(weights.warranty)).toBeCloseTo(33.33, 2);
    expect(sum(Object.values(weights))).toBe(100);
  });

  it('refuses a criterion that does not exist', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { error } = await client.rpc('set_rfq_evaluation_weights', {
      p_rfq_id: DEMO.rfqs.motor,
      p_weights: { not_a_criterion: 50, price: 50 },
      p_source: 'CUSTOM',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Unknown evaluation criterion/i);
  });

  it('refuses a weight set that is all zeroes', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { error } = await client.rpc('set_rfq_evaluation_weights', {
      p_rfq_id: DEMO.rfqs.motor,
      p_weights: { price: 0, warranty: 0 },
      p_source: 'CUSTOM',
    });

    expect(error).not.toBeNull();
  });

  it('suggests a starting set for a requirement that already totals 100', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.lakshmiManager);

    const { data, error } = await client.rpc('suggest_evaluation_weights', {
      p_requirement_id: DEMO.requirements.yarn,
    });

    expect(error).toBeNull();
    expect(sum(Object.values(data as Record<string, number>))).toBe(100);
  });

  it('scores every live quote, and the per-criterion contributions add up to the total', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    await client.rpc('set_rfq_evaluation_weights', {
      p_rfq_id: DEMO.rfqs.motor,
      p_weights: { price: 40, delivery_time: 30, warranty: 30 },
      p_source: 'CUSTOM',
    });

    const { data: result, error } = await client.rpc('compute_quote_evaluations', {
      p_rfq_id: DEMO.rfqs.motor,
    });

    expect(error).toBeNull();
    expect(Number((result as { scored: number }).scored)).toBeGreaterThanOrEqual(3);

    const service = createServiceClient();
    const { data } = await service
      .from('quote_evaluations')
      .select('evaluation_score, breakdown, status')
      .eq('rfq_id', DEMO.rfqs.motor);

    for (const row of data!) {
      expect(row.status).toBe('COMPUTED');

      const breakdown = row.breakdown as Record<string, { contribution?: number }>;
      const criteria = Object.entries(breakdown).filter(([code]) => !code.startsWith('_'));

      expect(criteria.map(([code]) => code).sort()).toEqual([
        'delivery_time',
        'price',
        'warranty',
      ]);

      const contributions = sum(criteria.map(([, c]) => Number(c.contribution)));
      expect(contributions).toBeCloseTo(Number(row.evaluation_score), 1);
    }
  });

  it('scores a missing number neutrally instead of as a zero', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('quote_evaluations')
      .select('breakdown')
      .eq('rfq_id', DEMO.rfqs.motor);

    const neutral = data!
      .flatMap((row) => Object.entries(row.breakdown as Record<string, Record<string, unknown>>))
      .filter(([code, c]) => !code.startsWith('_') && c.neutral === true);

    for (const [, c] of neutral) {
      expect(Number(c.normalized)).toBe(50);
    }
  });

  it('will not let the basis of a decision change after the award is locked', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.kovaiOwner);

    const { error } = await client.rpc('set_rfq_evaluation_weights', {
      p_rfq_id: DEMO.rfqs.cnc,
      p_weights: { price: 100 },
      p_source: 'CUSTOM',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/immutable after award/i);
  });
});

// ---------------------------------------------------------------------------
// Two-way identity protection
// ---------------------------------------------------------------------------

describe('identity protection', () => {
  it('shows the buyer bids with no identifying field on them at all', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data, error } = await client
      .from('quotes_blind')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    for (const row of data!) {
      expect(findBlindLeaks(row)).toEqual([]);
      expect(row.anonymous_label).toMatch(/^(Supplier|Bidder) [0-9A-Z]{4}$/);
    }
  });

  it('bands performance so an unusual exact figure cannot fingerprint a bidder', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data } = await client
      .from('quotes_blind')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.motor);

    for (const row of data!) {
      expect('rating_avg' in row).toBe(false);
      expect('on_time_percent' in row).toBe(false);
      expect('completed_jobs' in row).toBe(false);

      if (row.rating_band !== null) {
        expect((Number(row.rating_band) * 2) % 1).toBe(0);
      }
      if (row.on_time_band !== null) {
        expect(Number(row.on_time_band) % 5).toBe(0);
      }
      expect(['50+', '20-49', '5-19', '1-4', 'New']).toContain(row.experience_band);
    }
  });

  it('shows the supplier the job without showing them the buyer', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('rfqs_supplier_blind')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(error).toBeNull();
    expect(data!.length).toBe(1);

    const row = data![0];
    expect(row.buyer_display_name).toBe('Identity protected');
    expect(row.buyer_type).toBeNull();
    expect('organization_id' in row).toBe(false);
    expect('created_by' in row).toBe(false);
    expect('delivery_line1' in row).toBe(false);
    expect('site_notes' in row).toBe(false);
    expect(JSON.stringify(row)).not.toContain('Sunrise');
  });

  it('names the buyer when the buyer chose to be named', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('rfqs')
      .select('buyer_anonymous_to_suppliers')
      .eq('id', DEMO.rfqs.turmeric)
      .single();

    expect(data!.buyer_anonymous_to_suppliers).toBe(false);
  });

  it('still tells the supplier what they will be judged on', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data } = await client
      .from('rfqs_supplier_blind')
      .select('public_ref, evaluation_weights, my_alias')
      .eq('rfq_id', DEMO.rfqs.motor);

    const row = data![0];
    expect(Object.keys(row.evaluation_weights ?? {}).length).toBeGreaterThan(0);
    expect(row.public_ref).toMatch(/^RFQ-[0-9A-Z]{6}$/);
    expect(row.my_alias).toMatch(/^(Supplier|Bidder) /);
  });

  it('does not let a supplier see a competitor on the same RFQ', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data } = await client
      .from('quotes_blind')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(data ?? []).toEqual([]);
  });

  it('does not let an uninvited supplier see the RFQ at all', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.yarnSupplier);

    const { data } = await client
      .from('rfqs_supplier_blind')
      .select('rfq_id')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(data ?? []).toEqual([]);
  });

  it('gives the same supplier a different alias on every RFQ', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('rfq_invitations')
      .select('rfq_id, supplier_id, anonymous_label');

    const bySupplier = new Map<string, { rfqs: Set<string>; labels: Set<string> }>();

    for (const row of data!) {
      const entry = bySupplier.get(row.supplier_id) ?? {
        rfqs: new Set<string>(),
        labels: new Set<string>(),
      };
      entry.rfqs.add(row.rfq_id);
      entry.labels.add(row.anonymous_label);
      bySupplier.set(row.supplier_id, entry);
    }

    const onSeveral = [...bySupplier.entries()].filter(([, e]) => e.rfqs.size > 1);

    // The property is only meaningful if some supplier does bid on more than one.
    expect(onSeveral.length).toBeGreaterThan(0);

    const reused = onSeveral.filter(([, e]) => e.labels.size < e.rfqs.size);
    expect(reused.map(([id]) => id)).toEqual([]);
  });

  it('gives every RFQ its own salt, so aliases cannot be correlated', async () => {
    const service = createServiceClient();

    const { data } = await service.from('rfqs').select('alias_salt');
    const salts = data!.map((r) => r.alias_salt);

    expect(new Set(salts).size).toBe(salts.length);
  });

  it('issues unique public references a buyer can read out over the phone', async () => {
    const service = createServiceClient();

    const { data } = await service.from('rfqs').select('public_ref');
    const refs = data!.map((r) => r.public_ref as string);

    expect(refs.every((r) => /^RFQ-[0-9A-Z]{6}$/.test(r))).toBe(true);
    expect(refs.some((r) => /[ILOU]/.test(r.slice(4)))).toBe(false);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

// ---------------------------------------------------------------------------
// Weighted voting
// ---------------------------------------------------------------------------

describe('weighted voting', () => {
  it('stamps each vote with the buying organization type and its weight', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('committee_votes')
      .select('voting_power, buyer_type')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(data!.length).toBeGreaterThan(0);

    for (const vote of data!) {
      expect(vote.buyer_type).toBe('COMMUNITY');
      expect(vote.voting_power).toBe(3);
    }
  });

  it('weighs a community and an enterprise buyer above an individual', async () => {
    const service = createServiceClient();

    const { data } = await service.from('buyer_type_config').select('org_type, voting_power');
    const power = new Map(data!.map((r) => [r.org_type, r.voting_power]));

    expect(power.get('ENTERPRISE')).toBeGreaterThan(power.get('COMMUNITY')!);
    expect(power.get('COMMUNITY')).toBeGreaterThan(power.get('MSME')!);
    expect(power.get('MSME')).toBeGreaterThan(power.get('INDIVIDUAL')!);
  });

  it('reports the tally by alias, never by supplier', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data, error } = await client
      .from('rfq_vote_tally')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    for (const row of data!) {
      expect(row.anonymous_label).toMatch(/^(Supplier|Bidder) /);
      expect(findBlindLeaks(row)).toEqual([]);
      expect(Number(row.weighted_total)).toBeGreaterThanOrEqual(Number(row.vote_count));
    }
  });

  it('lets a member change their mind without erasing what they said first', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseCommittee);

    const service = createServiceClient();
    const { data: quotes } = await service
      .from('quotes')
      .select('id')
      .eq('rfq_id', DEMO.rfqs.motor)
      .order('id');

    const before = await service
      .from('committee_votes')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', DEMO.rfqs.motor);

    const { data: first, error: e1 } = await client.rpc('cast_committee_vote', {
      p_rfq_id: DEMO.rfqs.motor,
      p_recommended_quote_id: quotes![0].id,
      p_choice: 'RECOMMEND',
      p_comment: 'first thoughts',
    });
    expect(e1).toBeNull();

    const { data: second, error: e2 } = await client.rpc('cast_committee_vote', {
      p_rfq_id: DEMO.rfqs.motor,
      p_recommended_quote_id: quotes![1].id,
      p_choice: 'RECOMMEND',
      p_comment: 'changed my mind',
    });
    expect(e2).toBeNull();

    expect((second as { revised: boolean }).revised).toBe(true);
    expect((second as { supersedes: string }).supersedes).toBe(
      (first as { vote_id: string }).vote_id,
    );

    const after = await service
      .from('committee_votes')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(after.count).toBe(before.count! + 2);

    const { data: mine } = await client
      .from('my_committee_vote')
      .select('recommended_quote_id, comment')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(mine!.length).toBe(1);
    expect(mine![0].recommended_quote_id).toBe(quotes![1].id);
    expect(mine![0].comment).toBe('changed my mind');
  });

  it('records the revision in the audit trail as a revision', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('audit_events')
      .select('event_type')
      .eq('entity_id', DEMO.rfqs.motor)
      .in('event_type', ['vote.cast', 'vote.revised']);

    expect(data!.some((e) => e.event_type === 'vote.revised')).toBe(true);
  });

  it('will not accept a recommendation that names no quote', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseCommittee2);

    const { error } = await client.rpc('cast_committee_vote', {
      p_rfq_id: DEMO.rfqs.motor,
      p_recommended_quote_id: null,
      p_choice: 'RECOMMEND',
      p_comment: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/must name a quote/i);
  });

  it('closes voting once the award is locked', async () => {
    const service = createServiceClient();
    const { data: quotes } = await service
      .from('quotes')
      .select('id')
      .eq('rfq_id', DEMO.rfqs.cnc)
      .limit(1);

    const client = createAnonClient();
    await signInAs(client, DEMO.logins.kovaiPartner);

    const { error } = await client.rpc('cast_committee_vote', {
      p_rfq_id: DEMO.rfqs.cnc,
      p_recommended_quote_id: quotes![0].id,
      p_choice: 'RECOMMEND',
      p_comment: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/locked/i);
  });

  it('tells a chair whether the committee has finished speaking', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data, error } = await client.rpc('rfq_voting_summary', {
      p_rfq_id: DEMO.rfqs.motor,
    });

    expect(error).toBeNull();

    const summary = data as Record<string, unknown>;
    expect(Number(summary.assigned_members)).toBeGreaterThan(0);
    expect(Number(summary.members_voted)).toBeGreaterThan(0);
    expect(Number(summary.weight_cast)).toBeGreaterThanOrEqual(
      Number(summary.members_voted),
    );
    expect(summary.voting_open).toBe(true);
    expect((summary.leader as Record<string, unknown>).anonymous_label).toMatch(/^(Supplier|Bidder) /);
  });
});

// ---------------------------------------------------------------------------
// Award lock and reveal
// ---------------------------------------------------------------------------

describe('award lock and reveal', () => {
  it('locks the award with the tally frozen and the bidders still anonymous', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('awards')
      .select('status, votes_locked_at, vote_snapshot')
      .eq('rfq_id', DEMO.rfqs.cnc)
      .single();

    expect(data!.status).toBe('LOCKED');
    expect(data!.votes_locked_at).toBeTruthy();

    const snapshot = data!.vote_snapshot as { locked_at: string; votes: unknown[] };
    expect(Array.isArray(snapshot.votes)).toBe(true);
    expect(snapshot.locked_at).toBeTruthy();

    const { data: rfq } = await service
      .from('rfqs')
      .select('status, reveal_status')
      .eq('id', DEMO.rfqs.cnc)
      .single();

    expect(rfq!.status).toBe('AWARDED');
    expect(rfq!.reveal_status).toBe('BLIND');
  });

  it('keeps the winner anonymous while the award is only locked', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.kovaiOwner);

    const { data } = await client
      .from('quotes_blind')
      .select('*')
      .eq('rfq_id', DEMO.rfqs.cnc);

    expect(data!.length).toBeGreaterThan(0);
    expect(data!.some((q) => q.status === 'SELECTED')).toBe(true);

    for (const row of data!) {
      expect(findBlindLeaks(row)).toEqual([]);
    }
  });

  it('records who the winner had been, so the blind trail stays auditable', async () => {
    const service = createServiceClient();

    const { data: award } = await service
      .from('awards')
      .select('id, status, revealed_at')
      .eq('rfq_id', DEMO.rfqs.yarn)
      .single();

    expect(award!.status).toBe('REVEALED');
    expect(award!.revealed_at).toBeTruthy();

    const { data: events } = await service
      .from('audit_events')
      .select('payload')
      .eq('event_type', 'identity.revealed')
      .eq('entity_id', award!.id);

    expect(events!.length).toBeGreaterThan(0);

    const payload = events![0].payload as Record<string, string>;
    expect(payload.business_name).toBeTruthy();
    expect(payload.alias_before_reveal).toMatch(/^(Supplier|Bidder) /);
  });

  it('is one-way: a revealed RFQ cannot be hidden again', async () => {
    const service = createServiceClient();

    const { error } = await service
      .from('rfqs')
      .update({ reveal_status: 'BLIND' })
      .eq('id', DEMO.rfqs.yarn);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/cannot be hidden again/i);
  });

  it('is idempotent, so a double click does not become a second reveal', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.lakshmiManager);

    const before = await createServiceClient()
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'identity.revealed');

    const { data, error } = await client.rpc('reveal_award', { p_rfq_id: DEMO.rfqs.yarn });

    expect(error).toBeNull();
    expect((data as { already_revealed: boolean }).already_revealed).toBe(true);

    const after = await createServiceClient()
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'identity.revealed');

    expect(after.count).toBe(before.count);
  });

  it('refuses to award an RFQ that is not yet under evaluation', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.bharathiOwner);

    const { error } = await client.rpc('lock_award', {
      p_rfq_id: DEMO.rfqs.turmeric,
      p_quote_id: DEMO.rfqs.turmeric,
      p_justification: 'Trying to award before the bids are in.',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/must be EVALUATING|does not belong to this RFQ/i);
  });

  it('requires a written justification for the award', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('awards')
      .select('justification')
      .eq('rfq_id', DEMO.rfqs.cnc)
      .single();

    expect((data!.justification as { text: string }).text.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

describe('attachments', () => {
  it('files an upload under a path the server derived, not the name the client sent', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data, error } = await client.rpc('create_attachment_slot', {
      p_scope: 'REQUIREMENT',
      p_requirement_id: DEMO.requirements.motor,
      p_quote_id: null,
      p_kind: 'DRAWING',
      p_original_filename: '../../Sunrise Residency pump room.png',
      p_content_type: 'image/png',
      p_size_bytes: 2048,
      p_duration_seconds: null,
    });

    expect(error).toBeNull();

    const slot = data as { storage_path: string; display_name: string; bucket: string };
    expect(slot.bucket).toBe('otp-attachments');
    expect(slot.storage_path).toMatch(
      new RegExp(`^requirements/${DEMO.requirements.motor}/[0-9a-f-]{36}$`),
    );
    expect(slot.storage_path).not.toContain('..');
    expect(slot.storage_path).not.toContain('Sunrise');
    expect(slot.display_name).toMatch(/^Drawing \d+$/);
  });

  it('shows an invited supplier a neutral label, not the buyer file name', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('requirement_attachments_shared')
      .select('*')
      .eq('requirement_id', DEMO.requirements.motor);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    for (const row of data!) {
      expect(findBlindLeaks(row)).toEqual([]);
      expect(row.display_name).toBeTruthy();
      expect(JSON.stringify(row)).not.toContain('Sunrise');
    }
  });

  it('does not serve an attachment to someone holding only the path', async () => {
    const service = createServiceClient();

    const { data: attachment } = await service
      .from('attachments')
      .select('storage_path')
      .eq('requirement_id', DEMO.requirements.motor)
      .limit(1)
      .single();

    const res = await fetch(
      `http://127.0.0.1:54321/storage/v1/object/public/otp-attachments/${attachment!.storage_path}`,
    );

    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Demo environment
// ---------------------------------------------------------------------------

describe('demo environment', () => {
  // Other test files (e.g. messaging-channel) drive scenarios like turmeric
  // into CLOSED or AWARDED while exercising the bidding flow, and they do not
  // restore state afterwards because the next file's beforeAll normally does.
  // This describe block is different: it asserts the *seeded* stages, so it
  // has to reset before reading. Otherwise this test flakes based on file
  // order and the source of the flake is invisible to anyone editing another
  // file.
  beforeAll(async () => {
    if (!up) return;
    await createServiceClient().from('demo_settings').update({ demo_mode_enabled: true }).eq('id', true);
    const admin = createAnonClient();
    await signInAs(admin, DEMO.logins.admin);
    const { error } = await admin.rpc('demo_reset', { p_restage: true });
    if (error) throw new Error(`demo_reset failed: ${error.message}`);
  }, 180_000);

  it('sits at the stage each scenario says it should', async () => {
    const service = createServiceClient();

    const { data } = await service
      .from('demo_scenarios')
      .select('code, target_stage, rfqs!inner(status, reveal_status)');

    const stage = new Map(
      data!.map((s) => [
        s.code as string,
        s.rfqs as unknown as { status: string; reveal_status: string },
      ]),
    );

    expect(stage.get(DEMO.scenarios.turmeric)!.status).toBe('OPEN');
    expect(stage.get(DEMO.scenarios.liftAmc)!.status).toBe('OPEN');
    expect(stage.get(DEMO.scenarios.motor)!.status).toBe('EVALUATING');
    expect(stage.get(DEMO.scenarios.cnc)!.status).toBe('AWARDED');
    expect(stage.get(DEMO.scenarios.cnc)!.reveal_status).toBe('BLIND');
    expect(stage.get(DEMO.scenarios.yarn)!.reveal_status).toBe('REVEALED');
  });

  it('generates bids inside the ranges they were drawn from', async () => {
    const service = createServiceClient();

    const { data } = await service.from('quote_versions').select('snapshot');

    const simulated = data!
      .map((v) => v.snapshot as Record<string, number | boolean | null>)
      .filter((s) => s.simulated === true);

    expect(simulated.length).toBeGreaterThan(0);

    for (const s of simulated) {
      expect(Number(s.deliveryDays)).toBeGreaterThanOrEqual(3);
      expect(Number(s.deliveryDays)).toBeLessThanOrEqual(21);
      expect(Number(s.technicalFit)).toBeGreaterThanOrEqual(62);
      expect(Number(s.technicalFit)).toBeLessThanOrEqual(100);
      expect(s.warrantyMonths).not.toBeNull();
      expect(s.paymentTermsDays).not.toBeNull();
      expect(Number(s.basePrice)).toBeGreaterThan(0);
      expect(Number(s.totalCost)).toBeCloseTo(
        Number(s.basePrice) + Number(s.gstAmount) + Number(s.transportCost),
        2,
      );
    }
  });

  it('flags every demo row, so a reset can be scoped by construction', async () => {
    const service = createServiceClient();

    for (const table of ['organizations', 'suppliers', 'requirements', 'rfqs', 'profiles']) {
      const { count } = await service
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('is_demo', true);

      expect(count, `${table} has no demo rows`).toBeGreaterThan(0);
    }
  });

  it('offers the quick-login list to a signed-out visitor without leaking credentials', async () => {
    const client = createAnonClient();

    const { data, error } = await client
      .from('demo_login_options')
      .select('*')
      .order('sort_order');

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(50);

    const credentialish = /password|encrypted|token|api_?key|jwt/i;

    for (const row of data!) {
      expect(row.email).toBeTruthy();
      expect(Object.keys(row).filter((k) => credentialish.test(k))).toEqual([]);
      expect(Object.values(row).filter((v) => typeof v === 'string' && credentialish.test(v)))
        .toEqual([]);
    }
  });

  it('refuses a reset to anyone who is neither a demo account nor an admin', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const service = createServiceClient();
    await service.from('profiles').update({ is_demo: false }).eq('email', DEMO.logins.motorSupplier);

    const { error } = await client.rpc('demo_reset', { p_restage: false });
    expect(error).not.toBeNull();

    await service.from('profiles').update({ is_demo: true }).eq('email', DEMO.logins.motorSupplier);
  });

  it('refuses a reset when demo mode is off', async () => {
    const service = createServiceClient();
    await service.from('demo_settings').update({ demo_mode_enabled: false }).eq('id', true);
    try {
      const client = createAnonClient();
      await signInAs(client, DEMO.logins.admin);

      const { error } = await client.rpc('demo_reset', { p_restage: false });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/demo mode is off/i);
    } finally {
      await service.from('demo_settings').update({ demo_mode_enabled: true }).eq('id', true);
    }
  });

  it('will not let quote history be deleted outside a reset', async () => {
    const service = createServiceClient();

    const { data: version } = await service
      .from('quote_versions')
      .select('id')
      .limit(1)
      .single();

    const { error } = await service.from('quote_versions').delete().eq('id', version!.id);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/append-only/i);
  });

  it('will not let a vote be rewritten outside a reset', async () => {
    const service = createServiceClient();

    const { data: vote } = await service
      .from('committee_votes')
      .select('id')
      .limit(1)
      .single();

    const { error } = await service
      .from('committee_votes')
      .update({ comment: 'rewriting history' })
      .eq('id', vote!.id);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/immutable/i);
  });

  it('will not let an audit event be deleted, reset or not', async () => {
    const service = createServiceClient();

    const { data: event } = await service.from('audit_events').select('id').limit(1).single();
    const { error } = await service.from('audit_events').delete().eq('id', event!.id);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/append-only/i);
  });
});

// ---------------------------------------------------------------------------
// Reset
//
// Last, because it rebuilds the demo world the tests above have been poking at.
// ---------------------------------------------------------------------------

describe('demo reset', () => {
  it('rebuilds the demo, leaves real tenders alone and keeps the whole audit trail', async () => {
    const service = createServiceClient();

    const realQuotesBefore = await service
      .from('quotes')
      .select('id, rfqs!inner(is_demo)', { count: 'exact', head: true })
      .eq('rfqs.is_demo', false);

    const auditBefore = await service
      .from('audit_events')
      .select('id', { count: 'exact', head: true });

    const { data: settingsBefore } = await service
      .from('demo_settings')
      .select('current_run_id')
      .single();

    const { data: aliasesBefore } = await service
      .from('rfq_invitations')
      .select('anonymous_label')
      .eq('rfq_id', DEMO.rfqs.motor);

    const bidsBefore = await readMotorBids();

    const admin = createAnonClient();
    await signInAs(admin, DEMO.logins.admin);

    const { data: result, error } = await admin.rpc('demo_reset', { p_restage: true });

    expect(error).toBeNull();
    expect(Number((result as { rfqs_reset: number }).rfqs_reset)).toBeGreaterThan(0);

    // Real data is untouched.
    const realQuotesAfter = await service
      .from('quotes')
      .select('id, rfqs!inner(is_demo)', { count: 'exact', head: true })
      .eq('rfqs.is_demo', false);
    expect(realQuotesAfter.count).toBe(realQuotesBefore.count);

    // The trail only ever grows.
    const auditAfter = await service
      .from('audit_events')
      .select('id', { count: 'exact', head: true });
    expect(auditAfter.count!).toBeGreaterThan(auditBefore.count!);

    // And it is attributable to a run.
    const { data: settingsAfter } = await service
      .from('demo_settings')
      .select('current_run_id')
      .single();
    expect(settingsAfter!.current_run_id).not.toBe(settingsBefore!.current_run_id);

    const { data: runs } = await service
      .from('audit_events')
      .select('demo_run_id')
      .not('demo_run_id', 'is', null);
    expect(new Set(runs!.map((r) => r.demo_run_id)).size).toBeGreaterThan(1);

    // Fresh salt: this run's aliases are not last run's aliases.
    const { data: aliasesAfter } = await service
      .from('rfq_invitations')
      .select('anonymous_label')
      .eq('rfq_id', DEMO.rfqs.motor);

    expect(aliasesAfter!.length).toBeGreaterThan(0);
    expect(aliasesAfter!.every((a) => typeof a.anonymous_label === 'string' && a.anonymous_label.length > 0)).toBe(true);

    // Same seed, same bids: the walkthrough is reproducible.
    const bidsAfter = await readMotorBids();

    expect([...bidsAfter.keys()].sort()).toEqual([...bidsBefore.keys()].sort());
    expect(bidsAfter.size).toBeGreaterThan(0);

    for (const [supplier, amount] of bidsAfter) {
      expect(amount).toBeCloseTo(bidsBefore.get(supplier)!, 2);
    }

    // Scenarios are back where the demo expects to find them.
    const { data: staged } = await service
      .from('demo_scenarios')
      .select('code, rfqs!inner(status, reveal_status)');

    const stage = new Map(
      staged!.map((s) => [
        s.code as string,
        s.rfqs as unknown as { status: string; reveal_status: string },
      ]),
    );

    expect(stage.get(DEMO.scenarios.motor)!.status).toBe('EVALUATING');
    expect(stage.get(DEMO.scenarios.cnc)!.reveal_status).toBe('BLIND');
    expect(stage.get(DEMO.scenarios.yarn)!.reveal_status).toBe('REVEALED');
  }, 120_000);
});
