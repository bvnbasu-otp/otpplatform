# OTP-TAXONOMY-02A — Product Owner Decision Closure

**Date:** 2026-09-29  
**Role:** Product Owner closure (via prompt) — binds TAXONOMY-03 implementation scope  
**Inputs:** `OTP-TAXONOMY-01-READONLY-RECONSTRUCTION.md`, `OTP-TAXONOMY-02-TARGET-TAXONOMY-DESIGN.md`  
**Code / DB / deploy / ONDC live modified:** **NO** (this file only)

---

## Purpose (what TAXONOMY-03 may implement)

TAXONOMY-03 may implement **OTP buyer taxonomy and intake semantics only**: stable `requirement_categories` / `requirement_subcategories` IDs; procurement-mode → derived `requirement_type`; UI wiring for Describe/Other; minimal new leaves and non-destructive aliases; default-mode corrections; template mode mapping (`BUY` → `PRODUCT_MATERIAL`); DB-authoritative taxonomy with a thin or generated sync for legacy canonical nodes; PO/report identity on **subcategory code + snapshotted labels**; SNE inputs keyed on subcategory + nature. TAXONOMY-03 **must not** enable ONDC domains, hard-code RET19, rewrite historical requirement rows, or expand into a home-appliances taxonomy beyond the explicit leaves below.

---

## Baseline (read-only)

