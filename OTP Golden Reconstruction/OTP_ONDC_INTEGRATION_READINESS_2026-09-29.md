# ONDC Integration Readiness — 2026-09-29

**Status: AMBER** — real boundary, **NOT_CONFIGURED** in all dev/pilot environments tested

## Current state

| Check | Result |
|-------|--------|
| Production ONDC gateway connected | **No** |
| `ONDC_ENABLED=true` without subscriber keys | `NOT_CONFIGURED`, **zero** discovery rows |
| Fake `"ONDC Network Verified Supplier"` row | **Removed** from adapter |
| Beckn crypto / client types | Present under `packages/services/src/ondc/` |
| Callback ingestion | `OndcBapReceiver.handleOnSearch` + `listPendingCandidates(transactionId)` |

## Integration states (domain)

`ONDC_INTEGRATION_CONFIGURED`, `PREPROD`, `PRODUCTION`, `UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `NO_RESULTS`, `NOT_CONFIGURED`.

## Domain choice

- OTP acts as **BAP** boundary; search uses Beckn `search` via `OndcGatewayClient` when `signingPrivateKeyPem` + `subscriberId` are supplied.
- Default BAP URI placeholder: `https://api.otp.in/ondc/bap` (override via env/options).

## External onboarding remaining

1. ONDC registry subscriber id + keyId whitelist.
2. Production/staging gateway URL and network participant agreement.
3. Wire `/on_search` HTTP route to `OndcBapReceiver.handleOnSearch` (receiver already normalizes providers).
4. Preprod soak: empty `NO_RESULTS` is expected until BPP catalogs respond.

## Engine behavior when ONDC unavailable

OTP + Google providers continue; buyers see network count `0`, not fake sellers.
