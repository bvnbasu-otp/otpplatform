# B2-04 — Child Confirmation and Publication Contract

## Purpose and existing behavior
Define atomic, child-level confirmation/publication. **VERIFIED:** current `persistAndPublishDraft()` in `apps/web/src/features/intake/api/draft.ts` updates the requirement, then calls `publish_requirement` as separate client operations. `RequirementIntakePage.tsx` has a client-side allowance check; it is not the authoritative transaction boundary. `00002_core_tables.sql` makes `rfqs.requirement_id` unique. `00180_fix_signup_and_publish_audit.sql` is the latest tracked full publish function; `00282_individual_personal_procurement_lifecycle.sql` patches it for buyer-scope/personal ownership.

## Proposed operation
One authenticated database RPC, e.g. `confirm_and_publish_child`, executes the entire child transition in one PostgreSQL transaction. Name is illustrative; no function exists today.

1. Derive profile from authenticated server context; reject missing/invalid caller.
2. Lock child row and idempotency scope. Verify buyer-scope membership and existing role. Validate owner XOR and parent/child owner equality.
3. Compare expected child version; reject stale versions. Verify child is reviewable, classification is valid, required facts are complete, no blocking clarification exists, and all publish-bound items are `ACCEPTED`.
4. Freeze an immutable child version/snapshot with customer confirmer, profile, timestamp, and version identity.
5. Set child intake review confirmation through a server-only path. Ordinary clients cannot set confirmation directly.
6. Invoke the existing protected `public.publish_requirement` path. Do not directly insert into `rfqs` or duplicate allowance/audit logic.
7. Persist the returned RFQ ID/reference and idempotency outcome. Existing allowance, role, owner, duplicate, category, audit, and lifecycle checks remain authoritative.
8. Commit together. Return the RFQ identity and published child version. Discovery is not invoked inside this transaction.

Any validation, protected publish, audit, or persistence exception aborts the transaction: no confirmed-but-unpublished child, RFQ, entitlement consumption, or partial audit remains. PostgreSQL transaction composition is adequate; no distributed transaction is justified because supplier discovery is subsequent work.

## Idempotency and concurrency
- Key is scoped to child and authenticated owner; request fingerprint includes expected version and effective sourcing arguments.
- Same key + same committed operation returns the recorded RFQ/version without re-running publication.
- Same key with different payload is rejected.
- Concurrent confirms serialize on the child/idempotency record. A different stale version gets an explicit conflict. A second valid request after the first commit returns the existing result only under documented same-operation semantics.
- Unique `rfqs.requirement_id` remains defense in depth, not the full idempotency mechanism.
- If response times out after commit, client retries with same key; server returns same RFQ and does not consume quota or create a second audit publication event.
- Static source shows the current `publish_requirement` rejects an already-associated RFQ rather than replaying its success result. The wrapper must check a committed idempotency/publication record before invoking it again. The unique RFQ constraint alone does not provide successful retry semantics.

## Confirmation evidence
Immutable evidence: buyer profile; parent/group and child IDs; child version/hash; confirmed timestamp; accepted item IDs/versions; taxonomy references; request/idempotency key; returned RFQ ID/public reference; existing publication audit correlation. Do not treat client timestamp/profile as authority.

## Discovery sequencing and failure
Only a success response with returned RFQ and published child version may transition UI to discovery. Failure leaves child review state unchanged and no discovery/invitation call occurs. TELL must not route into a path that silently creates a missing RFQ: `DiscoverSuppliersPage` currently calls `ensureRfqForRequirement`, whose implementation may insert an RFQ. TELL-specific route must use returned RFQ ID and fail closed if missing.

## Validation boundary
**Static confidence: PARTIALLY VERIFIED.** PostgreSQL function calls execute within the caller's transaction, and the tracked publish function performs requirement status changes, organization credit update, RFQ insert, evaluation-weight write, and publication audit insert in that function. A wrapper invoking it on the same connection/transaction can provide atomic database rollback in principle. Existing payment RPCs demonstrate transaction/idempotency patterns but do not prove this RFQ wrapper.

**REQUIRES RUNTIME VALIDATION:** deployed function definition; effective trigger order; all entitlement/allowance effects; rollback behavior; timeout replay; audit cardinality; and simultaneous confirmation. Requires separate authorization for a disposable full migration-chain environment and integration/fault-injection tests. No database or tests were run in B2 review.

## Status
Contract proposed. Existing publication function remains protected; wrapper design and grouped-child gate require B2 schema approval and later implementation authorization.
