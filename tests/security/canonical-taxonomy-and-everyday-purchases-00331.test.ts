import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE_00331 = '00331_authoritative_17_category_taxonomy.sql';

describe('Migration 00331: Authoritative 17-Category Taxonomy & Everyday Purchases', () => {
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.+\.sql$/.test(f)).sort();
  const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE_00331), 'utf8');

  it('is the newest contiguous migration in the repository chain', () => {
    expect(migrations.at(-1)).toBe(FILE_00331);
    const index = migrations.indexOf(FILE_00331);
    expect(index).toBe(330); // 331st file (0-indexed)
    expect(migrations[index - 1]).toBe('00330_authoritative_pricing_and_supplier_fee_gate.sql');
  });

  it('enforces atomic transactional wrapper', () => {
    expect(sql.trimStart().startsWith('BEGIN;') || sql.includes('\nBEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('seeds all 17 approved top-level canonical categories', () => {
    const requiredCategories = [
      'construction_infrastructure',
      'plumbing_sanitary',
      'electrical_power',
      'hvac_refrigeration',
      'machinery_engineering',
      'industrial_supplies_hardware',
      'chemicals_process_materials',
      'textile_apparel',
      'agriculture_commodities',
      'packaging_printing',
      'property_facility_management',
      'safety_security',
      'water_environmental',
      'it_electronics_digital',
      'logistics_transportation',
      'professional_skilled_services',
      'general_other',
    ];

    for (const code of requiredCategories) {
      expect(sql).toContain(`'${code}'`);
    }

    // Verify unbundled naming
    expect(sql).toContain("'Plumbing & Sanitary'");
    expect(sql).toContain("'HVAC & Refrigeration'");
    expect(sql).toContain("'General / Miscellaneous / Other'");
  });

  it('remaps legacy furniture category to property & facility management', () => {
    expect(sql).toContain("code = 'property_facility_management'");
    expect(sql).toContain("code = 'furniture_fixtures'");
    expect(sql).toContain('is_active = false');
  });

  it('populates capabilities and subcategory_capabilities mappings', () => {
    expect(sql).toContain('INSERT INTO capabilities');
    expect(sql).toContain('INSERT INTO subcategory_capabilities');
    expect(sql).toContain("'plumbing_supply'");
    expect(sql).toContain("'hvac_supply'");
    expect(sql).toContain("'valves_taps'");
    expect(sql).toContain("'air_conditioners'");
  });
});
