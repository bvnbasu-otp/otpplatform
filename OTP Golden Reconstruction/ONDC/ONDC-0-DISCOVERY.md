# ONDC-0 — Read-Only Forensic Discovery

**Workspace:** `G:\My Drive\otp`  
**Discovery date:** 2026-09-29  
**Scope:** Read-only repo + official ONDC sources + allowed HTTPS GET of fixed OTP FQDN  
**Certified baseline (verify, do not assume):** `9cb4a037418893cbaf5c90b9f108884d32a1601b` — `feat(r2-31): finalize document ledger reporting engine`

---

## 1. Git & deployment surface (read-only)

| Item | Actual value |
|------|----------------|
| **HEAD** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` |
| **HEAD message** | `feat(r2-31): finalize document ledger reporting engine` |
| **Branch** | `main` (tracks `origin/main`) |
| **origin/main** | `9cb4a037418893cbaf5c90b9f108884d32a1601b` (same as HEAD) |
| **Baseline match** | **YES** — HEAD equals certified hash |
| **Working tree** | **Dirty** — modified: `OTP Golden Reconstruction/R2-31/R2-31-PRODUCTION-RELEASE-CERTIFICATION-2026-09-29.md`, `apps/web/src/features/site/components/SiteHeader.tsx`, `apps/web/src/features/site/components/SiteLayout.tsx`; numerous untracked files under `OTP Golden Reconstruction/`, `.vitest/`, and `scripts/*` (no clean/reset performed) |
| **Fixed OTP FQDN (marketing/host)** | `otpplatform-theta.vercel.app` |
| **subscriber_id / BAP id / participant id** | **UNKNOWN** — not established by repo or official mapping from theta FQDN; env example uses placeholder `bap.yourdomain.com` (see `.env.production.example`, redacted below) |

### Migrations present through `00222`

Confirmed files include (non-exhaustive tail): `00220_supplier_wallet_ledger_events.sql`, `00221_otp_referral_bonus_profile_matrix.sql`, `00222_otp_document_issuance_snapshots.sql` under `supabase/migrations/` (222 migration files in tree). **Not applied** in this discovery.

---

## 2. HTTPS check — `https://otpplatform-theta.vercel.app`

| Check | Result |
|-------|--------|
| HTTP GET | **200** (Server: Vercel) |
| TLS (local probe) | Certificate presented as `CN=*.vercel.app` via **Zscaler** corporate intercept (`Issuer: Zscaler Intermediate Root CA`). **Not** a direct end-to-end leaf observation of `otpplatform-theta.vercel.app` from this environment. |
| Protocol compliance | **NOT ESTABLISHED** — HTTP 200 alone is insufficient for ONDC registry OCSP/domain checks on a chosen **subscriber_id** FQDN. |

---

## 3. Repo search map — ONDC / Beckn / BAP / registry

### 3.1 ONDC integration package (protocol client + receiver)

| Path | Purpose |
|------|---------|
| `packages/services/src/ondc/ondc-network-service.ts` | BAP-side orchestration: `mapCategoryToOndcDomain`, `broadcastRfqToOndc` → gateway `/search` |
| `packages/services/src/ondc/client/ondc-gateway-client.ts` | Signed Beckn context, gateway URLs (staging/preprod/prod), `search` POST |
| `packages/services/src/ondc/receiver/ondc-bap-receiver.ts` | In-memory `on_search` ingestion, ACK/NACK, optional Ed25519 verify |
| `packages/services/src/ondc/crypto/ondc-auth-crypto.ts` | Ed25519 auth header create/verify (tests) |
| `packages/services/src/ondc/crypto/ondc-key-cache.ts` | Registry public key cache hook |
| `packages/services/src/ondc/types/ondc-beckn.ts` | Beckn payload types |
| `packages/services/src/ondc/__tests__/ondc-realtime.test.ts` | Crypto + receiver normalization tests |

**Not found in repo (grep):** `on_subscribe`, `ondc-site-verification.html`, registry `/subscribe` caller, deployed `/ondc/bap` HTTP routes in `apps/web`.

### 3.2 Supplier Network Engine (SNE) — ONDC as provider

| Path | Purpose |
|------|---------|
| `packages/services/src/discovery/supplier-network-engine.ts` | **Entry:** `discoverCandidates` — parallel providers, normalize, rank, cache, anti-leak |
| `packages/services/src/interfaces/supplier-network-port.ts` | **Adapter interface:** `SupplierNetworkPort.discover()` |
| `packages/services/src/discovery/networks/ondc-network-adapter.ts` | **ONDC adapter:** wraps `OndcSupplierProvider`; `NOT_CONFIGURED` → empty candidates |
| `packages/services/src/discovery/supplier-network-providers/ondc-supplier-provider.ts` | **Provider boundary:** `SupplierNetworkProvider`; no fixture sellers |
| `packages/services/src/discovery/networks/supplier-network-adapters.ts` | Registry of adapters (OTP, Google, ONDC, stubs) |
| `packages/services/src/factory/create-otp-services.ts` | Wires `OndcNetworkAdapter` into SNE with `DISABLED_GATE` / `isLive: false` |
| `packages/domain/src/enums/supplier-discovery-source.ts` | Provenance labels + `OndcIntegrationState` incl. `NOT_CONFIGURED` |
| `packages/domain/src/types/supplier-network-provider.ts` | Normalized discovery model + buyer count buckets |

### 3.3 Parallel provider engine (not factory-wired to web)

| Path | Purpose |
|------|---------|
| `packages/services/src/discovery/supplier-network-providers/supplier-network-provider-engine.ts` | Merge/dedup across `SupplierNetworkProvider` (OTP / ONDC / Google) |
| `packages/services/src/discovery/supplier-network-providers/supplier-network-providers.test.ts` | Provenance + `NOT_CONFIGURED` no-fake-seller tests |

### 3.4 Legacy / composite discovery path (RFQ service)

| Path | Purpose |
|------|---------|
| `packages/services/src/discovery/composite-discovery-service.ts` | Merges discovery services; optional SNE engine reference |
| `packages/services/src/discovery/mock-network-discovery-service.ts` | **Mock** external network row (not ONDC-specific) |
| `packages/services/src/factory/create-otp-services.ts` | `RFQService` uses `CompositeDiscoveryService` with `MockNetworkDiscoveryService` + local registry |
| `packages/services/src/services/managed-supplier-network-service.ts` | Refresh, quota, provenance persistence for managed network |

### 3.5 UI / product truth

| Path | Note |
|------|------|
| `apps/web/src/features/site/content/site-content.ts` | States ONDC/BNI **planned, not live** |
| `apps/web/src/features/requirement/pages/DiscoverSuppliersPage.tsx` | ONDC filter label in UI |
| `apps/web/src/features/admin/*` | `ondcGateway: 'ONLINE'` — **operational placeholder**, not registry proof |

### 3.6 Database

| Path | Note |
|------|------|
| `supabase/migrations/00001_enums.sql` | `ONDC` in supplier network enum |
| `supabase/migrations/00110_supplier_network_stub_toggle.sql` | Stub toggle ties pilot simulation to real dispatch |
| Various seeds | Pilot suppliers tagged `ONDC` — **seed data**, not live network |

### 3.7 Environment example (secrets redacted)

From `.env.production.example` (placeholders only):

```
ONDC_ENABLED=false
ONDC_ENVIRONMENT=PROD
ONDC_SUBSCRIBER_ID=bap.yourdomain.com
ONDC_UNIQUE_KEY_ID=key-01
ONDC_BAP_URI=https://api.yourdomain.com/ondc/bap
ONDC_SIGNING_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----"
ONDC_GATEWAY_URL=https://prod.gateway.ondc.org
ONDC_REGISTRY_URL=https://prod.registry.ondc.org
```

---

## 4. Supplier Network Engine — end-to-end map

```mermaid
flowchart LR
  subgraph entry [Entry points]
    SNE[SupplierNetworkEngine.discoverCandidates]
    SNPE[SupplierNetworkProviderEngine.discover]
    CDS[CompositeDiscoveryService.discover]
  end
  subgraph adapters [Source abstraction]
    PORT[SupplierNetworkPort]
    PROV[SupplierNetworkProvider]
  end
  subgraph sources [Providers]
    OTP[OTP registry / LocalRegistry]
    GGL[Google Places]
    ONDC[OndcNetworkAdapter / OndcSupplierProvider]
    STUB[BNI / Association / Direct stubs]
  end
  subgraph otp_core [OTP procurement — unchanged by discovery]
    RFQ[RFQ publish]
    QUOTE[Quotes / blind evaluation]
    AWARD[Award / PO]
  end
  SNE --> PORT
  SNPE --> PROV
  PORT --> OTP
  PORT --> GGL
  PORT --> ONDC
  PORT --> STUB
  PROV --> OTP
  PROV --> GGL
  PROV --> ONDC
  CDS --> SNE
  CDS --> LocalRegistry
  CDS --> MockNetwork
  RFQ --> CDS
  SNE --> Norm[Normalize + dedup + rank + Crockford alias]
  Norm --> Qual[OTP qualification / lifecycle tiers]
  Qual --> RFQ
```

| Stage | Location | Behavior |
|-------|----------|----------|
| **Entry (canonical SNE)** | `supplier-network-engine.ts` → `discoverCandidates` | Parallel adapter dispatch, circuit breaker, 30-day cache |
| **Source abstraction** | `SupplierNetworkPort`, `SupplierNetworkProvider` | Two parallel interfaces; ONDC implements both via adapter + provider |
| **Normalization** | SNE `normalizeAndDeduplicate`; SNPE `strongIdKey` merge | GSTIN, ONDC provider id, place id, phone, domain |
| **Provenance labels** | `supplier-discovery-source.ts` | OTP Verified / Network suppliers (ONDC) / Local businesses (Google) |
| **Qualification** | Lifecycle tiers in `NormalizedDiscoverySupplier`; SNE anti-leak | `ONDC_DISCOVERED` does not auto-upgrade to OTP_VERIFIED |
| **Persistence** | SNE in-memory cache; `ManagedSupplierNetworkService` + DB observations | ONDC callbacks **not persisted** (`OndcBapReceiver` in-memory map) |
| **Ranking** | `matchScore` sort in SNE; composite by max matchScore | ONDC adapter currently sets `matchScore: 0` in port wrapper |
| **Path to quote/award/PO** | `create-otp-services.ts`: `RFQService(repos, audit, discoveryInner)` | Discovery feeds RFQ invitation pool; award/PO remain internal OTP services |

---

## 5. Can ONDC be an adapter without a second engine?

**Answer: PARTIAL**

| Boundary | Interface | Evidence |
|----------|-----------|----------|
| **Intended adapter surface** | `SupplierNetworkPort` + `OndcNetworkAdapter` | Registered on existing `SupplierNetworkEngine` in `create-otp-services.ts` |
| **Secondary surface** | `SupplierNetworkProvider` + `OndcSupplierProvider` | Same ONDC stack; used in tests / future merge path, **not** wired in `createOtpServices` factory |
| **Separate protocol stack** | `OndcNetworkService`, `OndcGatewayClient`, `OndcBapReceiver` | Required Beckn BAP client/receiver — **adapter layer**, not a second discovery engine |
| **Gap** | `CompositeDiscoveryService` still includes `MockNetworkDiscoveryService`; `DirectNetworkAdapter` stub returns synthetic rows | Does not require a second engine but **conflicts with truthful ONDC pilot** until removed/gated |

**Exact interface boundary for ONDC-1 work:** implement/configure `OndcSupplierProvider` / `OndcNetworkAdapter` behind `SupplierNetworkPort.discover()` and expose Beckn HTTP callbacks to `OndcBapReceiver` — **without** replacing `SupplierNetworkEngine`.

---

## 6. OTP role inference (behavior-based)

| Inference | Status |
|-----------|--------|
| Buyer-initiated requirement → discovery → RFQ | **Buyer App (BAP)** candidate — `OndcGatewayClient` sets `bap_id`, issues `search` |
| Seller NP / Gateway / TSP | **NOT** primary OTP behavior in code |
| **subscriber_id for registry** | **UNKNOWN** (must be NP FQDN per official onboarding, not automatically `otpplatform-theta.vercel.app`) |

---

## 7. Discrepancies — official ONDC vs OTP assumptions

| Topic | OTP repo | Official ONDC | Winner |
|-------|----------|---------------|--------|
| Staging registry | Client still lists `staging.gateway.ondc.org` | Onboarding doc: staging registry **decommissioned** | **Official** |
| Default `bap_uri` | `https://api.otp.in/ondc/bap` in `ondc-network-service.ts` | Must match registered subscriber FQDN + callback paths | **Official** (OTP placeholder) |
| Domain per category | Heuristic `ONDC:B2B10`, `ONDC:SRV11`, etc. | Subscribe payload requires explicit domain(s); B2B retail RFQ in RET specs | **Product decision** + official domain catalog |
| Site marketing | “ONDC not live” | N/A | Product truth vs integration state |

---

## 8. Repository / database / deployment changed

**NO** — only ONDC-0 markdown artifacts written under `OTP Golden Reconstruction/ONDC/`.
