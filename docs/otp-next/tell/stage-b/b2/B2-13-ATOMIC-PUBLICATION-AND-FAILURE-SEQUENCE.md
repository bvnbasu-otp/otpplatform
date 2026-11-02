# B2-13 — Atomic Publication and Failure/Retry Sequence

## Boundary
One child is the unit of confirmation and publication. A parent/group only coordinates children. This is a proposed sequence, not an implemented or runtime-verified contract.

## Proposed success sequence
```text
Buyer -> Intake client -> Atomic child RPC -> Existing protected publish_requirement
  1. Review child/items and confirm(version, operation key).
  2. Authenticate actor; verify owner/persona/role, lock child, and check expected version/state.
  3. Validate category, required scope, and item states; build immutable confirmed child snapshot.
  4. Invoke protected publish_requirement; receive this child's RFQ/result.
  5. Persist confirmation, operation result, and audit; commit all changes in one transaction.
  6. Return this child/RFQ result to the client.
Buyer -> Discovery: explicitly start discovery for the returned RFQ only after successful commit.
```

The wrapper must preserve every existing allowance/quota, duplicate, persona/role, ownership, audit, and transactional publishing check. It must not directly insert an RFQ or discover an RFQ by requirement as a recovery shortcut. Exact function grants, `SECURITY DEFINER` configuration, locking, and operation-key schema require design review and disposable validation.

## Failure and retry semantics

| Event | Required outcome |
|---|---|
| Authentication, ownership, role, or allowance check fails | No confirmation, RFQ, quota/credit, audit-success, or discovery side effect; return explicit authorization/eligibility error. |
| Expected child version is stale | No write; return conflict and current version metadata sufficient for buyer recovery. |
| Child contains invalid state or missing required customer scope | No publish; preserve draft edits and identify clarification/review requirement. Optional unaccepted suggestions remain excluded, not auto-accepted. |
| Protected `publish_requirement` fails | Entire wrapper transaction rolls back: no confirmed snapshot, RFQ, allowance consumption, or success audit. |
| Commit succeeds but response is lost | Retry with same owner/child/operation key and matching request fingerprint returns the same committed RFQ/result without a second allowance use or RFQ. A changed payload under the same key is rejected. |
| Concurrent confirm for same child/version | Serialize or use equivalent constraint-backed coordination; only one operation commits. Other request receives the same result or explicit conflict, never a second RFQ/quota charge. |
| Commit fails | No success-shaped response; surface error and retain recoverable client draft. |
| Discovery provider fails after publish | Publication remains committed. Record/report discovery failure separately; retry discovery only for the returned RFQ using existing invitation deduplication. |
| Buyer opens discovery before successful publish | Fail closed. Do not call `ensureRfqForRequirement` or any fallback that creates an RFQ. |
| Sibling child is published or fails | No effect on this child's transaction or RFQ; never use a group-wide transaction. |

## Current behavior versus proposal
- **Current:** intake client saves the requirement and then calls `publish_requirement` separately. The tracked function's transaction does not make the preceding client save atomic with publication.
- **Proposed:** one child-scoped database operation persists confirmation evidence and invokes the existing protected publication path in a single transaction with idempotent retry.
- **Not verified:** deployed function body/grants, rollback behavior, allowance semantics under retries, and effective RLS. These require authorized disposable validation.
