# B2 DEP-02 — Atomic Publication and Retry Status

## Status

**Partially verified from tracked source; runtime behavior remains unverified and requires separate authorization.**

## Static evidence

- The tracked `publish_requirement` function performs its requirement/RFQ/credit/evaluation/audit database work within the function's transaction.
- The client currently saves the draft and invokes publication as separate operations. This is not an atomic confirmation-plus-publication boundary.
- Existing duplicate protection rejects a requirement already associated with an RFQ; tracked code does not establish replay-safe idempotency for a timed-out client retry.
- The existing protected publication path remains the required path for each confirmed child RFQ. A draft group must not bypass allowance, quota, persona/role, ownership, duplicate, or supplier-discovery protections.

Static inspection does not prove deployed function definitions, effective grants/policies, transaction outcomes, or external side-effect sequencing.

## Runtime proof still required

Before treating this dependency as closed, separately authorize tests in a named disposable environment proving:

1. Successful publication commits one RFQ and its associated allowance/audit effects.
2. Failure at each relevant step rolls back database effects.
3. Timeout followed by the same operation key returns/reconciles the original result without a second RFQ or allowance charge.
4. Duplicate and concurrent confirmation attempts produce one correct outcome.
5. Discovery begins only after successful publication commit and does not run on rollback.
6. Existing Individual, RWA, and MSME authorization and quota behavior remains intact.

External supplier providers, invitations, email, WhatsApp, and dispatch must remain mocked or excluded.

## Actions not performed

No migration, database/Docker test, hosted operation, supplier discovery, or publication was run in this evidence task. This document does not approve any of those operations.
