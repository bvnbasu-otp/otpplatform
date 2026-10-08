# ONDC-0 — Supplier Network Engine Compatibility

**Default aim:** external ONDC as **adapter**, not a second discovery engine or procurement redesign.

---

## 1. Compatibility verdict

| Verdict | **MINOR ADAPTER** (with **INTERFACE GAP** for HTTP/registry) |
|---------|----------------------------------------------------------------|

| Dimension | Classification | Rationale |
|-----------|----------------|-----------|
| Architectural fit | **DIRECT ADAPTER** at `SupplierNetworkPort` | `OndcNetworkAdapter` registered on `SupplierNetworkEngine` |
| Production wiring | **INTERFACE GAP** | No `on_subscribe`, no public BAP routes, `OndcBapReceiver` in-memory only |
| Parallel abstractions | **MINOR ADAPTER** | `SupplierNetworkProvider` + `SupplierNetworkProviderEngine` duplicate merge logic — not second engine but dual interface |
| Legacy composite path | **INTERFACE GAP** | `RFQService` still uses `CompositeDiscoveryService` + `MockNetworkDiscoveryService` |
| Truth / frozen invariants | **PRESERVED** if ONDC stays discovery-only | SNE invariants: no award authority, anti-leak aliases, no fake ONDC when `NOT_CONFIGURED` |
| Stub adapters | **ARCHITECTURAL CONFLICT risk** | `DirectNetworkAdapter` / BNI / Association stubs return synthetic matches; ONDC adapter explicitly does not |

**Can ONDC be an adapter without a second engine?** **PARTIAL YES** — use existing `SupplierNetworkEngine` + `OndcNetworkAdapter`; complete Beckn HTTP + registry outside engine.

---

## 2. Interface boundary (exact)

```
EngineDiscoveryRequest
  → SupplierNetworkEngine.discoverCandidates()
    → SupplierNetworkPort.discover()  [OndcNetworkAdapter]
      → OndcSupplierProvider.discover()
        → OndcNetworkService.broadcastRfqToOndc()  [signed search]
        → OndcBapReceiver.listPendingCandidates(txId)  [on_search ingestion]
    → normalizeAndDeduplicate + rank + cache
  → (downstream) RFQ invitations / OTP qualification — not in ONDC package
```

**Out of scope for adapter (remain OTP-internal):** quote evaluation, blind comparison, award, PO, wallet (00220–00221), document ledger (00222).

---

## 3. Provenance & labeling compatibility

| Source | `SupplierDiscoverySourceKind` | Buyer label | SNE `SupplierNetwork` enum |
|--------|------------------------------|-------------|----------------------------|
| OTP registry | `OTP_SUPPLIER` | OTP Verified | `LOCAL_REGISTRY` / OTP paths |
| Google | `GOOGLE_DISCOVERY` | Local businesses | via `GooglePlacesNetworkAdapter` |
| ONDC | `ONDC_SELLER` | Network suppliers | `ONDC` |
| Lifecycle | `ONDC_DISCOVERED` tier | Does not imply OTP Verified | Matches frozen qualification |

---

## 4. Persistence & ranking

| Concern | Current state | ONDC impact |
|---------|---------------|-------------|
| Discovery cache | 30-day in-memory (`supplier-network-engine.ts`) | ONDC results cached like other providers unless disabled |
| Managed network DB | `ManagedSupplierNetworkService` observations | No ONDC-specific schema; **MINIMAL LIKELY** if persisting BPP refs |
| Ranking | `matchScore` sort; ONDC port wrapper uses `0` | **MINOR ADAPTER** tuning needed for fair ranking vs OTP Verified |
| Callback storage | In-memory `searchResultsByTransaction` | **DESIGN REQUIRED** for production resilience (not implemented in ONDC-0) |

---

## 5. Database change classification (ONDC-0)

| Class | **MINIMAL LIKELY** (not NO CHANGE) if persisting ONDC external refs / sync state; **NO CHANGE** for read-only gate |
|-------|---------------------------------------------------------------------------------------------------------------------|

Evidence: no ONDC tables in migrations grep; enum `ONDC` exists since early migrations. Future ONDC-1 may need tables for subscriber metadata, callback audit, BPP correlation — **not designed in ONDC-0**.

---

## 6. Frozen invariants check

| Invariant | ONDC adapter impact |
|-----------|---------------------|
| R2-31 closed | No conflict |
| Wallet rules (buyer cashback + referral; supplier referral + ₹100 success; no supplier cashback) | No ONDC code touches wallet |
| Buyer ≠ Supplier | BAP-only role preserves |
| SNE = OTP discovery architecture; ONDC external | **PRESERVED** in intended design |
| No fake ONDC production sellers | **PRESERVED** when `NOT_CONFIGURED` / no client |
| Mock network in composite RFQ path | **RISK** — not ONDC but violates truthful pilot if left enabled |

---

## 7. Redesign required?

**NO** for discovery adapter path — boundary already exists.

**YES (localized, not engine replacement)** if product mandates:

- Public HTTPS routes for registry (`ondc-site-verification.html`, `on_subscribe`, Beckn callbacks)
- Removal/gating of `MockNetworkDiscoveryService` and stub `DirectNetworkAdapter` for pilot
- Wiring `SupplierNetworkProviderEngine` OR consolidating on SNE only

---

## 8. Code references (citation index)

| Topic | Path |
|-------|------|
| SNE entry | `packages/services/src/discovery/supplier-network-engine.ts` |
| Port contract | `packages/services/src/interfaces/supplier-network-port.ts` |
| ONDC adapter | `packages/services/src/discovery/networks/ondc-network-adapter.ts` |
| ONDC provider | `packages/services/src/discovery/supplier-network-providers/ondc-supplier-provider.ts` |
| Factory wiring | `packages/services/src/factory/create-otp-services.ts` |
| Beckn client | `packages/services/src/ondc/client/ondc-gateway-client.ts` |
| Receiver | `packages/services/src/ondc/receiver/ondc-bap-receiver.ts` |
