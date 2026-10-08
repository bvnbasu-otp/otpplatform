# OTP Pre-Production External Integration Discovery

**Date:** 2026-09-29  
**Git HEAD (verified):** `9cb4a037418893cbaf5c90b9f108884d32a1601b`  
**Working tree:** Dirty (SiteHeader, SiteLayout, R2-31 cert note, untracked Golden Reconstruction artifacts). No unrelated files reverted.  
**Scope:** Read-only discovery + minimal truthful-status fix for `MockNetworkDiscoveryService` in factory wiring.  
**Prior gate:** `OTP Golden Reconstruction/ONDC/ONDC-0-GATE-DECISION.md` — **BLOCKED_PRODUCT_DECISION** (Buyer App BAP; subscriber_id / ONDC domain not chosen).

---

## Architecture map (distinguishable sources)

```
Buyer RFQ / requirement
  ├─ Legacy path: CompositeDiscoveryService
  │     ├─ LocalRegistryDiscoveryService (OTP verified registry DB)
  │     └─ MockNetworkDiscoveryService (test harness only after fix; source=OTHER, never ONDC)
  │
  └─ Supplier Network Engine (SNE) — preserved, not replaced
        ├─ createLocalRegistryNetworkAdapter → OTP registry
        ├─ GooglePlacesNetworkAdapter → Google Places (discovery only)
        ├─ OndcNetworkAdapter → OndcSupplierProvider → OndcNetworkService / OndcGatewayClient
        ├─ DirectNetworkAdapter (stub simulation, truthfulStatus LIVE_ACTIVE in factory — pilot caveat)
        └─ BNI / Association (stub, DISABLED_GATE)

Parallel (not factory-wired to web RFQ): SupplierNetworkProviderEngine
  ├─ OtpSupplierProvider
  ├─ OndcSupplierProvider
  └─ GoogleDiscoveryProvider

Location intelligence (not ONDC):
  ├─ ProviderNeutralLocationIntelligence (Haversine, PIN, city — calculationMethod on candidates)
  └─ GoogleMapsLocationAdapter / GooglePlacesDiscoveryAdapter (credential-gated LIVE_API + fallback ladder)
```

**ONDC crypto / protocol (library only):** `packages/services/src/ondc/` — `OndcGatewayClient`, `OndcBapReceiver`, `ondc-auth-crypto`. No deployed `/on_subscribe`, no registry subscribe caller, no HTTP Beckn callback routes in `apps/web`.

---

## Integration inventory

| Integration | Code entry | Config (env names) | Secret required | Pre-prod endpoint | Callable from this shell | Status |
|-------------|------------|-------------------|-----------------|-------------------|--------------------------|--------|
| **ONDC BAP search** | `OndcGatewayClient.search` via `OndcSupplierProvider` / `OndcNetworkAdapter` | `ONDC_ENABLED`, `ONDC_ENVIRONMENT`, `ONDC_SUBSCRIBER_ID`, `ONDC_UNIQUE_KEY_ID`, `ONDC_BAP_URI`, `ONDC_SIGNING_PRIVATE_KEY_PEM`, `ONDC_GATEWAY_URL`, `ONDC_REGISTRY_URL` (documented in `.env.production.example`; **runtime factory does not load PEM/subscriber from env** — client only if ctor options pass `subscriberId` + `signingPrivateKeyPem`) | Ed25519 signing key PEM, registry whitelist | `https://preprod.gateway.ondc.org` (client default `PRE_PRODUCTION`) | **NO** — keys unset; `OndcNetworkService.getClient()` null | **Implemented / NOT_CONFIGURED** — zero candidates when flag true but no keys |
| **ONDC on_search ingest** | `OndcBapReceiver` (in-memory) | Same + public HTTPS BAP URI (not deployed) | Verify keys from registry | N/A (no public route) | **NO** | **Implemented locally / not reachable** |
| **ONDC registry subscribe** | Not in repo | Product subscriber_id FQDN + domain codes | Registry challenge keys | ONDC NP portal | **NO** | **Not implemented** — PRODUCT DECISION GAP |
| **Supplier Network Engine** | `SupplierNetworkEngine.discoverCandidates` | Wired in `create-otp-services.ts` | Per-adapter | N/A (in-process) | **YES** (unit tests) | **Functional** — ONDC adapter DISABLED_GATE unless `ONDC_ENABLED=true`; still NOT_CONFIGURED without keys |
| **Legacy composite RFQ discovery** | `RFQService.discoverAndInvite` → `CompositeDiscoveryService` | None for mock (now `VITEST=true` only) | None | N/A | **YES** | **Functional** for local registry; mock gated off pre-prod |
| **Google Places discovery** | `GooglePlacesDiscoveryAdapter`, `GoogleDiscoveryProvider` | `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_DAILY_LIMIT` | Google API key | `https://maps.googleapis.com/maps/api/place/textsearch/json` | **NO** — keys unset in shell | **Implemented / CREDENTIAL_GATED** — fallback ladder (cache → static reference → UNAVAILABLE) |
| **Google Maps location** | `GoogleMapsLocationAdapter` | `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY` | API key | Google Maps APIs | **NO** | **Implemented / offline Haversine when no key** |
| **Haversine / PIN / city** | `ProviderNeutralLocationIntelligence` | None | None | Offline | **YES** | **Functional** — `calculationMethod`: `HAVERSINE_COORDINATES`, `POSTAL_PIN_EXACT`, `CITY_MATCH`, etc. |
| **Deployed web (theta)** | `https://otpplatform-theta.vercel.app` | Vercel + Supabase (not inspected) | Hosted secrets unknown | Vercel edge | **Partial** — HTTP 200 HTML shell | **Live app** — not evidence of ONDC/Google backend calls from this audit |

