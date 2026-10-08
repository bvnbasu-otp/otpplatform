# ONDC-0E — Candidate Compatibility (Decision Preparation)

**Date:** 2026-09-29  
**Phase:** ONDC-0E (read-only; no implementation, registration, or network traffic)  
**Inputs:** `ONDC-0` through `ONDC-0D` artifacts under `OTP Golden Reconstruction/ONDC/` only; official excerpts already quoted therein.  
**Certified code baseline (reference):** `9cb4a037418893cbaf5c90b9f108884d32a1601b`  
**Repository / database / deployment changed:** **NO**

---

## 0. Immutable context (not reopened)

| Lock | Value |
|------|--------|
| OTP product | Identity-protected competitive sourcing: **TELL → REVIEW → DECIDE → TRACK** |
| Buyer personas | Individual, RWA, MSME |
| Architecture | **One** Supplier Network Engine; ONDC = external discovery **adapter** |
| Provenance | **ONDC_DISCOVERED ≠ OTP_REGISTERED ≠ GST_VERIFIED** — mandatory; no auto-verify |
| ONDC role | **Buyer App (BAP)**, `ops_no: 1`; **discovery only** (`search` / ingest `on_search`) |
| Out of scope | `select` / `init` / `confirm` / order / payment / settlement / fulfilment / post-order on Beckn |
| Pilot geography (intent) | Bhavani, Erode, Coimbatore, Chennai (TN), Bengaluru (KA) — **all PINs** in those places intended; **do not claim** sellers or inventory exist there |
| `subscriber_id` / callback host | Working assumption **`otpplatform-theta.vercel.app`** — **NOT REGISTERED** |
| Frozen | R2-31; Wallet W1–W10; Google GIS **separate** from ONDC |
| **SELECTED ONDC DOMAIN** | **NOT SELECTED** |

### 0.1 Candidates in scope (assessed; no ranking)

| Candidate | In matrix |
|-----------|-----------|
| `ONDC:RET10` | Yes |
| `ONDC:RET12` | Yes |
| `ONDC:RET14` | Yes |
| **B2B Retail v2.0.2** (specification **family**, not one subscribe code) | Yes |
| `ONDC:SRV11` | **Excluded** — not on enabled-domains sheet export 2026-09-29 (`ONDC-0C` §3, `ONDC-0D` E-17) |
| `ONDC:B2B10` | **Excluded** — OTP code heuristic only; absent from enabled sheet (`ONDC-0B`, `ONDC-0C` §5.F) |

---

## 1. Cross-candidate evidence mini-table (mandatory)

Legend: **Proves** = supported by cited artifacts in this workspace. **Does not prove** = cannot infer from those artifacts alone.

