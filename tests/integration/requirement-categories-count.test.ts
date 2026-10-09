import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Static guard: canonical taxonomy count matches 00019 seed (15 categories).
 * Live hosted count is validated when integration DB is reachable.
 */
describe('requirement_categories canonical catalog', () => {
  it('restore migration re-seeds all fifteen 00019 category codes', () => {
    const migration = readFileSync(
      resolve('supabase/migrations/00255_restore_requirement_categories_canonical.sql'),
      'utf8',
    );
    const codes = [
      'construction_infrastructure',
      'electrical_power',
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
    for (const code of codes) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(codes).toHaveLength(15);
  });
});
