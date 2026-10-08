# OTP-TAXONOMY-03A — Read-Only Implementation Verification

**Date:** 2026-09-30  
**Role:** Independent auditor (read-only; no remediation)  
**Inputs read:** `OTP-TAXONOMY-01-READONLY-RECONSTRUCTION.md`, `OTP-TAXONOMY-02-TARGET-TAXONOMY-DESIGN.md`, `OTP-TAXONOMY-02A-PRODUCT-OWNER-DECISION-CLOSURE.md`, `OTP-TAXONOMY-03-IMPLEMENTATION-CERTIFICATION.md` (cross-check only; not trusted as proof)  
**Code / DB / deploy modified by this audit:** **NO** (this file only)  
**Production DB modified by TAXONOMY-03A:** **NO**  
**00223 applied by this audit:** **NO** (`supabase migration list --local` read only)

---

## 1. Executive Summary

Independent inspection of **uncommitted** TAXONOMY-03 work at baseline commit `9cb4a037418893cbaf5c90b9f108884d32a1601b` confirms that **`00223_otp_taxonomy_03_buyer_taxonomy.sql` and companion code** implement the **core** of TAXONOMY-02A decisions D-01–D-16 (with D-04/D-07 deferrals as specified): new gym and domestic RO leaves, catalog default-mode corrections, Describe/Other UUID wiring, nine new starter templates atop four baselines, legacy `BUY` apply-time mapping, ONDC explicit-subcategory gating, and forward-only SQL without requirement/PO/snapshot rewrites.

**Gaps vs 02A (non-blocking for taxonomy release):** optional `painting_finishing` default not flipped; **no gym alias/redirect table**; D-09 **partial** (factory empty canonical seed + admin still reads static `ALL_CANONICAL_TAXONOMY_NODES`; in-memory tree still editable via `createNode`); D-10 **partial** (issuance snapshot subcategory metadata not extended); title-based SQL discovery (`00079`) and ONDC **fallback** heuristics when `subcategoryCode` is absent remain.

**Tests:** 7 focused vitest files, **28 passed** (cert claimed 24; count differs, all green).  
**Local migration ledger:** `00223` **listed as applied** on local Supabase. **Production application of 00223:** **NOT VERIFIED**.

**Final status:** **TAXONOMY-03A — CONDITIONALLY VERIFIED (core correct, P2/P3 or deferred non-taxonomy)**

---

## 2. Repository Baseline

| Item | Value | Evidence |
|------|--------|----------|
| **HEAD SHA** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` | `git rev-parse HEAD` |
| **HEAD parent** | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` | `git rev-parse HEAD^` |
| **Branch** | `main` (tracks `origin/main`) | `git branch --show-current`; `git status -sb` |
| **Working tree** | **Dirty** — TAXONOMY-03 implementation **not committed** | `git status -sb` |
| **Migration ceiling (repo files)** | `00223_otp_taxonomy_03_buyer_taxonomy.sql` exists (untracked) | `supabase/migrations/00223_*.sql` |
| **00223 exists** | **YES** | file read |
| **00223 applied locally** | **YES** — local and remote ledger both `00223` | `supabase migration list --local` (read-only) |
| **00223 applied production** | **NOT VERIFIED** | no hosted read-only DB session |
| **Baseline for diff** | `git diff 9cb4a037418893cbaf5c90b9f108884d32a1601b` | 18 tracked files; many taxonomy files **untracked** |

### Tracked modifications (taxonomy-relevant summary)

- Intake: `Tier1TellOtpCard.tsx`, `UnifiedThreeTierIntake.tsx`, `TemplatesAndExamplesModal.tsx`, `templates-and-examples.test.ts`
- Domain: `rule-based-requirement-parser.ts`, `supplier-network-provider.ts`, `index.ts`, `canonical-taxonomy.ts` (comment only)
- Services: `canonical-taxonomy-service.ts`, `ondc-network-service.ts`, `ondc-supplier-provider.ts`, `create-otp-services.ts`, tests
- Security: `taxonomy-classification-redteam.test.ts`

### Untracked (taxonomy scope; not exhaustive dump of golden notes)

