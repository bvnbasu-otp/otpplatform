-- 00062_cement_and_construction_suppliers.sql
-- Cement, Ready-Mix Concrete (RMC), TMT Steel, Aggregates & Turnkey Civil Construction Suppliers

INSERT INTO public.suppliers (
  id,
  business_name,
  source,
  contact_email,
  contact_phone,
  address,
  rating_avg,
  status,
  categories,
  capabilities
) VALUES
(
  '0d500000-0000-4000-8000-000000000101',
  'UltraTech & ACC Wholesale Cement Depot',
  'ONDC',
  'orders@ultratech-depot.test',
  '+91 98450 77112',
  '{"full": "Plot 18, Yeshwanthpur Industrial Area, Bangalore 560022", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.90,
  'ACTIVE',
  ARRAY['construction_infrastructure', 'materials'],
  '{"opc_53_grade_cement": true, "ppc_cement": true, "bulk_cement_tankers": true, "wholesale_supply_truckloads": true, "brands": ["UltraTech", "ACC", "Birla Super", "Dalmia", "Coromandel"]}'::jsonb
),
(
  '0d500000-0000-4000-8000-000000000102',
  'Kavveri Ready-Mix Concrete (RMC) & Transit Mix',
  'ASSOCIATION',
  'dispatch@kavveri-rmc.test',
  '+91 98450 88223',
  '{"full": "Sy No. 54, Sarjapur-Attibele Road, Bangalore 562125", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.85,
  'ACTIVE',
  ARRAY['construction_infrastructure', 'materials'],
  '{"rmc_grades": ["M20", "M25", "M30", "M35", "M40"], "transit_mixer_fleet_count": 18, "boom_pump_vertical_reach_meters": 36, "slab_foundation_concreting": true, "high_workability_self_compacting": true}'::jsonb
),
(
  '0d500000-0000-4000-8000-000000000103',
  'Bangalore TMT Steel & Building Materials Hub',
  'BNI',
  'sales@bangalore-tmtsteel.test',
  '+91 98450 99334',
  '{"full": "22, Mysore Road, Nayandahalli, Bangalore 560039", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.80,
  'ACTIVE',
  ARRAY['construction_infrastructure', 'materials'],
  '{"fe_550d_tmt_rebars": true, "sizes_mm": [8, 10, 12, 16, 20, 25, 32], "brands": ["Tata Tiscon", "JSW Neosteel", "Kamdhenu", "Sail"], "structural_steel_girders_ms_pipes": true, "onsite_crane_unloading": true}'::jsonb
),
(
  '0d500000-0000-4000-8000-000000000104',
  'Shree Balaji M-Sand, Aggregates & Brick Works',
  'LOCAL_REGISTRY',
  'trade@balaji-aggregates.test',
  '+91 98450 11445',
  '{"full": "Plot 89, Bommasandra Industrial Area, Bangalore 560099", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.70,
  'ACTIVE',
  ARRAY['construction_infrastructure', 'materials'],
  '{"manufactured_m_sand_concrete": true, "plastering_p_sand": true, "blue_metal_jelly_aggregates_20mm_40mm": true, "solid_concrete_blocks_4_6_8_inch": true, "red_clay_wirecut_bricks": true}'::jsonb
),
(
  '0d500000-0000-4000-8000-000000000105',
  'BuildRight Infrastructure & Turnkey Civil Works',
  'DIRECT',
  'contracts@buildright-infra.test',
  '+91 98450 22556',
  '{"full": "45, Industrial Estate, Electronic City Phase 2, Bangalore 560100", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.75,
  'ACTIVE',
  ARRAY['construction_infrastructure', 'property_facility_management'],
  '{"commercial_residential_civil_contracting": true, "rcc_frame_casting_column_slab": true, "structural_retrofitting_strengthening": true, "compound_wall_paver_road_construction": true, "waterproofing_structural_expansion_joints": true}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  business_name = EXCLUDED.business_name,
  source = EXCLUDED.source,
  contact_email = EXCLUDED.contact_email,
  contact_phone = EXCLUDED.contact_phone,
  address = EXCLUDED.address,
  rating_avg = EXCLUDED.rating_avg,
  status = EXCLUDED.status,
  categories = EXCLUDED.categories,
  capabilities = EXCLUDED.capabilities;
