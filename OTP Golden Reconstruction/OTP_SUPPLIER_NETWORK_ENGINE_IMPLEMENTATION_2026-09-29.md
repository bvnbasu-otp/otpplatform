# OTP Supplier Network Engine Implementation — 2026-09-29

**Status: AMBER**

## Provider interface

`SupplierNetworkProvider` (+ normalized `SupplierDiscoverySourceKind`) in:

- `packages/domain/src/types/supplier-network-provider.ts`
- `packages/services/src/discovery/supplier-network-providers/supplier-network-provider-engine.ts`

## Implementations

| Provider | File | Behavior |
|----------|------|----------|
| `OtpSupplierProvider` | `otp-supplier-provider.ts` | Real `SupplierRepository` rows only; no synthetic OTP suppliers |
| `OndcSupplierProvider` | `ondc-supplier-provider.ts` | `NOT_CONFIGURED` without keys; candidates only from `OndcBapReceiver` callbacks |
| `GoogleDiscoveryProvider` | `google-discovery-provider.ts` | Wraps `GooglePlacesDiscoveryAdapter`; lifecycle stays `DISCOVERED_IN_AREA` |

## Legacy port bridge

- `OtpSupplierNetworkAdapter` / `createLocalRegistryNetworkAdapter` replace stub local registry.
- `OndcNetworkAdapter` delegates to `OndcSupplierProvider` (fixture seller removed).

## Factory wiring

`create-otp-services.ts` uses `createLocalRegistryNetworkAdapter(repos.suppliers)` and registers `GooglePlacesNetworkAdapter` as credential-gated.

## Buyer UI

`SupplierRadarPulseBanner.tsx` — simple counts: **OTP Verified**, **Network suppliers**, **Local businesses** (optional `buyerCounts` prop).

## Existing SNE

`SupplierNetworkEngine` (SN.3) remains; provider engine is the provenance-first orchestration layer for new tests and future RFQ discovery integration.