- `supabase/migrations/00223_otp_taxonomy_03_buyer_taxonomy.sql`
- `packages/domain/src/taxonomy/intake-other-taxonomy.ts` (+ test)
- `packages/domain/src/taxonomy/legacy-template-mode.ts` (+ test)
- `packages/domain/src/ondc/ondc-taxonomy-boundary.ts` (+ test)
- `packages/domain/src/parser/otp-taxonomy-03-parser.test.ts`
- `packages/services/src/ondc/__tests__/ondc-taxonomy-03-boundary.test.ts`
- `OTP Golden Reconstruction/Taxonomy/*.md` (including cert)

### Out-of-scope dirty (flagged)

- `SiteHeader.tsx`, `SiteLayout.tsx`, R2-31 certification MD — site/release chrome, not taxonomy proof
- `create-otp-services.ts` also gates `MockNetworkDiscoveryService` to `VITEST === 'true'` — **SNE/discovery harness change**, not ONDC activation

---

## 3. Audit Scope and Method

- Read-only: no `supabase migration up`, `db push`, or mutating SQL
- Full read of `00223` SQL (137 lines)
- `git diff` from baseline SHA on tracked files; direct read of untracked taxonomy artifacts
- Focused vitest via `node_modules\.bin\vitest.cmd` (no `pnpm`/`npx` on PATH)
- Certification used only as a hypothesis list; every decision re-verified in source/SQL

---

## 4. Migration 00223 — Independent Review

| Check | Result |
|-------|--------|
| Updates `default_requirement_mode` only on named codes | **YES** — execution painting (3), `borewell_drilling`, `modular_carpentry_kitchen` |
| Inserts gym supply + AMC | **YES** — `gym_fitness_equipment_supply`, `gym_fitness_amc` |
| Retains `gym_fitness_equipment` | **YES** — display/description UPDATE only |
| Inserts domestic RO triple | **YES** — `domestic_ro_purifier`, `domestic_ro_installation`, `domestic_ro_amc` |
| WTP scope narrowed | **YES** — name/description/keywords UPDATE on `water_treatment_plant` |
| Paint SKU keywords | **YES** — append to `paints_coatings` |
| `painting_finishing` default | **NOT UPDATED** — remains seed `SERVICE` (`00019`) |
| Water heater / geyser leaf | **NOT ADDED** (D-04 defer) |
| HVAC leaves | **NOT ADDED** (D-07 defer) |
| UPDATE requirements / POs / snapshots | **NO** such statements |
| DELETE subcategories | **NO** |
| Idempotent inserts | **YES** — `ON CONFLICT (code) DO UPDATE` on new codes |
| Capability links | **YES** — gym leaves → `gym_equipment_amc` |

---

## 5. Decision Verification Matrix (D-01–D-16)

