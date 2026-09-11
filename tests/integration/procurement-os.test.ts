/**
 * Procurement OS — market intelligence + policy seeds.
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { createServiceClient, isLocalSupabaseReachable } from '../helpers/supabase-local';

let supabaseUp = false;

describe('procurement OS seeds', () => {
  beforeAll(async () => {
    supabaseUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!supabaseUp) ctx.skip();
  });

  it('market intelligence baselines exist for all pilot categories', async () => {
    const admin = createServiceClient();
    const keys = [
      'motor_winding_10hp',
      'cnc_spindle_repair',
      'cotton_yarn_40s',
      'electrical_panel_63a',
    ];

    for (const key of keys) {
      const { data } = await admin
        .from('market_intelligence_baselines')
        .select('category_key, sample_size')
        .eq('category_key', key)
        .single();
      expect(data?.category_key).toBe(key);
      expect(data?.sample_size).toBeGreaterThan(0);
    }
  });

  it('Greenview procurement policy includes evaluation weights', async () => {
    const admin = createServiceClient();
    const { data } = await admin
      .from('approval_policies')
      .select('threshold')
      .eq('id', 'a1000000-0000-4000-8000-000000000001')
      .single();

    const threshold = data?.threshold as {
      evaluationWeights?: { price: number };
      requestRoles?: string[];
    };
    expect(threshold?.evaluationWeights?.price).toBe(40);
    expect(threshold?.requestRoles).toContain('BUYER');
  });
});
