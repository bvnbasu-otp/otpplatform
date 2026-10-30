import assert from 'assert';
import { RuleBasedRequirementParser } from '../packages/domain/src/parser/rule-based-requirement-parser';
import { TEST_TAXONOMY } from '../packages/domain/src/parser/taxonomy.fixture';
import { RequirementMode } from '../packages/domain/src/enums/requirement-mode';

const parser = new RuleBasedRequirementParser();

async function run() {
  console.log('\n=============================================================');
  console.log('  🛍️  OTP PLATFORM — 10 EVERYDAY PURCHASES VERIFICATION');
  console.log('=============================================================');

  // 1. One ceiling fan
  const res1 = await parser.parse({ text: 'Buy one ceiling fan for master bedroom', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res1.categoryCode, 'electrical_power');
  assert.strictEqual(res1.subcategoryCode, 'fans_ventilation');
  assert.strictEqual(res1.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res1.quantity, 1);
  assert.strictEqual(res1.unit, 'PCS');
  console.log('✓ 1. One ceiling fan -> fans_ventilation (electrical_power), 1 PCS');

  // 2. One LED light
  const res2 = await parser.parse({ text: 'Need one LED light 20W white', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res2.categoryCode, 'electrical_power');
  assert.strictEqual(res2.subcategoryCode, 'led_lighting');
  assert.strictEqual(res2.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res2.quantity, 1);
  assert.strictEqual(res2.unit, 'PCS');
  console.log('✓ 2. One LED light -> led_lighting (electrical_power), 1 PCS');

  // 3. Two electrical switches
  const res3 = await parser.parse({ text: 'Buy two electrical switches 16A modular', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res3.categoryCode, 'electrical_power');
  assert.strictEqual(res3.subcategoryCode, 'switches_sockets');
  assert.strictEqual(res3.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res3.quantity, 2);
  assert.strictEqual(res3.unit, 'PCS');
  console.log('✓ 3. Two electrical switches -> switches_sockets (electrical_power), 2 PCS');

  // 4. One bathroom tap
  const res4 = await parser.parse({ text: 'Need one bathroom tap chrome finish', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res4.categoryCode, 'plumbing_sanitary');
  assert.strictEqual(res4.subcategoryCode, 'valves_taps');
  assert.strictEqual(res4.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res4.quantity, 1);
  assert.strictEqual(res4.unit, 'PCS');
  console.log('✓ 4. One bathroom tap -> valves_taps (plumbing_sanitary), 1 PCS');

  // 5. One water purifier
  const res5 = await parser.parse({ text: 'Purchase one water purifier 10L RO UV', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res5.categoryCode, 'water_environmental');
  assert.strictEqual(res5.subcategoryCode, 'water_purifiers');
  assert.strictEqual(res5.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res5.quantity, 1);
  assert.strictEqual(res5.unit, 'PCS');
  console.log('✓ 5. One water purifier -> water_purifiers (water_environmental), 1 PCS');

  // 6. Plumbing fittings
  const res6 = await parser.parse({ text: 'Need a few plumbing fittings PVC elbow and tee', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res6.categoryCode, 'plumbing_sanitary');
  assert.strictEqual(res6.subcategoryCode, 'pipes_fittings');
  assert.strictEqual(res6.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  console.log('✓ 6. Plumbing fittings -> pipes_fittings (plumbing_sanitary)');

  // 7. Door lock
  const res7 = await parser.parse({ text: 'Buy a door lock for main entrance', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res7.categoryCode, 'safety_security');
  assert.strictEqual(res7.subcategoryCode, 'door_locks_access_control');
  assert.strictEqual(res7.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res7.quantity, 1);
  assert.strictEqual(res7.unit, 'PCS');
  console.log('✓ 7. Door lock -> door_locks_access_control (safety_security), 1 PCS');

  // 8. Paint
  const res8 = await parser.parse({ text: 'Need 10 litres of paint for interior walls', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res8.categoryCode, 'chemicals_process_materials');
  assert.strictEqual(res8.subcategoryCode, 'paints_coatings');
  assert.strictEqual(res8.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res8.quantity, 10);
  assert.strictEqual(res8.unit, 'L');
  console.log('✓ 8. 10 litres paint -> paints_coatings (chemicals_process_materials), 10 L');

  // 9. Office chair
  const res9 = await parser.parse({ text: 'Need one office chair ergonomic high back', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res9.categoryCode, 'property_facility_management');
  assert.strictEqual(res9.subcategoryCode, 'office_furniture_workstations');
  assert.strictEqual(res9.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res9.quantity, 1);
  assert.strictEqual(res9.unit, 'PCS');
  console.log('✓ 9. Office chair -> office_furniture_workstations (property_facility_management), 1 PCS');

  // 10. CCTV camera
  const res10 = await parser.parse({ text: 'Need one CCTV camera 4MP IP dome', taxonomy: TEST_TAXONOMY });
  assert.strictEqual(res10.categoryCode, 'safety_security');
  assert.strictEqual(res10.subcategoryCode, 'cctv_surveillance');
  assert.strictEqual(res10.requirementMode, RequirementMode.PRODUCT_MATERIAL);
  assert.strictEqual(res10.quantity, 1);
  assert.strictEqual(res10.unit, 'PCS');
  console.log('✓ 10. CCTV camera -> cctv_surveillance (safety_security), 1 PCS');

  console.log('\n=============================================================');
  console.log('  🎉 ALL 10 EVERYDAY PURCHASE CLASSIFICATIONS PASSED (10/10)');
  console.log('=============================================================\n');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
