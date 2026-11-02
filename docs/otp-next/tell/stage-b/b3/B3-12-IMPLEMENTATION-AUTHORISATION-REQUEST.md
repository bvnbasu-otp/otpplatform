# B3-12 — Implementation Authorisation Request

## Current decision

**B3 PLANNING COMPLETE WITH OPEN DEPENDENCIES — IMPLEMENTATION BLOCKED.**

This request is deliberately split into bounded decisions. Nothing below is automatically approved by the B3 planning prompt.

## Immediate evidence request: DEP-01

Please authorize one of:

1. The database/schema owner provides authoritative `requirement_specifications` DDL/schema history, keys/FKs/constraints/indexes, ownership, RLS/grants/triggers/functions, API consumers and current/legacy status; or
2. Written authorization for metadata-only inspection of a **named disposable environment** that faithfully reproduces the relevant schema, with named database owner, allowed commands/query scope, data-safety constraints and cleanup owner.

No production/hosted access is requested or permitted. The repository does not identify a named individual database owner; the responsible role must be designated before access.

## Approval categories

| Category | Exact proposed scope | Approval requested now? |
|---|---|---|
| **A. Application code** | None. Later package-specific proposals will enumerate exact existing/new files. Candidate surfaces are listed in B3-10; no source files are changed now. | **No.** Do not begin implementation until DEP-01 is resolved and each bounded work package is separately approved. |
| **B. Database migrations/schema** | None authored/applied now. Later, after the item-storage decision, propose one reviewed additive migration using the next migration number after rechecking the branch; include parent/item/version/idempotency, RLS/grants, publish wrapper, supplier projection, generated types, reset scripts and rollback. Exact migration content/name is not knowable before DEP-01. | **No.** Separate explicit migration design and execution approval required. |
| **C. Runtime validation — disposable local** | Optional future run of `scripts/disposable-migration-validation.ts` in a newly named temp directory outside repo/Drive, unique `otp-disposable-*` project ID and approved free port base. Commands/sequence, historical migration 00077 side effect, Docker resources, migration stages, no seeds, registry image-pull possibility and cleanup are specified in B3-11. Follow with approved RLS/publication fault tests in that disposable DB. | **Not requested as blanket approval.** Request a separate decision after owner approves exact path, project ID, port, test files/queries and cleanup plan. |
| **D. Tests, builds and linting** | No execution now. Future targeted domain/web tests are enumerated in B3-11; new integration tests must be named and reviewed before running. Build/lint scope to be proposed with the implementation package. | **No.** Separate targeted validation approval. |
| **E. Supplier discovery / external integrations** | No Google Places or other supplier search, invitations, email, WhatsApp, supplier message, external provider, or dispatch operation. Future tests must mock external providers. | **Explicitly excluded.** Requires independent authorization and customer-facing communication controls. |
| **F. Production or hosted changes** | No hosted DB reads/writes, production metadata inspection, migrations, deployment, staging, commits, pushes, or live workflow. | **Explicitly excluded.** Requires separate production change-control authorization, not implied by B3. |

## Suggested next bounded action

First request DEP-01 source evidence from the schema owner. If unavailable, the owner may approve metadata-only inspection in a specifically named disposable environment. After reviewing that evidence, issue a separate approval for one or more exact runtime validation operations from B3-11. Do not authorize implementation packages B3-02 through B3-12 until the relevant schema/publication/security gates have been closed.

## Required approval record for runtime validation

Before any C/D operation, record:

- Environment owner and explicit disposable project identity.
- Exact absolute workdir outside repo and Google Drive.
- Unique Supabase project ID and selected free port base.
- Confirmation no hosted URLs/credentials/secrets/data are supplied.
- Exact migration stage and test/SQL files to run.
- Expected database/data/Docker side effects.
- Network access limited to required local container image pulls; no external procurement/notification providers.
- Evidence to retain and exact teardown/cleanup procedure.
- Named operator and approver.

No approval is being presumed from the phrase “progression into B3”.
