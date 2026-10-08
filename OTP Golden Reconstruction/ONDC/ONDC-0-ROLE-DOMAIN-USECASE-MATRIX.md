# ONDC-0 — Role, Domain & Use Case Matrix

Inference rule: derive role from **OTP behavior** (buyer requirement → network discovery → supplier engine → OTP qualification → OTP procurement), not from hosting FQDN alone.

---

## 1. Role matrix

| Candidate role | OTP behavioral evidence | Official NP types | Status | Notes |
|----------------|-------------------------|-------------------|--------|-------|
| **Buyer NP / Buyer App (BAP)** | `OndcGatewayClient` sets `bap_id`; `action: 'search'`; `OndcBapReceiver` handles `on_search`; buyer RFQ broadcast in `OndcSupplierProvider` | ops_no **1** Buyer App ([onboarding doc](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md)) | **SUPPORTED** | Primary ONDC integration role |
| Seller NP / Seller App | Suppliers onboard via OTP award/lifecycle; no BPP catalog publisher in scope | ops_no 2 | **NOT_SUPPORTED** as OTP’s ONDC role in frozen architecture | OTP supplier ≠ ONDC seller app |
| Gateway | No gateway implementation | gateway type in deprecated vlookup enums | **NOT_SUPPORTED** | |
| TSP | No evidence | — | **NOT_SUPPORTED** | |
| Buyer & Seller (ops_no 4) | Frozen: Buyer ≠ Supplier | ops_no 4 combined registration | **NOT_SUPPORTED** — would violate persona split | |

**Established role for ONDC-1 planning:** **Buyer App (BAP)** — confidence **HIGH** (code + ops_no 1).

**NOT ESTABLISHED (must not assume):**

| Identifier | Value |
|------------|-------|
| `subscriber_id` | **UNKNOWN** — must be NP FQDN chosen at registration, not auto `otpplatform-theta.vercel.app` |
| `bap_id` in Beckn context | **UNKNOWN** until equals registered `subscriber_id` |
| ONDC participant / registry record id | **UNKNOWN** |

---

## 2. Domain matrix

OTP procurement spans construction, MRO, services, textiles, etc. ONDC uses **domain codes** in Beckn `context.domain` and subscribe payload.

| OTP behavior | Code path | Example mapping | Official anchor |
|--------------|-----------|-----------------|-----------------|
| Category → Beckn domain heuristic | `mapCategoryToOndcDomain()` | `cement` → `ONDC:B2B10`; default → `ONDC:SRV11` | **OTP implementation only** |
| B2B RFQ / industrial procurement | Product intent | Closest official family: **B2B retail** specs with RFQ ([ONDC-RET-Specifications 2.0.2](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2)) | **UNCERTAIN** fit for all OTP categories |
| Single retail domain (e.g. RET10) | Not used in OTP mapper | — | Would not cover full OTP taxonomy |

| Domain identification for registry subscribe | Status |
|---------------------------------------------|--------|
| **Single ONDC domain for OTP platform** | **NOT IDENTIFIED** — **NO-GO trigger per gate rules** until product selects domain(s) from [enabled domains](https://github.com/ONDC-Official/.github/blob/main/profile/README.md) and registry policy |
| Force retail-only | **NOT APPLICABLE** — OTP is multi-category B2B procurement |

**Domain status:** **UNKNOWN** for registry purposes → gate **BLOCKED_PRODUCT_DECISION** component.

---

## 3. Use case matrix

| Use case step | OTP module | ONDC protocol touchpoint | Support status |
|---------------|------------|--------------------------|----------------|
| Buyer defines requirement | Requirement / RFQ intake | None | **SUPPORTED** (internal) |
| Discover external suppliers | `SupplierNetworkEngine` + `OndcNetworkAdapter` | `search` → `on_search` | **PARTIALLY_SUPPORTED** — code path exists; live config + HTTP callbacks missing |
| OTP qualification / verification | Supplier lifecycle, GST, OTP Verified tiers | None required at discovery | **SUPPORTED** (internal) |
| Identity-protected quote comparison | Blind RFQ / evaluation | Beckn `select`/`init`/… **not implemented** in `packages/services/src/ondc` | **NOT_SUPPORTED** over ONDC in current code |
| Award / PO / wallet | Award, PO, wallet migrations 00220–00221 | Out of scope for ONDC-0 | **SUPPORTED** internally; **frozen wallet rules** |

**Overall use case (ONDC as discovery adapter only):** **PARTIALLY_SUPPORTED**  
**Overall use case (full ONDC transaction through award):** **NOT_SUPPORTED** in repo — aligns with frozen “adapter if possible” scope.

---

## 4. Use case vs official network policy

| Check | Result |
|-------|--------|
| Use case requires fake ONDC sellers/subscribers | **NO** — `OndcSupplierProvider` returns empty when `NOT_CONFIGURED`; tests forbid invented sellers |
| Use case requires OTP to be Seller NP | **NO** |
| Domain unidentified for subscribe | **YES** — **NO-GO condition** until resolved |
| Role unestablished | **NO** — BAP established |
| Official docs insufficient for onboarding | **NO** — onboarding doc is sufficient for next phase planning |

---

## 5. Fixed FQDN vs ONDC identifiers

| Field | `otpplatform-theta.vercel.app` |
|-------|--------------------------------|
| OTP marketing / Vercel deploy host | **YES** (HTTP 200 observed) |
| Automatic `subscriber_id` | **NO** — **UNKNOWN** mapping |
| Automatic `bap_id` | **UNKNOWN** |
| Site verification host for registry | **UNKNOWN** — would require deliberate choice (may differ from theta subdomain) |
