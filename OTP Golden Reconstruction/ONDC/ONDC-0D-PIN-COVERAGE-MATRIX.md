# ONDC-0D — PIN Coverage Matrix

**Date:** 2026-09-29  
**Phase:** ONDC-0D (read-only)  
**OTP pilot intent:** **All PIN codes belonging to** Bhavani, Erode, Coimbatore, Chennai (Tamil Nadu), and Bengaluru (Karnataka).

---

## 1. Two authorities (do not merge)

| Authority | Purpose in this matrix | ONDC seller/inventory? |
|-----------|-------------------------|-------------------------|
| **[ONDC City and State Codes sheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing)** | Beckn **`area_code`** / city label / **STD → `std:`** planning | **No** — mapping only |
| **POSTAL PIN COVERAGE** | Where a place name exists in postal / district records | **No** — not ONDC catalog proof |

---

## 2. Executive PIN summary (five pilot places)

| OTP place | State | ONDC sheet city label(s) | Sheet STD | Beckn city code (planning) | Unique PINs (ONDC sheet) | Full PIN list in repo | POSTAL PIN COVERAGE |
|-----------|-------|--------------------------|-----------|----------------------------|--------------------------|----------------------|---------------------|
| **Bengaluru** | Karnataka | `BENGALURU URBAN`, `BENGALURU RURAL` | `080` | **`std:080`** — [onboarding vlookup example](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md); [B2B search example](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json) | **129** unique (**115** Urban + **20** Rural rows; **6** PINs appear under both labels) | **NOT FULLY COMPILED** | Karnataka urban/rural PINs — use India Post / sheet export; **not pasted here** |
| **Chennai** | Tamil Nadu | `CHENNAI` | `044` | **`std:044`** — sheet STD + `std:` convention; **no dedicated ONDC example URL for `std:044` in this pass** | **85** | **NOT FULLY COMPILED** | Tamil Nadu — postal authority separate |
| **Coimbatore** | Tamil Nadu | `COIMBATORE` | `0422` | **`std:0422`** — sheet STD + convention; **no dedicated ONDC example URL for `std:0422` in this pass** | **107** | **NOT FULLY COMPILED** | Same |
| **Erode** | Tamil Nadu | `ERODE` | `0424` | **`std:0424`** — sheet STD + convention; **no dedicated ONDC example URL for `std:0424` in this pass** | **61** | **NOT FULLY COMPILED** | [Erode District postal utilities](https://erode.nic.in/public-utility-category/postal/) lists HOs (includes Erode **638001**, Bhavani **638301**, etc.) |
| **Bhavani** | Tamil Nadu | **No `BHAVANI` label** | **NOT RESOLVED** on ONDC sheet | **NOT RESOLVED** — cannot assert a Bhavani-only Beckn city code from ONDC sheet | **Subset only:** **7** PINs under **`ERODE`** label with prefix **`6383`** (see §3) | **NOT FULLY COMPILED** for place boundary | **POSTAL PIN COVERAGE:** Bhavani H.O **638301** on [Erode District — Postal](https://erode.nic.in/public-utility-category/postal/) |

**Compilation method (when operator exports):** Download official ONDC city CSV (E-08 in `ONDC-0D-EVIDENCE-REGISTER.md`); filter by city labels above; dedupe `Pincode`; cross-check each PIN against POSTAL PIN COVERAGE for human place names; **never invent codes**.

---

## 3. Bhavani boundary (honesty block)

| Question | Answer |
|----------|--------|
| Does ONDC publish a “Bhavani” city row? | **No** (0 rows) |
| Where do Bhavani-area PINs appear on ONDC sheet? | Under **`ERODE`**, STD **`0424`**, PINs: `638301`, `638311`, `638312`, `638313`, `638314`, `638315`, `638316` |
| Is that set equal to “all PINs belonging to Bhavani” as a place? | **UNKNOWN** — ONDC sheet does not define Bhavani as a locality; postal district lists multiple offices beyond the `6383xx` block |
| Pilot intent shrink? | **No** — operator must define Bhavani PIN universe (postal sub-district / manual list) and map each PIN via ONDC sheet before Layer (D) tests |

---

## 4. Sample PINs for future Layer (4) tests (from ONDC sheet only)

| Place | Sample `area_code` | Sheet city label | Notes |
|-------|---------------------|------------------|-------|
| Bengaluru | `560001` | `BENGALURU URBAN` | First row in export sort — **not** a network density claim |
| Chennai | `600001` | `CHENNAI` | Same |
| Coimbatore | `638459` | `COIMBATORE` | Same |
| Erode | `638001` | `ERODE` | Erode H.O postal cross-ref on district postal page |
| Bhavani (intent) | `638301` | `ERODE` (sheet) | Matches Bhavani H.O on district postal page; Beckn city code for search planning **`std:0424`** unless ONDC guidance says otherwise |

---

## 5. Cross-place PIN matrix (ONDC sheet coverage only)

|  | PIN count (unique, sheet) | STD | Maps to OTP place |
|--|---------------------------|-----|-------------------|
| Bengaluru cluster | 129 | 080 | Yes |
| Chennai | 85 | 044 | Yes |
| Coimbatore | 107 | 0422 | Yes |
| Erode (full label) | 61 | 0424 | Yes — **includes** Bhavani-area `6383xx` rows |
| Bhavani-only slice | 7 (`6383xx` under `ERODE`) | 0424 | **Partial** vs OTP place intent |

**Layer (D) status for all cells:** **NETWORK PRESENT — INVENTORY UNCONFIRMED** until evidence type **4** runs with credentials.

---

## 6. ONDC national sheet scale

| Metric | Value |
|--------|-------|
| Total rows in ONDC city CSV export | **20,686** PIN rows |
| Full national dump in this repo | **No** — by design |

---

**Repository / database / deployment changed:** **NO**
