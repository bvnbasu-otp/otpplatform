# ONDC-1 — RET10–RET19 Multi-Domain Pilot Readiness

**Phase:** ONDC-1 (multi-domain pilot **candidate family** — discovery only)  
**Date:** 2026-09-29  
**Role lock:** Buyer App (BAP), `ops_no: 1`  
**Architecture lock:** One Supplier Network Engine; one ONDC adapter; RET pilot domains do **not** redefine OTP taxonomy  
**Geography intent (not seller claims):** Bhavani, Erode, Coimbatore, Chennai, Bengaluru  
**Working `subscriber_id` assumption:** `otpplatform-theta.vercel.app` — **NOT registered**  
**Evidence scope:** `ONDC-0*.md`, read-only `packages/services/src/ondc/**` and discovery factory; dirty diff on RET14 wiring (not committed)  
**Repository commit / push / deploy / subscribe / live discovery:** **NO**

---

## A. MULTI-DOMAIN PILOT STATUS

**RET10–RET19 cannot be treated as confirmed enabled** in OTP or on the ONDC network for OTP today. No registry subscribe has been performed; `OndcNetworkAdapter` remains `DISABLED_GATE` in `create-otp-services.ts`; live `search` / `on_search` E2E is **not** established (`ONDC-1-RET14-READINESS.md` §A, `ONDC-0C` §8).

| Treatment | Applies to |
|-----------|------------|
| **Partially confirmed** (official enabled-domains export cited in-repo; **not** OTP-enabled) | **`ONDC:RET10`**, **`ONDC:RET12`**, **`ONDC:RET14`** — Pre-Prod **Enabled** on 2026-09-29 sheet export (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3). |
| **Documentation-only candidates** (Product Owner pilot family labels; **no** matching evidence in `ONDC-0*.md` export for these codes) | **`ONDC:RET11`**, **`ONDC:RET13`**, **`ONDC:RET15`**, **`ONDC:RET16`**, **`ONDC:RET17`**, **`ONDC:RET18`**, **`ONDC:RET19`** — zero repository citations for these strings (`grep` across workspace). |
| **Documentation-only with official code mismatch** | PO label **RET19 (Hardware / Building / Industrial)** — closest **documented** registry rows are **`ONDC:RET1B`** (Hardware and Industrial) and **`ONDC:RET1C`** (Building and construction supplies), not `ONDC:RET19` (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3, §5.G). |

The expanded RET10–RET19 list is a **pilot candidate family**, not a claim that every code is subscribable or wired in OTP. Product Owner must later **select** a subset; this report does **not** choose activation.

---

## B. DOMAIN EVIDENCE MATRIX

