# ONDC-0C — Domain & Pilot Scope Gate

**Date:** 2026-09-29  
**Phase:** ONDC-0C (read-only; decision documentation only)  
**Inputs:** `ONDC-0B-LOCKED-DECISIONS.md`, other `ONDC-0*.md`, official sources cited below (verified this pass).  
**Certified code baseline (reference):** `9cb4a037418893cbaf5c90b9f108884d32a1601b`  
**Repository / database / deployment changed:** **NO**

---

## 1. Frozen constraints (not reopened)

Per `ONDC-0B-LOCKED-DECISIONS.md` and user ONDC-0C lock: Buyer App (BAP) only; **discovery only** (`search` / `on_search`); Supplier Network Engine unchanged; ONDC as external adapter; `subscriber_id` / callback host working assumption **`otpplatform-theta.vercel.app`** (not registered); provenance tiers mandatory; R2-31 and Wallet W1–W10 frozen; no implementation, keys, whitelist, or live traffic in this phase.

---

## 2. Official sources used (this pass)

| Topic | URL |
|-------|-----|
| Enabled domain codes (canonical list) | https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing (CSV export verified 2026-09-29) |
| ONDC profile (domains, reference apps, city sheet link) | https://github.com/ONDC-Official/.github/blob/main/profile/README.md |
| NP onboarding (BAP ops_no 1, lookup/vlookup city example) | https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md |
| Beckn core `search` / `on_search` | https://github.com/ONDC-Official/ONDC-Protocol-Specs/blob/master/protocol-specifications/core/v0/api/core.yaml |
| B2B Retail spec branch + search examples | https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2 |
| B2B `search` example (`domain`, location, PIN) | https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json |
| Services domain table (SRV10–12) | https://github.com/ONDC-Official/ONDC-SRV-Specifications/blob/release-services/README.md |
| City / PIN / STD mapping | https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing (CSV export verified 2026-09-29) |

Non-official blogs were not used as authority.

---

## 3. Enabled-domains sheet facts (2026-09-29 export)