| Claim | What evidence **proves** | What evidence **does not prove** |
|-------|--------------------------|----------------------------------|
| **Domain enabled (Pre-Prod subscribe)** | **`ONDC:RET10`**, **`ONDC:RET12`**, **`ONDC:RET14`**: rows on [Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing) export 2026-09-29 with Pre-Prod **Enabled** (`ONDC-0C` §3). **B2B Retail v2.0.2 family**: spec branch on GitHub with standalone B2B `search` examples; **no** spreadsheet row titled “B2B Retail v2.0.2”; examples use RET `context.domain` (e.g. `ONDC:RET10`) + `version: "2.0.2"` (`ONDC-0C` §3, §5.A). | That any one RET code covers **all** OTP procurement categories without product narrowing. That B2B 2.0.2 subscribe maps to **one** canonical code without **EXTERNAL ONDC ACCESS** / operator confirmation (`ONDC-0C` §5.A). Seller presence, inventory, or pilot-city density. |
| **Participants exist (national)** | RET verticals **CONFIRMED** on national directory / enabled sheet + profile (`ONDC-0D` Layer B). Public [Seller](https://www.ondc.org/pages/seller-network-participants.html) / [Buyer](https://www.ondc.org/pages/buyer-network-participants.html) NP pages documented — **DOCUMENTED BUT LOCATION UNCONFIRMED** (`ONDC-0D` E-13). | Participants registered **in** Bhavani / Erode / Coimbatore / Chennai / Bengaluru or at a given PIN. Counts or identities of BPPs per vertical without signed registry lookup or live `search` (E-15, E-16 **NOT RUN**). |
| **Seller presence in target cities** | **NOT ESTABLISHED BY CURRENT EVIDENCE** for any candidate — Layer (C) per pilot place is **UNKNOWN** without credentials (`ONDC-0D` §3). Protocol allows per-request `context.location.city.code` (`std:*`) and PIN stops (`ONDC-0C` §6). | That catalogs exist in TN/KA pilot clusters. Empty `on_search` remains valid (`ONDC-0C-GEOGRAPHY-MATRIX` §3). |
| **Inventory at PIN** | **NOT ESTABLISHED BY CURRENT EVIDENCE** — Layer (D) **NETWORK PRESENT — INVENTORY UNCONFIRMED** for all five places × RET candidates (`ONDC-0D-DOMAIN-CATEGORY-MATRIX` §4). ONDC city sheet gives PIN ↔ city ↔ STD for **`area_code` planning** only (E-08). | Stock, price, MOQ, or fulfilment capability at `638301`, `560001`, or any pilot PIN. POSTAL PIN COVERAGE ≠ ONDC inventory (`ONDC-0D-PIN-COVERAGE-MATRIX` §1). |
| **Discoverability from OTP (end-to-end)** | **Code path** exists: SNE → `OndcNetworkAdapter` → signed `search` + in-memory `on_search` receiver (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §2). When `NOT_CONFIGURED`, **zero** ONDC candidates (`ONDC-0B` §3). Core protocol defines BAP `search` / `on_search` (E-04). | Live discoverability until: whitelist + subscribe + keys + `ondc-site-verification.html` + `/on_subscribe` + public signed `bap_uri` + product-selected **single** subscribe `domain` aligned with Beckn `context.domain` / spec **version** (`ONDC-0B` §2.3, `ONDC-0C` §8). **REAL NETWORK DISCOVERY: NOT YET POSSIBLE** (`ONDC-0D` §1). |

---

## 2. B2B vs B2C orientation (factual; per candidate)

| Candidate | Sheet category (enabled export) | B2B / B2C orientation (evidence-bound) |
|-----------|--------------------------------|----------------------------------------|
| `ONDC:RET10` | Grocery | **B2C-primary** in official pre-prod **reference buyer** (B2C Retail) (`ONDC-0C` §5.E; profile Reference Applications). B2B **2.0.2 JSON examples also use** `ONDC:RET10` with `version: "2.0.2"` — same registry code, different spec **version** / use-case narrative (`ONDC-0C` §3). |
| `ONDC:RET12` | Fashion | **Retail vertical** (B2C-style catalog discovery in RET family). OTP mapper ties textiles/yarn (`ONDC-0B` §2.2). No B2B RFQ family label on sheet row. |
| `ONDC:RET14` | Electronics | **Retail vertical** (B2C-style catalog discovery in RET family). OTP mapper ties CCTV/electronics (`ONDC-0B` §2.2). |
| **B2B Retail v2.0.2 (spec family)** | **Not a sheet row** | **B2B procurement / RFQ-oriented** spec branch ([release-2.0.2](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2)); registry subscribe still uses **RET** `context.domain` codes in examples — **not** a distinct `ONDC:B2B*` code (`ONDC-0C` §3). Related enabled codes for industrial/construction overlap (**not** assessed as separate rows in this doc): `ONDC:RET1B`, `ONDC:RET1C` (`ONDC-0C` §5.G). |

---

## 3. Per-candidate assessment — dimensions A–J

Evaluation dimensions apply equally to discovery-only OTP scope. Facts below are **compatibility preparation**, not product choices.

---

### 3.1 `ONDC:RET10` (Grocery; lookup / reference exemplar)

#### Evidence mini-table (candidate-specific)

| Dimension | Proves | Does not prove |
|-----------|--------|----------------|
| Domain enabled | Pre-Prod **Enabled**; Pramaan **Enabled** on sheet (`ONDC-0C` §3) | OTP multi-category B2B pilot **fit** (grocery ≠ full taxonomy) |
| Participants | National RET / grocery category **CONFIRMED** on directory layer (`ONDC-0D` §2) | BPPs in pilot cities |
| Seller presence (5 places) | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| Inventory at PIN | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| OTP discoverability | Protocol + adapter wiring **documented**; live path **blocked** on registration (`ONDC-0D` §5.D) | Results at pilot PINs |

#### A — Procurement semantic fit

- Sheet labels vertical **Grocery** (`ONDC-0C` §3).
- Official **pre-prod reference buyer** path is **B2C Retail** using this domain family (`ONDC-0C` §5.E) — aligns with **consumer grocery**, not OTP’s multi-category **B2B** construction/MRO/services/textiles intent (`ONDC-0B` §2.4).
- B2B 2.0.2 **examples** reuse `ONDC:RET10` + `version: "2.0.2"` — semantic fit for **B2B grocery/industrial catalog search** is **NOT ESTABLISHED BY CURRENT EVIDENCE** beyond those example payloads (`ONDC-0C` §3).

#### B — RFQ mapping (compatibility questions, not promises)

| OTP TELL / requirement signal | Compatibility question for product / ONDC |
|---------------------------------|-------------------------------------------|
| Multi-line industrial RFQ with MOQ, credit, delivery slots | Does RET10 + B2C 1.2.x subscribe version support B2B RFQ tags, or only B2B 2.0.2 **version** on same code? **REQUIRES EXTERNAL CONFIRMATION** (`ONDC-0C` §5.A, §5.E). |
| Category = cement / steel / RMC | RET10 grocery domain vs construction taxonomies — **mismatch** unless product narrows to grocery-compatible SKUs only. |
| Identity-protected bid comparison | Beckn post-search RFQ flows exist in B2B spec; OTP **does not implement** them (`ONDC-0-ROLE-DOMAIN-USECASE-MATRIX` §3). |

#### C — Supplier discovery fields (network may expose via `on_search`)

- **Established:** Beckn catalog/provider descriptors in core + RET family; normalized in OTP to `ONDC_SELLER` / `ONDC_DISCOVERED` tier (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §3).
- **NOT ESTABLISHED BY CURRENT EVIDENCE:** Which RET10 BPP fields (GSTIN, FSSAI, B2B buyer segments) appear in pre-prod grocery catalogs without live `on_search` (E-15 **NOT RUN**).

#### D — Geography restrictions (no coverage claims)

- Search planning: `context.location.country.code` = `IND`; city `std:080` in onboarding + B2B examples; wildcard `"*"` in B2B category search example (`ONDC-0C` §6).
- Pilot places map to `std:080`, `std:044`, `std:0422`, `std:0424`; **Bhavani** Beckn city code **NOT RESOLVED** on ONDC sheet (`ONDC-0C-GEOGRAPHY-MATRIX` §2.1).
- **No claim** that grocery sellers exist in pilot cities.

#### E — Normalization consequences

- Subscribe domain **RET10** must align with Beckn `context.domain` on outbound `search` and adapter `mapCategoryToOndcDomain` heuristics (OTP default for many categories is **not** RET10 — `ONDC-0B` §2.2).
- Spec **version** (B2C vs B2B 2.0.2) must match subscribe choice — **NOT LOCKED** (`ONDC-0C-GEOGRAPHY-MATRIX` §4.1).
- ONDC port wrapper uses match score `0` today — ranking vs OTP Verified suppliers is **ONDC-1 design input** (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §4).

#### F — Qualification states

- Network rows remain **`ONDC_DISCOVERED`**; never **`OTP_REGISTERED`** or GST-verified without OTP lifecycle (`ONDC-0B` §3).
- `NOT_CONFIGURED` → zero candidates — no fake grocery sellers (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §6).

#### G — Smart Merit vs network data

- **Smart Merit** (OTP internal four-pillar composite) is **not** an ONDC API (`ONDC-0D-DOMAIN-CATEGORY-MATRIX` §6, E-18).
- Network may supply catalog attributes for merit **inputs** only after live discovery — **NOT ESTABLISHED BY CURRENT EVIDENCE**.
- BAP sorting / minimum listing **disclosure** obligation documented at [resources.ondc.org/disclosures](https://resources.ondc.org/disclosures) — **ONDC-1** planning; fetch failed HTTP 500 in ONDC-0D but handbook reference stands (E-14).

#### H — Identity-protection consequences

- Discovery-only: aliases / anti-leak in SNE apply to normalized candidates (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §2).
- Full identity-protected quote comparison over Beckn is **NOT_SUPPORTED** in repo (`ONDC-0-ROLE-DOMAIN-USECASE-MATRIX` §3) — RET10 choice does not change that for ONDC-0E scope.

#### I — Single engine

- **Unchanged:** one `SupplierNetworkEngine`; RET10 only affects adapter domain string + gateway context (`ONDC-0B` §4, `ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §1).

#### J — Callback consequences (documented only)

- Registry: `https://otpplatform-theta.vercel.app/ondc-site-verification.html` + `.../on_subscribe` — **required**, **not deployed** (`ONDC-0B` §2.3, `ONDC-0-DISCOVERY` §3.1).
- `on_search` → **`bap_uri`** from Beckn context; path **UNKNOWN**; placeholder env not theta (`ONDC-0B` §2.3).
- In-memory receiver — production persistence **ONDC-1 architecture requirement** (`ONDC-0C` §8).

---

### 3.2 `ONDC:RET12` (Fashion / textiles vertical)

#### Evidence mini-table (candidate-specific)

| Dimension | Proves | Does not prove |
|-----------|--------|----------------|
| Domain enabled | Pre-Prod **Enabled** (`ONDC-0C` §5.C) | Coverage of non-textile OTP categories |
| Participants | National fashion RET category **CONFIRMED** (`ONDC-0D` §2) | Textile BPPs at pilot PINs |
| Seller presence (5 places) | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| Inventory at PIN | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| OTP discoverability | Same adapter blockers as §1 | Yarn MOQ / mill certificates in catalog |

#### A — Procurement semantic fit

- Aligns with OTP mapper signal for **textiles / yarn** → `ONDC:RET12` (`ONDC-0B` §2.2).
- **Narrow** vs OTP multi-category intent unless product **narrows pilot** to fashion/textile RFQs (`ONDC-0C` §5.C).

#### B — RFQ mapping (compatibility questions)

| OTP signal | Compatibility question |
|------------|-------------------------|
| `cotton_yarn`, fabric specs | Do RET12 BPP catalogs expose B2B quantity breaks and specification attributes OTP TELL captures? **NOT ESTABLISHED BY CURRENT EVIDENCE**. |
| Construction + textiles same requirement | Single subscribe domain **RET12** cannot represent cement/steel — multi-domain registration later? **NOT ESTABLISHED BY CURRENT EVIDENCE** in artifacts (only one primary subscribe locked for ONDC-1 gate). |
| B2B RFQ 2.0.2 | Examples primarily on RET10 + v2.0.2 — whether RET12 uses same **version** line for RFQ tags **REQUIRES EXTERNAL CONFIRMATION**. |

#### C — Supplier discovery fields

- Same normalization path as other RET codes (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` §3).
- Fashion-specific attributes (size charts, HSN) — **NOT ESTABLISHED BY CURRENT EVIDENCE** without type-4 search.

#### D — Geography restrictions

- Same location model as §3.1 (`ONDC-0C` §6); Bhavani unresolved.
- **No claim** of fashion seller density in Tamil Nadu / Karnataka.

#### E — Normalization consequences

- OTP categories mapped to RET12 in code; other categories would send **wrong domain** if subscribe locks RET12 only — operator must align pilot category filter with domain (`ONDC-0B` §2.2).

#### F — Qualification states

- Identical provenance rules to §3.1 (`ONDC-0B` §3).

#### G — Smart Merit vs network data

- Same as §3.1 §G.

#### H — Identity-protection consequences

- Same as §3.1 §H.

#### I — Single engine

- Same as §3.1 §I.

#### J — Callback consequences

- Same as §3.1 §J — domain choice does not alter documented callback gaps.

---

### 3.3 `ONDC:RET14` (Electronics)

#### Evidence mini-table (candidate-specific)

| Dimension | Proves | Does not prove |
|-----------|--------|----------------|
| Domain enabled | Pre-Prod **Enabled** (`ONDC-0C` §5.D) | Industrial electronics vs consumer gadgets split on network |
| Participants | National electronics RET **CONFIRMED** (`ONDC-0D` §2) | CCTV/security BPPs in pilot geo |
| Seller presence (5 places) | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| Inventory at PIN | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| OTP discoverability | Adapter path documented; live blocked | Warranty/AMC fields in `on_search` |

#### A — Procurement semantic fit

- OTP mapper: **CCTV / electronics** → `ONDC:RET14` (`ONDC-0B` §2.2).
- **Narrow** slice of OTP taxonomy (`ONDC-0C` §5.D).

#### B — RFQ mapping (compatibility questions)

| OTP signal | Compatibility question |
|------------|-------------------------|
| CCTV bundles, installation | Are installation/services in RET14 catalog or better suited to **SRV** family (SRV **not** on enabled sheet)? **NOT ESTABLISHED BY CURRENT EVIDENCE** for subscribe path. |
| B2B RFQ with compliance docs | Does RET14 B2B version support document attachments OTP REVIEW needs? **NOT ESTABLISHED BY CURRENT EVIDENCE**. |

#### C — Supplier discovery fields

- Normalized to `ONDC_SELLER`; electronics-specific specs — **NOT ESTABLISHED BY CURRENT EVIDENCE** pre-live.

#### D — Geography restrictions

- Same as §3.1 §D.

#### E — Normalization consequences

- Misalignment if buyer RFQ category is not electronics but subscribe domain is RET14.

#### F — Qualification states

- Same as §3.1 §F.

#### G — Smart Merit vs network data

- Same as §3.1 §G.

#### H — Identity-protection consequences

- Same as §3.1 §H.

#### I — Single engine

- Same as §3.1 §I.

#### J — Callback consequences

- Same as §3.1 §J.

---

### 3.4 B2B Retail v2.0.2 (specification family — not one subscribe code)

Treat as **protocol/spec family** spanning RFQ and Non-RFQ narratives on GitHub `release-2.0.2`, with registry `domain` field still drawn from **RET enabled codes** in official JSON examples (`ONDC-0C` §3, §5.A).

#### Evidence mini-table (candidate-specific)

| Dimension | Proves | Does not prove |
|-----------|--------|----------------|
| Domain enabled | **PARTIALLY CONFIRMED:** underlying RET codes (e.g. RET10, RET1B, RET1C) enabled on sheet; **no** row “B2B Retail v2.0.2” (`ONDC-0C` §3, `ONDC-0D` §1) | Which **single** RET code OTP should subscribe for **multi-category** B2B pilot |
| Participants | B2B spec **CONFIRMED** on GitHub; national participants **DOCUMENTED BUT LOCATION UNCONFIRMED** | B2B RFQ-capable BPP count |
| Seller presence (5 places) | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| Inventory at PIN | **NOT ESTABLISHED BY CURRENT EVIDENCE** | — |
| OTP discoverability | B2B `search` examples standalone (`ONDC-0C` §4); OTP must align `version: "2.0.2"` with subscribe | End-to-end without ONDC-confirmed domain/version pairing |

#### A — Procurement semantic fit

- **Broadest** alignment with OTP **deferred RFQ / industrial procurement** intent among assessed candidates (`ONDC-0C` §5.A).
- Still **not** proof that all OTP seed categories (lift AMC, motor rewinding, turmeric, …) map to one B2B retail domain (`ONDC-0B` §2.2).
- Enabled **`ONDC:RET1B`** (Hardware and Industrial) and **`ONDC:RET1C`** (Building and construction supplies) are **material** if B2B family is interpreted as vertical RET registration (`ONDC-0C` §5.G) — **NOT ESTABLISHED BY CURRENT EVIDENCE** which RET code(s) ONDC expects for a multi-vertical B2B buyer.

#### B — RFQ mapping (compatibility questions)

| OTP phase | Compatibility question |
|-----------|------------------------|
| TELL (requirement text, qty, delivery PIN) | Can B2B `search` intent (category, fulfillment stop PIN/GPS — [search_by_fulfillment_end_loc.json](https://github.com/ONDC-Official/ONDC-RET-Specifications/blob/release-2.0.2/api/components/Examples/B2B_json/search/search_by_fulfillment_end_loc.json)) express OTP RFQ fields without `select`? **Spec suggests yes for discovery**; live BPP behavior **NOT RUN**. |
| REVIEW (blind comparison) | OTP blind evaluation stays internal; Beckn RFQ quote flows **out of scope** — can REVIEW run without network quote IDs? **Product/process question** — not answered by ONDC-0* artifacts. |
| DECIDE / TRACK | Award/PO/wallet on OTP rails (frozen) — B2B spec order phases **deferred** (`ONDC-0B` §1). |

#### C — Supplier discovery fields

- B2B examples include fulfillment stops with **`area_code` (PIN)** and **`gps`** (`ONDC-0C` §6).
- Provider/item fields in examples — **CONFIRMED** as spec surface; live field population **NOT ESTABLISHED BY CURRENT EVIDENCE**.

#### D — Geography restrictions

- B2B examples use `std:080` or city wildcard `"*"` for category search (`ONDC-0C` §6).
- Pilot multi-city: **permitted at protocol level** by varying location per `search` (`ONDC-0C` §6).
- Wildcard city for pilot policy — **REQUIRES EXTERNAL CONFIRMATION** (`ONDC-0C-GEOGRAPHY-MATRIX` §4, T7).

#### E — Normalization consequences

- **`context.version`** must be **2.0.2** for B2B family — mismatch with B2C 1.2.x reference buyer path if operator mixes paths (`ONDC-0C` §5.E).
- Heuristic `ONDC:B2B10` in OTP code is **INCOMPATIBLE** with enabled sheet — must not be used (`ONDC-0C` §5.F).
- Multi-RET vertical reality: subscribing one RET code while searching another in `context.domain` — **NOT ESTABLISHED BY CURRENT EVIDENCE** as allowed; likely registry/policy violation — **REQUIRES EXTERNAL CONFIRMATION**.

#### F — Qualification states

- B2B discovery rows still **ONDC_DISCOVERED** only (`ONDC-0B` §3).

#### G — Smart Merit vs network data

- B2B catalogs might expose trade terms usable as merit inputs — **NOT ESTABLISHED BY CURRENT EVIDENCE**.
- Disclosure obligations same as §3.1 §G (E-14).

#### H — Identity-protection consequences

- RFQ spec includes buyer/seller identity flows in **full** commerce — OTP identity protection for **competitive sourcing** may conflict with network fields that expose seller identity in `on_search`. **NOT ESTABLISHED BY CURRENT EVIDENCE** for anonymization guarantees on ONDC B2B discovery payloads.

#### I — Single engine

- B2B family does not require second engine; may require **richer** adapter mapping from OTP requirement → B2B search intent (`ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY` — **INTERFACE GAP** for HTTP/registry, not engine fork).

#### J — Callback consequences

- Identical registry/`bap_uri` gaps as §3.1 §J.
- B2B 2.0.2 does not remove site verification or encryption challenge steps (`ONDC-0B` §2.3).

---

## 4. Excluded codes (one-line note)

| Code | Reason |
|------|--------|
| `ONDC:SRV11` | Official SRV README defines code; **no `ONDC:SRV*` row** on enabled-domains export 2026-09-29 — **not selectable** for Pre-Prod subscribe on current evidence (`ONDC-0C` §5.B, `ONDC-0D` E-17). |
| `ONDC:B2B10` | OTP mapper heuristic only; **absent** from enabled sheet and official RET/SRV domain tables in prior passes (`ONDC-0C` §5.F). |

---

## 5. Decision-preparedness matrix (no ranking)

Rows = assessed candidates. Columns = readiness dimensions. Status vocabulary from ONDC-0C/0D.

| Candidate | Layer (A) subscribe | Discovery-only scope | BAP role | Pilot geo mapping | Layer (D) inventory | OTP engine fit | Provenance safe | ONDC-1 unblocked |
|-----------|---------------------|----------------------|----------|-------------------|---------------------|----------------|-----------------|------------------|
| `ONDC:RET10` | **COMPATIBLE** (sheet Enabled) | **COMPATIBLE** | **COMPATIBLE** | **PARTIALLY CONFIRMED** (`std:080` confirmed; Bhavani unresolved) | **UNKNOWN** (type 4 NOT RUN) | **COMPATIBLE** (adapter) | **COMPATIBLE** if `NOT_CONFIGURED`/labels enforced | **NO** — domain not selected; callbacks not deployed |
| `ONDC:RET12` | **COMPATIBLE** | **COMPATIBLE** | **COMPATIBLE** | **PARTIALLY CONFIRMED** | **UNKNOWN** | **COMPATIBLE** | **COMPATIBLE** | **NO** |
| `ONDC:RET14` | **COMPATIBLE** | **COMPATIBLE** | **COMPATIBLE** | **PARTIALLY CONFIRMED** | **UNKNOWN** | **COMPATIBLE** | **COMPATIBLE** | **NO** |
| B2B Retail v2.0.2 (family) | **REQUIRES EXTERNAL CONFIRMATION** (exact subscribe RET code + version mapping) | **COMPATIBLE** (spec examples) | **COMPATIBLE** | **PARTIALLY CONFIRMED** | **UNKNOWN** | **COMPATIBLE** (adapter); mapping complexity **NOT ESTABLISHED BY CURRENT EVIDENCE** | **COMPATIBLE** | **NO** |

**Gate outcome (unchanged):** **BLOCKED_PRODUCT_DECISION** — multiple COMPATIBLE RET codes; B2B family lacks single sheet row; Layer (D) not tested; Bhavani Beckn locality unresolved (`ONDC-0C` §7, `ONDC-0D` §25).

**Pre-prod reference E2E vs discovery-only:** Profile expects E2E with reference apps (B2C Retail) — whether discovery-only BAP clears pre-prod without full RET E2E for non-reference domains **REQUIRES EXTERNAL CONFIRMATION** (`ONDC-0C` §4).

---

## PRODUCT OWNER DECISION REQUIRED

Short factual list — **decisions not made in ONDC-0E:**

1. **Primary subscribe `domain` code** — exactly **one** from enabled sheet among assessed RET candidates (`ONDC:RET10`, `ONDC:RET12`, `ONDC:RET14`), or **confirm with ONDC** which RET code(s) register a **B2B Retail v2.0.2** buyer for OTP’s vertical mix (including whether **`ONDC:RET1B` / `ONDC:RET1C`** are in scope).
2. **Beckn spec `version`** aligned with subscribe choice (B2C reference path vs **2.0.2** B2B family).
3. **Pilot category narrowing** — whether OTP multi-category procurement is truncated to match a single RET vertical (textiles, electronics, grocery) or pursued via B2B family + external domain mapping confirmation.
4. **Pilot geography execution** — accept protocol-level multi-city `search` vs compile full PIN inventories; **close Bhavani** city/PIN mapping on ONDC sheet or obtain ONDC guidance (`ONDC-0C-GEOGRAPHY-MATRIX` §2.1).
5. **`subscriber_id` confirmation** — reuse **`otpplatform-theta.vercel.app`** vs override (voids ONDC-0B reuse lock if changed) (`ONDC-0B` §2.1).
6. **`bap_uri` and callback path segments** — not locked (`ONDC-0B` §2.3).
7. **Pre-prod clearance strategy** — discovery-only participation vs reference-app E2E expectations (`ONDC-0C` §4).
8. **Smart Merit + ONDC disclosure** — plan for [ONDC disclosures](https://resources.ondc.org/disclosures) and separation from network catalog ordering (`ONDC-0D` §6) — **ONDC-1** design, not ONDC-0E.

**ONDC-0E STATUS: DECISION PREPARATION COMPLETE**

- **STOP:** no live network traffic, no registration, no keys, no code changes, no database changes, no configuration changes, no deployment, **no domain selected**, **do not start ONDC-1**.

---

**Repository / database / deployment changed:** **NO**. **STOP.**
