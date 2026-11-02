# B3-05 — Atomic Publication and Idempotency Design

## Existing behavior (static evidence)

- `rfqs.requirement_id` is unique in `supabase/migrations/00002_core_tables.sql`.
- `public.publish_requirement` is defined in `00180_fix_signup_and_publish_audit.sql` and patched for Individual/personal buyer scope in `00282_individual_personal_procurement_lifecycle.sql`.
- The tracked function validates requirement existence/status/subcategory, buyer scope/role, and quote parameters; it updates organization RFQ credits where applicable, transitions the requirement, inserts the RFQ, writes evaluation weights and inserts a publication audit event, then returns RFQ identity.
- The tracked function raises if an RFQ already exists for the requirement. Unique `requirement_id` is defense in depth, not a successful retry response.
- `persistAndPublishDraft()` in `apps/web/src/features/intake/api/draft.ts` first updates the requirement, then separately calls `publish_requirement`. Its own comment describes the separate save-before-publish behavior. The two client operations are not one transaction.
- No TELL confirmation wrapper, child version, operation idempotency record, or timeout replay contract was found.

These are tracked-source observations only. They do not prove a deployed function, grants, transaction behavior, or effective entitlement implementation.

## Proposed one-child transaction

```text
Buyer             Intake API       Child confirm/publish RPC      Existing publish_requirement
  |                    |                       |                             |
  | confirm(child, expected-version, key)      |                             |
  |------------------->|---------------------->|                             |
  |                    |                       | derive authenticated profile |
  |                    |                       | authorize owner/persona/role |
  |                    |                       | lock/check child & operation |
  |                    |                       | verify version, one category,|
  |                    |                       | valid subcategory, readiness,|
  |                    |                       | required accepted scope      |
  |                    |                       | freeze immutable snapshot    |
  |                    |                       | call protected function ---->|
  |                    |                       |<----- RFQ id / public ref ----|
  |                    |                       | persist confirmation, result,|
  |                    |                       | audit in same transaction     |
  |                    |                       | COMMIT                       |
  |<-------------------|<----------------------| return only after commit      |
  | explicitly request discovery for returned RFQ --------------------------->|
```

One database transaction handles only one child. A parent/group or sibling is never part of this transaction. Discovery occurs after commit and is separately retryable; it must not create another RFQ.

## Idempotency and concurrency contract

- Server derives user/profile and owner scope from authenticated context; never trusts client-supplied owner or actor.
- Client generates a stable operation key for one confirmation attempt. Database scope includes authenticated owner, child, operation key, expected child version and canonical request fingerprint.
- Same key + same fingerprint after commit returns the original RFQ and immutable confirmed version without rerunning entitlement, publication audit, or discovery.
- Same key + different fingerprint is rejected explicitly.
- Different operation key against an already-published child returns a defined conflict or existing result only if the operation is semantically the same; never attempt a second publication.
- Serialize competing confirmation attempts on the child/operation identity, or equivalent unique/locking mechanism. Exactly one winner; other caller gets replay or explicit stale/conflict response.
- Child expected-version check prevents concurrent edits from being overwritten. A stale request writes no confirmation/publication.
- Operation-result persistence, confirmation snapshot, existing `publish_requirement` effects, and confirmation/publication audit must share one transaction. Any exception rolls them all back.
- The operation key/request hash must not contain secret or sensitive free-text content; hash/correlation identifiers are sufficient.

## Failure/retry matrix

| Scenario | Required outcome |
|---|---|
| Invalid auth, owner, persona, role, category or child state | Explicit failure; no confirmation, RFQ, allowance, success audit or discovery side effect. |
| Invalid/stale expected version | Conflict with safe current version metadata; preserve saved buyer edits. |
| Publish function or audit write errors before commit | Transaction rollback; no false published state or partial allowance/RFQ/audit. |
| Database commits, response is lost | Retry same key/fingerprint returns same RFQ and version; one allowance effect and one publication audit event. |
| Concurrent same-key request | One commit; replay or explicit safe pending/conflict result, never second RFQ. |
| Concurrent different-key request on same child | One successful operation at most; loser receives a deterministic conflict or replay of the committed result. |
| Discovery route attempted before successful commit | Fail closed; do not call discovery or `ensureRfqForRequirement` fallback. |
| Discovery fails after publication commit | RFQ remains published. Record/report discovery status separately and retry against the same returned RFQ; do not republish or spend allowance again. |
| One sibling fails | Does not alter another child's commit/result/status. |

Preventing duplicate audit events must distinguish the exactly-once committed publication event from separately recorded failed/retried attempts. Failed-attempt audit policy and retention need security review; do not claim “no audit” if existing protected function emits failure telemetry.

## Separate asynchronous boundaries

1. **Atomic DB publication:** confirmation + immutable version + protected RFQ publication + persisted idempotency result + required transactional audit.
2. **Post-commit supplier discovery:** explicitly initiated for returned RFQ; no need to run inside DB transaction.
3. **Provider/invitation retry:** retry only the same RFQ, preserve invitation uniqueness `(rfq_id, supplier_id)` and provider-specific dedupe; represent “provider unavailable”, “no matches”, and “invitations created” distinctly.

## Runtime proof still required

The approved disposable validation must demonstrate success, pre-commit failure rollback, timeout after commit replay, duplicate key/fingerprint protection, concurrent confirmation, exactly one RFQ/allowance/audit outcome, no pre-commit discovery, and unchanged existing RWA/MSME/Individual lifecycle. No runtime tests were run for this planning package.
