# ONDC-0D — Evidence Register

**Date verified:** 2026-09-29  
**Phase:** ONDC-0D (read-only; no live ONDC traffic)  
**Rule:** Network-layer claims cite **official ONDC** sources only. Postal PIN facts cite **POSTAL PIN COVERAGE** sources separately and are **not** ONDC seller coverage.

---

## Evidence type legend

| Type | Meaning | Used in ONDC-0D for |
|------|---------|----------------------|
| **1 — National** | India-wide registry / domain / protocol facts | Layer (A), national Layer (B) |
| **2 — City** | Beckn `std:*` city codes tied to official ONDC examples + city sheet | Pilot city code mapping |
| **3 — PIN** | PIN ↔ city ↔ STD from official ONDC city sheet; postal facts labeled separately | PIN intent, search `area_code` planning |
| **4 — Actual search** | Signed gateway `search` + live `on_search` | Layer (D) — **not executed** |

---

## Register

| ID | Type | Claim supported | Source | Method | ONDC-0D disposition |
|----|------|-----------------|--------|--------|---------------------|
| E-01 | 1 | Canonical **enabled domain codes** (Staging / Pre-Prod / Production columns) | [ONDC Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing) — linked from [ONDC-Official/.github profile § Enabled Domains](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#enabled-domains) | CSV export 2026-09-29 (`33` data rows + header) | **CONFIRMED** for Layer (A) at national level |
| E-02 | 1 | Pre-Prod gateway / registry base URLs | [ONDC-Official/.github profile § Gateway and Registry Endpoints](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#gateway-and-registry-endpoints) | Raw README fetch 2026-09-29 | **CONFIRMED** |
| E-03 | 1 | BAP onboarding role (`ops_no: 1`), registry subscribe / lookup patterns | [Onboarding of Participants](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) | Document review (prior pass + spot-check) | **CONFIRMED** |
| E-04 | 1 | Beckn discovery actions `search` / `on_search` for BAP | [ONDC-Protocol-Specs core.yaml](https://github.com/ONDC-Official/ONDC-Protocol-Specs/blob/master/protocol-specifications/core/v0/api/core.yaml) | Prior ONDC-0 matrices | **CONFIRMED** (protocol); Layer (D) still requires live network |
| E-05 | 1 | B2B Retail **2.0.2** search examples (`domain`, `version`, location, PIN stops) | [ONDC-RET-Specifications release-2.0.2 B2B search examples](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2/api/components/Examples/B2B_json/search) | Prior pass; examples use RET `context.domain` (e.g. fulfillment + category searches) | **CONFIRMED** (spec/examples); subscribe code still product-deferred |
| E-06 | 2 | Example Beckn city code **`std:080`** in registry vlookup | [Onboarding of Participants — lookup example](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) | Text search in onboarding doc | **CONFIRMED** for **`std:080` only** (cited example) |
| E-07 | 2 | Example Beckn city code **`std:080`** in B2B search JSON | [search_by_fulfillment_end_loc.json](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json) | Example file reference | **CONFIRMED** for **`std:080` only** |
| E-08 | 2–3 | Official **PIN ↔ City ↔ STD** mapping sheet (OTP must not invent PINs) | [City and State Codes spreadsheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing) — [profile § City and state codes](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#city-and-state-codes) | CSV export 2026-09-29 (`20,686` data rows); PowerShell aggregation | **CONFIRMED** for sheet-backed rows; **inventory NOT FULLY COMPILED** into repo artifacts |
| E-09 | 2 | **`std:044`**, **`std:0422`**, **`std:0424`** formed as `std:` + sheet **STD Code** column for CHENNAI / COIMBATORE / ERODE | E-08 export | Unique STD per city label in sheet | **PARTIALLY CONFIRMED** — mapping follows ONDC sheet + `std:` convention used in E-06/E-07; **no separate ONDC markdown example located for each code in this pass** |
| E-10 | 2 | **No `BHAVANI` city label** in ONDC city sheet | E-08 export | Case-sensitive filter `City -eq BHAVANI*` → `0` rows | **CONFIRMED** (absence on official sheet) |
| E-11 | 3 | Bhavani-intent PINs appear under **`ERODE`** city label with STD **`0424`** (e.g. `638301`) | E-08 export | Filter `City=ERODE` and PIN `6383*` → **7** unique PINs | **CONFIRMED** on ONDC sheet only; **does not prove** complete postal extent of place name “Bhavani” |
| E-12 | 3 | **POSTAL PIN COVERAGE** — Bhavani Head Post Office **`638301`** | [Erode District — Postal (Govt. of India NIC)](https://erode.nic.in/public-utility-category/postal/) | Page lists “Bhavani Head Post Office — Pincode : 638301” | **CONFIRMED** (postal utility listing); **not** ONDC inventory |
| E-13 | 1 | Public **network participant** marketing / directory pages (national; not geo-filtered API) | [Seller Network Participants](https://www.ondc.org/pages/seller-network-participants.html), [Buyer Network Participants](https://www.ondc.org/pages/buyer-network-participants.html) | Web fetch 2026-09-29 — registry counts shown as dynamic “Loading registry” | **DOCUMENTED BUT LOCATION UNCONFIRMED** for Layer (C) per pilot city |
| E-14 | 1 | BAP **sorting / minimum listing disclosure** obligation (network policy) | [ONDC Resources — Disclosures](https://resources.ondc.org/disclosures) (Buyer Apps sorting parameters & minimum standards) | Fetch attempted 2026-09-29 (**HTTP 500**); obligation also referenced in ONDC participant handbook citing Business Rules Ch.2 | **DOCUMENTED** — OTP must publish disclosures when live BAP; **not implemented** (ONDC-1 design input only) |
| E-15 | 4 | Live catalog / seller density for pilot PINs or cities | Pre-Prod gateway `search` + `on_search` with subscribed BAP credentials | **Not executed** (frozen) | **NOT RUN** — Layer (D) **EXTERNAL ONDC ACCESS REQUIRED** |
| E-16 | 4 | Registry **v2.0/lookup** filtered by city/domain without NP signing keys | [Onboarding lookup](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) | Requires `Authorization` signature on lookup | **NOT RUN** — treated as **EXTERNAL ONDC ACCESS REQUIRED** in this phase |
| E-17 | 1 | **Services (SRV)** domain table in GitHub vs enabled sheet gap | [ONDC-SRV-Specifications README](https://github.com/ONDC-Official/ONDC-SRV-Specifications/blob/release-services/README.md) vs E-01 export | E-01: **no `ONDC:SRV*` rows** | **CONFIRMED** — SRV codes **not** Layer (A) Pre-Prod registrable per sheet |
| E-18 | 1 | OTP repo **Smart Merit** composite (internal ranking pillar) | OTP Golden Reconstruction R2 review docs (e.g. four-pillar comparison) | Read-only cross-reference | **OTP product** — record only under **ONDC-1 DESIGN INPUT**; not an ONDC network claim |

---

## Re-verification notes (vs ONDC-0C)

| ONDC-0C claim | ONDC-0D re-check |
|---------------|------------------|
| Enabled sheet row set | **Unchanged** on 2026-09-29 export (33 domains) |
| City row counts (115/20/85/107/61) | **Recomputed** — Bengaluru **129** unique PINs across Urban+Rural (115+20 rows, 6 PINs shared across labels) |
| Bhavani unresolved | **Still unresolved** on ONDC sheet (E-10); postal HO **638301** (E-12) does not close full PIN inventory for place “Bhavani” |

---

**Repository / database / deployment changed:** **NO**
