# B3-02 — Dependency Closure Register

## Status key

- `VERIFIED`: authoritative tracked source directly establishes the statement.
- `PARTIALLY VERIFIED`: some static evidence exists, with material proof outstanding.
- `NOT VERIFIED`: available evidence does not establish the claim.
- `CONTRADICTED`: authoritative evidence conflicts with the claim.
- `REQUIRES RUNTIME VALIDATION`: static evidence is insufficient.
- `REQUIRES PRODUCT OWNER DECISION`: code cannot settle the product choice.
- `CLOSED`: every specified closure condition has evidence and review.

## B2 dependency results

| Dependency | Initial B2 status | Evidence inspected | Finding / final status | Closure condition |
|---|---|---|---|---|
| DEP-01 `requirement_specifications` schema and ownership | Unresolved reference (D) | Full tracked migration search; generated database type; application API search; cleanup/reset/admin references; existing `requirements`, `structured_specs`, typed attributes, RFQ and downstream PO/invoice structures | **D — NOT VERIFIED.** References occur in migration reset/purge code, cleanup scripts and admin cleanup; no tracked defining DDL, generated table type, active feature read/write contract, established ownership/keys/FKs, or RLS/grants were found. This does not prove that no external/hosted object exists. Do not select or create a competing item store yet. | Authoritative schema/history/API/grant evidence from the schema owner, or separately authorized metadata-only inspection against a named disposable schema that represents the relevant environment; then approve the item-storage decision. |
| DEP-02 Atomic publication and idempotent retry | Existing publish function and one-RFQ uniqueness statically identified | `00002_core_tables.sql`; `00180_fix_signup_and_publish_audit.sql`; personal lifecycle patch in `00282_individual_personal_procurement_lifecycle.sql`; `draft.ts`; existing publish tests and payment/award patterns noted in B2 | **PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION.** `publish_requirement` performs requirement/RFQ/credit/evaluation/audit work in one function transaction, but the client saves first and invokes it afterward. The function rejects an already-associated RFQ; uniqueness is not replay semantics. No child-confirmation wrapper or RFQ idempotency record exists in tracked source. | Review the wrapper design, then authorized disposable tests prove commit, rollback, timeout replay, duplicate and concurrent requests, one RFQ/allowance/audit outcome, and no discovery before commit. |
| DEP-03 Supplier visibility, RLS and permissions | Tracked supplier-masked view/invitation flow identified | `00329_fix_direct_invites_and_supplier_quoting_for_demo.sql`; `00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql`; supplier invitation fetch/detail API; `00002_core_tables.sql`; policies/helpers in `00004`, `00281`, `00282`, `00299` | **PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION.** Latest tracked view is invitation/supplier-identity filtered but exposes full description and JSON fields and has no explicit RFQ lifecycle predicate. Existing supplier client requests these fields. Static definitions cannot prove effective grants, RLS, or leakage boundaries. | Approve narrow field/lifecycle contract; disposable authenticated role tests prove all positive and negative access cases and preserve existing whole-RFQ quote flow. |
| DEP-04 Local draft identity isolation | Original B2 finding: identity omission and broad fallback | `intake-storage.ts`; `intake-draft-scope.ts`; `use-intake-draft.ts`; `RequirementIntakePage.tsx`; scoped-storage, resolver, and async-scope-guard tests | **REMEDIATION IMPLEMENTED; INDEPENDENTLY VERIFIED WITH FOLLOW-UP.** Scoped v2 keys include auth user, profile, organization, and persona; missing scope fails closed; no generic/org-only recovery remains. Legacy keys are never restored; explicit discard confirms the all-matching-key scope and preserves v2 keys. Pending results are gated by the active scope. Focused regression tests cover persona-only switching, pending fetch/save, malformed JSON, storage exceptions, and legacy notice/discard behavior. | Focused DEP-04 test files pass. Remaining follow-up: real-browser logout/login and multi-tab behavior, plus independent server-side ownership/RLS proof. This does not close DEP-01 through DEP-03. |

## Other architecture dependencies

| ID | Status | Evidence / decision required |
|---|---|---|
| Active taxonomy identifiers and deployment | `PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION` | Parser uses taxonomy snapshots and the web taxonomy loader resolves codes/IDs; tracked seeds do not prove active deployed IDs/version. |
| Version and amendment lifecycle | `NOT VERIFIED; REQUIRES PRODUCT OWNER DECISION` | No tracked immutable requirement child version or TELL amendment contract. Preserve published snapshots; decide same-RFQ amendment vs new RFQ only after lifecycle review. |
| Parent cancellation and retention | `REQUIRES PRODUCT OWNER DECISION` | No frozen parent-wide or child-cancellation policy; do not introduce new terminal statuses. |
| Discovery provider and invitation side effects | `PARTIALLY VERIFIED; REQUIRES RUNTIME VALIDATION` | Existing per-RFQ route and deduplication are statically visible; actual external provider/dispatch behavior is not executed or proven here. |
| Audit retention/immutability | `NOT VERIFIED` | `audit_events` exists, but table name and cleanup references do not establish statutory retention or immutability. Obtain security/legal/data-owner review. |

## Evidence sources

Repository-relative references: `supabase/migrations/00002_core_tables.sql`, `00004_rls_policies.sql`, `00014_requirement_intake_columns.sql`, `00180_fix_signup_and_publish_audit.sql`, `00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql`, `00281_individual_personal_ownership_foundation.sql`, `00282_individual_personal_procurement_lifecycle.sql`, `00299_internal_procurement_hard_deny.sql`, `00329_fix_direct_invites_and_supplier_quoting_for_demo.sql`, `packages/database/src/generated/supabase.ts`, `apps/web/src/features/intake/api/draft.ts`, `apps/web/src/features/intake/lib/intake-storage.ts`, `apps/web/src/features/intake/hooks/use-intake-draft.ts`, `apps/web/src/features/intake/pages/RequirementIntakePage.tsx`, `apps/web/src/features/auth/AuthProvider.tsx`, `apps/web/src/features/supplier/api/fetch-invitations.ts`, `apps/web/src/features/requirement/api/rfq-lifecycle.ts`.

## Closure conclusion

DEP-01, DEP-02, and DEP-03 are not `CLOSED`: DEP-01 prevents a final buyer-item persistence choice; DEP-02 and DEP-03 require authorized runtime proof. DEP-04's bounded local remediation is implemented and independently reviewed, with focused tests added for identified follow-ups; real-browser session-transition/multi-tab behavior and server-side authorization remain follow-up evidence. This register does not close B2 or authorize unrelated implementation.

## Status history and current DEP-04 evidence — 2026-11-01

The DEP-04 row above supersedes the earlier pre-implementation status in this register. The original defect finding remains as historical evidence. Implementation details and precise test results are recorded in `B3-DEP-04-DRAFT-IDENTITY-IMPLEMENTATION.md` and `B3-07-LOCAL-DRAFT-IDENTITY-ISOLATION-DESIGN.md`; this follow-up does not alter DEP-01, DEP-02, or DEP-03.
