-- 00061_water_filters_and_purification_suppliers.sql
-- Dedicated Water Filter, RO Purification, Water Treatment Plant (WTP), and Filtration Plant Suppliers

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
  '0d500000-0000-4000-8000-000000000096',
  'PureAqua Commercial RO & Water Filter Solutions',
  'ONDC',
  'sales@pureaqua-filters.test',
  '+91 98450 66778',
  '{"full": "104, 100ft Intermediate Ring Road, Koramangala, Bangalore 560047", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.85,
  'ACTIVE',
  ARRAY['water_environmental', 'property_facility_management'],
  '{"domestic_ro_purifiers": true, "commercial_ro_plants_lph": "250 - 5000 LPH", "whole_house_sediment_filters": true, "water_softener_plants": true, "uv_uf_filtration": true, "annual_maintenance_contract": true}'::jsonb
),
(
  '0d500000-0000-4000-8000-000000000097',
  'HydroClear Industrial Water Filtration & Softeners',
  'ASSOCIATION',
  'info@hydroclear-filters.test',
  '+91 98450 55667',
  '{"full": "42, Peenya Industrial Area 2nd Stage, Bangalore 560058", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.75,
  'ACTIVE',
  ARRAY['water_environmental', 'construction_infrastructure'],
  '{"multi_grade_sand_filters": true, "activated_carbon_filters": true, "automatic_water_softeners": true, "iron_arsenic_removal_filters": true, "industrial_dm_plants": true}'::jsonb
),
(
  '0d500000-0000-4000-8000-000000000098',
  'Zenith Water Systems & UV Purifiers',
  'BNI',
  'contracts@zenith-watersystems.test',
  '+91 98450 33221',
  '{"full": "28, Brigade Road, Ashok Nagar, Bangalore 560025", "city": "Bengaluru", "state": "Karnataka"}'::jsonb,
  4.65,
  'ACTIVE',
  ARRAY['water_environmental', 'property_facility_management'],
  '{"institutional_water_coolers_ro": true, "cartridge_membrane_replacements": true, "apartment_wtp_filters": true, "drinking_water_purification": true}'::jsonb
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
