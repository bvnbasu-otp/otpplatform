# ONDC-0D — Geographic Network Availability Discovery

**Date:** 2026-09-29  
**Phase:** ONDC-0D (read-only; no implementation, keys, registry, or live gateway traffic)  
**Workspace baseline:** OTP Supplier Network Engine + ONDC adapter (discovery-only scope per ONDC-0B)  
**Prior notes (re-verified, not authoritative alone):** `ONDC-0B-LOCKED-DECISIONS.md`, `ONDC-0C-*.md`  
**Repository / database / deployment changed:** **NO**

---

## 1. Purpose

Document **geographic network availability** for the OTP pilot places **without** simulating `search`, fabricating sellers, or selecting a subscribe domain unless evidence left exactly one option (**it did not** → **DOMAIN SELECTION: DEFERRED**).

Separate four layers at all times:

- **(A)** Domain enabled for registration  
- **(B)** Category on ONDC network directory (national)  
- **(C)** Participants in that category  
- **(D)** Actual seller / inventory for a city or PIN  

**Actual discovery without credentials:** **EXTERNAL ONDC ACCESS REQUIRED**. **REAL NETWORK DISCOVERY: NOT YET POSSIBLE.**

---

## 2. Frozen scope (not reopened)

| Item | Lock |
|------|------|
| Role | Buyer App (BAP), discovery only |
| Engine | Existing Supplier Network Engine |
| Host assumption | `otpplatform-theta.vercel.app` (**not registered**) |
| R2-31 / Wallet | **FROZEN** |
| Google GIS | **Not** evidence of ONDC sellers |
| Pilot places (do not shrink) | Bhavani, Erode, Coimbatore, Chennai (TN), Bengaluru (KA) — intent = **all PINs** in those places |

---

## 3. Executive table — five pilot locations

| OTP place | State | Layer (A) domain subscribe | Layer (B) category on network | Layer (C) participants in pilot geo | Layer (D) seller/inventory in geo | Overall geo status |
|-----------|-------|------------------------------|--------------------------------|--------------------------------------|-----------------------------------|--------------------|
| **Bengaluru** | Karnataka | **PARTIALLY CONFIRMED** — multiple Pre-Prod RET codes enabled; **one** not chosen | **CONFIRMED** (RET verticals nationally) | **DOCUMENTED BUT LOCATION UNCONFIRMED** | **NETWORK PRESENT — INVENTORY UNCONFIRMED** | **PARTIALLY CONFIRMED** (mapping); inventory **UNKNOWN** |
| **Chennai** | Tamil Nadu | Same | Same | Same | Same | Same |
| **Coimbatore** | Tamil Nadu | Same | Same | Same | Same | Same |
| **Erode** | Tamil Nadu | Same | Same | Same | Same | Same |
| **Bhavani** | Tamil Nadu | Same | Same | Same + **Beckn city code NOT RESOLVED** on ONDC sheet | Same + PIN place boundary **NOT FULLY COMPILED** | **DOCUMENTED BUT LOCATION UNCONFIRMED** |

**Evidence types used in this table:** **1** (national), **2** (city/`std:`), **3** (PIN sheet counts) — **not 4**.

---

## 4. Cross-city matrix (summary)

See **`ONDC-0D-DOMAIN-CATEGORY-MATRIX.md`** (domain × city Layer D) and **`ONDC-0D-PIN-COVERAGE-MATRIX.md`** (PIN counts and Bhavani boundary).

|  | Beckn city code (planning) | Unique PINs (ONDC sheet) | Type-2 evidence | Type-4 search |
|--|----------------------------|--------------------------|-----------------|---------------|
| Bengaluru | `std:080` — **CONFIRMED** in [onboarding lookup](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) & [B2B search example](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json) | 129 | **CONFIRMED** | **NOT RUN** |
| Chennai | `std:044` — sheet STD + `std:` convention | 85 | **PARTIALLY CONFIRMED** | **NOT RUN** |
| Coimbatore | `std:0422` — sheet STD + convention | 107 | **PARTIALLY CONFIRMED** | **NOT RUN** |
| Erode | `std:0424` — sheet STD + convention | 61 | **PARTIALLY CONFIRMED** | **NOT RUN** |
| Bhavani | **NOT RESOLVED** (no sheet city row) | 7× `6383xx` under **`ERODE`** label only | **NOT FOUND** on sheet for place name | **NOT RUN** |

