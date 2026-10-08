# OTP-TAXONOMY-01 — Read-Only Procurement Taxonomy Reconstruction

**Date:** 2026-09-29  
**Role:** Principal Product Architect + Procurement Domain Architect + QA/Red-Team  
**Scope:** Reconstruct current state only — no fixes, normalization, or implementation claims  
**Code / DB / deploy modified:** **NO** (this file only)

---

## 1. Executive Summary

OTP’s **operational buyer-facing taxonomy** is a **database-driven** `requirement_categories` / `requirement_subcategories` tree (seeded in `supabase/migrations/00019_taxonomy_data.sql` and extended in `00058`, `00059`, etc.), projected to the web intake wizard via `apps/web/src/features/intake/api/taxonomy.ts`. Buyers choose **category → subcategory → procurement mode** (`RequirementMode`), from which **`requirement_type`** (`PRODUCT` | `SERVICE` | `PROJECT`) is **derived server-side** (`packages/domain/src/enums/requirement-mode.ts`, `tests/integration/requirement-engine.test.ts`).

A **second, parallel taxonomy** exists in code as `CanonicalTaxonomyService` + in-memory `ALL_CANONICAL_TAXONOMY_NODES` (`packages/services/src/services/canonical-taxonomy-service.ts`) — **not wired to the intake UI** (VERIFIED: no references under `apps/web`).

**ONDC** is integrated as a **Supplier Network Engine (SNE) adapter** (`OndcNetworkAdapter` → `OndcSupplierProvider` → `mapCategoryToOndcDomain`), but production factory wiring keeps ONDC at **`DISABLED_GATE`** unless env enables it (`packages/services/src/factory/create-otp-services.ts`). The heuristic mapper emits **`ONDC:B2B10`**, **`ONDC:SRV11`**, **`ONDC:SRV13`** — codes **not** on the official enabled-domains export documented in `OTP Golden Reconstruction/ONDC/ONDC-0C-DOMAIN-PILOT-SCOPE.md` (VERIFIED).

**Critical risks:** (1) RFQ category string passed to ONDC search can **bypass** OTP subcategory precision; (2) UI **OTHER** options are not backed by taxonomy UUIDs; (3) mixed product/service/project lanes (CCTV equipment vs install, paint supply vs painting) are **split in DB** but **collapsed by substring heuristics** in ONDC and SQL discovery; (4) **Smart Merit** scoring is **quote-commercial** (price/TAT/warranty/rating/performance) — **not** taxonomy-driven (`packages/services/src/evaluation/quote-evaluation-service-impl.ts`).

**Certification (deliverable):** see §26.

---

## 2. Repository Baseline

