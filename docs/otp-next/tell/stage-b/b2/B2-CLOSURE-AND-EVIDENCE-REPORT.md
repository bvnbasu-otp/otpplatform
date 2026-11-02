# B2 Closure and Evidence Report

## Executive status

**B2 evidence work is recorded; B2 is not fully closed.** The authorized DEP-04 local draft identity-isolation implementation and follow-up UX are in place, and the focused regression tests pass. DEP-01 remains unresolved, while DEP-02 and DEP-03 still require separately authorized disposable runtime validation. No database, Docker, hosted environment, supplier provider, staging, commit, push, or deployment activity was performed.

The frozen TELL product and B1 contracts are unchanged. This work is limited to the local draft identity boundary and evidence reporting.

## Dependency disposition

| Dependency | Current finding | Evidence status | Remaining gate |
|---|---|---|---|
| DEP-01 `requirement_specifications` schema and ownership | No tracked defining DDL, generated type, active feature API, or RLS/grant contract found. Do not infer the object's external absence or create a competing item store. | **D — unresolved / not verified** | Obtain authoritative schema-owner evidence or separately approve metadata-only inspection of a specifically named disposable environment. |
| DEP-02 atomic publication and retry behavior | Existing `publish_requirement` database work is transaction-scoped, but client draft save and publication are separate calls; duplicate association is rejected rather than replayed idempotently. | **Partially verified statically** | Separately approved disposable tests for commit/rollback, timeout replay, duplicates/concurrency, allowance/audit effects, and discovery sequencing. |
| DEP-03 supplier visibility, RLS, and permissions | Tracked supplier view is invitation/supplier-identity filtered but exposes full description and JSON fields and has no explicit RFQ lifecycle predicate. Static definitions do not prove effective grants/RLS. | **Partially verified statically** | Separately approved disposable authenticated-role and negative-access tests; agree field/lifecycle allowlist. |
| DEP-04 local draft identity isolation | Scoped v2 storage, fail-closed identity resolution, no legacy restoration, explicit global-discard confirmation, and stale-result scope guard are implemented. | **Verified with follow-up** | Focused tests cover local identity and async guards. Real-browser logout/login, multi-tab, and server-side ownership/RLS proof remain separate follow-ups. |

## DEP-04 validation performed

The three focused test files were run separately:

```text
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-isolation.test.ts --pool=forks --maxWorkers=1
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-scope.test.ts --pool=threads --maxWorkers=1
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-scope-guard.test.ts --pool=forks --maxWorkers=1
```

Result: **3 test files passed; 23 tests passed** (16 storage/isolation, 5 scope resolution, 2 pending-response guard).

Coverage includes user/profile and persona-only separation, organization/persona switching, Individual scope without an organization, missing identity, key collision avoidance, malformed scoped JSON, localStorage read/write/delete failures, legacy detection/discard confirmation and failure UX, scoped-v2 preservation, and stale pending fetch/save results. The test run did not exercise a real browser, multiple tabs, database RLS, server-side draft ownership, or hosted configuration.

## Files changed

- `apps/web/src/features/intake/lib/intake-storage.ts`
- `apps/web/src/features/intake/lib/intake-draft-scope.ts`
- `apps/web/src/features/intake/lib/intake-draft-scope-guard.ts`
- `apps/web/src/features/intake/hooks/use-intake-draft.ts`
- `apps/web/src/features/intake/pages/RequirementIntakePage.tsx`
- `apps/web/src/features/intake/__tests__/draft-isolation.test.ts`
- `apps/web/src/features/intake/__tests__/draft-scope.test.ts`
- `apps/web/src/features/intake/__tests__/draft-scope-guard.test.ts`

Additional dependency-specific evidence and the next authorization request are in this directory and the B3 directory.

## Non-actions and constraints

- No schema design was selected for buyer-side items because DEP-01 is unresolved.
- No migration was authored or executed.
- No transaction, RLS, supplier-visibility, Docker, or hosted tests were run.
- No external supplier discovery or notification was triggered.
- No commits, pushes, staging, or deployment were performed.
- Local storage is an identity partition, not encryption or protection against another person with access to the same browser profile.

## Closure conclusion

The bounded local DEP-04 source change and follow-up regression evidence are complete, with real-browser logout/login, multi-tab, and server-side authorization remaining separate follow-ups. This does not close DEP-01 through DEP-03 or authorize subsequent B3 implementation. Treat this report as the current evidence snapshot; earlier planning registers describe the pre-implementation baseline.
