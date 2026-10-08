# OTP Pre-Production External Integration Certification

**Date:** 2026-09-29  
**Git HEAD (verified):** `9cb4a037418893cbaf5c90b9f108884d32a1601b`  
**Assessment type:** Pre-prod external integration readiness (ONDC + Google/GIS + SNE truth)

---

## Final result

**CONDITIONALLY CERTIFIED — EXTERNAL ACTION REQUIRED**

OTP preserves the **Supplier Network Engine** with honest **ONDC `NOT_CONFIGURED` → zero candidates** behavior and Google **credential-gated** discovery. Pre-production **ONDC network participation** and **live Google API** calls cannot be certified until product decisions, registry onboarding, and secrets are supplied. A small **mock-network gating** fix aligns RFQ composite discovery with documented test-only intent.

---

## Architecture map (summary)

| Path | Purpose | ONDC labeled? |
|------|---------|----------------|
| `SupplierNetworkEngine` | Canonical multi-network orchestration, GIS distance, anti-leak | ONDC only via `OndcNetworkAdapter` when enabled + configured |
| `CompositeDiscoveryService` | Legacy RFQ `discoverAndInvite` | **No** — local registry; mock only under Vitest |
| `SupplierNetworkProviderEngine` | Alternate aggregate (OTP + ONDC + Google providers) | ONDC via `OndcSupplierProvider` only |
| `ProviderNeutralLocationIntelligence` | Haversine / PIN / city | Never Google |

Full diagram: `OTP-PREPROD-INTEGRATION-DISCOVERY-2026-09-29.md`.

---

## ONDC status

| Check | Result |
|-------|--------|
| ONDC suppliers invented | **NO** |
| `NOT_CONFIGURED` returns zero candidates | **YES** (verified by unit tests) |
| `ONDC_ENABLED=true` without keys | `NOT_CONFIGURED`, empty discover |
| Registry subscribe / `on_subscribe` / site verification in repo | **NO** |
| Env vars documented | `ONDC_ENABLED`, `ONDC_ENVIRONMENT`, `ONDC_SUBSCRIBER_ID`, `ONDC_UNIQUE_KEY_ID`, `ONDC_BAP_URI`, `ONDC_SIGNING_PRIVATE_KEY_PEM`, `ONDC_GATEWAY_URL`, `ONDC_REGISTRY_URL` |
| Env vars wired to factory client | **PARTIAL** — manual ctor options only; **CONFIG GAP** |
| Product subscriber_id | **UNKNOWN** (not theta Vercel hostname by default) |
| ONDC domain for registry | **NOT IDENTIFIED** (ONDC-0 BLOCKED_PRODUCT_DECISION) |
| Live theta ONDC verification URL | SPA fallback HTML, **not** registry file |
| Pre-prod gateway callable from this shell | **NO** (no signing material) |

---

## Google / GIS status

| Check | Result |
|-------|--------|
| Google working (live API observed) | **NO** in this shell (keys unset) |
| Missing key behavior | CREDENTIAL_GATED / fallback ladder / Haversine offline |
| Google claimed when Haversine used | **NO** — `calculationMethod` on SNE `locationMatch` |
| Env names | `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_DAILY_LIMIT` |
| Founder operational UI | `GooglePlacesOperationalCard` (visibility; not live key proof) |

---

## Supplier Network Engine regression evidence

- **Not replaced or rewritten.**
- Existing suites pass: `supplier-network-engine.test.ts`, `supplier-network-redteam.test.ts`, `ondc-network-adapter.test.ts`.
- Factory still constructs the same `SupplierNetworkEngine` provider list (`OndcNetworkAdapter` remains `DISABLED_GATE` / `isLive: false` unless `ONDC_ENABLED`).

---

## Files changed (local only)

| File | Change |
|------|--------|
| `packages/services/src/factory/create-otp-services.ts` | Gate `MockNetworkDiscoveryService` to `VITEST=true` |
| `packages/services/src/discovery/composite-discovery-service.test.ts` | **Added** — mock not ONDC; pre-prod composite shape |

**Migrations created:** **None**

---

## Build & tests (this session)

| Command | Result |
|---------|--------|
| Targeted vitest (ONDC NOT_CONFIGURED, GIS fallback, composite) | **30 passed** (5 files) |
| `pnpm run build` | **Success** |

---

## Config gaps

1. **PRODUCT DECISION:** BAP `ONDC_SUBSCRIBER_ID` FQDN; ONDC domain code(s); callback host vs `otpplatform-theta.vercel.app`.  
2. **ONDC EXTERNAL:** NP whitelist, subscribe, signing keys, deployed verification + callbacks.  
3. **OTP WIRING:** Load documented ONDC env into `OndcNetworkService` without inventing values (future task).  
4. **GOOGLE CREDENTIAL GAP:** API key + quota for pre-prod Places.  
5. **RFQ path:** `CompositeDiscoveryService` still does not invoke SNE on `discover()` (engine option unused) — discovery-only ONDC/Google for RFQ invite flow remains engine-independent; acceptable for this certification scope but limits end-to-end ONDC via RFQ until wired.

---

## External actions (ordered)

1. Product sign-off on BAP role, subscriber_id, domains, pilot categories/geography.  
2. ONDC registry onboarding (whitelist, keys, site verification, `on_subscribe`).  
3. Set server env (names above) on pre-prod host; **do not** commit secrets.  
4. Google API key restriction + quota monitoring.  
5. Implement and deploy public Beckn BAP routes + receiver persistence (separate delivery).

---

## Explicit attestations

| Statement | Value |
|-----------|--------|
| ONDC suppliers invented | **NO** |
| Supplier Network Engine replaced | **NO** |
| Wallet / R2-31 / ONDC crypto keys generated | **NO** |
| Commit / push / deploy | **NO** |
| ONDC registration performed | **NO** |
| Browser MCP black-box | **NOT RUN** (curl black-box only for theta) |

---

## Certification rationale

**Not** `CERTIFIED — PRE-PROD READY` because ONDC network integration requires unresolved product decisions and ONDC-controlled registry steps, and Google live API was not observed.

**Not** `NOT CERTIFIED — IMPLEMENTATION GAP` for ONDC truthfulness core: adapters already fail closed; this session closed the composite mock pilot-truth gap without touching SNE economics or procurement state.

**Conditional** certification: codebase is **safe to run in pre-prod** regarding ONDC labeling (no fake network sellers); **external configuration and registry work** block declaring ONDC/Google **live** on the network.
