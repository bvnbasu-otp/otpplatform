# B2-14 — Implementation Readiness Gate

## Decision

**B2 NOT EVIDENCE-CLOSED — B3 BLOCKED.**

The source review supports the frozen single-category child → independently published RFQ model and identifies the existing protected publication/discovery path. It does not establish enough evidence to choose the buyer-item store or certify runtime transaction and authorization behavior.

## Gate checklist

| Gate | State | Evidence required to close |
|---|---|---|
| Frozen B1 consistency | **CLOSED** | B2-12 records the preserved child/category/publication, item, supplier quotation, discovery, and persona boundaries. |
| Existing schema and buyer-item store | **BLOCKED** | Resolve `requirement_specifications` with authoritative DDL/history, ownership, constraints, RLS/grants, and API/consumer evidence. Decide reuse/extension versus additive model only afterward. |
| Effective publication lifecycle | **BLOCKED** | Authorized disposable full-chain migration and deployed-function/grant inspection; verify allowance, quota, duplicate, ownership, persona/role and audit behavior. |
| Atomic confirmation + publication | **BLOCKED** | Disposable integration/fault injection demonstrates rollback, idempotent timeout retry, concurrent confirmation, and no duplicate RFQ/quota consumption. |
| Supplier visibility | **BLOCKED** | Supplier-role validation of view grants and rows; define/test field allowlist, lifecycle predicate, and exclusion of unaccepted/deleted/sibling/group/original/private data. |
| RLS and personas | **BLOCKED** | Disposable matrix for Individual, RWA member/roles, MSME owner/delegate, internal actor, supplier, cross-profile/scope, group-ID-only access, and unauthenticated access. |
| Taxonomy runtime binding | **BLOCKED** | Confirm active taxonomy IDs/version from an authorized runtime snapshot; parser must bind through canonical taxonomy rather than guessed IDs. |
| Local/server recovery | **DESIGN REQUIRED** | Identity-scoped local keys and server ownership must be specified. Remove organization-only/generic fallback; test logout/login, account switch, multiple groups, and concurrent edit conflicts. |
| Migration design | **BLOCKED** | After schema and RLS evidence, produce reviewed migration with FK/unique/index/RLS/grants/idempotency/rollback/reset-script impacts and compatibility for existing group-null RFQs. |
| Requirement-to-test traceability | **CLOSED AS SPECIFICATION** | B2-09 maps cases to behavior; tests are not run. Each implementation phase must execute its approved targeted tests and provide evidence. |

## Authorization boundary
This decision authorizes no B3 work, migration authoring/execution, database writes, tests, hosted access, production workflow, deployment, staging, commit, or push. Evidence acquisition that requires database access must be separately authorized and limited to a named disposable environment. B3 may be proposed only after the critical schema, publication, and supplier/RLS gates above are closed and reviewed.
