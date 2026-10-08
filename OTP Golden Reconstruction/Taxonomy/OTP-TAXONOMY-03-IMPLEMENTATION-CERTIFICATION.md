# OTP-TAXONOMY-03 — Implementation Certification

**Date:** 2026-09-30  
**Scope:** OTP buyer taxonomy only (no ONDC activation)  
**Code / DB / deploy:** Implementation in repo; production deploy **NOT** performed  

---

## 1. Executive Summary

TAXONOMY-03 implements Product Owner decisions D-01–D-16 (except deferred D-04 water heater and D-07 HVAC leaves) via forward migration `00223_otp_taxonomy_03_buyer_taxonomy.sql`, intake/template wiring, parser disambiguation for domestic RO vs commercial WTP, Describe/Other UUID persistence, legacy `BUY` → `PRODUCT_MATERIAL` template mapping, DB-authoritative canonical service default (empty in-memory seed in factory path), and ONDC domain gating when explicit `subcategoryCode` is present. Focused vitest (24 tests) and `pnpm run build` passed. Local Supabase migration apply succeeded.

---

## 2. Repository Baseline

| Item | Value |
|------|--------|
| **Baseline SHA** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` |
| **Final commit SHA** | **NOT COMMITTED** (user did not authorize commit) |
| **Migration ceiling (before)** | `00222_otp_document_issuance_snapshots.sql` |
| **Migration ceiling (after)** | `00223_otp_taxonomy_03_buyer_taxonomy.sql` |

---

## 3. Current OTP Taxonomy Inventory (post-03)

- **Authoritative source:** `requirement_categories` / `requirement_subcategories` (unchanged schema; new rows + default mode updates in `00223`).
- **New subcategory codes:** `gym_fitness_equipment_supply`, `gym_fitness_amc`, `domestic_ro_purifier`, `domestic_ro_installation`, `domestic_ro_amc`.
- **Legacy retained:** `gym_fitness_equipment` (ID preserved; display/description clarifies prefer new leaves).

---

## 4. Buyer-Facing Taxonomy

- **Wizard:** `fetchTaxonomy()` unchanged; new DB rows appear after migration.
- **Describe / Other:** `Tier1TellOtpCard.tsx` maps UI sentinels → `general_other` + `custom_requirement` UUIDs (`intake-other-taxonomy.ts`).
- **Templates:** 13 total (`CANONICAL_TEMPLATES`); HVAC template maps to `amc_facility` + `RATE_CONTRACT`.

---

## 5. Product / Service / Project Reconstruction

- Execution painting subcats default `PROJECT_CONTRACT` (catalog default only).
- `paints_coatings` remains `PRODUCT_MATERIAL`.
- `painting_maintenance` unchanged `SERVICE`.
- Borewell drilling default `PROJECT_CONTRACT`; pump product unchanged.
- Modular kitchen default `PROJECT_CONTRACT`.

---

## 6. RFQ Templates

| ID | Subcategory code | Mode apply |
|----|------------------|------------|
| `tmpl-cctv-supply` | `cctv_surveillance` | BUY → PRODUCT_MATERIAL |
| `tmpl-cctv-install` | `cctv_it_integration` | PROJECT_CONTRACT |
| `tmpl-domestic-ro` | `domestic_ro_purifier` | PRODUCT_MATERIAL |
| `tmpl-office-furniture` | `office_furniture_workstations` | PRODUCT_MATERIAL |
| `tmpl-painting-execution` | `home_interior_exterior_painting` | PROJECT_CONTRACT |
| `tmpl-plumber-visit` | `plumber_technician` | SERVICE |
| `tmpl-pool-amc` | `swimming_pool_maintenance` | AMC |
| `tmpl-gym-equipment` | `gym_fitness_equipment_supply` | PRODUCT_MATERIAL |
| `tmpl-describe-requirement` | `custom_requirement` | OTHER |
| `tmpl-hvac-maintenance` | `amc_facility` | AMC (fixed from non-canonical HVAC string) |

Baseline four templates retained.

---

## 7. Hidden / Implicit Rules Addressed

- Parser disambiguation: domestic/home/kitchen/10L RO → `domestic_ro_purifier` over `water_treatment_plant` (`rule-based-requirement-parser.ts`).
- ONDC: explicit `subcategoryCode` uses allow-list only; no title fallback to B2B10/SRV11/SRV13 (`ondc-network-service.ts`, `ondc-taxonomy-boundary.ts`).

---

## 8. Category → Discovery Mapping

- `SupplierDiscoveryRequest` extended with optional `subcategoryCode` / `requirementMode` for ONDC adapter boundary (`supplier-network-provider.ts`).
- No ONDC subscribe, credentials, or live gateway enablement.

---

## 9. Gap Closure vs TAXONOMY-02A

| Decision | Status |
|----------|--------|
| D-04 water heater leaf | Deferred (no change) |
| D-07 HVAC product/install leaves | Deferred; AMC via `amc_facility` |
| D-14 RET19 | Not hard-coded |

---

## 10. Target Model Alignment

Buyer intent → subcategory code + procurement mode → derived type; ONDC secondary and gated.

---

## 11. Product / Service / Project Model

`mapLegacyTemplateProcurementMode` (`legacy-template-mode.ts`); templates never persist `BUY` as `RequirementMode`.

---

## 12. Persona Examples

No persona-specific taxonomy forks; templates cover RWA/MSME/individual scenarios via existing leaves.

---

## 13. RFQ Starter Template Model

Template apply resolves `subcategoryCode` first (`UnifiedThreeTierIntake.tsx`).

---

## 14. Supplier Network Engine Integration

SNE request shape extended; ONDC provider passes taxonomy context when subcategory known.

---

## 15. ONDC Mapping Layer

- **Still gated:** factory `DISABLED_GATE` / env defaults unchanged.
- **Title heuristics:** only when `subcategoryCode` absent.
- **RET19:** not introduced.

---

## 16. RET10–RET19 Intersection

No RET19 mapping; explicit OTP leaves outside allow-list return `null` domain.

---

## 17. Smart Merit

No taxonomy-driven merit changes (unchanged).

---

## 18. Search / Keyword Model

DB `match_keywords` updated for WTP scope and paint SKU phrases in migration; parser augmentations for domestic RO and paint SKU vs execution.

---

## 19. Other / Custom Requirement

`general_other.custom_requirement` with real UUIDs; free text in title/description; no ONDC domain for Other.

---

## Self-Audit (D-01–D-16)

| ID | Decision | Implemented? | Evidence | Test | Residual risk |
|----|----------|--------------|----------|------|----------------|
| D-01 | Painting lanes | Yes | `00223` defaults; parser paint disambiguation; `paints_coatings` keywords | `otp-taxonomy-03-parser.test.ts` (domestic RO case); migration | `painting_finishing` default not flipped (optional 02A item) |
| D-02 | Gym split + alias | Yes | `00223` inserts; legacy `gym_fitness_equipment` retained | Templates `tmpl-gym-equipment` | No alias table; legacy row + new leaves |
| D-03 | Domestic RO | Yes | `00223` three leaves; WTP keywords narrowed; parser | `otp-taxonomy-03-parser.test.ts` | — |
| D-04 | Water heater defer | Yes (none) | — | — | Interim `custom_requirement` / `general_products` |
| D-05 | Borewell modes | Yes | `00223` `borewell_drilling` → PROJECT_CONTRACT | — | — |
| D-06 | Modular kitchen | Yes | `00223` `modular_carpentry_kitchen` default | — | — |
| D-07 | HVAC defer | Yes | `tmpl-hvac-maintenance` → `amc_facility` | `templates-and-examples.test.ts` | No HVAC SKU/install leaves |
| D-08 | BUY legacy | Yes | `legacy-template-mode.ts`; `UnifiedThreeTierIntake.tsx` | `legacy-template-mode.test.ts`; templates test | Historical rows untouched |
| D-09 | DB authoritative | Yes | `canonical-taxonomy-service.ts` default `[]`; `withLegacySeedNodes` for tests | Redteam/service tests updated | Admin UI still displays `ALL_CANONICAL_TAXONOMY_NODES` mirror |
| D-10 | PO identity snapshot | Partial | Requirements still FK `subcategory_id` | — | Issued snapshot payload not extended (no 00222 edit); reporting title heuristics untouched |
| D-11 | Other UUIDs | Yes | `Tier1TellOtpCard.tsx`; `intake-other-taxonomy.ts` | `intake-other-taxonomy.test.ts` | — |
| D-12 | Templates | Yes | `TemplatesAndExamplesModal.tsx` (+9) | `templates-and-examples.test.ts` | Template subcats require migrated DB for code resolution |
| D-13 | ONDC boundary | Yes | `ondc-taxonomy-boundary.ts`; `ondc-network-service.ts` | `ondc-taxonomy-boundary.test.ts`; `ondc-taxonomy-03-boundary.test.ts` | Heuristics remain without subcategory |
| D-14 | RET19 | Yes (none) | No RET19 in code | — | External confirmation still open |
| D-15 | Mode precedence | Yes | ONDC explicit path; parser does not set mode from title | ONDC tests | SQL title ILIKE discovery not removed |
| D-16 | Forward-only | Yes | `00223` only; idempotent inserts | Local `supabase migration up --local` applied | — |

---

## Files Changed (principal)

- `supabase/migrations/00223_otp_taxonomy_03_buyer_taxonomy.sql`
- `packages/domain/src/parser/rule-based-requirement-parser.ts`
- `packages/domain/src/taxonomy/*` (legacy mode, Other, ONDC boundary + tests)
- `packages/domain/src/ondc/ondc-taxonomy-boundary.ts`
- `packages/services/src/ondc/ondc-network-service.ts`
- `packages/services/src/services/canonical-taxonomy-service.ts`
- `apps/web/src/features/intake/components/Tier1TellOtpCard.tsx`
- `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx`
- `apps/web/src/features/intake/components/TemplatesAndExamplesModal.tsx`
- Tests listed above

---

## Tests Run

```
pnpm exec vitest run [7 focused files] → 24 passed
pnpm run build → success
```

---

## Production Actions

**None performed.** Hosted `db push` not run. Production apply of `00223` is a later explicit operator step.

---

## Certification

**TAXONOMY-03 — CONDITIONALLY CERTIFIED**

(OTP taxonomy decisions implemented and focused tests pass; **D-10** issuance snapshot subcategory metadata not extended without document-ledger change.)
