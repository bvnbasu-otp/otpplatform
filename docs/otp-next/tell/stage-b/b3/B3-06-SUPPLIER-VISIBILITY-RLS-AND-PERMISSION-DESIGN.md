# B3-06 — Supplier Visibility, RLS and Permission Design

## Existing static contract

- `00002_core_tables.sql` defines `rfq_invitations` with unique `(rfq_id, supplier_id)` and alias uniqueness per RFQ; quotes are unique per `(rfq_id, supplier_id)` and quote versions store a whole-quote snapshot.
- Latest tracked `rfqs_supplier_masked` definition is in `00329_fix_direct_invites_and_supplier_quoting_for_demo.sql`. It joins `rfqs` to requirements and the matching invitation and filters with `private.is_supplier_user_for(ri.supplier_id)`. It selects the requirement description, attributes, quality and commercial JSON, and has no explicit RFQ lifecycle predicate.
- It revokes `anon` and grants `SELECT` to `authenticated` and `service_role`; this is tracked SQL, not proof of effective deployed grants or data visibility.
- `apps/web/src/features/supplier/api/fetch-invitations.ts` queries this view for list/detail, including full description and JSON fields. Frontend scrubbing is not a security boundary.
- Buyer policy lineage includes `00004_rls_policies.sql`, personal ownership in `00281_individual_personal_ownership_foundation.sql`, buyer-scope/lifecycle patch in `00282_individual_personal_procurement_lifecycle.sql`, and internal hard deny in `00299_internal_procurement_hard_deny.sql`.

**DEP-03: PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION.** No deployment/RLS query or supplier-role test was run.

## Required supplier access predicate

A supplier may access one child RFQ only if all are true:

1. The RFQ is linked to exactly that child and the child has a committed publication.
2. The RFQ lifecycle is explicitly one of the approved supplier-access states; terminal/withdrawn/otherwise restricted states deny access.
3. An invitation exists for that exact RFQ and supplier.
4. Authenticated supplier identity matches that invitation.
5. Any revocation/expiry/role restriction is enforced at the database/API boundary.
6. The requested data is in the reviewed supplier-facing allowlist.

Parent/group membership never grants access. A supplier invited to Child A cannot infer Child B, parent original text, other invitations, discovery metadata, or another supplier's quote.

## Narrow accepted-scope contract

Supplier payload can include only the confirmed and published child scope necessary to prepare a whole-RFQ quotation:

- RFQ public reference, allowed title/status/deadline and sourcing parameters.
- One category/subcategory, child-level buyer-approved description, explicitly permitted location/delivery/timing.
- Customer-stated items (`ACCEPTED`) and OTP suggestions only after explicit buyer acceptance and inclusion in the immutable confirmed version.
- Required specifications/attributes after private-data review.
- Supplier's own invitation alias and own invitation state.

Explicitly exclude:

- Parent/group IDs, original mixed-source description and source revisions.
- Sibling child or RFQ records.
- `SUGGESTED`, `REJECTED`, `TOMBSTONED`, unconfirmed, stale or unpublished item/version data.
- Internal parser evidence, confidence scores, recommendation rationale/rules, internal supplier discovery scores/reasons.
- Buyer-only/site notes unless separately and explicitly approved for supplier disclosure.
- Buyer identity before existing award/reveal authorization.
- Other suppliers' invitations, aliases, bids, quote versions, scores or responses.

Free-text descriptions and JSON must be treated as potentially private. A column-level allowlist and validated projection are required; do not pass through complete existing `attributes`, `quality`, or `commercial` JSON merely because a UI strips keys.

## RLS, grants and RPC requirements

- No supplier direct grants on parent, draft item, parser proposal, or confirmation tables.
- Supplier endpoint/view performs exact RFQ + invitation + supplier identity + lifecycle checks in the database; it must not trust a client-supplied parent or supplier ID.
- Buyer access to parent/child/item remains governed by existing organization membership/role or Individual owner scope. Group ID is not a capability.
- Ordinary authenticated client cannot assign ownership, accept an item on behalf of the buyer, set confirmation/publication version, write audit identity, or read sibling data.
- Internal operator status does not add customer procurement write rights.
- Function/view `SECURITY DEFINER`, safe `search_path`, grants, view owner/bypass-RLS semantics, and custom policies must be reviewed as one effective access path.
- Identity masking and whole-RFQ quote submission/versioning remain unchanged.

## Negative and positive validation matrix

| Actor/scenario | Expected result |
|---|---|
| Anonymous/uninvited supplier reads RFQ | Denied/no row |
| Supplier A invited only to RFQ A requests RFQ B/sibling | Denied/no row |
| Any supplier requests unpublished/draft/withdrawn RFQ | Denied/no row per approved lifecycle |
| Invited supplier reads own permitted published RFQ | Allowed limited allowlist |
| Supplier queries unaccepted/rejected/tombstoned item or original/group/source metadata | No data exposed |
| Supplier requests another supplier's quote/history | Denied/no row |
| Buyer Individual, RWA member/manager/role, MSME owner/delegate | Existing scope/role limits hold; no parent widening |
| Cross-profile same organization; wrong organization; group ID alone; internal actor | Denied unless existing explicit authorization independently permits the operation |
| Invitation revoked / RFQ lifecycle changed | Access immediately follows database-enforced current state |

## Closure

DEP-03 cannot be `CLOSED` from static SQL or UI tests. It requires separately approved disposable tests against the full migration chain, effective grants, invitation states, roles, lifecycle statuses and negative data-leakage cases. No supplier discovery, invite, communication, hosted DB access, or runtime query was performed.
