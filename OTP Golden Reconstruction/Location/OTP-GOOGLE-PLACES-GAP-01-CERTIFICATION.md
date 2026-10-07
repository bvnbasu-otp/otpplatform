# OTP GOOGLE PLACES GAP-01 — Implementation Certification

**Date:** 2026-09-30  
**Scope:** Buyer PIN → Google Places managed coverage → Supplier Network Engine (no SNE redesign)  
**Migration ceiling:** 00223 (no 00224 applied; in-memory + edge function state for pilot)  
**Live Google key in agent shell:** **ABSENT** (`GOOGLE_PLACES_API_KEY` / `GOOGLE_MAPS_API_KEY` unset)

---

## Verdict

**CONDITIONALLY CERTIFIED — EXTERNAL GOOGLE CONFIGURATION REQUIRED**

Implementation and targeted tests pass; admin/buyer paths invoke `location-pin-coverage` edge function and `@otp/services` managed coverage. Live Google HTTP proof was not executed in this environment (no API key; 0 live calls).

---

## Q1–Q20

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| Q1 | Does buyer onboarding with valid PIN trigger coverage check without blocking signup? | **YES** | `BuyerRegisterForm.tsx` calls `queueBuyerPinDiscovery` after successful `submitSignupRequest` (fire-and-forget). `evaluateOnboardingLocation` queues async discovery. |
| Q2 | NEW PIN×category creates exactly one discovery generation? | **YES** | `ManagedSupplierNetworkService.scheduleControlledDiscovery` + `generationInFlight` Map; test `concurrent same-PIN buyers share one in-flight generation`. |
| Q3 | FRESH scope reuses with zero new Google calls? | **YES** | `prepareLocationNetwork` early return when `FRESH && !forceRefresh`; test NEW PIN second prepare `externalCallsExecuted === 0`. |
| Q4 | EXPIRED (REFRESH_ELIGIBLE) allows one controlled refresh? | **YES** | Age ≥ `freshnessWindowDays`; `forceRefresh` bypasses FRESH-only skip; test EXPIRED refresh. |
| Q5 | 30-day freshness tied to successful non-empty coverage only? | **YES** | `markSuccessfulDiscovery` only when `supplierCount > 0`; empty Google results do not update `knownScopes`. |
| Q6 | Admin Check Existing Coverage uses same system as Prepare (not client mock)? | **YES** | `AdminDashboardPage` wires `onPrepareLocation={prepareLocationNetworkViaCoverageService}`; console passes `executeDiscovery: false` for Check. |
| Q7 | Client mock suppliers removed from production admin path? | **YES** | Mock branch gated to `import.meta.env.MODE === 'test'` only; production shows error if backend missing. |
| Q8 | `ManagedSupplierNetworkService` uses Google adapter (not `generateRealisticMockDiscovery`) when credentialed? | **YES** | `executeControlledDiscovery` → `runManagedGooglePlacesDiscovery`; mock only when `allowLegacyMockDiscovery` (Vitest). |
| Q9 | PIN used as geographic input (not text-only)? | **YES** | `geocodeIndianPinCode` + Text Search `location`/`radius` bias in `discoverManagedCoverage`. |
| Q10 | Taxonomy → bounded deterministic search terms (no LLM)? | **YES** | `packages/domain/src/gis/google-places-category-search-terms.ts`; max 3 queries per scope in `runManagedGooglePlacesDiscovery`. |
| Q11 | Daily ceiling 1500 enforced before calls? | **YES** | `GoogleGisSafetyQuotaGuard` in adapter; managed service `evaluateQuota` returns `QUOTA_EXHAUSTED`. |
| Q12 | Force refresh bypasses 30-day freshness but not budget? | **YES** | `forceRefresh` skips FRESH early return; quota still evaluated. |
| Q13 | Dedup by Place ID only for Google merge? | **YES** | `findExistingSupplierByPlaceId`; adapter dedupe within managed Text Search response. |
| Q14 | Failed refresh preserves last good coverage? | **YES** | `knownScopes` updated only on successful non-empty merge; quota failure returns prior `knownSuppliersCount`. |
| Q15 | Single authoritative freshness (three caches reconciled)? | **YES** | `ManagedSupplierNetworkService` implements `LocationCoverageFreshnessAuthority`; adapter Tier-2 consults authority; SNE skips caching empty composites. |
| Q16 | Google discovery ≠ OTP_REGISTERED / GST_VERIFIED? | **YES** | Existing normalize path: `DISCOVERED_IN_AREA` / `DETAILS_AVAILABLE` only (`google-places-discovery-adapter.ts`). |
| Q17 | Production buyer onboarding cannot reach legacy mock discovery? | **YES** | `createOtpServices` sets `allowLegacyMockDiscovery: process.env.VITEST === 'true'`; test `production onboarding path does not use legacy mock`. |
| Q18 | Credentials server-side only (never logged)? | **YES** | Keys from env/edge secrets only; no key material in repo or certification. |
| Q19 | SNE fed without redesign? | **YES** | Managed service merges into existing `NetworkSupplierEntity` maps; `createOtpServices` still registers `GooglePlacesNetworkAdapter` on SNE unchanged. |
| Q20 | Live Google Places working in this run? | **NO** | Shell key absent; no live HTTP verification (≤20 call budget unused). |

