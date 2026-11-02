# B3 Implementation Change Register

## Authorized package

Only the bounded DEP-04 local draft identity-isolation implementation and its targeted tests were authorized. TELL product requirements and the B1 contracts were not changed.

## Change inventory

| File | Change |
|---|---|
| `apps/web/src/features/intake/lib/intake-storage.ts` | Replaced optional identity/fallback-key behavior with a validated user/profile/organization/persona scope and versioned collision-safe key; added safe legacy detection, confirmed global legacy discard, and status/notice behavior. |
| `apps/web/src/features/intake/lib/intake-draft-scope.ts` | Added buyer-context-to-storage-scope resolution; fails closed when authenticated buyer/profile/required organization identity is unavailable. |
| `apps/web/src/features/intake/lib/intake-draft-scope-guard.ts` | Added the shared production helper that applies pending draft results only when the captured scope remains current. |
| `apps/web/src/features/intake/hooks/use-intake-draft.ts` | Uses scoped storage, prevents unresolved-scope local draft creation, scopes state to the active key, and applies async results through the current-scope guard. |
| `apps/web/src/features/intake/pages/RequirementIntakePage.tsx` | Wires authenticated user and buyer context into the resolver; explains legacy ownership limits and global discard scope, and requires browser confirmation. |
| `apps/web/src/features/intake/__tests__/draft-isolation.test.ts` | Updated tests to the required scope and added coverage for invalid identity, persona/organization separation, legacy behavior, and collision resistance. |
| `apps/web/src/features/intake/__tests__/draft-scope.test.ts` | Tests authenticated buyer scope resolution, missing profile, Individual scope, RWA/MSME separation, and organizationless non-Individual rejection. |
| `apps/web/src/features/intake/__tests__/draft-scope-guard.test.ts` | Tests pending fetch/save results against real generated scope keys when account identity changes. |

## Verification record

The three focused test files were run separately:

```text
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-isolation.test.ts --pool=forks --maxWorkers=1
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-scope.test.ts --pool=threads --maxWorkers=1
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-scope-guard.test.ts --pool=forks --maxWorkers=1
```

Outcome: **3 test files passed; 23 tests passed** (16 storage/isolation, 5 scope resolution, 2 pending-response guard).

Focused coverage includes same-owner persona-only switching, missing profile, malformed scoped JSON, localStorage read/write/delete errors, legacy detection and discard-failure notice data, confirmation cancellation and global deletion preserving v2 keys, and pending fetch/save results rejected after scope changes. The async pending-result tests exercise the production guard called by the hook; they are not full mounted-hook/auth-provider integration tests.

No broader suite, build, type-check, lint, database, Docker, hosted, supplier, staging, commit, push, or deployment operation was performed.

## Explicitly out of scope

- Buyer-side RFQ item schema or `requirement_specifications` decision.
- Migration design or execution.
- Confirmation/publication atomicity or idempotency changes.
- Supplier-view, RLS, grants, or discovery changes.
- Server-side draft ownership changes.
- Any TELL product requirement or UX scope change.
