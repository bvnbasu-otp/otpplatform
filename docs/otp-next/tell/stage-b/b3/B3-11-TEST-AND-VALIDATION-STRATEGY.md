# B3-11 — Test and Validation Strategy

## Current status

No tests, builds, database commands, Docker commands, or hosted operations were run for B3 planning. Test specifications are not test results. Existing test files prove only their actual assertions.

## Requirement-to-test layers

| Layer | Scope | Candidate existing surfaces | Required new evidence |
|---|---|---|---|
| Domain unit | Multi-intent grouping, category boundary, confidence/clarification, provenance, quantity/unit nulls, suggestion state, replay identity, recommendation minimum-two exception | `packages/domain/src/parser/rule-based-requirement-parser.test.ts`, `otp-taxonomy-03-parser.test.ts` | Reviewed non-sensitive corpus and per-class precision/recall/confusion matrix; same-category unrelated scopes; no fabricated values |
| Web unit/component | Debounce, stale result race, customer edits, accepted/suggested UI, child navigation and failure messaging | `apps/web/src/features/intake/__tests__/unified-three-tier-intake.test.ts`, `create-requirement-mobile.test.ts` | Fake-timer invocation counts; resolve promises out of order; ensure stale result cannot mutate new input |
| Local cache/auth | Production call-site identity, no fallback, logout/account/persona switching, legacy key handling | `apps/web/src/features/intake/__tests__/draft-isolation.test.ts`, `AuthProvider.tsx`, protected sign-out route | Tests must exercise hook/page with actual auth context, not only helper functions called with explicit IDs |
| API/RPC integration | Ownership, expected version, atomic snapshot+publish, allowance, audit, operation-key replay and concurrency | `apps/web/src/features/intake/api/draft.ts`; database function tests | Disposable DB tests using authenticated Individual, RWA and MSME contexts; failure injection and two-session concurrency |
| RLS/security | Parent/group no privilege, item ownership, supplier exact-invitation/lifecycle allowlist, no leakage | `tests/security/`, policies and `rfqs_supplier_masked` | Positive/negative query tests for all actor roles; revoked invitation, sibling, unpublished, rejected/tombstoned/unaccepted records |
| Supplier regression | Masked payload, invitation, quote version and award workflow | `apps/web/src/features/supplier/supplier-quote-submission.test.ts`, `fetch-invitations.ts` | Whole-RFQ quote regression plus no new per-item quotation path |
| End-to-end | TELL to child confirmation to RFQ to explicit discovery, multi-child independence and mixed statuses | Existing intake/discovery E2E candidates | Instrumented provider mocks only; verify no side effect before commit and no external contact |
| Accessibility/responsive | 320/375/430 px, keyboard, screen reader, modal/keyboard behavior | `create-requirement-mobile.test.ts` and app E2E setup | Screen-reader state announcements, focus, reduced motion, accessibility scan |

## Minimum acceptance matrix

1. One coherent scope stays one child; multiple unrelated scopes split independently, including same-category unrelated scopes.
2. Every child has exactly one category and a taxonomy-valid subcategory.
3. Explicit facts stay customer-stated; recommendation origin is visible; no invented quantity, price, brand, specification or timing.
4. Customer-stated item begins `ACCEPTED`; suggestion begins `SUGGESTED`; edit does not accept; reject/tombstone survives reparse.
5. One plausible item remains one item when no relevant second suggestion exists.
6. Confirming one child changes only that child and returns exactly one RFQ after commit.
7. Fault before commit rolls back confirmation/RFQ/allowance/publication audit. Timeout after commit retries to same result. Concurrent confirmation cannot double-publish.
8. No supplier discovery/invitation before successful commit. Discovery retry targets same RFQ and does not duplicate invitation.
9. Supplier can access only its own invited published RFQ's allowlisted accepted scope; all sibling/private/draft/other-supplier data is denied.
10. Individual/RWA/MSME ownership and roles remain unchanged; existing whole-RFQ quote, revision, award and PO flow passes.
11. Local cache stays bound to profile + owner/persona scope across reload, logout, account and organization switch; no generic fallback.
12. Existing group-null requirement/RFQ workflows remain unchanged and no backfill is required.

