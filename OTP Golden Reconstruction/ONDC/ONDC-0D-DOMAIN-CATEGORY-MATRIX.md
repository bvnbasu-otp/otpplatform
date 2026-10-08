# ONDC-0D — Domain × Category × Geography Matrix

**Date:** 2026-09-29  
**Phase:** ONDC-0D (read-only)  
**DOMAIN SELECTION:** **DEFERRED** — no “best domain”; no subscribe code locked.

**Four layers (never collapsed):**

| Layer | Question | Evidence types |
|-------|----------|----------------|
| **(A)** | Domain **enabled for registration** (Pre-Prod)? | **1** |
| **(B)** | Category / vertical **present on ONDC network directory** (national)? | **1** |
| **(C)** | **Participants** registered in that category? | **1** (+ **2** if city-filtered lookup ever used) |
| **(D)** | **Actual seller / inventory** for a city or PIN? | **4** (not run) |

Status vocabulary: **CONFIRMED** / **PARTIALLY CONFIRMED** / **DOCUMENTED BUT LOCATION UNCONFIRMED** / **NETWORK PRESENT — INVENTORY UNCONFIRMED** / **NOT FOUND** / **UNKNOWN**.

---

## 1. Layer (A) — Enabled domains relevant to OTP (national)

Source: [Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing) — export 2026-09-29.

