# ONDC-0B — Locked Product Decisions & Resolved TBDs

**Date:** 2026-09-29  
**Phase:** ONDC-0B (read-only lock; no implementation)  
**Inputs:** User lock (below), `ONDC-0-*.md`, OTP Supplier Network / ONDC adapter code (read-only), ONDC-Official GitHub + [ondc.org](https://www.ondc.org) references cited inline.  
**Certified code baseline (reference):** `9cb4a037418893cbaf5c90b9f108884d32a1601b`

---

## 1. User lock (do not reopen)

| Decision | Locked value |
|----------|----------------|
| ONDC role | **Buyer App / BAP** (registry `ops_no: 1`) |
| Initial scope | **Discovery only** (`search` / ingest `on_search` via adapter) |
| Engine | **Existing OTP Supplier Network Engine** — no rewrite |
| ONDC position | **External discovery adapter** — not a second engine |
| OTP public app host (marketing / Vercel) | `otpplatform-theta.vercel.app` |
| Beckn order flow (`select` / `init` / `confirm`) | **DEFERRED** |
| Provenance | **MANDATORY** — ONDC discovered ≠ OTP registered ≠ GST verified |
| ONDC discovery | **Must never** auto-verify a supplier as OTP-verified |
| Google vs ONDC | **Separate** networks and labels |
| R2-31 | **FROZEN** |
| Wallet W1–W10 | **FROZEN** (no supplier cashback) |

---

## 2. Resolved / explicitly unresolved TBDs

### 2.1 ONDC `subscriber_id`

#### Official rule

- The Network Participant must use a **valid FQDN (DNS)** as `subscriber_id`, **without** the `https://` prefix.  
  **Source:** [Onboarding of Participants](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) (Prerequisites §1; subscribe field list §9).
- `subscriber_id` must have a **valid SSL certificate** used for **OCSP** validation during subscribe.  
  **Source:** same document (Prerequisites §2; subscribe step 11 OCSP check).
- In Beckn `context`, `bap_id` must align with the registry entry participants validate against (`bap_id` / `bap_uri` vs registry).  
  **Source:** [Onboarding Staging Q&A (Discussion #31)](https://github.com/ONDC-Official/developer-docs/discussions/31) (BAP/BPP id vs registry).

#### `vercel.app` / `otpplatform-theta.vercel.app`

- **No ONDC-Official rule forbids** `*.vercel.app` (or subdomains) as `subscriber_id` in the sources reviewed (onboarding doc, signing doc, [.github profile](https://github.com/ONDC-Official/.github/blob/main/profile/README.md)).
- Requirement is a **valid CA-issued SSL** for the FQDN in the operating region, not a specific registrar TLD.  
  **Source:** [ONDC-Protocol-Specs `core.yaml` — Subscriber.subscriber_id](https://github.com/ONDC-Official/ONDC-Protocol-Specs/blob/master/protocol-specifications/core/v0/api/core.yaml); onboarding OCSP step.

#### OTP repo facts (not policy)

- Deployed theta host returns SPA shell; **`ondc-site-verification.html` is not served** at the registry path today (`ONDC-0-DISCOVERY.md`).
- `.env.production.example` uses placeholder `ONDC_SUBSCRIBER_ID=bap.yourdomain.com` and `ONDC_BAP_URI=https://api.yourdomain.com/ondc/bap` — **not** theta hostname.

#### **Resolution (product + evidence)**

| Item | Resolution |
|------|------------|
| **Docs-eligible `subscriber_id` when reusing the existing deploy host** | **`otpplatform-theta.vercel.app`** (FQDN only; no `https://`) |
| **Is theta automatically `subscriber_id` by virtue of being the app FQDN?** | **No** — ONDC assigns identity to the FQDN **you whitelist and subscribe**; the user lock keeps marketing host separate from registry identity unless explicitly chosen. **This document explicitly chooses the reuse path below.** |
| **Alternative (dedicated API / BAP host)** | **NOT CHOSEN** — no second FQDN locked in product or repo |

**Operator obligations before subscribe (ONDC-controlled + deploy):**

1. Whitelist **exactly** `otpplatform-theta.vercel.app` on [portal.ondc.org](https://portal.ondc.org) (environment access request).  
   **Source:** [Onboarding of Participants — Whitelisting](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md).
2. Prove OCSP + domain verification on that host (verification file + `on_subscribe` — see §2.3).
3. Accept coupling of **registry identity** to the **Vercel preview/production app hostname** (operational risk; not prohibited by cited docs).

**If theta cannot pass OCSP or site verification on Vercel routing:** fallback is **NOT RESOLVABLE FROM DOCS** for a substitute hostname — official docs do not prescribe an alternate FQDN; the operator must procure and whitelist a **different** FQDN they control. Missing rule: **none** (choice is NP-owned DNS), not an ONDC doc gap.

---

### 2.2 ONDC domain code(s)

#### Official anchors

- Subscribe and lookup use a **`domain`** field (e.g. lookup example `ONDC:RET10`).  
  **Source:** [Onboarding of Participants — `/v2.0/lookup` example](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md).
- Authoritative **enabled domain code list:** [ONDC Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing).  
  **Source:** [ONDC-Official/.github — Enabled Domains](https://github.com/ONDC-Official/.github/blob/main/profile/README.md).
- **B2B RFQ** procurement alignment (discovery-only scope): **B2B Retail specifications v2.0.2** (RFQ, Non-RFQ).  
  **Source:** [ONDC-RET-Specifications `release-2.0.2`](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2).
- **Services (home / infra):** `ONDC:SRV11` = Home Services — Infra Services.  
  **Source:** [ONDC-SRV-Specifications `release-services` README](https://github.com/ONDC-Official/ONDC-SRV-Specifications/blob/release-services/README.md).

#### OTP code heuristics (`mapCategoryToOndcDomain`)

| OTP category signal (examples) | Beckn `context.domain` in code | Official anchor in this pass |
|--------------------------------|-------------------------------|------------------------------|
| Textiles / yarn | `ONDC:RET12` | Retail family — enabled list + RET specs |
| CCTV / electronics | `ONDC:RET14` | Retail family — enabled list + RET specs |
| Cement / steel / RMC / construction | `ONDC:B2B10` | **Not found** in ONDC-Official RET/SRV/LOG domain tables fetched; **do not use for subscribe until row exists in enabled-domains sheet** |
| Gym / AMC / paint | `ONDC:SRV13` | **Not listed** in SRV README (SRV10–SRV12 only) — **do not use for subscribe until verified in enabled-domains sheet** |
| Default (e.g. RO / general services) | `ONDC:SRV11` | **Official** SRV Infra Services |

**OTP procurement taxonomy:** multi-category (e.g. seeds: `motor_rewinding`, `lift_amc`, `cotton_yarn`, `turmeric`, …) — **no single OTP product category chosen for ONDC pilot.**

#### **Resolution (product)**

**No single domain code is locked.** Operator **must tick one primary** subscribe domain (and optionally additional registrations later) from this **evidence-backed short list**:

| # | Pilot intent | Domain code | Why on the list |
|---|--------------|-------------|-----------------|
| **A** | **B2B goods / RFQ-style procurement** (closest fit to OTP RFQ discovery, order flow deferred) | **Row for “B2B Retail v2.0.2” in [Enabled Domains spreadsheet](https://docs.google.com/spreadsheets/d/1Plny0C_4WwffquU6otDhuaVoVkuBd2XuyBKVr5oDDqY/edit?usp=sharing)** (exact string **not** duplicated here — sheet is canonical) | [RET B2B 2.0.2 RFQ](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2); B2B JSON examples live under RET repo ([example index](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2/api/components/Examples/B2B_json)) |
| **B** | **Facility / infra services** discovery (matches code default fallback) | **`ONDC:SRV11`** | [SRV README](https://github.com/ONDC-Official/ONDC-SRV-Specifications/blob/release-services/README.md) |
| **C** | **Textiles pilot** (if operator narrows to yarn/textile RFQ) | **`ONDC:RET12`** | OTP mapper + retail enabled family |
| **D** | **Electronics / security hardware pilot** | **`ONDC:RET14`** | OTP mapper + retail enabled family |
| **E** | **Official pre-prod reference-app path** (smallest documented external E2E sandbox; **not** OTP B2B product choice) | **`ONDC:RET10`** (B2C grocery in reference / lookup examples) | [Pre-prod reference buyer — B2C Retail](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#reference-applications); [lookup example `ONDC:RET10`](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) |

**Explicitly rejected for subscribe until verified in the enabled-domains sheet:** `ONDC:B2B10`, `ONDC:SRV13` (OTP-only heuristics in `packages/services/src/ondc/ondc-network-service.ts`).

**NOT RESOLVABLE FROM DOCS (without opening the spreadsheet):** the exact **single** `domain` string for “B2B Retail 2.0.2” subscribe row — official pointer is the spreadsheet, not a hardcoded string in onboarding markdown.

---

### 2.3 Callback host & paths (registry + discovery)

#### Named in [Onboarding of Participants](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md)

| Purpose | URL pattern | Status for OTP |
|---------|-------------|----------------|
| Site verification | `https://<subscriber_id>/ondc-site-verification.html` | **Required** at subscribe; **not deployed** on theta today |
| Registry encryption challenge | `https://<subscriber_id>/<callback_url>/on_subscribe` | **`callback_url` = relative path** in subscribe payload (operator chooses segment, e.g. `ondc` → `.../ondc/on_subscribe`) |
| Subscribe API (pre-prod) | `https://preprod.registry.ondc.org/ondc/subscribe` | ONDC-controlled endpoint |
| Gateway `search` (pre-prod) | `https://preprod.gateway.ondc.org/search` | **Source:** [.github Gateway table](https://github.com/ONDC-Official/.github/blob/main/profile/README.md) |

#### Beckn discovery callbacks

| Path | Status |
|------|--------|
| `on_search` HTTP path on BAP | **UNKNOWN** in onboarding doc — delivered to `bap_uri` from Beckn `context` per protocol; **no official fixed path** in onboarding steps 3–7 |
| OTP code placeholder | `ONDC_BAP_URI=https://api.yourdomain.com/ondc/bap` in `.env.production.example` — **implementation placeholder only**, not locked |

#### **Resolution (callback host)**

| Field | Resolution |
|-------|------------|
| **Registry / verification host** | **`otpplatform-theta.vercel.app`** (same FQDN as locked `subscriber_id` in §2.1) |
| **`subscriber_url` / `callback_url` relative segments** | **NOT LOCKED** in ONDC-0B — must be set in subscribe payload consistent with deployed routes (ONDC-1 implementation) |
| **`bap_uri` for `on_search`** | **UNKNOWN** until operator defines HTTPS base on subscriber host or chosen API prefix; must match registry |

---

### 2.4 Pilot category

| Source | Resolution |
|--------|------------|
| **OTP product** | **NOT CHOSEN** — multi-category procurement (construction, MRO, services, textiles, commodities, etc.; repo seeds and discovery tests span many subcategories). |
| **Official external default (pre-prod)** | **B2C Retail** — reference buyer app for pre-prod v1.2.0.  
  **Source:** [Reference Applications — Pre-prod table](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#reference-applications) (Domain: B2C, Use case: Retail, URL: [buyer-app-preprod-v2.ondc.org](https://buyer-app-preprod-v2.ondc.org/)). |

**OTP first ONDC pilot category:** operator must select **one** domain short-list option (§2.2) and matching OTP requirement category; until then **no OTP pilot category is locked**.

---

### 2.5 Pilot geography

| Source | Resolution |
|--------|------------|
| **Country** | **`IND`** — all cited onboarding / lookup examples. |
| **OTP** | **NOT CHOSEN** as single pilot geography — code/tests use Bengaluru signals (`pinCode` `560048`, default `cityCode` `std:080` when city string passed in `OndcSupplierProvider`). |
| **Official external default (city code)** | **`std:080`** appears in registry `vlookup` example (Bangalore).  
  **Source:** [Onboarding of Participants — vlookup example](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md). |
| **PIN / city mapping** | [City and State Codes spreadsheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing) — **Source:** [.github profile](https://github.com/ONDC-Official/.github/blob/main/profile/README.md#city-and-state-codes). |

---

## 3. Provenance & labeling rules (mandatory)

| Layer | Meaning | Buyer-facing label (OTP code) | Rules |
|-------|---------|------------------------------|--------|
| ONDC network hit | Seller surfaced from `search` / `on_search` only | `Network suppliers` (`ONDC_SELLER`) | `OndcSupplierProvider` returns **zero** candidates when `NOT_CONFIGURED`; **no fixture ONDC sellers** |
| OTP registry | Supplier onboarded / qualified in OTP | `OTP Verified` (`OTP_SUPPLIER`) | GST / OTP verification tiers are **internal** |
| Google | Places / GIS discovery | `Local businesses` (`GOOGLE_DISCOVERY`) | Separate adapter; not ONDC |

**Hard rules:**

1. **ONDC discovered ≠ OTP registered ≠ GST verified** — never merge tiers in UI or ranking copy.
2. **ONDC discovery must never auto-promote** a network row to OTP-verified or GST-verified state.
3. **`OndcIntegrationState.NOT_CONFIGURED`** remains the default until real subscriber keys + gateway whitelist exist.
4. Order flow on Beckn remains **out of scope** (deferred); award / PO / wallet stay on OTP rails (R2-31 / wallet frozen).

---

## 4. Architecture lock (unchanged)

- **Supplier Network Engine** remains the single orchestrator; **OndcNetworkAdapter** / **OndcSupplierProvider** are the only ONDC integration surface.
- ONDC is an **adapter**, not a parallel procurement engine.
- **No** registry subscribe, **no** key generation, **no** DB migration, **no** deploy changes in ONDC-0B.

---

## 5. Gate: ONDC-1 authorization

### NEXT STEP

**ONDC-1 is NOT AUTHORIZED** until:

1. **`subscriber_id`** — operator confirms **`otpplatform-theta.vercel.app`** (or formally overrides with a different whitelisted FQDN, which voids the §2.1 reuse lock and requires a new ONDC-0B amendment), **and**
2. **`domain`** — operator **picks exactly one** code from §2.2 short list **A–E** (primary subscribe domain), with **A** or **B** recommended for OTP B2B procurement vs services discovery respectively.

Until both are a **single evidence-backed value each** (subscriber_id = one FQDN; domain = one code from official list), remain at **BLOCKED_PRODUCT_DECISION** per `ONDC-0-GATE-DECISION.md`.

**Do not start ONDC-1** from this document alone.

---

## 6. Official source index (cited)

| Topic | URL |
|-------|-----|
| NP onboarding | https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md |
| Signing | https://github.com/ONDC-Official/developer-docs/blob/main/registry/signing-verification.md |
| ONDC profile (gateway, domains, reference apps) | https://github.com/ONDC-Official/.github/blob/main/profile/README.md |
| B2B Retail 2.0.2 | https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2 |
| Services domains | https://github.com/ONDC-Official/ONDC-SRV-Specifications/blob/release-services/README.md |
| NP portal | https://portal.ondc.org |

---

## 7. Summary table (executive)

| TBD | Resolution |
|-----|------------|
| **subscriber_id** | **`otpplatform-theta.vercel.app`** (docs-eligible; whitelist + verification still required) |
| **domain** | **Operator must pick one** from §2.2 list **A–E**; **not** a single locked code |
| **callback host** | **`otpplatform-theta.vercel.app`** for registry paths; `on_search` **path UNKNOWN** |
| **pilot category** | **OTP: NOT CHOSEN**; external default **B2C Retail** (reference app) |
| **pilot geography** | **Country IND**; **OTP city NOT CHOSEN**; external example **`std:080`** |
| **ONDC-1 authorized?** | **NO** |
