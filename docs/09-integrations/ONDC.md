# ONDC

Status: `CONFIG-GATED`. Domain constant `ONDC_FOUNDATION_INTEGRATION_STATUS` is `SupplierNetworkProviderOperationalStatus.CREDENTIAL_GATED` (`packages/domain/src/ondc/ondc-provider-foundation.ts`). The file states the module does not call the network and does not invent sellers, and that no path in the foundation returns live.

Public channel status: `PLANNED` (“Not connected”). That matches the canonical status. Do not upgrade it because `supabase/functions/ondc-on-search` exists.

## Scope that was read

- Protocol actions named on the foundation: `search`, `on_search`.
- Discovery is not invitation, registration, verification, award, or payment.
- Allow-listed domains in the foundation file: `ONDC:RET12`, `ONDC:RET14`.
- Buyer requested PIN is the geography authority. Seller-reported PIN may differ.

## Trace

| Layer | Evidence |
| --- | --- |
| Implementation | Ed25519 and BLAKE2b-512 helpers in `packages/services/src/ondc/crypto/ondc-auth-crypto.ts` (`generateOndcKeyPair`, `createBodyDigest`). Gate `resolveOndcEnvironmentGate` in `packages/domain/src/ondc/ondc-environment.ts`. Ingress `supabase/functions/ondc-on-search/index.ts` calls `handleOndcOnSearchRequest` only after the gate returns a pre-production client whose gateway, registry, and callback hosts are not production hosts. Otherwise it NACKs. |
| Configuration | Names only: `ONDC_ENVIRONMENT`, `ONDC_PROVIDER_ENABLED`, `ONDC_NETWORK_ENABLED`, `ONDC_PREPROD_*` (gateway, subscriber id, unique key id, signing private key, registry URL, callback URL), `ONDC_PRODUCTION_ENABLED`, and the matching `ONDC_PRODUCTION_*` slot. Legacy names in `ONDC_LEGACY_SHARED_SLOT_NAMES` do not satisfy either slot. Hosted values: `UNKNOWN`. |
| Runtime verification | `ondc-environment.test.ts` and `ondc-provider-foundation.test.ts` passed this phase (included in 59 domain tests). No registry lookup and no gateway `search` was executed against ONDC. |
| Production status | `LOCAL` and `CI` set `realClientAllowed` false. `PRODUCTION` stays denied unless `ONDC_PRODUCTION_ENABLED` is exactly true and the production slot is complete. The deployed ingress still NACKs when the hosts are production hosts, because it only continues for `PRE_PROD`. CI deploys `location-pin-coverage`, not `ondc-on-search`. `config.toml` sets `[functions.ondc-on-search] verify_jwt = false` for local config. Hosted deployment of the function: `UNKNOWN`. |
| Dependency | ONDC registry and gateway. `EXTERNAL-DEPENDENCY`. CSP `*.ondc.org` is a browser allow-list. |
| Limitation | Not a live procurement channel. Public copy is planned / not connected. Executed protocol actions in the domain constant are `search` and `on_search`. `select`, `init`, and `confirm` are named on the client-action list and are not the foundation’s executed set. |

Edge function `supabase/functions/ondc-on-search` is present. A live network transaction was not observed.

`packages/domain/src/edge/ondc-on-search-domain.ts` and `packages/services/src/ondc/ondc-on-search-endpoint.test.ts` were untracked at inspection. They are not evidence of a live network. `packages/services/src/ondc/crypto/ondc-auth-crypto.ts` was modified and uncommitted. This reconstruction did not extend those hunks.

CSP `connect-src` includes `https://*.ondc.org`. That is a browser allow-list, not a connection.
