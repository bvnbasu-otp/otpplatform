# B3 DEP-04 — Local Draft Identity Implementation Evidence

## Scope and status

The authorized implementation is limited to isolating local TELL intake drafts by authenticated buyer identity and procurement context, plus targeted tests. It does not implement a new server-side draft model, change database ownership/RLS, or close the broader runtime authorization gates.

**Status: source implementation complete; follow-up UX and focused regression tests pass; real-browser/server validation remains open.**

## Implemented behavior

### Identity resolution and storage key

- `intake-draft-scope.ts` resolves a local scope only when there is an authenticated user, signed-in buyer context, and profile ID.
- The storage identity contains authenticated user ID, application profile ID, organization ID (nullable), and resolved buyer persona.
- Storage uses a versioned key derived from an encoded JSON tuple, not delimiter concatenation.
- Missing/invalid identity performs no local read, write, or scoped clear. Organizationless contexts are accepted only for Individual buyers.

### Recovery and in-memory state

- Production intake load/save/clear call sites pass the resolved scope.
- Draft state is associated with its scope key and hidden when the current identity differs.
- Async fetch/save completions are ignored if the scope has changed.
- Offline local draft creation is gated on resolved scope and uses that scope's organization value.
- Server-side draft fetch/update behavior remains governed by the existing API and must still enforce ownership and authorization.

### Legacy keys

- Old generic and organization-scoped keys are detected but never automatically restored.
- Legacy data is retained until the user explicitly chooses the discard action and confirms removal in the browser dialog.
- The confirmation explains that legacy keys have no ownership metadata, that all matching legacy intake keys in this browser profile will be deleted, and that scoped v2 drafts will be preserved.
- Explicit discard removes only keys matching the legacy intake prefix; it does not clear unrelated browser storage. A failed scan or removal is surfaced with a retry notice.
- The notice does not display legacy draft contents or claim that ownership has been verified.

## Changed files

- `apps/web/src/features/intake/lib/intake-storage.ts`
- `apps/web/src/features/intake/lib/intake-draft-scope.ts`
- `apps/web/src/features/intake/lib/intake-draft-scope-guard.ts`
- `apps/web/src/features/intake/hooks/use-intake-draft.ts`
- `apps/web/src/features/intake/pages/RequirementIntakePage.tsx`
- `apps/web/src/features/intake/__tests__/draft-isolation.test.ts`
- `apps/web/src/features/intake/__tests__/draft-scope.test.ts`
- `apps/web/src/features/intake/__tests__/draft-scope-guard.test.ts`

## Verification

The three focused test files were run separately:

```text
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-isolation.test.ts --pool=forks --maxWorkers=1
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-scope.test.ts --pool=threads --maxWorkers=1
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-scope-guard.test.ts --pool=forks --maxWorkers=1
```

Result: **3 test files passed; 23 tests passed** (16 storage/isolation, 5 scope resolution, 2 pending-response guard).

The tests cover identity isolation including persona-only switching and missing profile identity, Individual without an organization, RWA/MSME context distinction, legacy non-restoration and explicit global-discard confirmation, scoped-v2 preservation, malformed scoped JSON, localStorage read/write/delete failures, legacy-detection/discard-failure notice behavior, and pending fetch/save results discarded after scope changes.

## Limitations and follow-up

- The unit tests use mocked local storage; they do not prove browser behavior across real logout/login, multiple tabs, or navigation.
- Pending fetch/save tests exercise the production async scope-guard used by the hook; they do not mount the hook in a real browser or simulate the full auth provider lifecycle.
- Server-side fetch/update authorization and database RLS were not changed or tested.
- Browser local storage is not encrypted and is not secure against another person with access to the same browser profile.
- DEP-04's bounded code/test slice does not close DEP-01, DEP-02, or DEP-03 and does not authorize broader B3 implementation.
- No build, full test suite, database, Docker, hosted, supplier, staging, commit, push, or deployment command was run.