| ID | Decision | Expected (02A) | Result | Evidence |
|----|----------|----------------|--------|----------|
| D-01 | Paint lanes | SKU → `paints_coatings` PRODUCT; execution painting → PROJECT default on 00058 subcats; maintenance SERVICE; optional `painting_finishing` PRODUCT or alias | **PARTIAL** | `00223` PROJECT defaults on 3 execution codes; `paints_coatings` keywords; parser SKU/execution disambiguation (`rule-based-requirement-parser.ts` `applyTaxonomy03Disambiguation`); **`painting_finishing` still SERVICE default** (`00019` L260–261, not in 00223 UPDATE list) |
| D-02 | Gym Option A | Keep `gym_fitness_equipment` ID; add supply PRODUCT + AMC SERVICE; alias/redirect; no delete | **PARTIAL** | `00223` inserts + legacy label UPDATE; **no `taxonomy_alias` table, no `is_active=false` redirect**; historical FK unchanged |
| D-03 | Domestic RO | Three leaves; not mapped to WTP; no duplicate tree | **PASS** | `00223` §3; WTP keywords tightened; parser prefers `domestic_ro_purifier` over WTP (`otp-taxonomy-03-parser.test.ts`) |
| D-04 | Water heater | Defer; no geyser leaf | **DEFERRED AS SPECIFIED** | No `water_geyser`/`geyser` in 00223; canonical mirror still has `ind_home_water_heater` in `canonical-taxonomy.ts` (not DB intake) |
| D-05 | Borewell | Drilling PROJECT; pump PRODUCT; flushing/rewind SERVICE | **PASS** | `00223` L15 `borewell_drilling` → `PROJECT_CONTRACT`; `borewell_motor_pump` untouched in 00223 (seed PRODUCT); `borewell_flushing`/`motor_rewinding` not altered |
| D-06 | Modular kitchen | `modular_carpentry_kitchen` PROJECT; no kitchen subtree | **PASS** | `00223` L16; no new kitchen children |
| D-07 | HVAC | Defer SKU/install; template → `amc_facility` AMC | **PASS** (defer leaves) | No `hvac_*` in 00223; `tmpl-hvac-maintenance` → `subcategoryCode: amc_facility`, `RATE_CONTRACT` (`TemplatesAndExamplesModal.tsx` L56–62) |
| D-08 | Legacy BUY | No SQL rewrite of modes; template apply → `PRODUCT_MATERIAL`; no BUY enum | **PASS** | `legacy-template-mode.ts`; `UnifiedThreeTierIntake.tsx` apply path; tests |
| D-09 | DB authoritative canonical | Thin DB-backed service; no independent in-memory product tree | **PARTIAL** | Factory: `new CanonicalTaxonomyService(repos, audit)` default **[]** (`create-otp-services.ts` L187); **`ALL_CANONICAL_TAXONOMY_NODES` unchanged**; **`AdminTaxonomyManager.tsx` still displays static list**; **`createNode`/`updateNode` still mutate in-memory** (`canonical-taxonomy-service.ts`); intake uses DB via `fetchTaxonomy` (unchanged pattern) |
| D-10 | PO/report identity | FK + snapshotted code/label; no snapshot rewrite | **PARTIAL** | Requirements still FK `subcategory_id` (unchanged); **no 00222 extension** for subcategory code on issued snapshots; `PurchaseOrdersPage` title heuristics not touched |
| D-11 | Other path | UUID `general_other` + `custom_requirement`; publish FK; no ONDC | **PASS** | `intake-other-taxonomy.ts`; `Tier1TellOtpCard.tsx` sentinels → real UUIDs; `mapExplicitSubcategoryToOndcDomain('custom_requirement')` → null |
| D-12 | Templates | 4 baseline + **9** approved; each maps code+mode; no new motor/electrical/waterproofing templates | **PASS** | `CANONICAL_TEMPLATES.length` 13; nine new ids `tmpl-cctv-supply` … `tmpl-describe-requirement`; baselines retained |
| D-13 | ONDC boundary | Explicit subcategory allow-list; no buyer RET; no title fallthrough to B2B10/SRV11/SRV13 when explicit | **PASS** (explicit path) | `ondc-taxonomy-boundary.ts`; `resolveOndcSearchDomain` (`ondc-network-service.ts` L72–77); tests |
| D-14 | RET19 | Must not hard-code as enabled | **PASS** | **No `RET19`/`RET1B`/`RET1C` in `.ts/.tsx`** (repo grep) |
| D-15 | Nature override | Explicit mode/subcategory wins; title must not silently override nature | **PARTIAL** | ONDC: explicit context blocks heuristic domains; parser **suggests subcategory** from title (not buyer-selected mode) — see §22; SQL `00079` title ILIKE discovery **not removed** |
| D-16 | Historical safety | Forward-only; no requirement row UPDATE; no DELETE referenced nodes | **PASS** | Full 00223 read; idempotent catalog inserts only |

---

## 6. D-01 Deep Dive — `painting_finishing`

| Question | Finding |
|----------|---------|
| **What is the node?** | `construction_infrastructure.painting_finishing` — label “Painting & finishing” (`00019_taxonomy_data.sql` L260–261) |
| **Current default nature** | **`SERVICE`** via `default_requirement_mode` (unchanged by 00223) |
| **Buyer use today** | Construction lane for painting-related keywords (`painting`, `putty`, `primer`, `emulsion`); capabilities link `painting_work` / `painting_service` (`00019` L623) — overlaps **material** and **service** semantics |
| **Contradiction with D-01?** | **Partial.** PO: litre/SKU buys → `paints_coatings` only; `painting_finishing` ambiguous. Implementation **routes parser SKU phrases to `paints_coatings`** but **does not** retarget catalog default or deprecate manual pick of `painting_finishing` |
| **Semantically correct as-is?** | **No** for material-only intent if buyer selects this leaf (SERVICE default). **Acceptable** if buyer uses `paints_coatings` or parser suggestion |
| **Future fix (no change in 03A)?** | Optional 00223-style `default_requirement_mode` → `PRODUCT_MATERIAL` and/or display alias to `paints_coatings`; or hide from primary picker |