---

## 5. Layer findings (detailed)

### 5.A — Domain enabled for registration

- **Source:** [Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing) (2026-09-29 export: 33 codes).  
- **CONFIRMED:** Pre-Prod **Enabled** for OTP-relevant RET codes (`RET10`, `RET12`, `RET14`, `RET1B`, `RET1C`, `RETeB2B`, `RETINVL`, …).  
- **NOT FOUND:** `ONDC:B2B10`, **`ONDC:SRV*`** on sheet (SRV still described in GitHub SRV README — subscribe path **INCOMPATIBLE** with sheet).  
- **Product:** **DOMAIN SELECTION: DEFERRED** — multiple registrable codes; B2B 2.0.2 is a **spec family**, not one sheet row.

### 5.B — Category on network directory

- **CONFIRMED** at **India national** level via enabled sheet + [ONDC profile](https://github.com/ONDC-Official/.github/blob/main/profile/README.md).  
- **NOT FOUND:** Official per-city category availability pages for the five pilot places.

### 5.C — Participants in category

- Public pages: [Seller NPs](https://www.ondc.org/pages/seller-network-participants.html), [Buyer NPs](https://www.ondc.org/pages/buyer-network-participants.html) — **national**, dynamic registry embed.  
- **DOCUMENTED BUT LOCATION UNCONFIRMED** for Tamil Nadu / Karnataka clusters.  
- Signed [registry lookup](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) — **not executed** (no NP credentials).

### 5.D — Actual seller / inventory

- Requires subscribed BAP, gateway `search`, and `on_search` at deployed callback — **NOT RUN**.  
- Empty catalogs remain valid; **no simulated responses**.  
- Status for all pilot PINs/cities: **NETWORK PRESENT — INVENTORY UNCONFIRMED** (optimistic network existence from national ONDC operation) or **UNKNOWN** where mapping incomplete (**Bhavani**).

---

## 6. PIN coverage pointer

Full matrix: **`ONDC-0D-PIN-COVERAGE-MATRIX.md`**.

- ONDC authoritative mapping: [City and State Codes](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing).  
- **POSTAL PIN COVERAGE** (example): Bhavani H.O **638301** on [Erode District — Postal](https://erode.nic.in/public-utility-category/postal/) — **not** ONDC inventory.  
- **Inventory NOT FULLY COMPILED** for exhaustive per-place PIN lists in this phase.

---

## 7. Domain × category pointer

**`ONDC-0D-DOMAIN-CATEGORY-MATRIX.md`** — no domain ranking; **DEFERRED** selection.

---

## 8. Evidence register

**`ONDC-0D-EVIDENCE-REGISTER.md`** — IDs E-01 … E-18.

---

## 9. Smart Merit & sorting (ONDC-1 design input only)

| Item | ONDC-0D action |
|------|----------------|
| OTP Smart Merit (internal composite ranking) | Document as **separate** from ONDC catalog; see R2 review pillars |
| ONDC buyer-app sorting / minimum listing disclosures | Plan for **ONDC-1** per [ONDC Disclosures](https://resources.ondc.org/disclosures); **no implementation** |
| Blended ranking of ONDC + OTP suppliers | **ONDC-1 DESIGN INPUT** — provenance labels mandatory (`ONDC-0B`) |

---

## 10. What ONDC-0D did **not** do

- Modify source, DB, migrations, deploy  
- Register, generate keys, whitelist  
- Send live gateway `search` or fake `on_search`  
- Select subscribe domain  
- Start **ONDC-1**  

---

## 25. Final gate report (Section 25)

```
PHASE: ONDC-0D — Geographic Network Availability Discovery (read-only)
DATE: 2026-09-29
REPOSITORY / DATABASE / DEPLOYMENT CHANGED: NO

ROLE: Buyer App (BAP); discovery only (search / on_search adapter path)
SUBSCRIBER_ID (WORKING ASSUMPTION, NOT REGISTERED): otpplatform-theta.vercel.app
ENGINE / FROZEN: Supplier Network Engine; R2-31 frozen; Wallet W1–W10 frozen; Google GIS ≠ ONDC

DOMAIN SELECTION: DEFERRED — NOT SELECTED (multiple Pre-Prod ENABLED RET-family codes; B2B 2.0.2 spec ≠ single sheet row; SRV* NOT on enabled sheet; ONDC:B2B10 NOT FOUND)

FOUR-LAYER SUMMARY (NATIONAL / PILOT):
(A) Domain enabled for registration: PARTIALLY CONFIRMED — enabled-domains sheet 2026-09-29; one subscribe code not product-selected
(B) Category on ONDC network directory: CONFIRMED nationally (RET + ancillary domains on sheet/profile); NOT per pilot city
(C) Participants in category: DOCUMENTED BUT LOCATION UNCONFIRMED — ondc.org NP pages + registry lookup (unsigned, NOT RUN)
(D) Actual seller/inventory for city/PIN: NETWORK PRESENT — INVENTORY UNCONFIRMED (all five places); evidence type 4 NOT RUN

EVIDENCE TYPES: 1 national — USED | 2 city — USED (std:080 CONFIRMED; std:044/0422/0424 PARTIALLY CONFIRMED) | 3 PIN — USED (counts; NOT FULLY COMPILED lists) | 4 actual search — NOT RUN

EXTERNAL ONDC ACCESS REQUIRED: YES (portal whitelist, subscribe, signing keys, site verification, public bap_uri, signed gateway search/lookup)
REAL NETWORK DISCOVERY: NOT YET POSSIBLE

PILOT PLACES (INTENT UNCHANGED): Bhavani, Erode, Coimbatore, Chennai (TN), Bengaluru (KA) — all PINs in those places intended
EXECUTIVE GEO STATUS:
- Bengaluru: PARTIALLY CONFIRMED (mapping); inventory UNKNOWN
- Chennai: PARTIALLY CONFIRMED (mapping); inventory UNKNOWN
- Coimbatore: PARTIALLY CONFIRMED (mapping); inventory UNKNOWN
- Erode: PARTIALLY CONFIRMED (mapping); inventory UNKNOWN
- Bhavani: DOCUMENTED BUT LOCATION UNCONFIRMED (no ONDC city row; PIN place set NOT FULLY COMPILED)

PIN INVENTORY: NOT FULLY COMPILED (ONDC sheet unique counts: Bengaluru 129, Chennai 85, Coimbatore 107, Erode 61; Bhavani slice 7×6383xx under ERODE label only)
POSTAL PIN COVERAGE: cited separately (e.g. Bhavani H.O 638301 on Erode District postal page) — not ONDC coverage

CROSS-CITY MATRIX: documented in ONDC-0D-DOMAIN-CATEGORY-MATRIX.md and ONDC-0D-PIN-COVERAGE-MATRIX.md
SMART MERIT / BAP SORTING DISCLOSURES: ONDC-1 DESIGN INPUT ONLY — no implementation

PROVENANCE: ONDC_DISCOVERED ≠ OTP_REGISTERED ≠ GST_VERIFIED — mandatory

PRODUCT DECISION NOW POSSIBLE: NO
REASON: Subscribe domain still DEFERRED; Layer (D) inventory unconfirmed for all pilot geographies; Bhavani Beckn locality NOT RESOLVED on official ONDC city sheet; REAL NETWORK DISCOVERY NOT YET POSSIBLE without EXTERNAL ONDC ACCESS

ONDC-1 AUTHORIZED: NO — STOP. Do not start ONDC-1 in this phase.
```

---

**Stop statement:** Repository / database / deployment changed: **NO**. **STOP.**
