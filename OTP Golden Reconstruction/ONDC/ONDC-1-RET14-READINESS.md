# ONDC-1 — RET14 Buyer App Pre-Production Readiness

**Phase:** ONDC-1 (RET14 Electronics pilot — discovery only)  
**Date:** 2026-09-29  
**Role lock:** Buyer App (BAP), `ops_no: 1`  
**Subscribe / search domain lock (this phase):** `ONDC:RET14` (Electronics) — **pilot only**; does **not** redesign OTP taxonomy around RET14  
**Geography intent (not seller claims):** Bhavani, Erode, Coimbatore, Chennai, Bengaluru  
**Working `subscriber_id` assumption:** `otpplatform-theta.vercel.app` — **NOT registered** on ONDC  
**Repository commit / push / deploy / db push / key generation:** **NO**

---

## A. Readiness status

| Field | Value |
|-------|--------|
| **Overall** | **BLOCKED_EXTERNAL_ONDC_ACTION** |
| **Adapter / code posture** | **CONDITIONALLY READY — EXTERNAL ONDC ACTION REQUIRED** |
| **RET14 live discovery works?** | **NO** — not whitelisted, not subscribed, no keys, no public `on_search` route |
| **ONDC integration complete?** | **NO** |
| **ONDC-1 phase complete?** | **NO** |

**Rationale:** OTP’s Supplier Network Engine (SNE) already exposes an honest ONDC adapter boundary (`NOT_CONFIGURED` → zero candidates; no fixture ONDC sellers). Minimal env wiring for documented `ONDC_*` variables and optional `ONDC_DISCOVERY_DOMAIN=ONDC:RET14` were added in this pass. Registry onboarding (whitelist, site verification, `/on_subscribe`, signed callbacks, gateway ACK with real keys) remains **operator / ONDC-controlled** and is **not started**.

---

## B. Baseline SHA

| Item | Value |
|------|--------|
| **Certified reference baseline** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` |
| **HEAD at discovery** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` (matches certified) |
| **Working tree** | **Dirty** — pre-existing and ONDC-1 local edits; **no commit** in this phase |
| **Migrations** | Present through `00222`; **not applied** in this phase |

**ONDC-1 code touch (this pass only):**

- `packages/services/src/ondc/ondc-network-service.ts` — env merge, `ONDC_DISCOVERY_DOMAIN`, `PREPROD` → `PRE_PRODUCTION`
- `packages/services/src/ondc/__tests__/ondc-realtime.test.ts` — tests for above
- `.env.production.example` — commented `ONDC_DISCOVERY_DOMAIN` for RET14 pilot

**Pre-existing dirty (readiness-relevant, not authored in this pass):**

- `packages/services/src/factory/create-otp-services.ts` — `MockNetworkDiscoveryService` only when `VITEST=true` (mock not labeled ONDC)

---

## C. Architecture (as implemented — not as docs claim)

### C.1 Single engine, ONDC as adapter

```
Buyer RFQ / discovery request
  → CompositeDiscoveryService (local registry + optional test mock)
  → SupplierNetworkEngine.discoverCandidates()
       ├── Local registry (OTP_REGISTERED)
       ├── Google Places (separate network)
       ├── OndcNetworkAdapter → OndcSupplierProvider → OndcNetworkService
       └── Stub adapters (Direct/BNI/Association — gated)
```

- **Factory:** `createOtpServices()` wires `OndcNetworkAdapter` with `isLive: false`, `TruthfulProviderStatus.DISABLED_GATE`.
- **Order flow:** `OndcGatewayClient` implements `select` / `init` / `confirm` / `status` in code but **no product wiring** — **DEFERRED** per lock.

### C.2 Discovery path (when configured)

1. `OndcSupplierProvider.discover()` → `OndcNetworkService.broadcastRfqToOndc()` → signed `POST` to gateway `/search`.
2. Beckn `context.domain` from `resolveOndcSearchDomain()` — **RET14 pilot:** set `ONDC_DISCOVERY_DOMAIN=ONDC:RET14` or use category heuristics (`cctv` / `electronic` → `ONDC:RET14`).
3. Candidates only after `OndcBapReceiver.handleOnSearch()` → `listPendingCandidates(transactionId)` — **in-memory only**; synchronous discover after search typically yields **zero** until HTTP callback is wired.

### C.3 Not in repo (verified grep)

- `ondc-site-verification.html` on `apps/web`
- `/on_subscribe` handler
- Public HTTP route for `on_search` → `OndcBapReceiver`
- Registry `/subscribe` client

### C.4 RET14 vs OTP categories

- Pilot domain **`ONDC:RET14`** is a **registry / Beckn** lock for this phase.
- OTP RFQ categories remain multi-vertical; **do not** remap OTP taxonomy to RET14-only.
- Non-electronics RFQ strings still map via `mapCategoryToOndcDomain()` unless `ONDC_DISCOVERY_DOMAIN` overrides — operator must understand **search domain must match subscribe domain**.