---

## ONDC status (truth)

| Layer | State |
|-------|--------|
| Role | Buyer App (BAP) — per ONDC-0 |
| `ONDC_ENABLED` default | Off; only exact string `true` enables adapter |
| Integration state without keys | `NOT_CONFIGURED` → **0 candidates** (tests: `ondc-network-adapter.test.ts`, `supplier-network-providers.test.ts`) |
| `subscriber_id` | **UNKNOWN** — not `otpplatform-theta.vercel.app` by default |
| ONDC domain for registry | **NOT product-selected** (code heuristics: `mapCategoryToOndcDomain`) |
| Mock / fake ONDC sellers | **NO** in ONDC provider path |
| Live site `ondc-site-verification.html` | HTTP 200 returns **SPA `index.html`** (Vercel fallback), not registry verification file |

---

## Google / GIS status (truth)

| Layer | State |
|-------|--------|
| Discovery vs location | Google = **discovery** (`GOOGLE_DISCOVERY` / `GOOGLE_PLACES` network); distance in SNE uses **ProviderNeutralLocationIntelligence** unless Maps adapter used elsewhere |
| Missing API key | `TruthfulProviderStatus.CREDENTIAL_GATED`; no LIVE_API claim |
| Fallback | Static reference directory for pilot PIN 560048 when ladder allows — labeled via `sourceType` / provenance, not OTP verified |
| Shell credentials | `GOOGLE_PLACES_API_KEY` / `GOOGLE_MAPS_API_KEY` **unset** — CREDENTIAL GAP for live Google calls |

---

## Config gaps (names only)

**ONDC (external + wiring):**

- Product: `ONDC_SUBSCRIBER_ID`, Beckn `ONDC_BAP_URI` host, ONDC domain code(s) for subscribe
- Secrets: `ONDC_SIGNING_PRIVATE_KEY_PEM`, registry whitelist (ONDC-controlled)
- Flags: `ONDC_ENABLED=true`, `ONDC_ENVIRONMENT` (PREPROD / PRE_PRODUCTION alignment)
- **Implementation gap:** documented env vars are not automatically bound into `OndcNetworkService` in `create-otp-services.ts` (constructor injection only today)

**Google:**

- `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY`
- Optional quota: `GOOGLE_PLACES_DAILY_LIMIT`

---

## Pilot truth bug addressed (minimal code)

**Finding:** `create-otp-services.ts` always registered `MockNetworkDiscoveryService` on the RFQ composite path while ONDC-0 / R2-28 classified it test-only — risk of synthetic `mock-network-*` invitations alongside real registry (source `OTHER`, not ONDC, but misleading for pre-prod).

**Change:** Include `MockNetworkDiscoveryService` only when `process.env.VITEST === 'true'`. SNE unchanged.

---

## External actions required (no OTP execution)

1. Product lock **subscriber_id FQDN** and **ONDC domain** registration set.  
2. ONDC NP whitelist + subscribe + site verification + `on_subscribe` on chosen host.  
3. Provision signing key material and configure server env (no generation in this task).  
4. Google Cloud Places/Maps API key + quota for pre-prod.  
5. Deploy Beckn callback routes and wire `OndcBapReceiver` persistence (future; not done here).

---

## Migrations

**None created.** Existing through `00222` not applied in this task.

---

## Black-box live site

- **Browser MCP:** NOT RUN (no browser tab available).  
- **curl.exe:** `https://otpplatform-theta.vercel.app` → 200 HTML; CSP allows `https://*.ondc.org` connect-src (deployed bundle policy only).

---

## Tests referenced

- `packages/services/src/discovery/networks/ondc-network-adapter.test.ts`
- `packages/services/src/discovery/supplier-network-providers/supplier-network-providers.test.ts`
- `packages/services/src/gis/google-maps-location-adapter.test.ts`
- `packages/services/src/gis/google-places-pilot-activation.test.ts`
- `packages/services/src/discovery/supplier-network-engine.test.ts` (SNE regression)
- **Added:** `packages/services/src/discovery/composite-discovery-service.test.ts`