---

## 7. D-02 Deep Dive — Gym

| Check | Result |
|-------|--------|
| `gym_fitness_equipment` ID intact | **YES** — UPDATE name/description only (`00223` L60–64) |
| Supply leaf PRODUCT | **YES** — `gym_fitness_equipment_supply` `PRODUCT_MATERIAL` |
| AMC leaf SERVICE/AMC | **YES** — `gym_fitness_amc` mode `AMC` |
| No gym-project leaf | **YES** |
| Old RFQs resolve (same subcategory_id FK) | **YES** — no ID change |
| Alias / redirect for new picks | **NOT IMPLEMENTED** — legacy leaf remains selectable in full DB tree |

---

## 8. D-03 / D-04 / D-05 / D-06 Summary

- **D-03:** Three RO leaves under `water_environmental`; WTP relabeled commercial/industrial; domestic phrases removed from WTP keywords — **PASS**
- **D-04:** No geyser subcategory — **DEFERRED**
- **D-05:** `borewell_drilling` → `PROJECT_CONTRACT` in 00223 — **PASS**
- **D-06:** `modular_carpentry_kitchen` → `PROJECT_CONTRACT` — **PASS**

---

## 9. D-07 / D-08 Summary

- **D-07:** HVAC equipment/install codes absent; maintenance template bound to `amc_facility` — **PASS**
- **D-08:** `mapLegacyTemplateProcurementMode('BUY')` → `PRODUCT_MATERIAL`; templates retain legacy `mode: 'BUY'` display only — **PASS**; no SQL UPDATE on `requirements`

---

## 10. D-09 Deep Dive — Canonical vs DB (Critical)

| Path | Authoritative for buyer intake? | Can diverge from DB? |
|------|----------------------------------|---------------------|
| `fetchTaxonomy()` / wizard | **DB** | No (post-migration rows appear when DB migrated) |
| `RuleBasedRequirementParser` | **DB snapshot** | No |
| `createOtpServices().taxonomy` | **In-memory** (default **empty**) | **Yes** — `classifyBuyerIntent` uses `classifyRawBuyerIntent` over constructor nodes only |
| `AdminTaxonomyManager` | **`ALL_CANONICAL_TAXONOMY_NODES` static** | **Yes** — includes nodes **not** in DB (e.g. `ind_home_water_heater` / `geyser_purchase`) |
| Admin `createNode` / `updateNode` | In-memory only | **Yes** — mutations do **not** write `requirement_*` tables |

**Escalation assessment:** Buyer RFQ publish path does **not** call `classifyBuyerIntent` (grep: web **zero** hits; service usage tests/admin only). **Residual architecture debt (P2):** parallel editable/display catalog; PO target “DB-only authoritative” **not fully closed**. **Not P1** for buyer taxonomy correctness while intake remains DB-driven.

---

## 11. D-10 — Requirements, Snapshots, Reports

| Layer | Status |
|-------|--------|
| **A — Requirement FK** | **PASS** — publish still uses `subcategory_id` UUID |
| **B — Snapshot copy** | **NOT EXTENDED** — no change to 00222 issuance payload in this tranche |
| **C — Historical immutability** | **PASS** — 00223 does not touch issued rows |
| **D — Report grouping** | **UNCHANGED** — PO page title heuristics remain (02A backlog) |

Per audit instructions: **not a release blocker** unless taxonomy identity on issued docs is **lost** — it is **not** lost; gap is forward reporting enrichment only.

---

## 12. D-11 — Describe / Other

- Sentinel UI values `__OTP_DESCRIBE_*__` map to **`general_other` + `custom_requirement` UUIDs** (`Tier1TellOtpCard.tsx`, `intake-other-taxonomy.ts`)
- **No** magic `'OTHER'` string stored as FK id
- ONDC explicit map returns **null** for `custom_requirement`
- Tests: `intake-other-taxonomy.test.ts`

---

## 13. D-12 — Starter Templates

