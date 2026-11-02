# B3 Final — Architecture and Readiness Decision

## Final status

**B3 PLANNING COMPLETE WITH OPEN DEPENDENCIES — IMPLEMENTATION BLOCKED**

This status follows the requested allowed outcomes. Architecture planning is sufficiently documented to guide evidence closure and bounded future authorization, but not to claim implementation readiness or runtime security.

## 1. Repository baseline

- Root: `G:\My Drive\otp`; branch `main`, tracking `origin/main`.
- HEAD: `77888fba12c6cee441017986a663393d92d4b649`; zero ahead/behind at baseline.
- Initial `git status --porcelain=v2 --branch` showed no tracked staged/unstaged changes and one untracked root, `docs/otp-next/tell/`.
- The untracked root contained the 15 existing B2 documents; all were preserved. No B2 document was updated during B3 planning.
- The TELL documentation inventory contained the B2 package but no standalone B1 folder. The frozen B1 contract was taken from the authoritative prompt and reconciled B2 records.
- No application code, migrations, generated types, tests, configs, database objects or hosted environment were modified or accessed. No tests/builds, staging, commit, push or deployment was performed.

## 2. Documents inspected and produced

Inspected the full existing B2 decision package, including architecture assessment, parent/child specification, item state model, publication/discovery contracts, data/migration assessment, UX, security, acceptance criteria, roadmap, evidence gaps, consistency matrix, atomic sequence, readiness gate and executive decision.

Created only under `docs/otp-next/tell/stage-b/b3/`:

1. Executive scope and authorization
2. Dependency closure register
3. `requirement_specifications` schema decision
4. Buyer item and parent-child data architecture
5. Atomic publication and idempotency design
6. Supplier visibility/RLS/permission design
7. Local draft identity isolation design
8. Multi-intent parser and clarification contract
9. Customer review and acceptance UX
10. Implementation roadmap and dependencies
11. Test and validation strategy
12. Implementation authorization request
13. Final architecture and readiness decision

## 3. DEP-01 — schema and ownership

**Outcome D — unresolved; NOT VERIFIED.** Tracked reset/purge references exist, but no tracked defining DDL/generated table type/active buyer API/RLS/grant contract was found. `requirements.structured_specs` is a legacy JSON mirror without a durable item lifecycle; PO/invoice lines are downstream records, not buyer draft items. It is unsafe to assume `requirement_specifications` exists, is absent, or is reusable. Required evidence and named owner role/approval are detailed in B3-03/B3-12.

## 4. DEP-02 — atomic publication

**PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION.** Tracked `publish_requirement` executes requirement transition, RFQ insert, organization credit update where applicable, evaluation weights and audit within a database function transaction; `rfqs.requirement_id` is unique. However, the web client saves before calling the RPC, and the function rejects an existing RFQ rather than replaying a successful result. No atomic confirmation wrapper or idempotent child operation is implemented. A child-only transactional design and failure/retry matrix are in B3-05; no runtime proof was performed.

## 5. DEP-03 — supplier visibility/RLS

**PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION.** Latest tracked `rfqs_supplier_masked` is invitation/supplier-identity filtered, but selects full requirement description and JSON `attributes`, `quality`, `commercial`, and lacks an explicit RFQ lifecycle predicate. Supplier client reads those fields. View grant and policy source are not proof of effective deployed permissions. B3-06 defines an invitation + identity + lifecycle + field-allowlist contract and disposable negative/positive tests.

## 6. DEP-04 — local draft identity

**Original pre-implementation finding:** verified static defect. Storage permitted missing user identity and organization/generic fallback keys; production call sites passed organization only. The original implementation status and design requirements remain documented in B3-07 for history.

**Current implementation status (2026-11-01):** the authorized local remediation uses authenticated user/profile/organization/persona-scoped v2 keys, fails closed when scope is unresolved, never restores legacy keys, and guards pending fetch/create/save results against scope changes. Legacy discard now explains that old keys have no ownership metadata, confirms removal of all matching keys in the browser profile, and preserves v2 drafts. Focused regression tests cover identified storage, identity-switch, and legacy UX cases. Independent verification found no active generic or organization-only application recovery path.

