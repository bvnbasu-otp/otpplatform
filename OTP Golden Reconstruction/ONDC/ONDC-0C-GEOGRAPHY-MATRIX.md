# ONDC-0C — Geography & Pilot Coverage Matrix

**Date:** 2026-09-29  
**Phase:** ONDC-0C (read-only; no live ONDC requests)  
**Authority for PIN / city / STD:** [City and State Codes spreadsheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing) (linked from [ONDC .github profile § City and state codes](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#city-and-state-codes))  
**Beckn city code examples:** [Onboarding vlookup `std:080`](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md); [B2B search `std:080`](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json)

**Repository / database / deployment changed:** **NO**

---

## 1. Definitions

| Term | Meaning in this document |
|------|---------------------------|
| **OTP REQUESTED PILOT COVERAGE** | Product intent: all PIN codes belonging to Bhavani, Erode, Coimbatore, Chennai (Tamil Nadu), and Bengaluru (Karnataka) |
| **ONDC VERIFIED PRE-PROD COVERAGE** | Whether live BPP catalogs respond to `search` in those locations on pre-prod — **NOT TESTED** in ONDC-0C |
| **PIN inventory** | Exhaustive list of PINs per place — **NOT COMPILED** in this pass (no pasted PIN roll) |
| **City code (Beckn)** | ONDC examples use `context.location.city.code` values such as `std:080`; format **`std:` + STD Code** from the official city sheet (see onboarding + B2B examples) |

---

## 2. Place table (OTP intent → official mapping)

Mapping uses **City** labels and **STD Code** columns from the official CSV export (2026-09-29). Beckn `std:` codes are formed as `std:` + sheet STD (zero-padded as in sheet, e.g. `080`, `044`, `0422`, `0424`).

| OTP place (intent) | State | Official sheet “City” labels used for PIN association | STD (sheet) | Beckn city code (per ONDC example pattern) | PIN inventory for OTP place |
|--------------------|-------|--------------------------------------------------------|-------------|--------------------------------------------|-----------------------------|
| **Bengaluru** | Karnataka | `BENGALURU URBAN`, `BENGALURU RURAL` | `080` | **`std:080`** (supported by [onboarding vlookup example](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md)) | **NOT COMPILED** — sheet row counts: Urban **115**, Rural **20** (duplicate PIN rows possible across labels) |
| **Chennai** | Tamil Nadu | `CHENNAI` | `044` | **`std:044`** | **NOT COMPILED** — sheet row count **85** |
| **Coimbatore** | Tamil Nadu | `COIMBATORE` | `0422` | **`std:0422`** | **NOT COMPILED** — sheet row count **107** |
| **Erode** | Tamil Nadu | `ERODE` | `0424` | **`std:0424`** | **NOT COMPILED** — sheet row count **61** |
| **Bhavani** | Tamil Nadu | **No `BHAVANI` city label** in official export | **UNRESOLVED_EXTERNAL_REQUIREMENT** | **UNRESOLVED_EXTERNAL_REQUIREMENT** — do not assume a separate std code without ONDC sheet row or written guidance | **NOT COMPILED** — operator must define PIN set (e.g. Bhavani town PINs) and map each PIN via official sheet; sample sheet rows near Bhavani geography often appear under **`ERODE`** city label (e.g. `638301`, `638311` → STD `0424`) |

### 2.1 Bhavani note (evidence-bound)

A full-text search of the official city/PIN CSV for **`BHAVANI`** as a city name returned **no matches** (2026-09-29). OTP’s geographic intent for “Bhavani” therefore requires either:

1. Operator-supplied PIN list cross-checked row-by-row against the [official sheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing), or  
2. **External confirmation** from ONDC support if Bhavani must be treated as a distinct pilot locality beyond sheet city labels.

Until then: **UNRESOLVED_EXTERNAL_REQUIREMENT** for Bhavani-specific Beckn city code; PINs that map to **`ERODE`** in the sheet use **`std:0424`** under the ONDC `std:` convention.

---

## 3. Location model summary (for pilot test planning)

| Layer | Official mechanism | Pilot use (documentation only) |
|-------|-------------------|--------------------------------|
| Country | `context.location.country.code` = `IND` | Fixed |
| City | `context.location.city.code` = `std:NNN…` or `"*"` in B2B examples | One code per search per target city cluster |
| PIN | `area_code` on fulfillment stop locations in B2B search | Match official sheet PIN for buyer delivery intent |
| GPS | `gps` on stops in B2B search example | Optional precision; **NOT TESTED** against live BPPs |

**Multi-city:** Protocol examples support changing city code and/or stops per `search` request; one subscribed BAP is not documented as single-city-only.

**Seller presence:** Network catalog density in Tamil Nadu / Karnataka clusters is **NOT TESTED / EXTERNAL** — empty `on_search` remains valid (no fake sellers).

---

## 4. Test-plan matrix (no live requests)

Planned checks for **ONDC-1+** after registry subscribe and adapter deploy. **Do not execute in ONDC-0C.**

| # | Place cluster | Beckn city code (from §2) | Sample PIN strategy | Discovery action (when authorized) | Expected evidence | ONDC-0C status |
|---|---------------|---------------------------|---------------------|--------------------------------------|-------------------|----------------|
| T1 | Bengaluru | `std:080` | Use buyer PIN from sheet (`BENGALURU URBAN` / `RURAL` row) | Signed `search` + receive `on_search` at deployed `bap_uri` | ACK + catalog or empty result; provenance label `ONDC_SELLER` only | **NOT RUN** |
| T2 | Chennai | `std:044` | PIN from `CHENNAI` row | Same | Same | **NOT RUN** |
| T3 | Coimbatore | `std:0422` | PIN from `COIMBATORE` row | Same | Same | **NOT RUN** |
| T4 | Erode | `std:0424` | PIN from `ERODE` row | Same | Same | **NOT RUN** |
| T5 | Bhavani (intent) | **UNRESOLVED** until §2.1 closed | PIN list **NOT COMPILED**; map via sheet when defined | Same | Same | **BLOCKED on geography resolution** |
| T6 | Multi-city sequence | Rotate T1–T4 codes across sequential searches | Distinct PIN per city | Same BAP subscriber | Confirms multi-city search pattern | **NOT RUN** |
| T7 | Wildcard city | `"*"` only if domain/spec allows (B2B example) | Category-driven search | `search` per [search_by_category.json](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_category.json) | ONDC validation / BPP behavior | **REQUIRES EXTERNAL CONFIRMATION** for pilot policy |
| T8 | Counterparty lookup | `std:080` etc. | vlookup / v2 lookup with chosen domain | Registry lookup API | Seller apps registered in city | **NOT RUN** |

### 4.1 Preconditions column (all tests)

| Precondition | ONDC-0C state |
|--------------|---------------|
| Product-selected **single** ONDC domain from enabled sheet | **NOT MET** — see `ONDC-0C-DOMAIN-PILOT-SCOPE.md` |
| Whitelist + subscribe on `otpplatform-theta.vercel.app` | **NOT STARTED** |
| Signed gateway `search` + HTTP `on_search` route | **NOT IMPLEMENTED** |
| Domain version (e.g. B2C 1.2.x vs B2B 2.0.2) aligned with subscribe choice | **NOT LOCKED** |

---

## 5. Coverage honesty statement

| Question | Answer |
|----------|--------|
| Does OTP intend multi-state pilot geography? | **Yes** — TN + KA places listed in §2 |
| Is every PIN in those places enumerated here? | **No — NOT COMPILED** |
| Is pre-prod seller coverage verified? | **No — NOT TESTED / EXTERNAL** |
| Is Bhavani city code officially resolved? | **No — UNRESOLVED_EXTERNAL_REQUIREMENT** |

---

## 6. ONDC-1 prerequisites (geography)

1. Close **Bhavani** PIN set and sheet mapping (or obtain ONDC guidance).  
2. Compile PIN inventories offline from the [official sheet export](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing) — **do not guess PINs**.  
3. After domain selection, align `context.domain`, spec **version**, and search intent with chosen vertical.  
4. Run test matrix §4 only with real registry credentials — never fabricate `on_search` payloads.

**Stop:** No live ONDC traffic in ONDC-0C. Repository / database / deployment unchanged.
