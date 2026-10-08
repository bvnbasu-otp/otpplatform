# Google runtime proof

## 2026-10-08

`GOOGLE_PLACES_API_KEY` and `GOOGLE_MAPS_API_KEY` are NOT_SET in process, user, and machine scope. No live Places call was made. Status of this proof: CREDENTIAL_GATED. Not LIVE.

POST `executeDiscovery: false`, PIN `560048`, category `electrical`, no bearer: HTTP 200, `status` `NEVER_DISCOVERED`, `externalCallsExecuted` 0, `knownSuppliersCount` 0, `suppliers` `[]`. Do not invent suppliers from that response.

Production function `location-pin-coverage` is deployed.

## Calls

1. POST `executeDiscovery: true`, pincode `560048`, category `electrical`, no Authorization header. HTTP 401. Body: `Authentication required for discovery`. No supplier list.

2. POST `executeDiscovery: false`, same pin and category, no Authorization header. HTTP 200. Body fields: `ok` true, `scopeKey` `::560048:electrical`, `status` `NEVER_DISCOVERED`, `externalCallsExecuted` 0, `knownSuppliersCount` 0, `suppliers` empty. Stage counts for `DISCOVERED_IN_AREA`, `OTP_REGISTERED`, and `GST_VERIFIED` were 0.

## Credentials

`GOOGLE_PLACES_API_KEY` and `GOOGLE_MAPS_API_KEY` in this agent environment: NOT_SET. The key inside the hosted function was not read. NOT_CONFIGURED was not observed, because discovery did not pass authentication, so the function never reached the provider branch.

## What this is not

No supplier was created. No static Bengaluru directory row was returned by this call. The result is not labeled `GOOGLE_PLACES`. PIN `560048` was not certified as Google-discovered.

## Decision

Google production discovery is **NOT CERTIFIED**. The remaining step is not proven to be only an external Google response. An authenticated call and a configured key are both unproven.