**Disposition: VERIFIED WITH FOLLOW-UP.** This closes the bounded local implementation/test follow-up only, not server-side ownership or RLS. Real-browser logout/login and multi-tab behavior remain outside the focused test evidence.

## 7. Target architecture

Preserve frozen B1:

```text
Buyer-only parent (coordination, private source history)
  ├─ Child A = existing requirement (one category) → atomic protected publication → RFQ A
  ├─ Child B = existing requirement (one category) → atomic protected publication → RFQ B
  └─ Child N = existing requirement (one category) → atomic protected publication → RFQ N
```

Reuse existing requirement, protected RFQ publication, invitation, supplier discovery and whole-RFQ quote lifecycle. Add a parent relation and durable buyer item/version model only after DEP-01 proves whether reuse is safe. Parent/group grants no child access and is never a combined RFQ or transaction. Suggestions remain distinct from accepted scope. Discovery is explicitly buyer initiated after successful commit and uses only the returned RFQ. Supplier payload is a narrow projection of the confirmed/published child.

## 8. Roadmap and critical path

Critical path: DEP-01 owner evidence → approved item storage/schema → parent/child and item persistence → atomic child confirmation/publication proof → supplier view/RLS proof → explicit discovery integration → review UX → acceptance/regression evidence.

Parser/clarification and local-cache work may be separately authorized where independent, but cannot bypass schema, publication or supplier-security gates. B3-10 gives twelve bounded packages, likely file surfaces, impacts, dependencies, acceptance, tests, rollback and approver.

## 9. Security/data-integrity risks

- Unknown item schema could make a new table duplicate or conflict with existing ownership.
- Client save-then-publish can leave persisted edits despite publication failure; existing publish transaction does not make the prior client write atomic.
- Unique RFQ constraint prevents duplicate rows but not safe successful retry semantics or exactly-once allowance/audit behavior.
- Supplier view can expose sensitive free text and JSON unless projected with explicit allowlist/lifecycle/accepted-item gates.
- Broad local-storage fallback can make one account read another account's stale procurement draft on a shared browser.
- Parent/group linkage must not widen RWA/MSME/Individual ownership or role permissions.
- Reparse must not overwrite edits or revive rejected/tombstoned suggestions.
- Profile/address data and supplier-discovery provider behavior require separate privacy and runtime review.

## 10. Runtime validation still required

DEP-02/03 require authorized disposable full-chain tests. DEP-04's bounded local remediation and focused regression evidence are recorded above; real-browser account/logout and multi-tab checks and server-side ownership/RLS evidence remain separate follow-ups. DEP-01 requires authoritative schema/owner evidence; a clean local migration chain alone cannot prove external schema status.

## Status update — 2026-11-01

The original final planning decision above is retained as a historical baseline. The subsequent DEP-04 local implementation, independent review, additional focused tests, and remaining limitations are recorded in B3-07 and B3-02. B2 remains open because DEP-01, DEP-02, and DEP-03 remain unresolved.

Static inspection found `scripts/disposable-migration-validation.ts`, which uses a fresh temp workdir, staged migrations, disabled seeds, unique project ID/ports, environment refusals and scoped teardown. B3-11 documents exact proposed commands, side effects (including Docker image pull), migration stage 00077 safeguards and cleanup boundaries. It was not run. No production or hosted environment is requested.

## 11. Exact authorization boundary

- **Requested now:** resolve DEP-01 by obtaining schema-owner evidence or separately approve a named disposable metadata-only inspection.
- **Not requested now:** application implementation, migration authoring/application, runtime validation, tests/build/lint, supplier discovery/external communication.
- **Explicitly excluded:** hosted/production reads/writes, staging, commits, pushes, deployments, and changes to existing procurement workflows.
- Each later category requires separate, exact approval as itemized in B3-12.

## 12. Recommendation

Do not begin B3 implementation yet. First resolve DEP-01 and review the exact disposable-validation proposal. Then close atomic publication and supplier/RLS proof before authorizing an implementation work package. Preserve B1 and do not treat a written design or test plan as runtime evidence.