| Domain | Label (PO pilot family) | Evidence it exists | Evidence currently enabled/subscribable | Evidence status |
|--------|-------------------------|--------------------|----------------------------------------|-----------------|
| RET10 | Grocery | Pre-Prod **Enabled** row; lookup example `ONDC:RET10` (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3, §5.E; `ONDC-0B-LOCKED-DECISIONS.md` §2.2). | **OTP:** `ONDC_ENABLED` default off; no subscribe. **Network:** sheet Pre-Prod Enabled — **not** exercised by OTP. | **DOCUMENTED BUT ENABLEMENT NOT ESTABLISHED** |
| RET11 | Food & Beverage | **NOT ESTABLISHED BY CURRENT EVIDENCE** in `ONDC-0*.md` or ONDC code. | None in evidence. | **NOT ESTABLISHED BY CURRENT EVIDENCE** |
| RET12 | Fashion | Pre-Prod **Enabled** (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3, §5.C). OTP mapper: textiles → `ONDC:RET12` (`ONDC-0B-LOCKED-DECISIONS.md` §2.2; `ondc-network-service.ts`). | Same as RET10 — sheet only; OTP not subscribed. | **DOCUMENTED BUT ENABLEMENT NOT ESTABLISHED** |
| RET13 | Beauty & Personal Care | **NOT ESTABLISHED BY CURRENT EVIDENCE** in gathered docs. | None in evidence. | **NOT ESTABLISHED BY CURRENT EVIDENCE** |
| RET14 | Electronics | Pre-Prod **Enabled** (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3, §5.D). OTP mapper: CCTV/electronics → `ONDC:RET14` (`ONDC-0B-LOCKED-DECISIONS.md` §2.2). Dirty diff: `ONDC_DISCOVERY_DOMAIN` override + tests (`ondc-network-service.ts`, `ondc-realtime.test.ts`). | **OTP:** optional env override only; **not** registry subscribe. **ONDC-1-RET14-READINESS.md** documents pilot lock as doc phase, not live enablement. | **DOCUMENTED BUT ENABLEMENT NOT ESTABLISHED** |
| RET15 | Home & Decor | **NOT ESTABLISHED BY CURRENT EVIDENCE** in `ONDC-0*.md`. | None in evidence. | **NOT ESTABLISHED BY CURRENT EVIDENCE** |
| RET16 | Health & Wellness | **NOT ESTABLISHED BY CURRENT EVIDENCE** in `ONDC-0*.md`. | None in evidence. | **NOT ESTABLISHED BY CURRENT EVIDENCE** |
| RET17 | Automotive | **NOT ESTABLISHED BY CURRENT EVIDENCE** in `ONDC-0*.md`. | None in evidence. | **NOT ESTABLISHED BY CURRENT EVIDENCE** |
| RET18 | Books & Stationery | **NOT ESTABLISHED BY CURRENT EVIDENCE** in `ONDC-0*.md`. | None in evidence. | **NOT ESTABLISHED BY CURRENT EVIDENCE** |
| RET19 | Hardware / Building / Industrial | PO label only. Official sheet cites **`ONDC:RET1B`**, **`ONDC:RET1C`** — not `RET19` (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3, §5.G; `ONDC-0D-DOMAIN-CATEGORY-MATRIX.md` §1). | OTP heuristic uses invalid `ONDC:B2B10` for construction (`ondc-network-service.ts`) — **not** sheet-backed. | **NOT ESTABLISHED BY CURRENT EVIDENCE** (as `RET19`); related **RET1B/RET1C** are **DOCUMENTED BUT ENABLEMENT NOT ESTABLISHED** |

**Note:** Evidence status **CONFIRMED ENABLED** is **not** used for any row — OTP has not completed whitelist, subscribe, keys, or callback HTTP surfaces (`ONDC-1-RET14-READINESS.md` §C.3, §D G-01–G-06).

---

## C. OTP PROCUREMENT COVERAGE MATRIX

**OTP taxonomy source:** `requirement_categories` / `requirement_subcategories` in `supabase/migrations/00019_taxonomy_data.sql` and extensions (e.g. `00058_furniture_and_painting_taxonomy_and_suppliers.sql`, `00059_amenities_sports_pools_vehicle_repair.sql`, `00061_water_filters_and_purification_suppliers.sql`). OTP also distinguishes requirement modes: **PRODUCT**, **SERVICE**, **PROJECT** (`packages/domain/src/enums/procurement.ts` — `RequirementType`).

**Scope statement:** The RET10–RET19 pilot family does **not** cover OTP’s complete procurement universe. **Services and projects** (electrical contracting, plumbing services, borewell drilling, swimming pool AMC, gym maintenance, civil work, painting services, party/event services, installation-heavy SKUs, etc.) remain **outside** the RET retail discovery pilot unless official evidence maps them to a subscribed RET domain—and **`ONDC:SRV*`** codes are **not** on the enabled-domains export (`ONDC-0C-DOMAIN-PILOT-SCOPE.md` §3, §5.B).

### C.1 Product procurement (materials / equipment supply)

