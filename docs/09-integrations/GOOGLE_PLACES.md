# Google Places

Capability status: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). This page is the wiring.

| Layer | What it is |
| --- | --- |
| Implementation | Two paths, below. |
| Configuration | Daily application limit 1500. API key names `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY`. Hosted values: `UNKNOWN`. |
| Runtime verification | Library quota and pilot-activation unit tests were run this phase (19 passed). No Google HTTP call was made. |
| Production status | Edge coverage is the buyer and admin path. A successful hosted Google response was not observed. Not `LIVE-VERIFIED`. |
| Dependency | Google Places API (New), `EXTERNAL-DEPENDENCY`. |
| Limitation | Monthly OTP limit: NOT AUTHORITATIVELY CONFIGURED. 1500 is the configured daily limit, not measured usage. |

## Path A — buyer and admin coverage

Web callers invoke the edge function `location-pin-coverage`:

- `apps/web/src/features/requirement/api/rfq-lifecycle.ts`
- `apps/web/src/features/portal/api/location-discovery.ts`
- `apps/web/src/features/admin/api/supplier-network-coverage.ts`

`supabase/functions/location-pin-coverage/index.ts` calls `runEdgeAuthoritativeLocationPinCoverage`.

`supabase/functions/_shared/location-pin-coverage/orchestrator.ts` sets `DAILY_LIMIT = 1500`, reads the key from `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY`, and sets `allowLegacyMockDiscovery: false`.

`runAuthoritativeLocationPinCoverage` in `packages/services/src/discovery/location-pin-coverage-orchestrator.ts`:

1. Reuses a fresh coverage generation from the durable store (`00224` tables `location_pin_coverage_scope`, `location_pin_coverage_supplier`, `location_pin_coverage_generation`).
2. If a key and `serverFetchFn` exist, calls `discoverManagedCoverage` (`places:searchText`). The adapter comment says this tier does not use static or simulated results.
3. Persists through `store.upsertSuppliers`. `rawToPersisted` sets `verificationStage` to `DISCOVERED_IN_AREA`.
4. If the key is missing, returns `PROVIDER_UNAVAILABLE` with the message that managed discovery is not configured.

`public.location_pin_coverage_reserve_google_calls` (`00224`) takes `p_daily_limit integer DEFAULT 1500` and increments `google_places_daily_budget.request_count`. There is no monthly column. The founder card falls back to displaying 1500 when the passed limit is not finite.

Trust on this path stays `DISCOVERED_IN_AREA`. It is not `OTP_REGISTERED` and it is not `GST_VERIFIED`.

## Path B — library fallback ladder

`GooglePlacesDiscoveryAdapter.discoverWithFallbackLadder` in `packages/services/src/gis/google-places-discovery-adapter.ts`. `apps/web` and `supabase/functions` do not import `discover` or `discoverWithFallbackLadder`. `managedOrchestratorAuthorized` is passed only from `packages/services/src/gis/google-places-pilot-activation.test.ts`.

| Order | `sourceType` string | What the code does |
| --- | --- | --- |
| 1 | `LIVE_API` | Runs only when `managedOrchestratorAuthorized`, a key, and `isTruthfulLive` are set. If `fetchFn` is absent, `getSimulatedLivePayload` is returned under the `LIVE_API` label. |
| 2 | `DATABASE_CACHE` | Reads `this.discoveryCache`, an in-memory `Map`. The name is a terminology issue. This is not the `00224` database. |
| 3 | `STATIC_REFERENCE` | `getStaticReferenceCandidates`. Fixture directory. |
| 4 | `UNAVAILABLE` | Empty result. |

`discover()` calls the ladder and returns only `candidates`. It drops `sourceType`.

`normalizeCandidate` sets `verificationStatus` to `SELF_DECLARED` when details are complete, otherwise `UNVERIFIED`. The comment in that function says the adapter does not set OTP-verified or GST-verified. Fixture rows set `isDetailsComplete` true, so they are `SELF_DECLARED`. They are not `OTP_REGISTERED` and not `GST_VERIFIED`.

The string `FALLBACK_ACTIVE` was not found under `packages/`.

## Limits

| Figure | Class |
| --- | --- |
| 1500 per day | Application configured daily limit on the edge constant, the SQL default, and the founder display fallback. Also the in-memory guard `maxDaily` and the budget map `dailyRequestLimit`. Not measured usage. |
| 50000 per month | In-memory `GoogleGisSafetyQuotaGuard` default `maxMonthly`. Not used by the edge or the SQL counter. |
| 45000 per month | Field `monthlyRequestLimit` on `DEFAULT_PROVIDER_BUDGET_CONFIGS.GOOGLE_PLACES`. `ManagedSupplierNetworkService.evaluateQuota` reads `dailyRequestLimit` only. |
| 50000 in the adapter radius | Metres (`Math.min(50000, radius)`). Not a quota. |

Authoritative OTP monthly Google limit: NOT AUTHORITATIVELY CONFIGURED.

Google’s own contractual quota is not stated in this repository. Billing-console usage is `NOT INSTRUMENTED`.

## Static Bengaluru fixtures

Source: `BANGALORE_560048_ELECTRICAL_STATIC_DIRECTORY` in `google-places-discovery-adapter.ts`. PIN `560048` plus an electrical-like category returns that list. Any PIN starting with `560`, or a city string containing “bengaluru”, returns a copy with a `_gen` place-id suffix. A missing PIN in `getScopeKey` becomes `560048`.

Reach: library only. The coverage edge function and `apps/web` do not call it. Place ids are fixtures. Names and phones can look like businesses. The verification field does not say Google, OTP-registered, or GST-verified. Do not delete the fixtures in a documentation pass.