| Baseline (4) | Retained |
|--------------|----------|
| `tmpl-submersible-motor`, `tmpl-hvac-maintenance`, `tmpl-cnc-flanges`, `tmpl-terrace-waterproofing` | **YES** |

| Approved add (9) | `subcategoryCode` | Mode apply |
|------------------|-------------------|------------|
| `tmpl-cctv-supply` | `cctv_surveillance` | BUY → PRODUCT_MATERIAL |
| `tmpl-cctv-install` | `cctv_it_integration` | `canonicalRequirementMode: PROJECT_CONTRACT` |
| `tmpl-domestic-ro` | `domestic_ro_purifier` | BUY → PRODUCT_MATERIAL |
| `tmpl-office-furniture` | `office_furniture_workstations` | BUY → PRODUCT_MATERIAL |
| `tmpl-painting-execution` | `home_interior_exterior_painting` | PROJECT_CONTRACT |
| `tmpl-plumber-visit` | `plumber_technician` | SERVICE |
| `tmpl-pool-amc` | `swimming_pool_maintenance` | RATE_CONTRACT → AMC |
| `tmpl-gym-equipment` | `gym_fitness_equipment_supply` | BUY → PRODUCT_MATERIAL |
| `tmpl-describe-requirement` | `custom_requirement` | OTHER |

**No** new motor/electrical/waterproofing **templates** beyond baselines — **PASS**.

---

## 14. D-13 / D-14 / D-15 — ONDC Layer

| Check | Result |
|-------|--------|
| `mapExplicitSubcategoryToOndcDomain` | Allow-list small (textile → RET12, `cctv_surveillance` PRODUCT → RET14); else **null** |
| Explicit paint/gym/painting execution | **null** — no B2B10/SRV11/SRV13 (`ondc-taxonomy-boundary.test.ts`) |
| Fallback when **no** `subcategoryCode` | **`mapCategoryToOndcDomain` still emits B2B10/SRV11/SRV13** — labeled **FALLBACK HEURISTIC — NOT AN OVERRIDE** of buyer mode |
| `ONDC_DISCOVERY_DOMAIN` override | Still honored (`resolveOndcSearchDomain` L67–69) |
| Factory ONDC adapter | **`DISABLED_GATE`** (`create-otp-services.ts` L128–130) |
| Buyer intake UI shows RET codes | **NO** (`apps/web` intake grep: no `ONDC:`/`RET1`) |
| RET19 hard-coded enabled | **NO** |
| RET1B/RET1C activated | **NO** |
| `OndcSupplierProvider` passes taxonomy | `subcategoryCode` / `requirementMode` when present (`ondc-supplier-provider.ts` L65–69) |

---

## 15. D-16 — Historical Compatibility

- Stable IDs; legacy gym row retained; new codes via insert + conflict upsert
- No destructive DELETE; no requirement/PO/snapshot UPDATE statements in 00223
- **PASS**

---

## 16. Explicit Mode vs Heuristic — Cases 1–5

| Case | Scenario | Expected | Observed | Classification |
|------|----------|----------|----------|----------------|
| **1** | Buyer selects `cctv_surveillance` + `PRODUCT_MATERIAL`; RFQ title mentions “installation” | Nature/mode **not** overridden by title for ONDC | `resolveOndcSearchDomain(..., { subcategoryCode: 'cctv_surveillance', requirementMode: 'PRODUCT_MATERIAL' })` → RET14 or null per mode; **not** SRV11 from title alone | **PASS** (explicit ONDC path) |
| **2** | Buyer selects `paints_coatings` + explicit PRODUCT mode; title is paint SKU | Mode unchanged | Parser may suggest `paints_coatings`; **mode from buyer picker**, not parser title→mode | **PASS** |
| **3** | Buyer selects execution painting subcat + `PROJECT_CONTRACT` | ONDC must not fall through to SRV13/B2B10 | Explicit map → **null** for `home_interior_exterior_painting` | **PASS** |
| **4** | **No** subcategory on ONDC request; category string only | Heuristic domain | `mapCategoryToOndcDomain` still used | **FALLBACK HEURISTIC — NOT AN OVERRIDE** — **ACCEPTABLE FALLBACK** per gated SNE; **RESIDUAL DEFECT (P2)** if production enables ONDC without always passing `subcategoryCode` |
| **5** | Describe/Other + free text | No ONDC domain | `custom_requirement` → null | **PASS** |