| OTP procurement category | Likely product/service nature | Candidate RET domain(s) | Evidence status | Technical issue |
|--------------------------|------------------------------|-------------------------|-----------------|-----------------|
| Electrical materials | **PRODUCT** — e.g. `electrical_items_cables`, `switchgear_panels`, `lighting_fixtures` (`00019_taxonomy_data.sql`) | **RET14** (electronics-adjacent SKUs); **RET19 / RET1B** (industrial MRO) — **hypothesis** | **DOCUMENTED BUT ENABLEMENT NOT ESTABLISHED** for any RET code in OTP | Heuristic may send `ONDC:B2B10` or `ONDC:SRV11` instead of approved RET (`ondc-network-service.ts`; `ONDC-0B` §2.2). Single `ONDC_DISCOVERY_DOMAIN` cannot safely cover multi-vertical RFQs. |
| Plumbing materials | **PRODUCT** — e.g. `plumbing_sanitary_fittings`, `pipe_supply` | **RET19 / RET1C** (building supplies) — **hypothesis** | **NOT ESTABLISHED BY CURRENT EVIDENCE** for `RET19`; **RET1C** sheet row only in `ONDC-0C` | Materials vs **plumbing_service** (SERVICE) conflated if category string ambiguous. |
| CCTV equipment | **PRODUCT** — `cctv_surveillance` (`PRODUCT_MATERIAL`, `00019_taxonomy_data.sql`) | **RET14** | Mapper → `ONDC:RET14` (`ondc-network-service.ts`); subscribe **not** done | Installation bundled in `cctv_installation` (PROJECT) — RET14 does not imply install service (`ONDC-0E` §3.3). |
| Borewell | **SERVICE/PROJECT** — `borewell_drilling` (`SERVICE`, `00019`) | **NOT COVERED BY CURRENT RET PILOT SCOPE** | **NOT ESTABLISHED BY CURRENT EVIDENCE** on RET family | Default mapper → `ONDC:SRV11` (not on enabled sheet). |
| Swimming pool | **SERVICE** — `swimming_pool_maintenance` (`00059_amenities_sports_pools_vehicle_repair.sql`) | **NOT COVERED BY CURRENT RET PILOT SCOPE** | SRV / facility services not on enabled sheet | — |
| Gym equipment | **PRODUCT/SERVICE** — `gym_fitness_equipment` (`00059`) | **NOT COVERED BY CURRENT RET PILOT SCOPE** (equipment supply might hypothetically map to a RET vertical; **no evidence** for RET11–RET19) | **NOT ESTABLISHED BY CURRENT EVIDENCE** | Mapper sends gym/AMC strings → `ONDC:SRV13` (invalid code per `ONDC-0B` §2.2). |
| Gym maintenance | **SERVICE** — AMC / maintenance | **NOT COVERED BY CURRENT RET PILOT SCOPE** | SRV not on sheet | Same heuristic defect. |
| Civil work | **PROJECT** — `civil_work` (`PROJECT_CONTRACT`, `00019`) | **NOT COVERED BY CURRENT RET PILOT SCOPE** (materials may relate to **RET1C**) | Construction heuristic → `ONDC:B2B10` (**invalid**) | Civil **services** ≠ building **materials** RET vertical. |
| Painting | **PRODUCT/SERVICE** — `painting_finishing` vs `painting_service` | **NOT COVERED BY CURRENT RET PILOT SCOPE** for services; materials **hypothesis RET15** if ever on sheet — **no evidence** | **NOT ESTABLISHED BY CURRENT EVIDENCE** | `paint` substring → `ONDC:SRV13` in mapper. |
| Water heater | **PRODUCT** — solar/water heat in supplier seeds (`00078`) not a dedicated subcategory code in excerpt | **RET14** or **RET16** — **hypothesis only** | **NOT ESTABLISHED BY CURRENT EVIDENCE** | No OTP→RET mapping in code. |
| Water filter | **PRODUCT** — water treatment / RO (`water_environmental`, `00019`, `00061`) | **RET10** grocery-adjacent vs **RET16** — **hypothesis only** | **NOT ESTABLISHED BY CURRENT EVIDENCE** | Test string maps to `ONDC:SRV11` (`ondc-realtime.test.ts`). |
| Furniture | **PRODUCT** — `furniture_fixtures` (`00058_furniture_and_painting_taxonomy_and_suppliers.sql`) | **RET15** Home & Decor — **PO label only** | **NOT ESTABLISHED BY CURRENT EVIDENCE** | No mapper entry; not on cited enabled-sheet excerpt. |
| Home appliances | **PRODUCT** — not isolated as category in cited taxonomy migrations | **RET14** / **RET15** — **hypothesis** | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| Party/event | **SERVICE** — event security keywords in `00019_taxonomy_data.sql` | **NOT COVERED BY CURRENT RET PILOT SCOPE** | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |

