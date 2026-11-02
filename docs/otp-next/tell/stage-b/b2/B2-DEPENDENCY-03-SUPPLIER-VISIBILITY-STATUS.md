# B2 DEP-03 — Supplier Visibility, RLS, and Permissions Status

## Status

**Partially verified from tracked source; effective permissions and runtime visibility remain unverified.**

## Static evidence

The latest tracked supplier-view definition reviewed is in `00329_fix_direct_invites_and_supplier_quoting_for_demo.sql`. The view is invitation/supplier-identity filtered, but it exposes the full requirement description and JSON fields including attributes, quality, and commercial data. It has no explicit RFQ lifecycle predicate. The supplier client currently requests these fields.

Migration text alone does not establish effective grants, RLS behavior, view ownership/security mode, or whether sensitive values are present in those fields in practice. No supplier identity was used and no provider or invitation flow was triggered.

## Runtime proof still required

Separately authorized disposable authenticated-role tests should prove:

- invited supplier can access only its intended published RFQs;
- unrelated suppliers and unauthenticated roles cannot access the RFQ or its data;
- unpublished, draft, cancelled, or otherwise disallowed lifecycle states are not exposed;
- supplier quotations continue to reference the whole RFQ as currently designed;
- sensitive buyer-only data is excluded according to an approved field allowlist;
- existing supplier quoting and invitation behavior is preserved.

The product/security owner must approve the supplier field and lifecycle allowlist before schema or view changes are designed.

## Actions not performed

No database, RLS, supplier, external-provider, or hosted test was run. This status is not a request to weaken or replace existing supplier protections.