---

## D. Gap register

| ID | Gap | Severity | Owner | Status |
|----|-----|----------|-------|--------|
| G-01 | NP portal whitelist for `otpplatform-theta.vercel.app` | **Blocker** | ONDC / operator | Open |
| G-02 | Ed25519 signing key pair + `unique_key_id` in registry | **Blocker** | Operator | Open (no keygen in repo) |
| G-03 | Registry subscribe (`domain`: `ONDC:RET14`, BAP `ops_no: 1`) | **Blocker** | ONDC / operator | Open |
| G-04 | `https://otpplatform-theta.vercel.app/ondc-site-verification.html` | **Blocker** | OTP deploy | Not implemented |
| G-05 | `on_subscribe` encryption challenge route | **Blocker** | OTP deploy | Not implemented |
| G-06 | Public `bap_uri` + `on_search` HTTP → `OndcBapReceiver` | **Blocker** | OTP deploy | Not implemented |
| G-07 | `OndcNetworkService` did not read `ONDC_*` env until ONDC-1 pass | Medium | OTP | **Mitigated** (env merge) |
| G-08 | `ONDC_ENVIRONMENT=PREPROD` vs client `PRE_PRODUCTION` | Medium | OTP | **Mitigated** (normalization) |
| G-09 | Category → domain heuristic uses `ONDC:B2B10` / `ONDC:SRV11` not on enabled-domains sheet | High (if used) | Product | Open — RET14 pilot should use `ONDC_DISCOVERY_DOMAIN` |
| G-10 | `OndcSupplierProvider` passes `city` as `std:${city}` (city name ≠ STD code) | High | OTP | Open — use official city sheet (`ONDC-0C-GEOGRAPHY-MATRIX`) |
| G-11 | `on_search` results in-memory only; no DB persistence | High | OTP | **Documented** — schema design needed; **no migration** in ONDC-1 |
| G-12 | `OndcNetworkAdapter.discover()` drops `lifecycleTier` / `provenanceLabel` from provider | Medium | OTP | Open |
| G-13 | `validate-prod-env.ts` omits `ONDC_UNIQUE_KEY_ID`, `ONDC_BAP_URI`, `ONDC_DISCOVERY_DOMAIN` | Low | OTP | Open |
| G-14 | Live gateway search / inventory in pilot PINs | **Unknown** | ONDC network | **NOT TESTED** — do not claim sellers |
| G-15 | Pre-prod E2E reference buyer is B2C Retail (`RET10`); RET14 clearance path | Medium | ONDC | **REQUIRES EXTERNAL CONFIRMATION** |
| G-16 | `ONDC_REGISTRY_URL` in `.env.production.example` — no registry client in repo | Low | OTP | Open |

---

## E. Security

| Topic | Finding |
|-------|---------|
| **Signing** | Outbound: `createOndcAuthHeader` (Ed25519) in `ondc-auth-crypto.ts`. Inbound: `OndcBapReceiver.verifyWebhook` with registry public key cache — **only if** HTTP route exists and verification not skipped. |
| **MOCK** | `skipSignatureVerification` when `environment === 'MOCK'` — must not be used for pre-prod pilot labels. |
| **Secrets** | `ONDC_SIGNING_PRIVATE_KEY_PEM` — env-only; **not generated** in this phase. |
| **Truthfulness** | `OndcIntegrationState.NOT_CONFIGURED` without subscriber + key; `UNAVAILABLE` on gateway failure; no fabricated ONDC sellers in adapter tests. |
| **Mock network** | `MockNetworkDiscoveryService` returns `source: 'OTHER'`, not ONDC; gated to `VITEST=true` in current factory diff. |
| **Production** | ONDC remains opt-in via `ONDC_ENABLED=true`; default off in `.env.production.example`. |

---

## F. Provenance

| Tier | Code signal | Buyer label | Rules |
|------|-------------|-------------|-------|
| **ONDC_DISCOVERED** | `OndcSupplierProvider` → `lifecycleTier: 'ONDC_DISCOVERED'`, `provenanceLabel: Network suppliers` | Network suppliers | From `on_search` only when configured |
| **OTP_REGISTERED** | Local registry / `OtpSupplierProvider` | OTP Verified | Internal qualification |
| **GST_VERIFIED** | Separate statutory flows | (internal) | **Never** implied by ONDC hit |

**Mandatory:** ONDC discovery **must not** auto-promote to OTP verified or GST verified. `OndcNetworkAdapter` adds `matchReasons` including `provenance:ONDC_SELLER` and `ondc_state:*`.

---

## G. External actions required (do not simulate)