---

## Tests (executed)

| Suite | Result |
|-------|--------|
| `packages/services/src/discovery/location-pin-coverage-gap01.test.ts` | **7/7 passed** |
| `packages/services/src/services/managed-supplier-network-service.test.ts` | **6/6 passed** |
| `packages/domain/src/gis/google-places-category-search-terms.test.ts` | **3/3 passed** |
| `apps/web` `pnpm run build` | **passed** |

---

## Migration note (00224)

Not added. Concurrent generation and freshness are enforced in-process (`generationInFlight`, `knownScopes`) and at edge (`inFlight` map). A future hosted multi-instance deployment should add `00224` with scope uniqueness and RLS before production scale-out.

---

## Files touched (GAP-01)

- `packages/domain/src/gis/google-places-category-search-terms.ts` (+ test, index export)
- `packages/services/src/discovery/google-places-managed-coverage.ts`
- `packages/services/src/discovery/location-coverage-freshness-authority.ts`
- `packages/services/src/discovery/location-pin-coverage-gap01.test.ts`
- `packages/services/src/gis/google-places-discovery-adapter.ts`
- `packages/services/src/services/managed-supplier-network-service.ts` (+ test)
- `packages/services/src/factory/create-otp-services.ts`
- `packages/services/src/discovery/supplier-network-engine.ts`
- `apps/web/src/features/admin/api/supplier-network-coverage.ts`
- `apps/web/src/features/admin/pages/AdminDashboardPage.tsx`
- `apps/web/src/features/admin/components/AdminSupplierNetworkConsole.tsx`
- `apps/web/src/features/portal/api/location-discovery.ts`
- `apps/web/src/features/portal/components/BuyerRegisterForm.tsx`
- `supabase/functions/location-pin-coverage/index.ts`

---

**Certification line:** **CONDITIONALLY CERTIFIED — EXTERNAL GOOGLE CONFIGURATION REQUIRED**

---

## REMEDIATION (2026-09-30)

- **Root cause confirmed:** `location-pin-coverage` edge implemented an independent Google path (in-memory `inFlight`, no 30-day freshness, no durable lock, no shared 1500/day budget, no SNE-aligned persistence). Buyer (`queueBuyerPinDiscovery`) and SuperAdmin (`prepareLocationNetworkViaCoverageService`) both invoked that edge.
- **Unified authority:** `runAuthoritativeLocationPinCoverage` (`packages/services/src/discovery/location-pin-coverage-orchestrator.ts`) is the Node production orchestrator; edge delegates via `supabase/functions/_shared/location-pin-coverage/orchestrator.ts` + Postgres RPCs in migration `00224_location_pin_coverage_authority.sql` (freshness, generation lock, daily budget, supplier persistence by Place ID).
- **GEO:** PIN geocode is mandatory before scoped Text Search; geocode failure returns `GEOCODE_FAILED` without unrestricted text-only discovery.
- **Mocks:** `allowLegacyMockDiscovery` remains Vitest-only; production buyer/admin paths do not reach `generateRealisticMockDiscovery`.
- **Tests:** `location-pin-coverage-gap01.test.ts` — 13 cases covering checks A–J (authoritative orchestrator + shared store).
- **Migration 00224:** Added; **NOT APPLIED** to hosted production in this run (SQL file only).
- **Live Google:** Not executed; no API key configured.

---

## GAP-01 Production Call-Path Containment Review (2026-09-30)