### C.2 Service / project procurement (explicitly outside RET pilot unless evidence says otherwise)

| OTP procurement category | Nature | RET10–RET19 coverage | Evidence status | Technical issue |
|--------------------------|--------|----------------------|-----------------|-----------------|
| Electrical services | **SERVICE/PROJECT** — `electrical_contracting`, `electrician_service` | **NOT COVERED BY CURRENT RET PILOT SCOPE** | `ONDC-0B` §2.4 multi-category services | Heuristic defaults non-matched categories to **SRV11** (not subscribable). |
| Plumbing services | **SERVICE** — `plumbing_services`, `plumber_service` | **NOT COVERED** | Same | — |
| CCTV as install/project | **PROJECT** — `cctv_installation`, `cctv_it_integration` | **NOT COVERED** (equipment vs install) | `ONDC-0E` §3.3 | RET14 product discovery ≠ install contract. |
| Borewell drilling | **SERVICE** | **NOT COVERED** | `00019` | — |
| Swimming pool AMC | **SERVICE** | **NOT COVERED** | `00059` | — |
| Gym maintenance | **SERVICE** | **NOT COVERED** | `00059` | — |
| Civil work | **PROJECT** | **NOT COVERED** | `00019` | — |
| Painting services | **SERVICE** | **NOT COVERED** | `00019` | — |
| Water heater install | **PROJECT/SERVICE** (when install-led) | **NOT COVERED** | **NOT ESTABLISHED** | — |
| Party/event services | **SERVICE** | **NOT COVERED** | `00019` | — |

### C.3 RET19 (materials-oriented note)

PO **RET19** aligns **conceptually** with OTP **materials** lanes (electrical SKUs, plumbing fittings, hardware, building supplies) per taxonomy (`electrical_power`, `construction_infrastructure`, `00019_taxonomy_data.sql`). **Official registry evidence in-repo uses `ONDC:RET1B` and `ONDC:RET1C`, not `ONDC:RET19`.** There is **no** evidence that RET19 (or RET1B/RET1C) covers **electrical/plumbing/civil/borewell/painting services**—only that industrial/building **supply** verticals exist on the enabled sheet (`ONDC-0C` §5.G). Services remain **NOT COVERED BY CURRENT RET PILOT SCOPE** unless ONDC confirms otherwise.

**Geography:** Domain enabled ≠ participant in city ≠ inventory at PIN ≠ OTP can discover (`ONDC-0D-DOMAIN-CATEGORY-MATRIX.md` four layers). Bhavani Beckn city code **not resolved** (`ONDC-0D` §5).

---

## D. MULTI-DOMAIN ARCHITECTURE ASSESSMENT