**Parser note:** Title may **re-suggest subcategory** (e.g. domestic RO, paint SKU) via `applyTaxonomy03Disambiguation`; **`requirementMode` in parse output** comes from **subcategory default**, not title keywords (`rule-based-requirement-parser.ts` ~L307). Buyer-selected mode in UI is separate state — **not a silent nature override** once buyer confirms mode.

---

## 17. Red-Team Questions 1–15 (Post–TAXONOMY-03)

| # | Question | Answer | Label |
|---|----------|--------|-------|
| 1 | Single buyer-facing taxonomy in UI? | **Yes** — DB `requirement_*` via `fetchTaxonomy` | PASS |
| 2 | Same taxonomy for NL parser? | **Yes** — shared snapshot | PASS |
| 3 | Parallel canonical taxonomy? | **Yes** — static nodes + empty factory seed; **not** intake | PASS (debt noted D-09) |
| 4 | Buyers pick PRODUCT/SERVICE/PROJECT directly? | **No** — `RequirementMode` | PASS |
| 5 | Client-trusted `requirement_type`? | **No** — server-derived | PASS |
| 6 | Lanes distinguished in DB? | **Improved** defaults + new leaves; legacy ambiguities remain on unpicked nodes | PARTIAL |
| 7 | CCTV product vs install separated? | **DB leaves + templates**; heuristics if ONDC lacks subcategory | PARTIAL |
| 8 | Describe/Other valid UUID publish? | **Yes** after Tier1 wiring | PASS (was FAIL in TAXONOMY-01) |
| 9 | ONDC codes in buyer UI? | **No** | PASS |
| 10 | ONDC uses OTP subcategory when provided? | **Yes** — explicit allow-list path | PASS |
| 11 | All emitted ONDC codes registry-valid? | **No** on **fallback** path (B2B10/SRV11/SRV13) | PASS (known; gated off by default) |
| 12 | ONDC second under SNE? | **Yes** | PASS |
| 13 | ONDC enabled in default factory? | **No** — `DISABLED_GATE` | PASS |
| 14 | Discovery taxonomy-only (no title SQL)? | **No** — `00079` still present | FAIL → **RESIDUAL DEFECT P2** (deferred per 02A phasing) |
| 15 | Smart Merit taxonomy-driven? | **No** | PASS |

---

## 18. Changed-File Register

| File | Change | In scope? | Risk |
|------|--------|-----------|------|
| `00223_otp_taxonomy_03_buyer_taxonomy.sql` | Catalog forward migration | **YES** | Low if applied only via controlled migrate |
| Intake components + tests | Other UUID, templates, apply mapping | **YES** | Low |
| `intake-other-taxonomy.ts`, `legacy-template-mode.ts`, `ondc-taxonomy-boundary.ts` | New domain modules | **YES** | Low |
| `rule-based-requirement-parser.ts` | RO/paint disambiguation | **YES** | Low — suggest-only |
| `ondc-network-service.ts`, `ondc-supplier-provider.ts` | Explicit taxonomy context | **YES** | Low — still gated |
| `canonical-taxonomy-service.ts` | Default `[]` seed | **YES** | P2 admin/classification drift |
| `create-otp-services.ts` | Mock discovery vitest-only | **PARTIAL** | **SNE test harness** — not wallet/ONDC live |
| `canonical-taxonomy.ts` | Comment only | **YES** | None |
| `SiteHeader.tsx`, `SiteLayout.tsx` | Site chrome | **NO** | R2-31 UI noise |
| R2-31 certification MD | Doc edit | **NO** | None |
| Untracked wallet/integration golden MD trees | Evidence | **NO** | None |

**Not observed in taxonomy diff:** wallet migrations, auth, org membership, production env files, ONDC subscribe/credentials, PO/invoice/ledger logic changes.

---

## 19. Test Execution (Read-Only Rerun)

**Command:**