| Item | Value | Evidence |
|------|--------|----------|
| **HEAD SHA** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` | `git rev-parse HEAD` (this run) |
| **Branch** | `main` | `git branch --show-current` |
| **Migration ceiling** | `00222_otp_document_issuance_snapshots.sql` | highest `supabase/migrations/*.sql` filename |
| **Dirty (tracked modified)** | `OTP Golden Reconstruction/R2-31/R2-31-PRODUCTION-RELEASE-CERTIFICATION-2026-09-29.md`; `apps/web/src/features/site/components/SiteHeader.tsx`; `SiteLayout.tsx`; `packages/services/src/factory/create-otp-services.ts`; `packages/services/src/ondc/ondc-network-service.ts`; `packages/services/src/ondc/__tests__/ondc-realtime.test.ts` | `git status --short` |
| **Dirty (untracked)** | Large `OTP Golden Reconstruction/**` evidence trees; `packages/services/src/discovery/composite-discovery-service.test.ts`; scripts; `.vitest/` | same |
| **ONDC-related dirty?** | **YES** — `ondc-network-service.ts`, `ondc-realtime.test.ts`, `create-otp-services.ts` (inspect only; not edited in this task) | status |
| **R2-31-related dirty?** | **YES** — R2-31 certification markdown modified; site header/layout (may be release UI; not fully traced) | status |
| **Wallet-related dirty?** | **NO** among tracked `M` files (wallet migrations exist at `00220`/`00221` but are not in dirty list) | status |

**Stash / tree:** not modified.

---

## 3. Current OTP Taxonomy Inventory

### 3.1 Primary operational taxonomy (VERIFIED)

| Layer | Artifact | Purpose |
|-------|-----------|---------|
| Schema | `supabase/migrations/00013_requirement_taxonomy.sql` | Tables, enums (`requirement_mode`, attributes, capabilities, evaluation criteria) |
| Seed data | `00019_taxonomy_data.sql` | 15 top-level `requirement_categories`, subcategories, capabilities, attributes, keyword arrays |
| Backfill | `00020_taxonomy_backfill.sql` | Parser keyword aliases |
| Extensions | `00058_furniture_and_painting_taxonomy_and_suppliers.sql`, `00059_amenities_sports_pools_vehicle_repair.sql`, `00061_water_filters_and_purification_suppliers.sql` (suppliers only for 061) | Furniture/painting subcategories; gym/pool/sports; water filter **supplier seeds** |
| Runtime API | `apps/web/src/features/intake/api/taxonomy.ts` | `fetchTaxonomy()` → `TaxonomySnapshot` |
| Parser | `packages/domain/src/parser/rule-based-requirement-parser.ts` + `taxonomy.fixture.ts` | NL → subcategory via `match_keywords` |
| Tests | `tests/integration/requirement-engine.test.ts`, `tests/security/taxonomy-classification-redteam.test.ts` | DB taxonomy + canonical service red-team |

**Top-level categories (15)** — VERIFIED from `00019_taxonomy_data.sql` lines 16–61:  
`construction_infrastructure`, `electrical_power`, `machinery_engineering`, `industrial_supplies_hardware`, `chemicals_process_materials`, `textile_apparel`, `agriculture_commodities`, `packaging_printing`, `property_facility_management`, `safety_security`, `water_environmental`, `it_electronics_digital`, `logistics_transportation`, `professional_skilled_services`, `general_other`.

**Subcategory count:** INFERRED **80+** base (`OTP Golden Reconstruction/R2-27-Data-Inventory-PreReset-Report.md`) **plus** furniture/painting and amenities migrations (exact count not recomputed in SQL this pass).

### 3.2 Secondary / parallel taxonomies (VERIFIED)

| Name | Location | Buyer-visible? |
|------|----------|----------------|
| **Canonical taxonomy nodes** | `@otp/domain` + `CanonicalTaxonomyService` | **NO** in web intake |
| **Supplier `categories` text[]** | `suppliers.categories` (e.g. seeds) | Internal matching / discovery |
| **Capabilities** | `capabilities` + `supplier_capabilities` | Supplier profile + discovery |
| **UI template labels** | `TemplatesAndExamplesModal.tsx` — modes `BUY` \| `SERVICE` \| `REPAIR` \| `RATE_CONTRACT` | Partial overlap with `RequirementMode`; not identical enum |
| **PO list title heuristics** | `PurchaseOrdersPage.tsx` | Reporting filter only — not intake taxonomy |
| **Pilot quote title regex** | `00084_auto_generate_pilot_supplier_quotes.sql`, `00188_...` | Demo/simulation — not buyer taxonomy |

### 3.3 Legacy `public.categories`

Referenced in purge/reset RPCs (`00184_production_clean_state_reset_and_demo_isolation.sql`) as preserved master data alongside `requirement_categories`. **Relationship to intake:** UNKNOWN for current wizard (intake uses `requirement_*` only — VERIFIED in `taxonomy.ts`).

---

## 4. Buyer-Facing Taxonomy

### 4.1 Journey (TELL → REVIEW → DECIDE → TRACK)

**TELL (intake):** `UnifiedThreeTierIntake.tsx` + `Tier1TellOtpCard.tsx`  
- Free text / voice → parser suggests subcategory  
- Manual: **Category** dropdown (all active `requirement_categories`)  
- **Type of Work (Subcategory)** filtered by category  
- **Procurement Mode** — full `REQUIREMENT_MODE_LABELS` (`packages/domain/src/enums/requirement-mode.ts`)  
- Location, timing, budget, dynamic attributes from `category_attribute_definitions`  
- Chips: Borewell, Electrical, Plumbing, Security (CCTV), Cleaning, Civil, Maintenance, Packaging (`Tier1TellOtpCard.tsx` `SUGGESTION_CHIPS`)

**REVIEW:** Quote comparison UI uses commercial pillars; merit score from evaluation service (not category-specific weights unless buyer adjusted suggested weights per subcategory via `subcategory_evaluation_suggestions`).

**Personas:** Individual, RWA (organization type `COMMUNITY` in examples), MSME — **same intake controls**; persona affects org governance elsewhere, not a separate category tree (INFERRED from intake components; signup flows join `requirement_categories` for supplier onboarding — `00212_reconcile_...sql`).

### 4.2 Product / Service / Project at UI

Buyers do **not** pick `PRODUCT` | `SERVICE` | `PROJECT` directly. They pick **Procurement Mode**; type is derived (`requirementTypeForMode`). Modes map to type per `requirement-mode.ts` (VERIFIED).

### 4.3 “Other” path (VERIFIED — broken persistence model)

`Tier1TellOtpCard.tsx` adds select options `{ value: 'OTHER', ... }` for category and subcategory.  
`handleCategorySelect` / `handleSubcategorySelect` treat `OTHER` as opaque string — **no** mapping to `general_other` / `custom_requirement` UUIDs.  
Validation requires non-empty `subcategoryId` (`UnifiedThreeTierIntake.tsx`) — `'OTHER'` satisfies length but **fails FK** on publish (REQUIRES PRODUCT DECISION / P0 — see §20).

**DB escape hatch exists:** `general_other` → `custom_requirement` subcategory (`00019_taxonomy_data.sql`) — **not** wired to UI `OTHER` value.

---

## 5. Product / Service / Project Reconstruction

### 5.1 Canonical enums

| Concept | Enum | Source |
|---------|------|--------|
| Coarse lifecycle type | `RequirementType`: PRODUCT, SERVICE, PROJECT | `packages/domain/src/enums/procurement.ts` |
| Buyer-facing mode | `RequirementMode` (11 values + OTHER) | `requirement-mode.ts` |
| DB default per subcategory | `default_requirement_mode` | `requirement_subcategories` |

**Derivation (VERIFIED):** `PRODUCT_MATERIAL`, `COMMODITY_TRADING` → PRODUCT; `PROJECT_CONTRACT` → PROJECT; most other modes → SERVICE; `OTHER` → `null` type (`requirementTypeForMode`). DB trigger/RPC mirrors this (`requirement-engine.test.ts`).

### 5.2 Mixed lanes — DB vs heuristics

| Buyer intent | Subcategory / capability (VERIFIED paths) | Default mode | Heuristic risk |
|--------------|---------------------------------------------|--------------|----------------|
| CCTV **equipment** | `cctv_surveillance` (`PRODUCT_MATERIAL`) | Product | `electronic`/`security` → `ONDC:RET14` |
| CCTV **install / project** | `cctv_it_integration` (`PROJECT_CONTRACT`); capability `cctv_installation` | Project | Same substring rules if title says “cctv” |
| Paint **materials** | `painting_finishing` (construction) | SERVICE in seed row | `paint` → `ONDC:SRV13` (invalid code) |
| Paint **service** | `home_interior_exterior_painting` (`00058`), `painting_service`, `painting_maintenance` | SERVICE | Same |
| Gym **equipment** | `gym_fitness_equipment` (`00059`) | SERVICE (default mode in migration) | `gym` → `ONDC:SRV13` |
| Gym **AMC** | keywords include `gym amc` | AMC-capable | `amc` → `ONDC:SRV13` |
| Electrical **materials** | `electrical_items_cables`, etc. | PRODUCT_MATERIAL | `electrical` not in mapper; may fall through to `ONDC:SRV11` |
| Electrical **work** | `electrical_contracting` | PROJECT_CONTRACT | `construction` unrelated; default SRV11 |
| Plumbing **fittings** | `plumbing_sanitary_fittings` | PRODUCT (sanitary_fitting capability) | — |
| Plumbing **service** | `plumbing_services`, `plumber_technician` | SERVICE | — |
| Water **purifier / RO** | `water_treatment_plant` (RO keywords); suppliers in `00061`, `00078` | PROJECT_CONTRACT | `Domestic RO Water Purifiers` test → `ONDC:SRV11` (invalid) |
| Water **heater** | No dedicated subcategory found | — | **NOT FOUND** as taxonomy node; solar water heaters in **supplier** capabilities (`00111`, `00078`) only |

---

## 6. Existing RFQ Examples and Templates

### 6.1 UI templates & case studies (VERIFIED)

Source: `apps/web/src/features/intake/components/TemplatesAndExamplesModal.tsx`

| Template / Example | FOUND? | Path |
|--------------------|--------|------|
| Borewell motor rewinding | **FOUND** (template) | `tmpl-submersible-motor` |
| HVAC maintenance | **FOUND** | `tmpl-hvac-maintenance` |
| CNC flanges (buy) | **FOUND** | `tmpl-cnc-flanges` |
| Terrace waterproofing | **FOUND** | `tmpl-terrace-waterproofing` |
| Chennai RWA generator | **FOUND** (example) | `ex-chennai-rwa-generator` |
| Pune MSME CNC bushings | **FOUND** | `ex-pune-msme-machining` |
| Bengaluru MSME solar 50kW | **FOUND** | `ex-blr-solar-rooftop` |

**Named verticals not in canonical templates:**

| Named example | Status | Evidence |
|---------------|--------|----------|
| CCTV | **AMBIGUOUS** | Chip text in `Tier1TellOtpCard`; demo supplier SecureVision; no dedicated template |
| Water purifier/filter | **NOT FOUND** in templates; **FOUND** taxonomy/suppliers | `water_treatment_plant` keywords; supplier seeds `00061`, `00078` |
| Water heater | **NOT FOUND** taxonomy subcategory | Supplier capability only |
| Furniture | **FOUND** taxonomy `00058`; **NOT FOUND** UI template | subcategories `office_furniture_workstations`, etc. |
| Electrical/plumbing materials | **FOUND** taxonomy | `electrical_items_cables`, `plumbing_sanitary_fittings` |
| Gym equipment/maintenance | **FOUND** taxonomy `00059` | `gym_fitness_equipment` |
| Pool | **FOUND** taxonomy | `swimming_pool_maintenance` |
| Borewell | **FOUND** | template + `borewell_drilling`, demo seed motor RFQ |
| Civil | **AMBIGUOUS** | `construction_infrastructure` broad; chip “Civil work” |
| Painting | **FOUND** | `00058` painting subcategories; tests use `home_interior_exterior_painting` |
| Party/event | **AMBIGUOUS** | `security_services` keywords `event security` only |
| CCTV install | **FOUND** | capability `cctv_installation`; linked from `cctv_surveillance` |
| Heater install | **NOT FOUND** | — |
| Appliances | **NOT FOUND** dedicated | computers_laptops / electronics adjacent |
| Electronics | **FOUND** | `it_electronics_digital`, `cctv_surveillance` |
| Hardware | **FOUND** | `industrial_supplies_hardware` |
| Building materials | **FOUND** | `construction_infrastructure` |

### 6.2 Demo seeded RFQs (VERIFIED)

`supabase/seed_demo_environment.sql`: motor rewinding (RWA), lift AMC, CNC job work, cotton yarn, turmeric — **not** CCTV/furniture/pool demo RFQs in primary five requirements.

### 6.3 Integration test fixtures

`scripts/run_live_automated_tests.ts` references `home_interior_exterior_painting`, `swimming_pool_maintenance` subcategory codes.

---

## 7. Hidden / Implicit Taxonomy Rules

| Trigger | Destination | Why | Nature | Correct? | Risk |
|---------|-------------|-----|--------|----------|------|
| `yarn`/`textile`/`cotton`/`fabric` in category string | `ONDC:RET12` | Heuristic mapper | Code | **REQUIRES ONDC CONFIRMATION** for subscribe | Misroutes non-fashion RFQs containing “fabric” |
| `cctv`/`security`/`camera`/`electronic` | `ONDC:RET14` | Heuristic | Code | RET14 on enabled sheet — **DOCUMENTED CANDIDATE** | “Security guard” → RET14 via `security` |
| `cement`/`steel`/`rmc`/`construction`/`infra` | `ONDC:B2B10` | Heuristic | Code | **NOT ESTABLISHED** (no B2B10 on sheet) | Civil/electrical titles with “construction” |
| `gym`/`fitness`/`amc`/`paint` | `ONDC:SRV13` | Heuristic | Code | **NOT ESTABLISHED** (SRV13 not on sheet) | Paint **product** RFQs → invalid domain |
| default | `ONDC:SRV11` | Fallback | Code | **NOT ESTABLISHED** for subscribe | Majority of OTP catalog |
| `ONDC_DISCOVERY_DOMAIN` env | Overrides all | Pilot lock | Config | **CONFIRMED BY REPO EVIDENCE** | Single domain for all categories |
| RFQ title `%cctv%` | SQL supplier match | `discover_and_invite_for_rfq` | DB | INFERRED intentional | Bypasses subcategory precision |
| RFQ title `%water%` | SQL supplier match | same | DB | INFERRED | Broad false positives |
| RFQ title `%chair%`/`%furniture%` | SQL supplier match | same | DB | INFERRED | — |
| Pilot quote `water\|ro\|filter...` | Simulated quotes | `00084`, `00188` | DB | Demo | Not buyer taxonomy |
| PO page title `paint`/`cctv`/`pool` | UI category bucket | `PurchaseOrdersPage.tsx` | UI | Reporting only | Drift from DB taxonomy |

---

## 8. Current Category → Discovery Mapping

### 8.1 Intended architecture (product principles)

**Desired:** OTP category (subcategory code) → SNE → optional ONDC adapter with **approved** mapping table.

### 8.2 Actual runtime (VERIFIED)

1. **Publish requirement** stores `category_id`, `subcategory_id`, `requirement_mode`, `requirement_type` on `requirements`.
2. **RFQ creation** triggers discovery via `CompositeDiscoveryService`:
   - `LocalRegistryDiscoveryService` — `findActiveByCategory(criteria.category)` where category is typically **category code** string (`in-memory.ts` filters `suppliers.categories` array).
   - `SupplierNetworkEngine` — dispatches to adapters including `OndcNetworkAdapter` (**disabled gate** in default factory).
3. **Postgres path** `discover_and_invite_for_rfq` uses category/subcategory codes + **title ILIKE heuristics** (`00079_fix_discover_and_invite_uniqueness.sql`).
4. **ONDC path** `OndcSupplierProvider.discover` calls `broadcastRfqToOndc` with `category: request.category` — **RFQ category string**, not necessarily subcategory code (`ondc-supplier-provider.ts`).

**Bypass flag:** ONDC Beckn domain is chosen from **category string heuristics** (`mapCategoryToOndcDomain`) or env override — **can ignore** OTP subcategory and nature (VERIFIED). This is a **taxonomy bypass** relative to product principles.

**SNE vs legacy:** Engine registered in `CompositeDiscoveryService` options; legacy local registry still runs in parallel (VERIFIED `create-otp-services.ts`).

---

## 9. OTP Taxonomy Gap Analysis

| Gap | Severity | Evidence |
|-----|----------|----------|
| Dual taxonomy (DB vs CanonicalTaxonomyService) | P1 | Service exists; web intake uses DB only |
| UI `OTHER` ≠ `custom_requirement` | P0 | §4.3 |
| ONDC invalid / unapproved domain codes | P0 | `ondc-network-service.ts`; `ONDC-0C` |
| Gym subcategory default mode `SERVICE` for equipment supply | P2 | `00059` |
| No dedicated domestic RO / geyser subcategories | P2 | Relies on `water_treatment_plant` / suppliers |
| Template mode enum (`BUY`) ≠ `RequirementMode` (`PRODUCT_MATERIAL`) | P2 | `TemplatesAndExamplesModal.tsx` |
| Discovery SQL title rules duplicate ONDC substring risk | P1 | `00079` |
| RET19 vs RET1B/RET1C unresolved | P1 | ONDC golden docs |
| Single `ONDC_DISCOVERY_DOMAIN` vs multi-vertical OTP | P1 | `ONDC-1-RET10-19-MULTI-DOMAIN-READINESS.md` |

---

## 10. Proposed Target OTP Taxonomy (PROPOSED — not implemented)

**Principles:** Buyer language first; nature explicit; canonical IDs stable; ONDC never shown to buyers.

### 10.1 Top-level (preserve 15 where possible)

Keep existing `requirement_categories` codes as **Layer 3 canonical IDs** — rename display only where needed (e.g. clarify `general_other` as “Describe your requirement”).

**Add explicit splits (PROPOSED):**

- Under `safety_security`: separate **Surveillance products** vs **Surveillance installation** (already partially present — enforce mutual-exclusivity in UI copy).
- Under `water_environmental`: add **Domestic RO / purifier (product)** vs **RO AMC (service)** vs **Commercial WTP (project)** — currently conflated in `water_treatment_plant`.
- Under `electrical_power`: split **Materials SKUs** vs **Contracting** (subcategories exist — improve parser disambiguation).

### 10.2 Nature assignment

Default `default_requirement_mode` per subcategory reviewed; fix `gym_fitness_equipment` → `PRODUCT_MATERIAL` or split supply vs AMC subcategories.

### 10.3 Other / Describe

Wire UI `OTHER` to `general_other.custom_requirement` + free-text `buyer_spec` field; never block publish.

---

## 11. Product / Service / Project Model

### 11.1 Buyer wording (PROPOSED)

| Nature | Buyer label | When to use |
|--------|-------------|-------------|
| **PRODUCT** | “Buy products or materials” | Tangible goods, catalogs, deliverable SKUs |
| **SERVICE** | “Hire a service or maintenance” | Time & skill, AMC, repairs, professional services |
| **PROJECT** | “Run a project or installation contract” | Multi-step site work, milestones, bundled supply+install |

Backend retains `RequirementMode` granularity; type remains derived.

### 11.2 Validation against repo

Existing mapping in `requirementTypeForMode` supports this model (VERIFIED). `PROJECT_CONTRACT` already covers CCTV integration, electrical contracting, WTP (VERIFIED subcategory rows).

---

## 12. Individual / RWA / MSME Examples (matrix)

| Category (subcategory code) | Nature | Individual | RWA | MSME |
|-----------------------------|--------|------------|-----|------|
| `motor_rewinding` | SERVICE (repair) | Home borewell motor | Block B pump room | Factory motor |
| `lift_amc` | SERVICE (AMC) | Rare | **2 lifts society** (demo seed) | Commercial building |
| `cctv_surveillance` | PRODUCT | Home cameras | Society perimeter | Warehouse security |
| `cctv_it_integration` | PROJECT | — | Clubhouse NVR project | Plant integration |
| `home_interior_exterior_painting` | SERVICE | Flat painting | — | — |
| `rwa_society_exterior_repainting` | SERVICE | — | **Tower repainting** | — |
| `swimming_pool_maintenance` | SERVICE (AMC) | — | **Pool AMC** | Resort |
| `gym_fitness_equipment` | PRODUCT/SERVICE | Home gym | Clubhouse gym | Office wellness |
| `cotton_yarn` | PRODUCT | — | — | **Export knitwear** (demo) |
| `custom_requirement` | OTHER | One-off | Society odd job | Custom machine |

---

## 13. RFQ Starter Template Model

| Field | PRODUCT | SERVICE | PROJECT |
|-------|---------|---------|---------|
| Title, description | ✓ | ✓ | ✓ |
| Subcategory + mode | ✓ | ✓ | ✓ |
| Quantity + unit | ✓ | optional | optional (lot/SQFT) |
| Delivery city + PIN | ✓ | ✓ | ✓ |
| Fulfilment mode | SUPPLIER_DELIVERY common | SUPPLIER_ONSITE common | SUPPLIER_ONSITE |
| Required-by / SLA | ✓ | ✓ | ✓ |
| Dynamic attributes (HP, SQFT, etc.) | SKU specs | SLA, visits | Milestones, scope |
| Suggested evaluation weights | from `subcategory_evaluation_suggestions` | same | same |
| Budget / payment terms | optional | optional | **milestone** more likely |
| Min quotes / deadline | ✓ | ✓ | ✓ |

**Do not** show ONDC domain, supplier source, or merit formula inputs at intake.

---

## 14. Supplier Network Engine Integration

**VERIFIED wiring** (`create-otp-services.ts`):

- `SupplierNetworkEngine` with providers: Local registry (live), Google Places (gated), Direct (live), **ONDC (DISABLED_GATE)**, BNI/Association (disabled).
- `CompositeDiscoveryService` merges legacy local registry + engine results.
- ONDC adapter uses `OndcSupplierProvider`; truthful status `isTruthfulLive = false` (`ondc-network-adapter.ts`).

**Taxonomy inputs to SNE:** `EngineDiscoveryRequest` carries category/location; exact field mapping from requirement subcategory code — INFERRED from `otp-supplier-provider.ts` (uses category string).

**Provenance tiers:** ONDC candidates labeled `ONDC_DISCOVERED` / lifecycle in provider result (VERIFIED `ondc-supplier-provider.ts`) — distinct from `OTP_REGISTERED` / `GST_VERIFIED` supplier records (product principle; enforcement INFERRED not fully traced here).

---

## 15. ONDC Mapping Layer

| OTP Category (code) | Nature | ONDC Candidate | Evidence | Confidence | Conditions |
|---------------------|--------|----------------|----------|------------|------------|
| `textile_apparel` / yarn subcats | PRODUCT | `ONDC:RET12` | `mapCategoryToOndcDomain` | DOCUMENTED CANDIDATE (sheet) | Subscribe + mapping table |
| `cctv_surveillance`, electronics | PRODUCT | `ONDC:RET14` | mapper + tests | DOCUMENTED CANDIDATE | Pilot override `ONDC_DISCOVERY_DOMAIN` |
| `construction_infrastructure` materials | PRODUCT/PROJECT | `ONDC:RET1C` | ONDC-0C sheet | DOCUMENTED CANDIDATE | Not wired in code (code uses B2B10) |
| `industrial_supplies_hardware` | PRODUCT | `ONDC:RET1B` | ONDC-0C sheet | DOCUMENTED CANDIDATE | Not wired in code |
| `construction_*` with cement/steel keywords | — | `ONDC:B2B10` | `ondc-network-service.ts` | **NOT ESTABLISHED** | Invalid registry code per ONDC-0C |
| Default / most services | SERVICE | `ONDC:SRV11` | mapper default | **NOT ESTABLISHED** | Not on enabled sheet |
| gym/AMC/paint keywords | SERVICE | `ONDC:SRV13` | mapper | **NOT ESTABLISHED** | Not on enabled sheet |
| `grocery` (if any) | PRODUCT | `ONDC:RET10` | ONDC-0C only | DOCUMENTED CANDIDATE | Weak OTP fit |
| Party/event, borewell, pool, painting service | SERVICE/PROJECT | — | ONDC-1 scope statement | **NOT COVERED BY CURRENT RET PILOT SCOPE** | SRV family not enabled |
| PO label **RET19** | — | `ONDC:RET19` | grep ONDC docs | **NOT ESTABLISHED** | Use RET1B/RET1C in official sheet — **REQUIRES ONDC CONFIRMATION** |

**No live ONDC search performed in this task.**

---

## 16. RET10–RET19 Intersection

**Enabled in official export (VERIFIED ONDC-0C):** RET10, RET12, RET14, RET1B, RET1C, RETeB2B, RETINVL.

**OTP categories with plausible RET intersection:**

- RET12: `textile_apparel`
- RET14: `cctv_surveillance`, `it_electronics_digital` (partial)
- RET1B/RET1C: `industrial_supplies_hardware`, `construction_infrastructure` materials, electrical SKUs (hypothesis)
- RET10: weak unless grocery added

**Outside retail pilot (services/projects):** electrical contracting, plumbing services, borewell drilling, pool AMC, gym maintenance, civil/painting **services**, CCTV **installation**, professional services, logistics — **NOT COVERED BY CURRENT RET PILOT SCOPE** per ONDC-1 doc alignment.

**RET11,13,15–18,19:** **NOT ESTABLISHED BY CURRENT EVIDENCE** in enabled sheet; RET19 vs RET1B/RET1C **unresolved** — document only.

---

## 17. Smart Merit Taxonomy Dependency

**Current behavior (VERIFIED):** `QuoteEvaluationServiceImpl.score` uses price, delivery, warranty, supplier rating, past performance — **no** `category_id`, `subcategory_id`, or keywords (`quote-evaluation-service-impl.ts`).

**UI “Smart Merit” / merit score:** Displayed as `evaluationScore` (0–100 scale; UI sometimes divides by 10) on award/reveal cards — **commercial composite**, not taxonomy.

**Recommendations (PROPOSED — do not change formula in this task):**

- Feed **subcategory code** and **requirement_type** as **metadata** for explainability and reporting only.
- Use taxonomy for **suggested evaluation weights** at intake (already via `fetchSuggestedWeights`) — merit should **consume buyer-selected weights**, not ONDC catalog order.
- Keep **ONDC provenance** out of merit calculation (ONDC-0D §6).

---

## 18. Search / Keyword Model

### 18.1 Canonical keyword sources (VERIFIED)

1. `requirement_subcategories.match_keywords` (primary parser signal)
2. `category_attribute_definitions.match_patterns`
3. `00020_taxonomy_backfill.sql` alias rows
4. Ad hoc SQL/title rules in `discover_and_invite_for_rfq`

### 18.2 PROPOSED controlled model

- **Canonical keyword table** per subcategory: `primary`, `synonyms`, `negative_keywords` (e.g. borewell drilling vs motor repair).
- **Matcher:** token-boundary + phrase match; no bare substring `security` → electronics.
- **Optional ONDC mapping table** keyed by subcategory code — never by free-text RFQ title alone.

### 18.3 False-positive risks (VERIFIED concerns)

| Pattern | Risk |
|---------|------|
| `security` | guards vs CCTV |
| `borewell` | drilling vs motor repair (mitigated in 00019 comments) |
| `electronic` | broad RET14 routing |
| `paint` | product vs service → SRV13 |
| `water` | SQL discovery overly broad |

---

## 19. Other / Custom Requirement

| Stage | Current behavior | Gap |
|-------|------------------|-----|
| UI | `OTHER` select values | No UUID mapping |
| Persistence | Expects `subcategory_id` FK | `OTHER` invalid |
| Discovery | Category code null/ wrong | Weak matching |
| ONDC | String heuristics on title/category | Unreliable |
| Fallback | `general_other.custom_requirement` exists in DB | Not linked |

**Requirement:** Taxonomy must not block procurement — **currently at risk** if buyer selects UI `OTHER` (P0).

---

## 20. Contradiction Register

| ID | Severity | Title | Summary |
|----|----------|-------|---------|
| C-01 | **P0** | ONDC mapper emits non-sheet domains | `B2B10`, `SRV11`, `SRV13` in `ondc-network-service.ts` vs `ONDC-0C` |
| C-02 | **P0** | UI OTHER path vs DB FK | `Tier1TellOtpCard` `OTHER` not `custom_requirement` |
| C-03 | **P1** | Dual taxonomy engines | DB wizard vs `CanonicalTaxonomyService` |
| C-04 | **P1** | Category string bypasses subcategory for ONDC | `broadcastRfqToOndc({ category })` |
| C-05 | **P1** | RET19 label vs RET1B/RET1C registry | Unresolved in ONDC golden docs |
| C-06 | **P1** | Single `ONDC_DISCOVERY_DOMAIN` vs multi-vertical OTP | Env override |
| C-07 | **P2** | Template `BUY` vs `PRODUCT_MATERIAL` | Templates modal |
| C-08 | **P2** | Gym equipment default mode SERVICE | `00059` |
| C-09 | **P2** | PO title taxonomy ≠ requirement taxonomy | `PurchaseOrdersPage.tsx` |
| C-10 | **P3** | `public.categories` vs `requirement_categories` | Legacy preservation |

---

## 21. Regression Risk Register

| Area | Risk if taxonomy changed |
|------|---------------------------|
| RFQ create/edit | FK, validation, mode→type triggers |
| Discovery / matching | `discover_and_invite_for_rfq`, capability maps, supplier `categories` arrays |
| Quotes / pilot sim | Title regex branches in `00084`/`00188` |
| Smart Merit / evaluation | Suggested weights per subcategory |
| Award / reveal / PO docs | Category labels in snapshots |
| Reporting / analytics | MVs joining `requirement_categories` (`00154`) |
| Demo seeds | Fixed subcategory codes in `seed_demo_environment.sql` |
| Tests | `requirement-engine.test.ts`, parser fixture sync to `00019` |
| ONDC adapter | Domain mapping tests in `ondc-realtime.test.ts` |
| RWA / MSME / Individual | Org governance unchanged; intake shared |
| Supplier onboarding | Signup RPC joins `requirement_categories` |

---

## 22. Target Architecture (6 layers)

| Layer | Content | Rule |
|-------|---------|------|
| **1 — Buyer language** | Title, description, chips, templates | Plain language; no ONDC codes |
| **2 — Nature** | `RequirementMode` + derived `RequirementType` | Single source: mode picker |
| **3 — Canonical ID** | `requirement_subcategories.code` (+ category code) | Stable; versioned migrations |
| **4 — SNE mapping** | Subcategory → capabilities → supplier registry | OTP suppliers first |
| **5 — External ONDC mapping** | Optional row: subcategory → allowed Beckn domain | Allow-list only; env override per pilot |
| **6 — Provenance** | ONDC_DISCOVERED vs OTP_REGISTERED vs GST_VERIFIED | Never merge tiers in buyer copy |

**Rule:** External taxonomy must not become canonical OTP category.

---

## 23. Open Product Decisions

1. Wire UI `OTHER` to `custom_requirement` or remove until wired? (**REQUIRES PRODUCT DECISION**)
2. Authoritative taxonomy: deprecate in-memory canonical nodes or sync to DB? (**REQUIRES PRODUCT DECISION**)
3. RET pilot: RET14-only vs RET1B/RET1C materials vs multi-subscribe strategy? (**REQUIRES ONDC CONFIRMATION**)
4. Resolve RET19 naming vs RET1B/RET1C? (**REQUIRES ONDC CONFIRMATION**)
5. Split gym supply vs AMC subcategories? (**REQUIRES PRODUCT DECISION**)
6. Domestic RO / geyser subcategories? (**REQUIRES PRODUCT DECISION**)
7. Disable title-based SQL discovery heuristics in production? (**REQUIRES PRODUCT DECISION**)

---

## 24. Implementation Recommendations (documentation only)

1. **Freeze** buyer-facing changes until C-01/C-02 resolved.
2. Replace `mapCategoryToOndcDomain` production use with **subcategory → allow-list** table (ONDC-1 already recommends).
3. Align parser negative keywords with ONDC mapping boundaries.
4. Single taxonomy write path: DB seeds + generated fixture for tests.
5. Expose `general_other` intentionally in UI instead of magic `OTHER` string.
6. Merit: pass subcategory metadata to reporting; keep scoring formula stable.

---

## 25. Explicit Non-Goals

- No code, migration, or ONDC live search changes in this task  
- No normalization of existing data or supplier categories  
- No resolution of RET19 vs RET1B/RET1C  
- No claim that heuristic mappings are correct  
- No commit, deploy, or package install  

---

## 26. Final Certification

### 26.1 Red-team questions (explicit)

| # | Question | Answer | Label |
|---|----------|--------|-------|
| 1 | Is there exactly one buyer-facing taxonomy in production UI? | **Yes** — DB `requirement_*` via `fetchTaxonomy` | VERIFIED |
| 2 | Is that same taxonomy used for NL parsing? | **Yes** — shared snapshot | VERIFIED |
| 3 | Does a parallel canonical taxonomy exist? | **Yes** — `CanonicalTaxonomyService`, not in web intake | VERIFIED |
| 4 | Do buyers select PRODUCT/SERVICE/PROJECT directly? | **No** — they select `RequirementMode` | VERIFIED |
| 5 | Is requirement_type client-trusted? | **No** — derived server-side | VERIFIED |
| 6 | Are PRODUCT/SERVICE/PROJECT distinguished in DB seeds? | **Yes** — per-subcategory `default_requirement_mode` | VERIFIED |
| 7 | Are mixed lanes (CCTV product vs install) separated in DB? | **Partially** — subcategories exist; heuristics collapse | VERIFIED |
| 8 | Can buyer complete RFQ via Describe/Other without valid subcategory UUID? | **No** — UI `OTHER` is broken for FK | VERIFIED |
| 9 | Are ONDC domain codes shown to buyers? | **No** in intake UI | VERIFIED |
| 10 | Does ONDC mapping use OTP subcategory codes? | **Not reliably** — string heuristics on category/title | VERIFIED |
| 11 | Are emitted ONDC codes all registry-valid? | **No** — B2B10, SRV11, SRV13 | VERIFIED + ONDC-0C |
| 12 | Is ONDC the second supplier engine? | **No** — adapter under SNE | VERIFIED |
| 13 | Is ONDC enabled in default service factory? | **Gate disabled** unless env | VERIFIED |
| 14 | Does discovery use only taxonomy (no title SQL)? | **No** — `00079` title rules | VERIFIED |
| 15 | Does Smart Merit depend on taxonomy? | **No** — commercial weights only | VERIFIED |
| 16 | Do suggested evaluation weights vary by subcategory? | **Yes** — optional DB suggestions | VERIFIED |
| 17 | Are named buyer examples (CCTV, pool, furniture) in starter templates? | **Mostly no** — only 4 templates | VERIFIED |
| 18 | Are water purifier needs covered in taxonomy? | **Partially** — WTP/RO keywords; no domestic RO leaf | VERIFIED |
| 19 | Does RET10–RET19 cover OTP services/projects? | **No** for most services/projects | DOCUMENTED in ONDC-1 |
| 20 | Is taxonomy reconstruction complete for PO review? | **Yes** — this document | — |

### 26.2 Certification line

**TAXONOMY-01 — READY FOR PRODUCT OWNER REVIEW**

*(Implementation of taxonomy/ONDC fixes remains blocked by contradictions C-01–C-02; PO review required before engineering.)*

---

*End of OTP-TAXONOMY-01 read-only reconstruction.*