The official [Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing) (linked from [.github profile § Enabled Domains](https://github.com/ONDC-Official/.github/blob/main/profile/README.md)) is the registry-oriented code list. Export contained **33 domain rows** (plus header). Relevant rows:

| Code | Category (sheet) | Pre-Prod |
|------|------------------|----------|
| `ONDC:RET10` | Grocery | Enabled |
| `ONDC:RET12` | Fashion | Enabled |
| `ONDC:RET14` | Electronics | Enabled |
| `ONDC:RET1B` | Hardware and Industrial | Enabled (Pramaan: In Progress) |
| `ONDC:RET1C` | Building and construction supplies | Enabled (Pramaan: In Progress) |
| `ONDC:RETeB2B` | eB2B (DigiDukaan) | Enabled |
| `ONDC:RETINVL` | Inventory Less | Enabled |

**Not present in the enabled-domains export:** `ONDC:B2B10`, `ONDC:SRV10`, `ONDC:SRV11`, `ONDC:SRV12`, and **no row titled “B2B Retail v2.0.2”** as a separate code.

B2B **specifications** (branch `release-2.0.2`) use Beckn `context.domain` values from the **RET** family in official JSON examples (e.g. `"domain": "ONDC:RET10"`, `"version": "2.0.2"`), not a distinct `ONDC:B2B*` registry code.

---

## 4. Discovery-only scope vs full protocol

| Check | Result |
|-------|--------|
| OTP scope | **`search` + ingest `on_search` only** — post-search Beckn actions out of scope |
| Core protocol | `search` and `on_search` are first-class BAP actions ([core.yaml](https://github.com/ONDC-Official/ONDC-Protocol-Specs/blob/master/protocol-specifications/core/v0/api/core.yaml)) |
| RET / B2B specs describe full commerce phases | **Yes** — order/fulfilment/post-order exist in spec narrative ([RET repo README](https://github.com/ONDC-Official/ONDC-RET-Specifications)) |
| **DOMAIN-SCOPE COMPATIBILITY BLOCKER** (domain requires select/init/confirm *before* discovery can be exercised) | **None identified** for evaluated RET candidates — discovery examples exist without mandating prior order flow |
| Pre-prod **reference buyer** path | B2C Retail only ([profile § Reference Applications](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#reference-applications)); profile states NPs should complete **E2E testing with reference applications** — **REQUIRES EXTERNAL CONFIRMATION** for whether OTP’s **discovery-only** BAP can obtain pre-prod clearance without full RET E2E for non-reference domains |

---

## 5. Per-candidate evaluation (§14 — no “winner” language)

Evaluation axes: (1) listed on **enabled-domains sheet** for Pre-Prod subscribe; (2) **BAP + ops_no 1** compatible; (3) **discovery-only** compatible; (4) fit to OTP multi-category intent without expanding scope.

### 5.A — “B2B Retail row” (B2B Retail v2.0.2 / RFQ family)

| Axis | Status | Evidence |
|------|--------|----------|
| Registry code | **REQUIRES EXTERNAL CONFIRMATION** | No spreadsheet row named “B2B Retail v2.0.2”; B2B is a **spec branch** ([release-2.0.2](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2)) using **RET** `context.domain` codes in examples ([search_by_category.json](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_category.json)) |
| Pre-Prod registrable | **REQUIRES EXTERNAL CONFIRMATION** | Subscribe `domain` must match enabled sheet; operator must confirm with ONDC which **single** RET code(s) register a B2B 2.0.2 buyer for OTP’s vertical mix |
| BAP discovery-only | **COMPATIBLE** (spec) | B2B search examples are standalone `action: "search"` |
| OTP product fit | **Broadest** alignment with deferred RFQ / industrial procurement intent | Spec includes RFQ flows ([release notes](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2)) |

**Summary label:** **COMPATIBLE** (protocol/spec) + **REQUIRES EXTERNAL CONFIRMATION** (exact subscribe `domain` string — not one sheet row).

### 5.B — `ONDC:SRV11` (Home Services — Infra Services)

| Axis | Status | Evidence |
|------|--------|----------|
| Official domain definition | **Yes** — [SRV README](https://github.com/ONDC-Official/ONDC-SRV-Specifications/blob/release-services/README.md) lists `ONDC:SRV11` |
| Enabled-domains sheet Pre-Prod | **INCOMPATIBLE** (for registry subscribe as of 2026-09-29 export) | **No SRV* row** in [enabled domains CSV](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing) despite Services section on profile |
| BAP discovery-only | **COMPATIBLE** (protocol pattern) | Same Beckn discovery pattern as core spec |
| OTP code default fallback | Maps many categories to SRV11 in repo heuristic — **not registry authority** | `ONDC-0B` |

**Summary label:** **INCOMPATIBLE** for subscribe until `ONDC:SRV11` appears on enabled-domains sheet (or ONDC confirms alternate registration path).

### 5.C — `ONDC:RET12` (Fashion / textiles vertical)

| Axis | Status | Evidence |
|------|--------|----------|
| Enabled-domains sheet | **COMPATIBLE** | Row 16: Pre-Prod **Enabled** |
| BAP discovery-only | **COMPATIBLE** | Retail discovery via `search` / `on_search` per core + RET family |
| OTP fit | Narrow vs full OTP taxonomy | Textiles/yarn only unless product narrows pilot |

**Summary label:** **COMPATIBLE**

### 5.D — `ONDC:RET14` (Electronics)

| Axis | Status | Evidence |
|------|--------|----------|
| Enabled-domains sheet | **COMPATIBLE** | Row 18: Pre-Prod **Enabled** |
| BAP discovery-only | **COMPATIBLE** | Same as RET12 |
| OTP fit | Narrow | CCTV/electronics slice of taxonomy |

**Summary label:** **COMPATIBLE**

### 5.E — `ONDC:RET10` (Grocery; reference / lookup exemplar)

| Axis | Status | Evidence |
|------|--------|----------|
| Enabled-domains sheet | **COMPATIBLE** | Row 14: Pre-Prod **Enabled**, Pramaan **Enabled** |
| BAP discovery-only | **COMPATIBLE** | Lookup example uses `ONDC:RET10` ([onboarding doc](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md)); B2B 2.0.2 examples also use `ONDC:RET10` with `version: "2.0.2"` |
| Pre-prod reference buyer | **Official external path** | B2C Retail reference buyer URL in [profile](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#reference-applications) |
| OTP B2B product fit | **Weak** as primary pilot category | Grocery/B2C reference path ≠ OTP multi-category B2B procurement |

**Summary label:** **COMPATIBLE** (network/registry) — **not** a product-narrowing choice for OTP B2B intent.

### 5.F — `ONDC:B2B10` (OTP code heuristic only)

| Axis | Status | Evidence |
|------|--------|----------|
| Enabled-domains sheet | **Absent** | Not in 2026-09-29 export |
| ONDC-Official RET/SRV/LOG domain tables | **Absent** | Per `ONDC-0B`; LOG uses `ONDC:LOG10`/`LOG11` for logistics |
| Registrable | **INCOMPATIBLE** | Do not use for subscribe |

**Summary label:** **INCOMPATIBLE**

### 5.G — Related enabled codes (not in §5 short list but material to “B2B Retail row”)

| Code | Sheet | Relevance to OTP |
|------|-------|------------------|
| `ONDC:RET1B` | Pre-Prod Enabled | Hardware / industrial — OTP MRO overlap |
| `ONDC:RET1C` | Pre-Prod Enabled | Building / construction supplies — OTP construction overlap |
| `ONDC:RETeB2B` | Pre-Prod Enabled | **eB2B (DigiDukaan)** — distinct from B2B Retail **2.0.2** branch |

These increase **multi-code COMPATIBLE** set if “B2B Retail row” is interpreted as vertical RET registration rather than one string.

---

## 6. Location model (official)

| Mechanism | Where defined | OTP implication |
|-----------|---------------|-----------------|
| Beckn `context.location.city.code` | B2B search examples use `std:080` or wildcard `"*"` ([search_by_fulfillment_end_loc.json](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json), [search_by_category.json](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_category.json)) | City targeting uses **`std:` + STD** style codes in examples |
| PIN (`area_code`) + GPS | B2B search `fulfillment.stops[].location` | Discovery can scope by **PIN** and **GPS** alongside city code |
| Registry vlookup `city` | `std:080` example ([onboarding doc](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md)) | Counterparty lookup can filter by city |
| Canonical PIN ↔ city ↔ STD | [City and State Codes spreadsheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing) | OTP pilot PIN intent must map through this sheet — see `ONDC-0C-GEOGRAPHY-MATRIX.md` |

**Multi-city BAP:** Onboarding and search examples show **per-request** `city` / location; nothing in cited docs requires a BAP to bind to one city forever. **Multiple pilot cities are permissible** at the protocol level by varying `context.location` (and/or stop PINs) per `search`. **Seller catalog presence** in those cities is **NOT TESTED / EXTERNAL** — network density is not guaranteed.

**Arbitrary PINs:** PINs must align with official mapping for valid `area_code`; using PINs not in the city sheet is **REQUIRES EXTERNAL CONFIRMATION** / likely invalid for validation utilities.

---

## 7. Section 15 — domain selection decision block

| Field | Value |
|-------|-------|
| **SELECTED ONDC DOMAIN** | **NOT SELECTED** |
| **Selection status** | **DOMAIN NOT YET SELECTABLE** |
| **Reason (factual)** | More than one candidate remains **COMPATIBLE** on official evidence for Pre-Prod BAP discovery: at minimum **`ONDC:RET10`**, **`ONDC:RET12`**, **`ONDC:RET14`**, and—if “B2B Retail row” means B2B 2.0.2 vertical registration—additional **RET** codes such as **`ONDC:RET1B`** / **`ONDC:RET1C`** without a single canonical subscribe string in the enabled-domains sheet. **`ONDC:SRV11`** is **INCOMPATIBLE** with the current enabled-domains export. **`ONDC:B2B10`** is **INCOMPATIBLE**. |
| **Gate rule** | Per ONDC-0C §15: do not pick a “winner” when multiple COMPATIBLE; outcome is **BLOCKED_PRODUCT_DECISION** until operator selects **one** primary subscribe domain with ONDC-confirmed code. |
| **ONDC-1 prerequisite (product)** | Operator must lock **exactly one** `domain` from enabled sheet (+ confirm B2B 2.0.2 version mapping with ONDC if choosing B2B vertical). |

---

## 8. ONDC-1 architecture prerequisites (documentation only)

| Item | ONDC-0C disposition |
|------|---------------------|
| Registry subscribe + keys | **NOT STARTED** |
| `ondc-site-verification.html` + `/on_subscribe` on `otpplatform-theta.vercel.app` | **NOT IMPLEMENTED** |
| Public signed `bap_uri` for `on_search` | **UNKNOWN path** — ONDC-1 |
| Persist `on_search` / correlation | **ONDC-1 ARCHITECTURE REQUIREMENT** — **no DB migration in ONDC-0C** |
| Adapter / gateway live traffic | **NOT IMPLEMENTED** |
| Enabled-domain confirmation for SRV | If product requires infra services, **external** sheet update or ONDC guidance required before subscribe |

---

## 9. Pilot geography pointer

OTP requested multi-place coverage (Bhavani, Erode, Coimbatore, Chennai, Bengaluru) is documented in **`ONDC-0C-GEOGRAPHY-MATRIX.md`**. PIN inventory for pilot places is **NOT COMPILED** in this pass (counts and city-code mapping only).

---

## 26. Final gate report (Section 26 template)

```
PHASE: ONDC-0C — Domain & Pilot Scope Gate (read-only)
DATE: 2026-09-29
REPOSITORY / DATABASE / DEPLOYMENT CHANGED: NO

ROLE: Buyer App (BAP); ops_no 1 per Onboarding of Participants. Seller / Gateway: NOT IN SCOPE.

SUBSCRIBER_ID (WORKING ASSUMPTION, NOT REGISTERED): otpplatform-theta.vercel.app
CALLBACK HOST (WORKING ASSUMPTION): otpplatform-theta.vercel.app (registry verification + on_subscribe); bap_uri path NOT LOCKED

SCOPE: DISCOVERY ONLY — search / on_search via adapter; select/init/confirm/payment/settlement/fulfilment/post-order OUT OF SCOPE

SELECTED ONDC DOMAIN: NOT SELECTED
DOMAIN SELECTION STATUS: DOMAIN NOT YET SELECTABLE

CANDIDATE SUMMARY:
- B2B Retail row (B2B v2.0.2 spec family): COMPATIBLE (discovery spec) + REQUIRES EXTERNAL CONFIRMATION (exact subscribe domain string; no single enabled-sheet row)
- ONDC:SRV11: INCOMPATIBLE for subscribe (not on enabled-domains export 2026-09-29) despite SRV README
- ONDC:RET12: COMPATIBLE (Pre-Prod Enabled)
- ONDC:RET14: COMPATIBLE (Pre-Prod Enabled)
- ONDC:RET10: COMPATIBLE (Pre-Prod Enabled; official lookup/reference exemplar; weak OTP B2B product narrow-fit)
- ONDC:B2B10: INCOMPATIBLE (not registrable; not on enabled sheet)

DOMAIN-SCOPE COMPATIBILITY BLOCKER: NONE for discovery-only on RET candidates
PRE-PROD E2E REFERENCE APP vs DISCOVERY-ONLY: REQUIRES EXTERNAL CONFIRMATION (profile requires E2E with reference apps; only B2C Retail reference buyer listed)

LOCATION MODEL: context.location.city.code (std:*), optional wildcard; search stops may use GPS + area_code (PIN); city/PIN authority = City and State Codes spreadsheet
MULTI-CITY BAP: PERMITTED at protocol level (per-search location); NOT TESTED on network
SELLER PRESENCE IN PILOT GEOGRAPHY: NOT TESTED / EXTERNAL

PILOT GEOGRAPHY (OTP INTENT): Bhavani, Erode, Coimbatore, Chennai (TN), Bengaluru (KA) — all PINs in those places intended; see ONDC-0C-GEOGRAPHY-MATRIX.md
PIN INVENTORY: NOT COMPILED (official row counts only)
ONDC VERIFIED PRE-PROD COVERAGE: NOT TESTED

PROVENANCE: ONDC_DISCOVERED ≠ OTP_REGISTERED ≠ GST_VERIFIED — mandatory; no auto-verify

ENGINE / FROZEN: Supplier Network Engine only; R2-31 frozen; Wallet W1–W10 frozen; Google GIS separate

REAL ONDC TRAFFIC: NOT TESTED
REGISTRATION: NOT STARTED
KEYS: NOT CREATED
ADAPTER IMPLEMENTATION: NOT IN THIS PHASE
DATABASE: UNCHANGED (callback persistence = ONDC-1 architecture requirement only)

GATE OUTCOME: ONDC-0C: BLOCKED_PRODUCT_DECISION

ONDC-1 AUTHORIZED: NO — STOP. Do not start ONDC-1 until exactly one domain code is product-selected and confirmed against enabled-domains sheet (+ ONDC if B2B 2.0.2 mapping).
```

---

**Stop statement:** Repository / database / deployment changed: **NO**. **STOP.** Do not start ONDC-1.
