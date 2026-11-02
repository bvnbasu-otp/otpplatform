# B3 Next Authorization Request

## Current decision

**DEP-04 local identity-isolation implementation and focused follow-up regression tests are complete for the authorized slice. The decision is VERIFIED WITH FOLLOW-UP: real-browser logout/login, multi-tab, and server-side ownership/RLS evidence remain separate. B2/B3 are not fully evidence-closed, and no further implementation or runtime validation is authorized by this report.**

## Open blockers

| Dependency | Current status | Evidence needed before implementation decision |
|---|---|---|
| DEP-01 `requirement_specifications` | Unresolved; tracked repository evidence does not define the object. | Authoritative schema-owner evidence, or separate written approval for metadata-only inspection of a named disposable schema. |
| DEP-02 atomic publication | Static transaction evidence only; client save and publish remain separate and retry replay is not established. | Separately approved disposable fault/retry/concurrency validation. |
| DEP-03 supplier visibility | Static view evidence only; effective grants/RLS and intended field/lifecycle boundary remain unresolved. | Approved field/lifecycle allowlist and separately approved disposable supplier-role tests. |
| DEP-04 local identity | Scoped local implementation and focused tests verified; async scope guard, legacy global-discard confirmation, storage failure, and notice behavior covered. | Real-browser logout/login and multi-tab validation plus server-side ownership/RLS proof, if required for release closure. |

## Proposed next decision

First request DEP-01 evidence from the responsible schema owner. Do not select or migrate a buyer-side item model until object existence, ownership, constraints, RLS/grants, consumers, and cleanup behavior are established.

After review, request a separate, bounded authorization for DEP-02/DEP-03 disposable runtime validation. That request must identify the disposable environment, absolute work directory outside the repository and Google Drive, unique project identity and free port base, exact scripts/tests/queries, expected database and Docker side effects, evidence to retain, and teardown/cleanup owner. No hosted environment or production access is requested.

## Explicit exclusions

No blanket approval is requested for:

- database migrations or writes;
- use of the repository's configured local database reset;
- hosted or production access;
- external supplier discovery, invitations, email, messaging, or dispatch;
- broader B3 implementation;
- staging, commits, pushes, or deployment.

Any later application-code, migration, test, or runtime work must be separately authorized with its exact scope and validation evidence.
