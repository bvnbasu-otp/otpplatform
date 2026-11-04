# Product Taxonomy — 17 Canonical SNE Categories

**Status:** Canonical & Active in Database (`supabase/migrations/00331_authoritative_17_category_taxonomy.sql`).
**Applicability:** Universal across Individual, RWA, and MSME personas.

## 1. Overview
The X2O (OTP Next) procurement taxonomy classifies everyday Indian procurement requirements across 17 first-class radial categories. The taxonomy organizes everyday products and services without burdening buyers or suppliers with enterprise procurement jargon.

## 2. The 17 Canonical Categories

| # | Code | Category Name | Description & Representative Scope |
|---|---|---|---|
| 1 | `construction_infrastructure` | **Construction & Civil Infrastructure** | Civil work, building materials, renovation, waterproofing, cement, steel, bricks, aggregates. |
| 2 | `plumbing_sanitary` | **Plumbing & Sanitary** | Pipes, CPVC/GI fittings, bathroom taps, sanitaryware, water tanks, pumps, plumbing contracting. |
| 3 | `electrical_power` | **Electrical & Power** | LED lighting, switches, cables, panels, DG sets, transformers, wiring, electrical contracting. |
| 4 | `hvac_refrigeration` | **HVAC & Refrigeration** | Split AC, commercial VRV/VRF, chillers, ducting, exhaust fans, refrigeration units, AMC. |
| 5 | `machinery_engineering` | **Machinery & Engineering** | Industrial machines, CNC job work, motors, pumps, compressors, gearbox repair, spares. |
| 6 | `industrial_supplies_hardware` | **Industrial Supplies & Hardware** | Fasteners, bolts, bearings, hand/power tools, cutting tools, welding rods, lubricants, abrasives. |
| 7 | `property_facility_management` | **Property & Facility Management** | Office & home furniture, interior fitouts, painting, carpentry, civil maintenance, pest control. |
| 8 | `safety_security_surveillance` | **Safety, Security & Surveillance** | CCTV systems, access control, fire extinguishers, alarms, security guarding, biometric scanners. |
| 9 | `automotive_fleet` | **Automotive & Fleet Services** | Vehicle maintenance, commercial fleet repairs, tyres, batteries, lubricants, commercial transport. |
| 10 | `packaging_printing_stationery` | **Packaging, Printing & Stationery** | Corrugated boxes, packaging tapes, bubble wrap, brochures, labels, customized marketing print. |
| 11 | `logistics_freight_warehousing` | **Logistics, Freight & Warehousing** | Intercity logistics, local tempo transport, courier services, cold storage, warehousing space. |
| 12 | `it_hardware_networking` | **IT Hardware & Networking** | Laptops, desktops, server racks, network switches, routers, cabling, printers, computer AMC. |
| 13 | `textiles_apparel_uniforms` | **Textiles, Apparel & Uniforms** | Corporate uniforms, security uniforms, industrial PPE apparel, linens, towels, fabrics. |
| 14 | `food_catering_hospitality` | **Food, Catering & Hospitality** | Corporate cafeteria catering, event food service, pantry supplies, packaged food & beverages. |
| 15 | `office_retail_supplies` | **Office & Retail Supplies** | Desk supplies, stationery, register books, billing paper, cleaning consumables, retail POS rolls. |
| 16 | `cleaning_housekeeping_waste` | **Cleaning, Housekeeping & Waste Management** | Housekeeping services, cleaning chemicals, mop/bucket tools, waste disposal, deep cleaning. |
| 17 | `professional_business_services` | **Professional & Business Services** | Statutory audit, legal contracting, corporate compliance, technical consulting, ISO audit. |

## 3. Database Authority
- Migration `00331_authoritative_17_category_taxonomy.sql` is verified applied on hosted Supabase (`qsuvtcezffomtwzwyrso`).
- Category records are stored in `public.requirement_categories` with active flag `is_active = true`.
- Subcategory capabilities map to canonical 4-digit/6-digit Indian PIN Code supplier networks.