| Item | Value | Label |
|------|--------|--------|
| **HEAD SHA** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` | OBSERVED |
| **Branch** | `main` | OBSERVED |
| **Migration ceiling** | `00222_otp_document_issuance_snapshots.sql` | OBSERVED |
| **Dirty tracked** | R2-31 MD; `SiteHeader.tsx`; `SiteLayout.tsx`; `create-otp-services.ts`; `ondc-network-service.ts`; `ondc-realtime.test.ts` | OBSERVED |

---

## Bucket summary

| Bucket | Decisions |
|--------|-----------|
| **DECIDED** | D-01, D-02, D-03, D-05, D-06, D-07 (defer scope), D-08, D-09, D-10, D-11, D-12, D-13, D-15, D-16 |
| **DEFERRED** | D-04 (water heater product leaf); D-07 HVAC dedicated product/install leaves (use generic facility paths until appliance/HVAC tranche) |
| **NOT REQUIRED** | Broad appliance top-level; grocery taxonomy; RET19 OTP rename; historical data migration in 02A |
| **REQUIRES EXTERNAL ONDC CONFIRMATION** | D-14 (RET19); live ONDC domain enablement (D-13 boundary is decided; activation is not) |

---

## D-01 — Painting

**Decision (PRODUCT DECISION):**  
- **“50 litres exterior paint”** → **PRODUCT** via `chemicals_process_materials.paints_coatings` + `PRODUCT_MATERIAL` (or `COMMODITY_TRADING` only if buyer explicitly trades commodities).  
- **“Paint our apartment block”** (execution / contractor scope) → **PROJECT/WORK** via `property_facility_management.rwa_society_exterior_repainting` (society/block) or `home_interior_exterior_painting` (residential interior/exterior) with **`PROJECT_CONTRACT`** — **not** SERVICE as the governing nature for execution.  
- **Recurring painting maintenance** → **SERVICE** only on the **existing** recurring leaf `property_facility_management.painting_maintenance` (keywords include repainting/block painting but PO intent is **AMC/periodic maintenance**, not one-off execution). Do **not** add duplicate categories for wording variants.

**Existing nodes (OBSERVED):**

| Code | Parent | Default mode (OBSERVED) | PO lane |
|------|--------|-------------------------|---------|
| `paints_coatings` | `chemicals_process_materials` | `PRODUCT_MATERIAL` | Product SKU |
| `painting_finishing` | `construction_infrastructure` | `SERVICE` | Ambiguous (capabilities link `painting_work` / `painting_service`; `paints_coatings` has `paint_supply`) — **do not** use for litre/SKU buys |
| `home_interior_exterior_painting` | `property_facility_management` | `SERVICE` (`00058`) | Execution → **PROJECT** at mode |
| `rwa_society_exterior_repainting` | `property_facility_management` | `SERVICE` (`00058`) | Block execution → **PROJECT** at mode |
| `commercial_office_painting` | `property_facility_management` | `SERVICE` (`00058`) | Commercial execution → **PROJECT** at mode |
| `painting_maintenance` | `property_facility_management` | `SERVICE` (`00019`) | Recurring maintenance |
| `wood_metal_polish_painting` | `property_facility_management` | `SERVICE` (`00058`) | Specialist service (retain) |

**Minimum TAXONOMY-03 action:**  
1. Intake copy + parser: litre/SKU paint → `paints_coatings` only.  
2. Set **default_requirement_mode** to `PROJECT_CONTRACT` on execution painting subcategories (`home_interior_exterior_painting`, `rwa_society_exterior_repainting`, `commercial_office_painting`) **or** enforce `PROJECT_CONTRACT` in validation when scope is turnkey/contractor (smallest: **default mode migration** on those three codes).  
3. Optionally retarget `painting_finishing` default to `PRODUCT_MATERIAL` **or** mark display-only alias → `paints_coatings` for materials; **do not** split ID without alias.  
4. Leave `painting_maintenance` as SERVICE/AMC-eligible for recurring lane.

**Must NOT:** Treat painting execution as SERVICE-by-default; add parallel “painting project” leaves; use title keywords to set nature or ONDC domain.

---

## D-02 — Gym

**Decision (PRODUCT DECISION):** **Option A** (smallest **semantically safe** backward-compatible path): retain historical `gym_fitness_equipment` ID; add two new leaves; route UI/parser via **alias**, no ID deletion or rename.

| Lane | Target |
|------|--------|
| Equipment purchase | **PRODUCT** → **PROPOSED** `gym_fitness_equipment_supply` (`property_facility_management`, `PRODUCT_MATERIAL`) |
| AMC / maintenance | **SERVICE** → **PROPOSED** `gym_fitness_amc` (`property_facility_management`, `AMC`) |
| Setup / turnkey install | **PROJECT** → `cctv_it_integration` pattern: use **PROJECT_CONTRACT** on supply leaf when install bundled, or facility project subcategory if scope is civil+floor+equipment (no new gym project leaf required now) |

**Existing nodes (OBSERVED):**  
- `property_facility_management.gym_fitness_equipment` — default mode **`SERVICE`** in `00059_amenities_sports_pools_vehicle_repair.sql` (verified).  
- Capability `gym_equipment_amc` linked to `gym_fitness_equipment` in same migration.

**Minimum TAXONOMY-03 action:** Insert `gym_fitness_equipment_supply` + `gym_fitness_amc`; taxonomy alias table (or `is_active` + redirect) mapping **`gym_fitness_equipment` → disambiguate by mode** (PRODUCT_MATERIAL/AMC → new leaves; historical FKs unchanged). Optionally set `gym_fitness_equipment.is_active = false` for **new** picks only with alias redirect.

**Must NOT:** Delete/rename `gym_fitness_equipment`; change historical `subcategory_id`; Option B-only default flip to PRODUCT (breaks AMC history on same node).

---

## D-03 — Domestic RO

**Decision (PRODUCT DECISION):**  
- **“10L RO” product** → **PRODUCT** → **PROPOSED** `water_environmental.domestic_ro_purifier` (`PRODUCT_MATERIAL`) — **no existing requirement_subcategory leaf** (supplier JSON in `00061` references `domestic_ro_purifiers` capability only).  
- **Install** → **PROJECT** → **PROPOSED** `water_environmental.domestic_ro_installation` (`PROJECT_CONTRACT`) **minimum** if install must not share `water_treatment_plant` (commercial plant). Alternative until leaf exists: `plumber_technician` + `PROJECT_CONTRACT` for simple wall-mount only — **preferred minimum is one install leaf** to avoid plant misclassification.  
- **AMC** → **SERVICE** → **PROPOSED** `water_environmental.domestic_ro_amc` (`AMC`).

**Existing nodes (OBSERVED):**  
- `water_environmental.water_treatment_plant` — `PROJECT_CONTRACT`; keywords include `ro plant` (commercial/industrial conflation risk).  
- No `domestic_ro_purifier` in migrations `00019` / `00058` / `00059` / `00061`.

**Minimum TAXONOMY-03 action:** Add **three** leaves: `domestic_ro_purifier`, `domestic_ro_amc`, `domestic_ro_installation` (install leaf is minimum to separate from WTP). Tighten parser negatives on `water_treatment_plant` for “10L / home / kitchen RO”.

**Must NOT:** Broad home-appliances taxonomy; route domestic SKU to `water_treatment_plant`.

---

## D-04 — Water heater

**Decision (PRODUCT DECISION):** **(3) Defer** dedicated canonical product leaf until a broader **appliances** tranche.  
**Evidence:** No `geyser_purchase` / `water_heater` in `requirement_subcategories` seeds (OBSERVED). `ind_home_water_heater` / `geyser_purchase` exist only in `packages/domain/src/taxonomy/canonical-taxonomy.ts` (parallel canonical tree — **not** DB intake).

**Minimum TAXONOMY-03 action:** None for water heater. Interim: `general_other.general_products` + `PRODUCT_MATERIAL` or free-text `custom_requirement` if urgent.

**Must NOT:** Invent ONDC RET support; add `water_geyser_supply` in 03A without PO appliance tranche.

**Status bucket:** DEFERRED (product decision closed as defer).

---

## D-05 — Borewell

**Decision (PRODUCT DECISION):**  
- **Equipment** → **PRODUCT** → `water_environmental.borewell_motor_pump` (`PRODUCT_MATERIAL`).  
- **Drilling** → **PROJECT/WORK** (overrides TAXONOMY-02 SERVICE default) → `water_environmental.borewell_drilling` with **`PROJECT_CONTRACT`** as default mode and buyer type **PROJECT**.  
- **Maintenance** → **SERVICE** → `water_environmental.borewell_flushing` (`00019`, rejuvenation/maintenance) and `motor_rewinding` for motor repair (existing).

**Existing nodes (OBSERVED):**  
- `borewell_drilling` — default `SERVICE` (`00019`).  
- `borewell_motor_pump` — `PRODUCT_MATERIAL`.  
- `borewell_flushing` — `SERVICE`.  
- `motor_rewinding` — `REPAIR_MAINTENANCE`.

**Minimum TAXONOMY-03 action:** Update `borewell_drilling.default_requirement_mode` → `PROJECT_CONTRACT` (single-row migration); parser negatives to keep motor/pump/repair off drilling leaf. **No** new drilling leaf — `borewell_drilling` **is** the project lane.

**Must NOT:** Leave drilling as SERVICE-default for new RFQs; add redundant “borewell project” code.

---

## D-06 — Modular kitchen

**Decision (PRODUCT DECISION):**  
- **Buy cabinets/components only** → **PRODUCT** → `furniture_fixtures.home_living_furniture` or `office_furniture_workstations` (component context) + `PRODUCT_MATERIAL`; avoid forcing turnkey leaf.  
- **Design + manufacture + install** → **PROJECT** (dominant OTP turnkey case) → `furniture_fixtures.modular_carpentry_kitchen` + **`PROJECT_CONTRACT`**.

**Existing nodes (OBSERVED):**  
- `modular_carpentry_kitchen` — parent `furniture_fixtures`, default **`SERVICE`** (`00058`).  
- Capability `custom_modular_carpentry` linked to modular kitchen.

**Minimum TAXONOMY-03 action:** Change `modular_carpentry_kitchen.default_requirement_mode` → `PROJECT_CONTRACT`; UI copy separating “supply only” vs “turnkey fit-out”. **No** large kitchen subtree; **no** mandatory new component leaf (reuse furniture PRODUCT subcats).

**Must NOT:** Reparent or delete `modular_carpentry_kitchen`; collapse component buys into turnkey leaf without buyer mode.

---

## D-07 — HVAC

**Decision (PRODUCT DECISION):**  
- **Equipment PRODUCT** / **install PROJECT** / **AMC SERVICE** — conceptually closed, but **no dedicated HVAC subcategory codes** in DB seeds (OBSERVED).  
- **Defer** dedicated HVAC equipment/install leaves.  
- **AMC now:** map maintenance template to `property_facility_management.amc_facility` + `AMC` (existing).  
- **Equipment/install:** interim `electrical_power` product leaves (e.g. `ups_inverters`) only if buyer intent matches; otherwise `custom_requirement` until HVAC tranche.

**Existing nodes (OBSERVED):** `amc_facility` (`AMC`); template `tmpl-hvac-maintenance` uses **non-canonical** display string “HVAC Maintenance & Servicing” (`TemplatesAndExamplesModal.tsx`).

**Minimum TAXONOMY-03 action:** Fix template mapping to `amc_facility`; defer `hvac_*` subcategory codes.

**Must NOT:** Invent ONDC HVAC domains; build full chiller/AHU taxonomy in 03A.

---

## D-08 — Legacy BUY

**Decision (PRODUCT DECISION):** **`BUY` is not a long-term semantic model.** New flows use **`RequirementMode.PRODUCT_MATERIAL`** (OBSERVED enum in `packages/domain/src/enums/requirement-mode.ts` — no `BUY` value). Historical requirements/RFQs **keep stored modes as-is**; **no** migration rewrite of `requirement_mode` or `requirement_type` on published rows.

**Compatibility mapping (TAXONOMY-03):**

| Legacy UI / template | Canonical mode | Derived type |
|----------------------|----------------|--------------|
| `BUY` (templates) | `PRODUCT_MATERIAL` | PRODUCT |
| `REPAIR` | `REPAIR_MAINTENANCE` | SERVICE |
| `RATE_CONTRACT` | `AMC` | SERVICE |
| `SERVICE` | `SERVICE` | SERVICE |

**Minimum TAXONOMY-03 action:** Template apply layer maps `BUY` → `PRODUCT_MATERIAL` only at apply-time; document in template types.

**Must NOT:** Bulk-update historical transactions; introduce `BUY` into `RequirementMode` enum.

---

## D-09 — CanonicalTaxonomyService

**Decision (PRODUCT DECISION):** **One authoritative source — database `requirement_*` tables.** `CanonicalTaxonomyService` **must not** remain a second independently editable taxonomy.

**Usage (OBSERVED):**  
- **Not** used under `apps/web` intake (`fetchTaxonomy` → DB).  
- **Used:** `create-otp-services.ts` factory; `tests/security/taxonomy-classification-redteam.test.ts`; `AdminTaxonomyManager.tsx` reads `ALL_CANONICAL_TAXONOMY_NODES` from `@otp/domain` (admin catalog display).

**TAXONOMY-03 action (least risky):** **Thin DB-backed service** — `CanonicalTaxonomyService` reads taxonomy snapshot from DB/repos; **generate** `ALL_CANONICAL_TAXONOMY_NODES` from SQL seeds in CI for domain package tests (**sync C**); remove runtime classification dependence on hand-maintained in-memory tree. Admin manager should consume DB API, not static node list, when ready.

**Must NOT:** Make in-memory canonical nodes authoritative over DB; dual-write taxonomy.

---

## D-10 — PO / reports

**Decision (PRODUCT DECISION):** Target identity = **`requirement_subcategories.code`** + **human-readable display label** snapshotted at issuance. Issued document snapshots remain **immutable**. Do **not** redesign report layouts in TAXONOMY-03 — only **close identity rule**: stop depending on free-form PO titles for category bucket logic long-term (`PurchaseOrdersPage.tsx` title heuristics are **not** canonical).

**Minimum TAXONOMY-03 action:** Ensure publish/issuance paths persist subcategory code + label on snapshots (extend if missing); reporting backlog to consume code.

**Must NOT:** Title-only taxonomy for new features; rewrite issued snapshots.

---

## D-11 — OTHER

**Decision (PRODUCT DECISION):** **Confirmed TAXONOMY-03 target:** UI “Other / Describe” maps to **`general_other`** category + **`custom_requirement`** subcategory (OBSERVED `00019_taxonomy_data.sql`, default mode `OTHER`). Free text in title/description/buyer spec describes the need. **No** category inference from title. **No** forced ONDC domain. SNE may use generic capability matching. Smart Merit scores quotes only (OBSERVED — no taxonomy in `quote-evaluation-service-impl.ts`).

**Existing (OBSERVED):** `Tier1TellOtpCard.tsx` still uses magic `'OTHER'` string (not UUID) — broken FK path per TAXONOMY-01.

**Minimum TAXONOMY-03 action:** Wire selects to DB UUIDs; remove opaque `'OTHER'` FK.

**Must NOT:** Guess taxonomy from title; emit ONDC domain for `custom_requirement`.

---

## D-12 — Starter templates

**Baseline four (OBSERVED)** — `TemplatesAndExamplesModal.tsx` / `CANONICAL_TEMPLATES`:

| ID | Title |
|----|--------|
| `tmpl-submersible-motor` | 10 HP Submersible Borewell Motor Rewinding |
| `tmpl-hvac-maintenance` | Comprehensive Annual HVAC Chiller Maintenance |
| `tmpl-cnc-flanges` | CNC Machined SS316 Industrial Flanges |
| `tmpl-terrace-waterproofing` | Commercial Terrace Waterproofing… |

### Classification table

| Candidate | Add now \| Defer | Why |
|-----------|------------------|-----|
| CCTV supply | **Add now** | High-frequency RWA/MSME; DB leaf `cctv_surveillance` exists |
| CCTV turnkey/install | **Add now** | Pairs with supply; leaf `cctv_it_integration` exists |
| Domestic RO | **Add now** | After `domestic_ro_purifier` leaf (D-03); closes water conflation |
| Motor rewinding | **Defer** | Already covered by `tmpl-submersible-motor` |
| Workstations/furniture | **Add now** | `office_furniture_workstations` exists; strong MSME UX |
| Painting (flat/society) | **Add now** | `home_interior_exterior_painting` / `rwa_society_exterior_repainting` |
| Electrical materials | **Defer** | Taxonomy exists (`electrical_items_cables`); lower template ROI |
| Plumber visit | **Add now** | `plumber_technician` — common individual path |
| Waterproofing | **Defer** | `tmpl-terrace-waterproofing` + `roofing_waterproofing` sufficient |
| Pool AMC | **Add now** | RWA persona; `swimming_pool_maintenance` exists |
| Gym equipment | **Add now** | After D-02 leaves; high clubhouse demand |
| Describe anything / Other | **Add now** | P0 — pairs with D-11 `custom_requirement` |

**Minimum set that materially improves UX:** Keep **4 baseline** + add **8**: CCTV supply, CCTV turnkey, domestic RO, workstations, painting, plumber visit, pool AMC, gym equipment, Describe/Other (baseline motor/HVAC/CNC/terrace retained).

**Must NOT:** Conflate templates with taxonomy categories; templates stay narrower than full tree.

---

## D-13 — ONDC boundary

**Decision (PRODUCT DECISION):** OTP taxonomy is **customer-facing and authoritative**. ONDC is a **backend allow-list**: OTP subcategory + nature → approved Beckn domain. Buyers **never** choose RET10/12/14, RET1B/RET1C, B2B10, SRV11, SRV13. **No** title-based domain guessing in target state. Documentation appearance ≠ live enablement; external subscribe remains a **separate gate** (`DISABLED_GATE` default OBSERVED).

**TAXONOMY-03:** Subcategory allow-list table design only if ONDC phase engaged; **do not** activate domains in taxonomy tranche.

**Must NOT:** Let ONDC heuristics determine OTP category.

---

## D-14 — RET19

**Decision (ONDC CONFIRMATION REQUIRED):** **RET19 remains unresolved.** It **must not** be treated as an enabled ONDC domain. TAXONOMY-03 **must not** hard-code RET19 as confirmed live. **RET1B / RET1C** remain **documented candidates only** (per ONDC golden docs).

**TAXONOMY-03 action:** None for RET19 naming; optional comment in ONDC mapping schema “RET19 prohibited until external confirmation”.

**Must NOT:** Map OTP categories to RET19 in production allow-list.

---

## D-15 — Nature override

**Decision (PRODUCT DECISION):** Explicit buyer **mode/nature is never silently overridden** by title keywords. Example: **“CCTV”** in title **must not** set nature, subcategory, or ONDC domain without buyer category/mode choices.

**TAXONOMY-03 action:** Parser suggests only; discovery/ONDC refactors must not use title-only routing for production (align with deprecating `00079` title ILIKE heuristics — flag/phase, not necessarily single release).

**Must NOT:** Keyword → `requirement_type` or Beckn domain without subcategory FK + mode.

---

## D-16 — Historical compatibility

**Decision (PRODUCT DECISION):** Stable IDs; **no** destructive deletion; **no** ID reuse; historical RFQs/POs remain valid; issued snapshots immutable; FKs remain valid; **aliases allowed**; **new leaves allowed**. **No data migration** in 02A (no bulk rewrite of requirements).

**TAXONOMY-03 action:** Add leaves/aliases/defaults forward-only; `taxonomy_alias` or equivalent for deprecated gym/painting redirects.

**Must NOT:** Hard-delete subcategories referenced in history; re-parent rows with FK breakage.

---

## Decision matrix

| ID | Decision | Final Target | TAXONOMY-03 Action | Status |
|----|----------|--------------|-------------------|--------|
| D-01 | Paint SKU=PRODUCT; execution=PROJECT; recurring=`painting_maintenance` SERVICE | `paints_coatings` + PROJECT on 00058 painting subcats / maintenance on `painting_maintenance` | Default mode PROJECT on execution subcats; SKU routing to `paints_coatings`; clarify `painting_finishing` | DECIDED |
| D-02 | Option A: alias `gym_fitness_equipment` + new supply/AMC leaves | `gym_fitness_equipment_supply`, `gym_fitness_amc` | Insert leaves + alias; keep historical ID | DECIDED |
| D-03 | Domestic RO product + install PROJECT + AMC SERVICE | **PROPOSED** `domestic_ro_purifier`, `domestic_ro_installation`, `domestic_ro_amc` | Add 3 leaves under `water_environmental` | DECIDED |
| D-04 | Defer water heater leaf (option 3) | Interim `general_products` / `custom_requirement` | No geyser leaf in 03A | DEFERRED |
| D-05 | Drilling=PROJECT on `borewell_drilling`; pump=PRODUCT; maintenance=flushing/rewind | Existing water_environmental codes | `borewell_drilling` default → `PROJECT_CONTRACT` | DECIDED |
| D-06 | Components=PRODUCT furniture subcats; turnkey=`modular_carpentry_kitchen` PROJECT | `modular_carpentry_kitchen` + furniture PRODUCT subcats | Default PROJECT on modular kitchen | DECIDED |
| D-07 | AMC via `amc_facility`; defer HVAC SKU/install leaves | `amc_facility` for template | Map `tmpl-hvac-maintenance`; defer `hvac_*` codes | DECIDED (defer leaves) |
| D-08 | BUY not long-term; new=`PRODUCT_MATERIAL`; no history rewrite | Template map BUY→PRODUCT_MATERIAL | Apply-time mapping only | DECIDED |
| D-09 | DB authoritative; thin DB-backed canonical service + generated fixtures | Single taxonomy source | Refactor service; CI generate from SQL | DECIDED |
| D-10 | PO/report identity = subcategory code + snapshotted label | Issuance snapshots | Persist code+label; no title buckets for new logic | DECIDED |
| D-11 | Other → `general_other.custom_requirement` | UUID wire + free text | Fix Tier1 OTHER FK | DECIDED |
| D-12 | 4 baseline + 8 new templates (see table) | Template library v2 | 03F template mapping to codes/modes | DECIDED |
| D-13 | OTP taxonomy authoritative; ONDC allow-list secondary | Layer 5 boundary | No buyer RET; no title ONDC | DECIDED |
| D-14 | RET19 unresolved; not enabled | No RET19 in allow-list | Do not hard-code RET19 | REQUIRES EXTERNAL ONDC CONFIRMATION |
| D-15 | No silent nature override from title | Mode + subcategory FK | Parser suggest-only; phase title heuristics | DECIDED |
| D-16 | Stable IDs, aliases, no 02A data migration | Historical FK safe | Forward-only migrations | DECIDED |

---

## Final gate

**TAXONOMY-02A — CONDITIONALLY CLOSED**

Product taxonomy decisions D-01–D-13, D-15–D-16 are closed for implementation planning. **D-14 (RET19)** and live ONDC domain activation remain **outside** TAXONOMY-03 scope; TAXONOMY-03 **may proceed** on OTP taxonomy, intake, templates, and SNE inputs **without** activating ONDC domains or asserting RET19.

---

*End of OTP-TAXONOMY-02A. Not implemented. Not deployed.*