1. **ONDC portal:** Request pre-production access; whitelist **`otpplatform-theta.vercel.app`** (or formally change `subscriber_id` and amend product lock).
2. **DNS / TLS:** Valid certificate on subscriber FQDN for OCSP checks at subscribe.
3. **Keys:** Generate Ed25519 keypair **outside** repo; register `unique_key_id` with ONDC.
4. **Subscribe payload:** `domain` = **`ONDC:RET14`**, role Buyer App, `subscriber_id`, `callback_url` segment matching deployed routes.
5. **Deploy on theta:** `ondc-site-verification.html`, `/on_subscribe`, HTTPS `bap_uri` base for Beckn callbacks.
6. **Gateway:** Confirm pre-prod gateway URL (`https://preprod.gateway.ondc.org`) and whitelist ACK.
7. **ONDC support:** Confirm whether RET14 BAP can obtain pre-prod sign-off with **discovery-only** scope (vs full reference-app E2E on `RET10`).
8. **Geography:** Map pilot PINs to `std:*` via [City and State Codes spreadsheet](https://docs.google.com/spreadsheets/d/12A_B-nDtvxyFh_FWDfp85ss2qpb65kZ7/edit?usp=sharing); Bhavani Beckn city **not resolved** in ONDC-0D.

Until G-01–G-06 complete, status remains **BLOCKED_EXTERNAL_ONDC_ACTION**.

---

## H. Minimal plan (remaining — post ONDC-1 doc)

| Step | Action | Migration? |
|------|--------|------------|
| H-1 | Operator completes G-01–G-06 | No |
| H-2 | Set env: `ONDC_ENABLED=true`, `ONDC_ENVIRONMENT=PREPROD`, `ONDC_SUBSCRIBER_ID=otpplatform-theta.vercel.app`, keys, `ONDC_BAP_URI`, `ONDC_GATEWAY_URL`, `ONDC_DISCOVERY_DOMAIN=ONDC:RET14` | No |
| H-3 | Implement Beckn HTTP routes on web/API host (paths locked at subscribe time) | No DB if in-memory soak only |
| H-4 | Fix city → `std:` mapping using official sheet | No |
| H-5 | Persist `on_search` / transaction correlation | **Yes — design migration; do not apply without gate** |
| H-6 | Wire `lifecycleTier` through `OndcNetworkAdapter` to SNE normalized model | No |
| H-7 | Soak: expect `NO_RESULTS` until BPPs respond; never backfill fake sellers | No |

**Explicitly out of scope:** wallet W1–W10, R2-31 issuance, procurement state machine rewrite, `select`/`init`/`confirm`, production deploy.

---

## I. Test plan

| Test | Result (2026-09-29) |
|------|---------------------|
| `packages/services/src/discovery/networks/ondc-network-adapter.test.ts` | **PASS** |
| `packages/services/src/discovery/supplier-network-providers/supplier-network-providers.test.ts` | **PASS** |
| `packages/services/src/ondc/__tests__/ondc-realtime.test.ts` | **PASS** (incl. RET14 domain override + env merge) |
| `pnpm run build` (web) | **PASS** |
| Live pre-prod gateway `search` | **NOT RUN** (blocked — no credentials / whitelist) |
| E2E buyer discovery with real `on_search` | **NOT RUN** |

---

## J. Production impact

| Question | Answer |
|----------|--------|
| **Was production changed?** | **NO** |
| **Was production deployed?** | **NO** |
| **Were production secrets or keys added?** | **NO** |
| **Database / migrations applied?** | **NO** |

Local / workspace code and documentation only.

---

## K. Certification gate

| # | Criterion | Met? |
|---|-----------|------|
| 1 | Buyer App (BAP) role only | **YES** (code + lock) |
| 2 | Discovery-only scope; order flow deferred | **YES** |
| 3 | Single SNE; ONDC adapter boundary only | **YES** |
| 4 | RET14 selected for **this** ONDC-1 pilot | **YES** (product lock) |
| 5 | RET14 on enabled-domains Pre-Prod sheet | **YES** (ONDC-0C export) |
| 6 | `subscriber_id` registered on ONDC | **NO** |
| 7 | Site verification + `on_subscribe` live | **NO** |
| 8 | Signed gateway search + `on_search` E2E | **NO** |
| 9 | Pilot geography seller presence proven | **NO** |
| 10 | R2-31 / wallet invariants untouched | **YES** |
| 11 | No fake ONDC sellers in adapter path | **YES** |
| 12 | ONDC-1 “complete” / RET14 works E2E | **NO** |

**Gate outcome:** **FAIL** — external ONDC actions and HTTP compliance surfaces required before any “ready for pre-prod traffic” claim.

---

## Stop statement

**Production changed: NO. ONDC integration complete: NO. RET14 E2E: NO. ONDC-1 complete: NO. STOP. Do not deploy.**
