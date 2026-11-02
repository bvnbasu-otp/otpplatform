# B2-09 — Functional Acceptance and Regression Specification

All tests below are **NOT RUN**. Existing files are read-only candidates for extension; proposed test names are not created.

| ID | Preconditions / action | Expected result | Boundary and existing evidence | Future verification |
|---|---|---|---|---|
| A01 | One clear scope with several related lines | One child, one category, all relevant lines retained | Parser / group; existing parser tests | Unit + persistence |
| A02 | Two unrelated scopes in different categories | Two independently reviewable child drafts | Parser / group | Unit + E2E |
| A03 | Same category but unrelated scopes | Separate children | Scope classifier | Unit |
| A04 | Several activities in one coherent scope | One child, not one per activity | Parser | Unit |
| A05 | Mixed boundary/category unclear | Clarification; no ready/publish child | Parser/review | Unit + UI |
| A06 | One legitimate product/repair with one line | One line accepted; no unrelated second suggestion | Recommendation/UI | Unit |
| A07 | Customer-stated item parsed | Initial `ACCEPTED`, evidence retained; child still needs confirmation | Item persistence | Integration |
| A08 | OTP suggestion created and edited but left unaccepted; customer confirms an otherwise valid child | Suggestion remains `SUGGESTED` and is excluded from the confirmed/published supplier scope; the child may publish if its required customer-stated/accepted scope is otherwise valid | Item API/RPC/view | Integration |
| A09 | Buyer accepts suggestion then confirms child | Accepted item included in frozen version | RPC | Integration |
| A10 | Buyer rejects suggestion | `REJECTED`, audit retained, excluded from active supplier view and future same-key suggestions | Item persistence | Integration |
| A11 | Buyer deletes item | `TOMBSTONED`, history retained, excluded from supplier view | Item persistence/view | Integration |
| A12 | Reparse after buyer edit/reject/tombstone | Stable ID/edit preserved; rejected/tombstoned suggestion not revived | Parser reconciliation | Unit + integration |
| A13 | Confirm one of N children | Only that child confirmed/published; siblings unchanged | RPC | DB integration |
| A14 | Publication raises after confirmation attempt | Full rollback; no RFQ/entitlement/audit publication side effect | Atomic RPC | Disposable DB |
| A15 | Concurrent confirm same version/key | One publication; other response replays same RFQ or explicit safe conflict; one allowance use | Lock/idempotency | Disposable DB |
| A16 | Confirm with stale expected version | Explicit conflict; no confirmation/publication | RPC | Integration |
| A17 | Response timeout after DB commit then retry | Same RFQ returned; no duplicate RFQ/quota/audit | RPC | Fault-injection integration |
| A18 | Publication fails, discovery route is attempted | No discovery call/invitation; route fails closed without RFQ creation | Intake/router | Existing `discover-explicit-flow.test.ts` does not prove this failure gate; add E2E and RPC integration |
| A19 | Successful child publication then buyer starts discovery | Only that child RFQ is searched/invited | Discovery API | Existing explicit-flow tests; multi-child E2E |
| A20 | Discovery provider fails / zero matches then retry | Accurate distinct status; existing invites reused; no duplicate invite | Discovery RPC | Disposable integration |
| A21 | Child version changes after publication | Published snapshot unchanged; amendment/revalidation required before rediscovery | Version/RFQ | Integration; amendment decision needed |
| A22 | Parent has mixed child statuses | Parent summary correct; no group-wide transition | Parent API/UI | Unit + E2E |
| A23 | Buyer switches account/logs out | Previous memory/cache inaccessible; exact new owner key only | Recovery | Extend `draft-isolation.test.ts` |
| A24 | Same org, different profiles / same profile, different scope / Individual null org | No cross-scope cache or server access | Storage/RLS | Unit + role matrix |
| A25 | User knows group ID but not child rights | Child read/edit/confirm denied | RLS/RPC | Disposable RLS |
| A26 | Supplier invited to child A, not B | Sees only published A accepted items and child description | Masked view | Disposable RLS + supplier detail |
| A27 | Supplier queries for original text, group metadata, sibling, suggested/rejected/tombstoned item | No such fields/rows exposed | View/RLS | Leakage tests |
| A28 | Existing group-null RFQ/quote flow | Unchanged; no backfill or new mandatory parent field | Migration compatibility | Full-chain disposable |
| A29 | Existing whole-RFQ quote/revision/award/PO | Snapshot and lifecycle remain unchanged | Supplier quote | Existing `supplier-quote-submission.test.ts`; regression suite |
| A30 | Individual, RWA, MSME representative roles | Existing owner/member/delegate limits retained | RLS/RPC | Disposable role matrix |
| A31 | `requirement_specifications` exists with unknown/overlapping semantics | No migration assumes it absent or repurposes it | Schema review | Requires authorized metadata/schema evidence |
| A32 | Mobile 320/375/430 px and keyboard/screen reader | Review/confirmation usable and state announced | UI | Existing `create-requirement-mobile.test.ts`; new E2E/a11y |

## Evidence note
No test was executed. Existing tests prove only their authored assertions; e.g. `draft-isolation.test.ts` passes user IDs explicitly and does not establish production call-site isolation. `publish-and-allowance.test.ts` verifies current client update-before-publish behavior, not atomic confirmation. `discover-explicit-flow.test.ts` checks explicit discovery paths but not the new atomic publish failure gate.