```text
.\node_modules\.bin\vitest.cmd run packages/domain/src/parser/otp-taxonomy-03-parser.test.ts packages/domain/src/taxonomy/intake-other-taxonomy.test.ts packages/domain/src/taxonomy/legacy-template-mode.test.ts packages/services/src/ondc/__tests__/ondc-taxonomy-03-boundary.test.ts apps/web/src/features/intake/__tests__/templates-and-examples.test.ts packages/domain/src/ondc/ondc-taxonomy-boundary.test.ts packages/services/src/services/canonical-taxonomy-service.test.ts
```

| Outcome | Detail |
|---------|--------|
| **Result** | **PASS** — 7 files, **28** tests |
| **Skip** | 0 |
| **Build** | **Not rerun** (optional; vitest covered focused scope) |
| **Cert delta** | Cert stated 24 tests; observed 28 (additional cases in boundary/service suites) |

---

## 20. Findings Register (Severity)

| Sev | ID | Title |
|-----|-----|-------|
| **P0** | — | *(none)* |
| **P1** | — | *(none)* |
| **P2** | F-01 | `painting_finishing` remains SERVICE-default; manual pick can misalign D-01 SKU lane |
| **P2** | F-02 | Gym legacy leaf lacks alias/redirect table (`D-02` minimum partial) |
| **P2** | F-03 | D-09 incomplete: admin + `ALL_CANONICAL_TAXONOMY_NODES` parallel tree; in-memory admin mutations |
| **P2** | F-04 | ONDC/heuristic fallback when `subcategoryCode` absent; SQL title discovery (`00079`) unchanged |
| **P3** | F-05 | D-10 issuance snapshot subcategory code/label not extended |
| **P3** | F-06 | TAXONOMY-03 work uncommitted at HEAD; production 00223 apply not verified |

---

## 21. Gap vs Implementation Certification

| Cert claim | Independent result |
|------------|-------------------|
| 24 vitest passed | **28 passed** (consistent pass) |
| Local migration applied | **Confirmed** read-only list |
| D-01 full | **`painting_finishing` optional gap** |
| D-02 alias | **Overstated** — no alias table |
| D-09 DB authoritative | **Partial** — factory empty OK for intake; admin/static nodes remain |
| D-10 partial | **Agree** |

---

## 22. ONDC Regression Assessment

- **No** activation: factory gate unchanged; no credentials/subscribe in taxonomy diff
- **Improvement:** explicit subcategory path prevents B2B10/SRV11/SRV13 for classified RFQs when context passed
- **Regression risk:** if adapter invoked without `subcategoryCode`, legacy heuristics unchanged — **mitigated** while `DISABLED_GATE`

---

## 23. Historical Data Assessment

- No 00223 mutation of transactional taxonomy FKs
- Legacy gym RFQs remain valid on `gym_fitness_equipment`
- Issued snapshots untouched

---

## 24. Deferred Items (As Specified)

- **D-04** water heater product leaf — not in 00223
- **D-07** HVAC product/install subcategories — not in 00223
- **D-14** RET19 external confirmation — no code assertion

---

## 25. Smart Merit / SNE / Parser (Smoke)

- **Smart Merit:** no taxonomy scoring changes observed
- **SNE:** request type extended with optional `subcategoryCode` / `requirementMode`; composite mock gating — test-only path
- **Parser:** TAXONOMY-03 disambiguation scoped; does not write DB

---

## 26. Contradictions with TAXONOMY-02A

| Topic | Contradiction? |
|-------|----------------|
| Core leaves & defaults | **No** |
| Gym alias mechanism | **Yes** — 02A minimum alias not fully built |
| Canonical single source | **Partial** — comments + empty factory, not full admin/CI sync |
| Template count | **No** — 4+9=13 |

---

## 27. Certification Independence Statement

This document **does not** adopt `OTP-TAXONOMY-03-IMPLEMENTATION-CERTIFICATION.md` as proof. Status derives from SQL, `git diff`, and test rerun above.

---

## 28. Final Status Line

**TAXONOMY-03A — CONDITIONALLY VERIFIED (core correct, P2/P3 or deferred non-taxonomy)**

---

## 29. Attestations

| Statement | Value |
|-----------|-------|
| Source code edited by auditor | **NO** (except this file) |
| Migrations applied by auditor | **NO** |
| Production modified | **NO** |
| ONDC-1 started | **NO** |
| Remediation performed | **NO** |

---

*End of OTP-TAXONOMY-03A read-only verification.*