**Verdict:** **One** `OndcNetworkAdapter` + **one** SNE can support a **selected set** of RET domains **without** duplicating engines or callback systems, **if** product and implementation replace single-value override + silent heuristics with an explicit allow-list and per-search domain resolution (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY.md` §1–2). **Not implemented today.**

| Concern | Assessment | Evidence |
|---------|------------|----------|
| **Configuration** | **Single-value** `ONDC_DISCOVERY_DOMAIN` env + `discoveryDomain?: string` on `OndcServiceOptions` — applies one Beckn `context.domain` to **all** searches when set (`ondc-network-service.ts` `mergeOndcServiceOptionsFromEnv`, `resolveOndcSearchDomain`). **Not** a multi-domain allow-list. `mapCategoryToOndcDomain` emits **`ONDC:B2B10`**, **`ONDC:SRV11`**, **`ONDC:SRV13`** — absent from enabled sheet (`ONDC-0C` §3; `ONDC-0B` §2.2). **Required future model (do not implement here):** OTP category → internal mapping table → **approved allow-list** → adapter domain string. | `ondc-network-service.ts`; `ONDC-1-RET14-READINESS.md` §C.4, G-09 |
| **Request builder reuse** | **Yes** — one `OndcGatewayClient.search` + `createContext({ domain, action: 'search', ... })` (`ondc-network-service.ts` `broadcastRfqToOndc`). Domain is a parameter; no per-RET client classes. | Code |
| **Parser / normalizer** | **Shared** — `OndcBapReceiver` normalizes catalog/providers; no RET-specific parser modules (`ondc-bap-receiver.ts`). Domain-specific catalog shape differences among RET10–RET19 **NOT ESTABLISHED BY CURRENT EVIDENCE** in repo. | Code + §E |
| **Callback receiver** | **One** in-memory `searchResultsByTransaction` map keyed by `transaction_id` (`ondc-bap-receiver.ts`). Can ingest callbacks for multiple domains **if** HTTP route exists and `transaction_id` correlates; **no** `domain` field stored on normalized candidates today. | Code |
| **Persistence** | **In-memory only**; no migration (`ONDC-1-RET14-READINESS.md` G-11; `ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY.md` §4). Design must distinguish **domain**, **transaction**, **callback**, **source=ONDC**, **idempotency**, **lifecycle** before any DB work — **STOP before migration**. | Code + ONDC-0 docs |
| **Provenance** | Provider sets `lifecycleTier: 'ONDC_DISCOVERED'`, `provenanceLabel` (`ondc-supplier-provider.ts`). **`OndcNetworkAdapter.discover` drops `lifecycleTier` / `provenanceLabel`** when mapping to SNE (`ondc-network-adapter.ts` lines 45–55; G-12). ONDC discovery **≠** `OTP_REGISTERED` / GST verified (`ONDC-0B` §1; `ONDC-1-RET14-READINESS.md` §F). | Code |
| **Smart Merit** | Independent of ONDC domain — internal ranking; ONDC catalog order must not imply OTP merit (`ONDC-0D-DOMAIN-CATEGORY-MATRIX.md` §6). | Docs |
| **OTP taxonomy** | Remains multi-category in DB seeds and RFQ intake; **must stay independent** of Beckn `context.domain` (`ONDC-0B` §2.4; `ONDC-1-RET14-READINESS.md` §C.4). | Docs + `00019_taxonomy_data.sql` |

---

## E. DOMAIN-SPECIFIC TECHNICAL DIFFERENCES

For **Buyer App discovery** (`/search`, `/on_search`, auth, signing, encryption, callback, correlation) **among RET10–RET19**:

**NOT ESTABLISHED BY CURRENT EVIDENCE**

Gathered `ONDC-0*.md` treat RET family candidates as sharing Beckn core `search` / `on_search` (`ONDC-0C` §4) without per-code differential tables for RET11–RET19. B2B spec **version** `2.0.2` vs B2C reference path is a **cross-cutting** uncertainty, not a per-RET10–19 matrix (`ONDC-0C` §4–5; `ONDC-0E` §2).

---

## F. ONDC ONBOARDING IMPLICATIONS

From in-repo official-requirements excerpts only:

| Mechanism | Evidence | Implication for RET10–RET19 family |
|-----------|----------|-----------------------------------|
| **Participant-wide** | NP registration, FQDN `subscriber_id`, keys, whitelist, site verification, `/on_subscribe` (`ONDC-0-OFFICIAL-REQUIREMENTS-MATRIX.md` §A; `ONDC-0B` §2.1–2.3) | One **subscriber_id** (e.g. working assumption `otpplatform-theta.vercel.app`) — **not registered**; applies across domains. |
| **Domain-specific subscribe** | Subscribe payload includes **`domain`** field; lookup example uses `ONDC:RET10` (`ONDC-0B` §2.2; onboarding cited in `ONDC-0-OFFICIAL-REQUIREMENTS-MATRIX.md`) | **Each** Beckn retail vertical typically requires **matching** subscribe `domain` and `context.domain` on search. **Do not assume** one subscribe covers all ten PO RET codes without ONDC confirmation (`ONDC-0E` §3.4 multi-RET note). |
| **Subscription / ops_no** | BAP `ops_no: 1` (`ONDC-0B` §1) | Role is participant-level; not per RET domain. |
| **Certification / reference E2E** | Profile expects E2E with reference apps; pre-prod reference buyer is **B2C Retail** (`ONDC-0C` §4; G-15) | **REQUIRES ONDC CONFIRMATION** for discovery-only sign-off on non-RET10 domains. |

**Do not subscribe** with working `subscriber_id` until product selects domain(s) and external gates complete (`ONDC-1-RET14-READINESS.md` §G).

---

## G. RET14 WORK ALREADY DONE

Inspection: dirty diff vs `9cb4a037418893cbaf5c90b9f108884d32a1601b` (`ONDC-1-RET14-READINESS.md` §B).

| Change | Classification | Rationale |
|--------|----------------|-----------|
| `mergeOndcServiceOptionsFromEnv` + `ONDC_*` env merge | **RETAIN** → **GENERALIZE** | Needed for any RET pilot, not RET14-only (`ondc-network-service.ts`). |
| `parseOndcEnvironment` (`PREPROD` → `PRE_PRODUCTION`) | **RETAIN** | Cross-domain env normalization (`ondc-network-service.ts`; G-08). |
| `discoveryDomain` + `ONDC_DISCOVERY_DOMAIN` single override | **GENERALIZE** (keep mechanism) / **DEFER** multi-domain | Valid for **one** active subscribe domain at a time; **not** an allow-list (`ONDC-1-RET14-READINESS.md` §C.2). |
| `resolveOndcSearchDomain` | **RETAIN** | Correct pattern: override then fallback — fallback to heuristic should be **removed/disabled** when allow-list exists (G-09). |
| Comments/examples naming RET14 | **GENERALIZE** | Reword to “pilot domain” when implementing allow-list; example in `.env.production.example` is illustrative only. |
| Tests: RET14 override + env merge | **RETAIN** | Extend later per selected domains; do not duplicate test files per RET. |
| `broadcastRfqToOndc` uses `resolveOndcSearchDomain` | **RETAIN** | Core multi-domain hook point (parameterize domain per request). |
| Pre-existing `create-otp-services.ts` `MockNetworkDiscoveryService` gated on `VITEST=true` | **RETAIN** (separate) | Not ONDC-labelled; not part of RET14 diff (`ONDC-1-RET14-READINESS.md` §B). |
| RET14-only product lock in `ONDC-1-RET14-READINESS.md` | **DEFER** to PO | Superseded by multi-domain **candidate family**; doc remains historical evidence. |

**REMOVE (future implementation, not in this pass):** reliance on `mapCategoryToOndcDomain` silent paths to `ONDC:B2B10` / `ONDC:SRV11` / `ONDC:SRV13` for production discovery (G-09).

---

## H. G-ISSUE RECLASSIFICATION

| ID | Summary | Reclassification |
|----|---------|------------------|
| G-01 | NP whitelist for `otpplatform-theta.vercel.app` | **RET10–19 COMMON** |
| G-02 | Ed25519 keys + `unique_key_id` | **RET10–19 COMMON** |
| G-03 | Registry subscribe with `domain` | **RET10–19 COMMON** — was RET14-specific in ONDC-1 doc; multi-domain implies **one or more** subscribe actions per **confirmed** sheet code, not assumed single RET14 |
| G-04 | `ondc-site-verification.html` | **RET10–19 COMMON** |
| G-05 | `/on_subscribe` route | **RET10–19 COMMON** |
| G-06 | Public `bap_uri` + `on_search` HTTP | **RET10–19 COMMON** |
| G-07 | `ONDC_*` env not read (mitigated) | **RET10–19 COMMON** |
| G-08 | `PREPROD` vs `PRE_PRODUCTION` (mitigated) | **RET10–19 COMMON** |
| G-09 | Heuristic `B2B10` / `SRV11` / `SRV13` | **RET10–19 COMMON** — **required design correction** (allow-list); still **not implemented** |
| G-10 | City name vs `std:` codes | **RET10–19 COMMON** |
| G-11 | In-memory `on_search` only | **RET10–19 COMMON** |
| G-12 | Adapter drops `lifecycleTier` | **RET10–19 COMMON** |
| G-13 | `validate-prod-env.ts` omits ONDC vars | **RET10–19 COMMON** |
| G-14 | Live inventory in pilot PINs | **REQUIRES ONDC CONFIRMATION** |
| G-15 | RET14 discovery-only vs RET10 reference E2E | **REQUIRES ONDC CONFIRMATION** — applies to **any** non-reference RET domain in a multi-domain pilot |
| G-16 | `ONDC_REGISTRY_URL` without registry client | **RET10–19 COMMON** |

**NO LONGER RELEVANT:** none — all gaps remain material for any RET pilot.

---

## I. MINIMUM IMPLEMENTATION DELTA

(Product Owner selects pilot subset later; **do not implement** in this phase.)

1. **Approved domain allow-list** — config or DB table of sheet-confirmed codes (e.g. RET10, RET12, RET14, RET1B, RET1C from evidence); reject unknown codes at search build time.
2. **OTP category → mapping → allow-list → `context.domain`** — replace silent `mapCategoryToOndcDomain` production use; **no** default to `ONDC:SRV11` / `ONDC:B2B10`.
3. **One adapter** — keep `OndcNetworkAdapter` / `OndcSupplierProvider` / `OndcNetworkService`; pass **per-request** domain from mapping when multiple subscriptions exist.
4. **Provenance** — persist and surface `source=ONDC`, `domain=RETxx`, `lifecycle=ONDC_DISCOVERED`; fix G-12 adapter pass-through.
5. **City `std:` codes** — map pilot places via official city sheet (`ONDC-0C` §6; G-10); fix `std:${city}` conflation in `ondc-supplier-provider.ts`.
6. **Callback correlation** — HTTP `on_search` → `OndcBapReceiver`; key by `transaction_id`; store **domain** from Beckn `context` on pending results.
7. **Persistence design** — document schema for transactions/callbacks/idempotency; **STOP before migration** (`ONDC-1-RET14-READINESS.md` H-5).

**Explicitly out:** wallet W1–W10, R2-31, Beckn order flow, production deploy, ten engines, live network discovery in this phase, choosing which RET domain is activated.

---

## J. BLOCKERS / EXTERNAL ACTIONS

| Blocker | Owner |
|---------|--------|
| ONDC portal whitelist for `otpplatform-theta.vercel.app` (G-01) | ONDC / operator |
| Ed25519 + X25519 keys registered (G-02) | Operator |
| Subscribe payload(s) with **confirmed** `domain` code(s) per product selection (G-03) | ONDC / operator |
| Deploy `ondc-site-verification.html`, `/on_subscribe`, signed `bap_uri`, `on_search` route (G-04–G-06) | OTP deploy |
| ONDC confirmation: multi-domain subscribe policy, B2B 2.0.2 version pairing, discovery-only vs reference E2E (G-15) | ONDC |
| Evidence for PO codes **RET11–RET13, RET15–RET18, RET19** on enabled-domains sheet | ONDC / refresh export |
| Pilot geography: Bhavani STD resolution; inventory unproven (G-14) | ONDC / operator |

No fake connectivity, keys, or subscribe in this phase.

---

## K. FINAL GATE

**CONDITIONALLY READY — EXTERNAL ONDC ACTION REQUIRED**

- **Architecture:** one SNE + one adapter can support a **selected** RET subset after allow-list and callback/persistence design (§D, §I).
- **Runtime:** **not** ready — registration, HTTP compliance, domain product lock, and invalid heuristic domains block live discovery (`ONDC-1-RET14-READINESS.md` §A, §K).

---

**Stop statement:** Production changed: **NO**. Code modified (this pass): **NO** (report only). **STOP.** Do not deploy. Do not subscribe.
