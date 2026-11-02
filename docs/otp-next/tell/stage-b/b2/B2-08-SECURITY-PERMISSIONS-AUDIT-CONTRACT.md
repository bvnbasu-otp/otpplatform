# B2-08 — Security, Permissions and Audit Contract

## Purpose
Specify least-privilege owner, confirmation, supplier visibility, cache isolation, and audit requirements. Runtime RLS was not queried or tested.

## Authorization matrix

| Actor | Parent/group | Child/item draft | Confirm/publish | Supplier view |
|---|---|---|---|---|
| Individual buyer | Own profile only; organization null | Own personal owner scope only | Existing personal buyer authorization; no synthetic group privilege | Not applicable |
| RWA member | Existing organization membership and existing role limits | Existing buyer-scope policies; group does not add rights | Existing eligible roles only; no committee/approval rights added | Not applicable |
| MSME owner/delegate | Existing owner and delegate boundaries | Existing authorized scope only | Existing publish/delegate rules; no broadened authority | Not applicable |
| Internal operator/admin | Existing explicit operational access only | No customer procurement write rights by virtue of internal status | No implicit publish rights | Not applicable |
| Supplier | No parent/group or draft item access | No draft access | None | Exact invitation + exact published RFQ and accepted item allowlist only |

**VERIFIED foundation:** migrations 00281/00282 define owner XOR and buyer-scope membership/role helpers. **NOT VERIFIED:** effective deployed policies/role matrix.

Static policy evidence includes organization-scoped requirement policies in `00004_rls_policies.sql`, personal owner policies in `00281_individual_personal_ownership_foundation.sql`, buyer-scope helpers/publication-discovery patches in `00282_individual_personal_procurement_lifecycle.sql`, and internal procurement hard-deny policies in `00299_internal_procurement_hard_deny.sql`. This establishes tracked policy logic, not the effective hosted policy composition or grants.

## RLS and RPC requirements
- Parent owner XOR; child owner pair must equal parent owner pair.
- Group ID never authorizes child select/update/confirm/publish.
- Item access derived through independently authorized child and editable lifecycle.
- Ordinary client cannot set confirmed state, immutable version, or publication evidence.
- RPC derives actor from session; checks profile/role/owner, expected version, state and item eligibility.
- `SECURITY DEFINER` code uses fixed safe `search_path`, minimum grants, explicit auth checks, and no client-trusted owner identity.
- Supplier receives no direct grants to parent/item tables. View is invitation-scoped, immutable-child-version-specific, and excludes unaccepted/deleted/sibling/group/original data.
- The latest tracked `rfqs_supplier_masked` view in `00329` filters by supplier identity/invitation, but returns full requirement description and JSON `attributes`, `quality`, and `commercial`; its predicate has no explicit RFQ-status condition. TELL needs a field allowlist, lifecycle gate, and review of buyer-private content in those existing fields.
- Account isolation requires profile + typed owner scope in every local key. Missing identity means no cache I/O. Logout/account switch must clear active memory and avoid previous-key reads.

## Audit evidence
Every event needs: event type; entity/parent/child/item/RFQ IDs; actor profile or named system/network actor; actor class (`CUSTOMER`, `OTP_SYSTEM`, `AUTOMATION`, `SUPPLIER_NETWORK`); action; from/to state; version; event timestamp; reason code; source/rule version; correlation/idempotency key; payload sufficient to reconstruct transition without leaking supplier/buyer data.

Record at least source creation/revision, parser proposal/version, item creation/edit/accept/reject/tombstone, clarification, child readiness, confirmation attempt/success/failure correlation, publication outcome, discovery attempt/outcome, invitation creation, amendment, cancellation, and recovery/conflict events. Confirmation/publication audit writes are in the same DB transaction. Supplier network events occur after publication and are correlated to RFQ and child version.

Audit immutability/retention is not established by table name alone. Align with existing statutory retention rules; never use ordinary purge flows to remove protected audit evidence.

## Negative security criteria
Cross-profile same-organization reads denied; wrong organization/personal scope denied; group ID alone denied; unconfirmed child cannot publish through direct protected RPC; stale version rejected; supplier cannot query sibling/original/suggested/rejected/tombstoned content; unauthenticated/internal actor cannot use buyer RPC; RWA/MSME authority is not widened.

## Status and blockers
Current local recovery call sites omit profile ID and storage falls back to organization-only/generic keys (**VERIFIED defect**). `localStorage` stores the intake draft, including original description, quantity, delivery location/address, commercial/quality fields, and buyer-only site notes. Effective RLS, custom grants, supplier view status gating, and persona matrix remain **NOT VERIFIED / REQUIRES RUNTIME VALIDATION** in an authorized disposable environment.