| Code | Category (sheet) | Pre-Prod (A) | Layer (B) on network | Layer (C) participants | Layer (D) pilot geo |
|------|------------------|--------------|----------------------|--------------------------|---------------------|
| `ONDC:RET10` | Grocery | **Enabled** | **CONFIRMED** (RET family on [profile](https://github.com/ONDC-Official/.github/blob/main/profile/README.md)) | **DOCUMENTED BUT LOCATION UNCONFIRMED** — [buyer/seller NP pages](https://www.ondc.org/pages/seller-network-participants.html) national | **NETWORK PRESENT — INVENTORY UNCONFIRMED** for all 5 places |
| `ONDC:RET12` | Fashion | **Enabled** | **CONFIRMED** | Same as RET10 | Same |
| `ONDC:RET14` | Electronics | **Enabled** | **CONFIRMED** | Same | Same |
| `ONDC:RET1B` | Hardware and Industrial | **Enabled** | **CONFIRMED** | Same | Same |
| `ONDC:RET1C` | Building and construction supplies | **Enabled** | **CONFIRMED** | Same | Same |
| `ONDC:RETeB2B` | eB2B (DigiDukaan) | **Enabled** | **CONFIRMED** | Same | Same |
| `ONDC:RETINVL` | Inventory Less | **Enabled** | **CONFIRMED** | Same | Same |
| B2B Retail **spec 2.0.2** (RFQ family) | Spec branch — **not a separate sheet code** | **PARTIALLY CONFIRMED** — examples use RET `context.domain` + `version: 2.0.2` | **CONFIRMED** as spec on GitHub | **UNKNOWN** subscribe string — **DEFERRED** | **NOT RUN** |
| `ONDC:SRV11` (and SRV10–12 in SRV README) | Services | **NOT FOUND** on enabled sheet | **NOT FOUND** for registry subscribe | **NOT APPLICABLE** until (A) | **NOT APPLICABLE** |
| `ONDC:B2B10` | OTP code heuristic only | **NOT FOUND** | **NOT FOUND** | **NOT FOUND** | **NOT FOUND** |

**Layer (A) summary:** Multiple Pre-Prod **COMPATIBLE** RET-family codes remain; **exactly one** subscribe domain **not selected** (per ONDC-0C gate).

---

## 2. Layer (B) — Category on directory (national, not geo-scoped)

| Category family | Official directory / spec surface | Status |
|-----------------|-----------------------------------|--------|
| Retail B2C / RET verticals | Profile § Retail + enabled sheet | **CONFIRMED** |
| Retail eB2B / INVL | Profile § eB2B and Inventory Less | **CONFIRMED** |
| B2B Retail 2.0.2 JSON flows | [RET release-2.0.2](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2) | **CONFIRMED** (spec); registry code mapping **DEFERRED** |
| Services SRV | Commented section in profile; SRV GitHub README | **PARTIALLY CONFIRMED** as spec; **NOT FOUND** on enabled sheet for subscribe |
| Logistics / FIS / TRV | Enabled sheet rows | **CONFIRMED** nationally — **out of OTP pilot domain shortlist** |

**No official ONDC page was found in this pass that lists category availability **per pilot city**.**

---

## 3. Layer (C) — Participants by category × pilot city

| Pilot place | Evidence that NPs exist nationally in RET (etc.) | Evidence that NPs serve this city/PIN |
|-------------|---------------------------------------------------|----------------------------------------|
| Bengaluru | **DOCUMENTED BUT LOCATION UNCONFIRMED** — public NP pages + enabled domains | **UNKNOWN** without signed lookup/search |
| Chennai | Same | Same |
| Coimbatore | Same | Same |
| Erode | Same | Same |
| Bhavani | Same | **UNKNOWN** + Beckn city code **NOT RESOLVED** for Bhavani label |

**Registry lookup** with city filter (`std:*`) is documented in onboarding but requires **NP credentials** → **EXTERNAL ONDC ACCESS REQUIRED**.

---

## 4. Layer (D) — Inventory matrix (domain candidate × city)

**Assumption:** Any future subscribe domain from Layer (A) shortlist; **no domain chosen**.

|  | Bengaluru | Chennai | Coimbatore | Erode | Bhavani |
|--|-----------|---------|------------|-------|---------|
| `ONDC:RET10` | **NETWORK PRESENT — INVENTORY UNCONFIRMED** | Same | Same | Same | Same (+ **city code NOT RESOLVED** for place name) |
| `ONDC:RET12` | Same | Same | Same | Same | Same |
| `ONDC:RET14` | Same | Same | Same | Same | Same |
| `ONDC:RET1B` | Same | Same | Same | Same | Same |
| `ONDC:RET1C` | Same | Same | Same | Same | Same |
| `ONDC:RETeB2B` | Same | Same | Same | Same | Same |
| B2B 2.0.2 vertical (spec) | Same | Same | Same | Same | Same |

**Evidence type 4:** **NOT RUN** — **REAL NETWORK DISCOVERY: NOT YET POSSIBLE** without whitelist, subscribe, keys, deployed `bap_uri`, and signed gateway traffic.

---

## 5. Cross-city comparison (protocol + mapping only)

| Dimension | Bengaluru | Chennai | Coimbatore | Erode | Bhavani |
|-----------|-----------|---------|------------|-------|---------|
| ONDC sheet city label | `BENGALURU URBAN` + `RURAL` | `CHENNAI` | `COIMBATORE` | `ERODE` | **None** |
| STD / Beckn planning code | `std:080` (**CONFIRMED** via ONDC examples) | `std:044` (**PARTIALLY CONFIRMED**) | `std:0422` (**PARTIALLY CONFIRMED**) | `std:0424` (**PARTIALLY CONFIRMED**) | **NOT RESOLVED** |
| PIN inventory compiled | **NOT FULLY COMPILED** (129 unique) | NOT FULLY (85) | NOT FULLY (107) | NOT FULLY (61) | NOT FULLY (7 under `ERODE` `6383xx` only) |
| Layer (D) | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED | UNCONFIRMED |

---

## 6. Smart Merit / buyer-app sorting (ONDC-1 design input only)

| Topic | Disposition |
|-------|-------------|
| OTP **Smart Merit Score** (internal 4-pillar ranking) | **Not** an ONDC network API; preserve separation from `on_search` catalog ordering |
| ONDC BAP obligation to disclose sorting parameters & minimum listing standards | Documented at [resources.ondc.org/disclosures](https://resources.ondc.org/disclosures) — **ONDC-1** must plan public disclosure + UI labeling; **no implementation in ONDC-0D** |
| Merging ONDC results with Smart Merit in buyer UI | **ONDC-1 DESIGN INPUT** — provenance + disclosure first |

---

**Repository / database / deployment changed:** **NO**