## Exact targeted commands proposed for a later authorized phase

These commands are candidates after tests are implemented, dependencies installed and a target environment explicitly approved; they were **not run**:

```powershell
pnpm exec vitest run --config packages/domain/vitest.config.ts packages/domain/src/parser/rule-based-requirement-parser.test.ts packages/domain/src/parser/otp-taxonomy-03-parser.test.ts
pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/features/intake/__tests__/draft-isolation.test.ts apps/web/src/features/intake/__tests__/unified-three-tier-intake.test.ts apps/web/src/features/intake/create-requirement-mobile.test.ts apps/web/src/features/supplier/supplier-quote-submission.test.ts
```

Database/security acceptance requires newly approved integration test files and an isolated DB. Do not run broad `pnpm test:db`, `pnpm db:reset`, `pnpm test:live`, `pnpm test:smoke`, migration deploy, or live discovery until a specific target and command are approved. Full E2E and builds are separate approvals under B3-12.

## Disposable migration/RLS validation proposal (not executed)

Static inspection found `scripts/disposable-migration-validation.ts`, a purpose-built local Docker validator. It creates an isolated work directory, copies staged migrations, generates a local config with seeds disabled, refuses linked/overlapping workdirs and hosted DB environment variables, uses a unique project ID/ports, validates Docker resource ownership, stages the historical purge migration only against an empty database, and scopes teardown to that one project. It excludes several nonessential services; external discovery/communications are not invoked by this migration utility.

**Environment:** a new absolute temporary directory outside the repository and Google Drive (e.g. `%LOCALAPPDATA%\Temp\otp-tell-b3-<random>`); unique `otp-disposable-<8-24 lowercase alphanumeric>` ID; unoccupied port base 55000–59900 selected after approval. No production/hosted URL, link, seed data, or data copy.

**Commands proposed only after written approval** (replace placeholders with exact approved values):

```powershell
pnpm exec tsx scripts/disposable-migration-validation.ts prepare --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
pnpm exec tsx scripts/disposable-migration-validation.ts start --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
pnpm exec tsx scripts/disposable-migration-validation.ts stage-B --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
pnpm exec tsx scripts/disposable-migration-validation.ts stage-C --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
pnpm exec tsx scripts/disposable-migration-validation.ts stage-D --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
pnpm exec tsx scripts/disposable-migration-validation.ts ledger --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
pnpm exec tsx scripts/disposable-migration-validation.ts teardown --workdir "C:\Users\<user>\AppData\Local\Temp\otp-tell-b3-<random>" --project-id otp-disposable-<suffix> --port-base <approved-port>
```

The script's stage-B executes migration `00077` only after it verifies historical transactional tables are empty in that throwaway DB. The script's D stage applies the remaining copied chain (currently through the validated migration ceiling). The package script `pnpm db:reset` is not proposed because it resets the repository's configured local DB, not this isolated instance.

**Side effects:** Docker containers, volumes and network for only the unique project; migrations create/delete data only in the throwaway DB; local image pulls may contact a container registry. No supplier search, invitation, email, WhatsApp, production data, or hosted database should be contacted. If the script refuses due to env variables, path, ports, Docker collisions, or migration drift, stop and investigate; do not bypass checks.

**Safeguards/evidence:** review marker, migration manifest hashes, selected port plan, Docker inventory and env-refusal behavior before start; capture stage/ledger output, rollback/retry/RLS test results and resource inventory. `teardown` removes only its project resources. The work directory itself contains copied migrations/manifest and must be reviewed then removed only by an exact-path, separately approved cleanup; no wildcard cleanup.

This migration-chain run alone does not close DEP-01's possible external schema question and is not proof of hosted deployment.