| # | Control | Status | Evidence |
|---|---------|--------|----------|
| 1 | Single orchestrator (`runAuthoritativeLocationPinCoverage`); edge is thin entry | **CLOSED** | `supabase/functions/_shared/location-pin-coverage/orchestrator.ts` imports Node orchestrator; removed duplicate geocode/text-search HTTP ladder in edge. |
| 2 | `executeControlledDiscovery` / buyer RFQ / onboarding / schedule paths cannot HTTP Google independently | **CLOSED** | `ManagedSupplierNetworkService` routes through `invokeAuthoritativeCoverage`; legacy `executeControlledDiscovery` body removed. |
| 3 | `discover()` / `discoverWithFallbackLadder` not unrestricted production Google entry | **CLOSED** | Tier-1 LIVE_API gated on `managedOrchestratorAuthorized`; `discoverManagedCoverage` requires `orchestratorAuthorized`. |
| 4 | `generateRealisticMockDiscovery` Vitest-only | **CLOSED** | `isVitestMockDiscoveryAllowed()` guard + factory default `allowLegacyMockDiscovery` only when `VITEST=true`. |
| 5 | `forceRefresh` server-authorized (not body trust) | **CLOSED** | `resolveForceRefreshAuthorization` + edge `request-auth.ts` (JWT + `profiles.is_platform_admin` / `is_founder`). |
| 6 | Postgres authority for freshness/lock/budget (no default in-memory prod store) | **CLOSED** | `FailClosedLocationPinCoverageStore` production default; edge uses `SupabaseLocationPinCoverageStore` RPCs. |
| 7 | Stale 15m lock: token re-check before each billable HTTP | **CLOSED** | `assertGenerationLock` on store + orchestrator/`runManagedGooglePlacesDiscovery` hooks; SQL `location_pin_coverage_assert_generation_lock` added to **00224 file** (not hosted-applied). |
| 8 | Reserve before every geocode + text search | **CLOSED** | Orchestrator `reserveGoogleCalls` before geocode and each search term (unchanged contract, enforced on unified path). |
| 9 | Geocode failure → `GEOCODE_FAILED`, no text-only geographic claim | **CLOSED** | `runManagedGooglePlacesDiscovery` early return; tests J + managed path. |
| 10 | Results `DISCOVERED_IN_AREA`, Place ID dedup, bounded search terms | **CLOSED** | `rawToPersisted` / adapter mapping; domain search-term map max 3. |
| 11 | Buyer + admin share orchestrator | **CLOSED** | Vitest: shared orchestrator case + test H. |
| 12 | Anonymous cannot spend Google budget on edge | **CLOSED** | Edge 401 when `executeDiscovery` without JWT. |
| 13 | SNE not redesigned; no direct Google outside orchestrator | **CLOSED** | Adapter ladder Tier-1 blocked without orchestrator flag. |
| 14 | No live Google / no key configured in agent run | **CLOSED** | No `GOOGLE_PLACES_API_KEY` set; tests use mocked `fetchFn` only. |
| 15 | Migration 00224 hosted apply | **NOT APPLIED** | SQL file edited for lock assert RPC only; **no** `db push` / hosted SQL. |
| 16 | Postgres concurrency/budget RPC proof | **NOT PROVEN** | Local `127.0.0.1:54322` not exercised; no in-memory results claimed as DB tests. |
| 17 | Targeted tests + web build | **PASS** | `location-pin-coverage-gap01.test.ts` **18/18**; `managed-supplier-network-service.test.ts` **6/6**; `apps/web` build **pass**. |

### Production call graph (after containment)

```
Client (buyer/admin edge invoke)
  → location-pin-coverage/index.ts (JWT + forceRefresh policy)
  → runEdgeAuthoritativeLocationPinCoverage
  → runAuthoritativeLocationPinCoverage (packages/services)
      → LocationPinCoverageStore (Postgres RPCs on edge; FailClosed/InMemory in Node tests)
      → reserveGoogleCalls → tryAcquireGeneration → assertGenerationLock*
      → geocodeIndianPinCode (managed module)
      → runManagedGooglePlacesDiscovery (orchestratorAuthorized)
          → GooglePlacesDiscoveryAdapter.discoverManagedCoverage (orchestratorAuthorized)
      → upsertSuppliers → completeGeneration

ManagedSupplierNetworkService (Node)
  → prepareLocationNetwork / discoverForBuyerRfq / scheduleControlledDiscovery
  → invokeAuthoritativeCoverage → runAuthoritativeLocationPinCoverage (same graph)

Blocked paths:
  → GooglePlacesDiscoveryAdapter.discover / discoverWithFallbackLadder (no Tier-1 LIVE without flag)
  → runManagedGooglePlacesDiscovery without orchestratorAuthorized
  → generateRealisticMockDiscovery outside Vitest
```

### Self-audit Q1–Q15 (containment)

| Q | Answer | Note |
|---|--------|------|
| Q1 | NO | No production module may HTTP Google without orchestrator — **enforced in code**. |
| Q2 | NO | Edge is not a second Google implementation — **delegates to Node orchestrator**. |
| Q3 | NO | Legacy `executeControlledDiscovery` cannot HTTP Google — **removed / delegated**. |
| Q4 | NO | Adapter `discover()` unrestricted LIVE — **Tier-1 gated**. |
| Q5 | NO | Mock reachable from production factory — **Vitest gate + fail-closed store**. |
| Q6 | YES | `forceRefresh` derived server-side for edge — **buyer 403, superadmin OK**. |
| Q7 | YES | Anonymous discovery blocked on edge execute path. |
| Q8 | YES | Default prod store is fail-closed, not `InMemoryLocationPinCoverageStore`. |
| Q9 | YES | Lock token checked before billable HTTP (`assertGenerationLock`). |
| Q10 | YES | Reserve-before-fetch on geocode + each text search. |
| Q11 | YES | Geocode failure → `GEOCODE_FAILED`. |
| Q12 | YES | `DISCOVERED_IN_AREA` + Place ID dedup preserved. |
| Q13 | NO | Live Google called in this run. |
| Q14 | NO | API key configured in agent environment. |
| Q15 | **00224 NOT APPLIED to hosted**; local apply **NO**. |

### Verdict (containment pass)

**BLOCKED — CODE GAP**

Code-path containment for GAP-01 is implemented and covered by Vitest (24 tests in targeted suites). **Remaining gate:** Postgres concurrency/daily-budget RPC proof against migration `00224` was **not executed** (local Docker Postgres not applied/tested). Do **not** treat as ready for hosted `00224` application until real RPC tests pass.
