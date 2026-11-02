# TELL Stage B2 — Final Executive Decision Record

## Purpose and status
This records a read-only functional/architecture validation. No application, database, migration, test, build, hosted environment, or procurement workflow was changed or executed.

**Status: B2 NOT EVIDENCE-CLOSED — B3 BLOCKED.**

## Baseline
`main` / `origin/main`; HEAD `77888fba12c6cee441017986a663393d92d4b649`; 331 contiguous migrations. At the start of this evidence-closure task, the eleven existing B2 documents were untracked and preserved. The four additional deliverables and evidence-justified corrections were made only in the B2 documentation directory.

## Key findings
1. **`requirement_specifications`:** repository classification is **D — unresolved reference**. Tracked cleanup/admin references exist, but no tracked defining DDL, generated type, feature contract, or tests establish its schema or purpose. Its existence and purpose are **NOT VERIFIED — EXTERNAL/SCHEMA EVIDENCE REQUIRED**. Do not repurpose it or assume absent without authoritative schema/API evidence.
2. **Parent/children:** no tracked parent/group relationship exists. Existing `requirements` plus unique one-to-one `rfqs.requirement_id` is the natural child publication basis. The recommended parent is an orchestration-only buyer record; each child remains a regular requirement.
3. **Frozen scope:** each independently reviewable child has exactly one category and is independently published as its own RFQ. Earlier B2 wording that denied this boundary is superseded by frozen B1 and owner clarification; the consistency matrix records the correction.
4. **Items:** `structured_specs` is a legacy JSON mirror and clarification may inspect JSON line-item keys; neither provides durable item identity, acceptance, rejection, tombstone, edit version, or supplier filtering. PO/invoice line items are downstream financial data, not buyer draft items.
5. **Atomic publish:** current client code saves then calls `publish_requirement`, not atomic confirmation/publication. Proposed single database transaction must call the existing protected function and make retry idempotent.
6. **Discovery:** existing buyer-initiated per-RFQ discovery can be reused. TELL must fail closed instead of relying on the discovery page’s `ensureRfqForRequirement` RFQ-creation fallback.
7. **Supplier/quotes:** current masked view is invitation-scoped but lacks accepted TELL item semantics, explicit RFQ lifecycle filtering, and a narrow contract for full description/JSON fields. Define accepted-item allowlist/RLS in B2. Preserve one whole-RFQ commercial quote.
8. **Recovery/security:** production local recovery omits profile ID and permits organization-only/generic fallback keys; fix before B4. Existing ownership helpers are the basis; runtime RLS remains unverified.

## Data architecture recommendation
Reuse existing child `requirements`, protected publication, `rfqs`, discovery, invitation, quote, and audit mechanisms. Add only a buyer-only parent/group and child/item/version structures proven necessary after `requirement_specifications` evidence. If that table is a compatible buyer-side specification/item system, evaluate extension/reuse first. If it is unrelated/obsolete/inadequate, use an additive normalized buyer item model. No migration recommendation can safely become final before evidence.

## Deliverable status

| Deliverable | Status |
|---|---|
| B2-01 Existing Architecture Assessment | Reconciled; `requirement_specifications` classified as unresolved; runtime unknowns isolated |
| B2-02 Parent-Child Functional Specification | Reconciled to single-category child/independent RFQ |
| B2-03 Item State/Acceptance Rules | Consistent with approved ACCEPTED/SUGGESTED/REJECTED/TOMBSTONED states |
| B2-04 Atomic Confirmation/Publication | Static transaction design specified; runtime proof outstanding |
| B2-05 Supplier Discovery Integration | Reconciled; post-publication, per-RFQ, explicit buyer action |
| B2-06 Data/Migration Assessment | Conditional; item-store selection blocked on schema evidence |
| B2-07 Customer UX | Consistent with child-level review/publication |
| B2-08 Security/Permissions/Audit | Reconciled; local cache defect and supplier view gaps explicit; runtime RLS unverified |
| B2-09 Acceptance/Regression Criteria | Corrected item acceptance criterion; tests NOT RUN |
| B2-10 Roadmap/Decision Register | Reconciled; unresolved dependencies/owners recorded |
| B2-11 Evidence Gap Register | Added |
| B2-12 B1 Contract Consistency Matrix | Added |
| B2-13 Atomic Publication and Failure Sequence | Added |
| B2-14 Implementation Readiness Gate | Added |

## Critical blockers and next evidence
- Obtain authoritative `requirement_specifications` DDL/schema history, keys, constraints, FKs, RLS/grants, triggers, and intended API; or separately authorize metadata-only inspection against a named disposable DB.
- Obtain authorization for full-chain disposable migration/RLS/atomic publication validation. No hosted database access.
- Confirm deployed effective publication function and taxonomy values only through separately authorized evidence.
- Keep B2 implementation, all later phases, production workflows, and deployment separately authorized.

## Final recommendation
The single-category child → independent RFQ architecture is supported by existing `requirements`/`rfqs` relationships, and static transaction composition is plausible. However, the unresolved `requirement_specifications` object is a critical dependency for choosing or extending the buyer item store; a parallel model cannot be ruled out safely. Effective publication, supplier view/RLS, and role behavior also require runtime validation. Per the B2 completion rule, these critical architecture questions prevent evidence closure.

**B2 NOT EVIDENCE-CLOSED — B3 BLOCKED.**
