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
