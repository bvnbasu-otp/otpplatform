# Procurement

Status: `IMPLEMENTED` as domain types, routes, and SQL functions listed here. A completed hosted procurement was not observed.

Journey map: [CUSTOMER_JOURNEYS.md](../01-product/CUSTOMER_JOURNEYS.md).

## Requirement

`packages/domain/src/types/requirement-intake.ts` describes four intake questions: what is needed, where, commercial details (including payment terms), and confirmation. Personas in that file are Individual, RWA, and MSME.

`RequirementStatus` (`packages/domain/src/enums/procurement.ts`): `DRAFT`, `SUBMITTED`, `RFQ_CREATED`, `QUOTING`, `NEGOTIATION`, `EVALUATION`, `AWARDED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

## RFQ

`RfqStatus`: `DRAFT`, `OPEN`, `CLARIFICATION`, `CLOSED`, `EVALUATING`, `AWARDED`, `CANCELLED`.

Publishing an RFQ does not consume an allowance. On the isolated local database, migrations `00286` and `00289` consume one included monthly allowance, one yearly quarterly bonus, or one unexpired purchased extra-RFQ credit when the first comparison-eligible supplier quote is persisted. No qualifying supplier response consumes nothing. A quote that fails that eligibility does not consume. Revisions, retries, duplicate events, and another eligible quote for the same RFQ do not consume a second entitlement. Cancellation before a qualifying quote consumes none. Cancellation after consumption does not refund. Purchased credits expire with the subscription and are not transferred on renewal. A quote outside the RFQ's UTC month fails closed with `PILOT_ALLOWANCE_PERIOD_UNDECIDED`; cross-month charging is not defined. Individual buyers keep `organization_id` null.

Local code and the isolated database tests verify that rule. Hosted enforcement is NOT VERIFIED. CI for the unchanged base commit does not apply these uncommitted migrations.

The buyer allowance label and the publish check call `get_buyer_pilot_allowance`. They do not recount consumption rows and they do not close a confirmed purchased credit before that result. An incomplete result keeps publishing closed. Administrative pilot checks are the service-role paths only; an authenticated caller cannot activate legal enforcement or turn the purchase simulator on.

## Agreements

Buyer and Supplier agreements are separate rows (`CUSTOMER_EULA`, `SUPPLIER_EULA`), both version `v1.0-20261014`, both `PENDING_LEGAL_APPROVAL`. The seeded hash on both rows is `sha256:7c8b0303d8a9e7019cf39e2df95000be05e527d91d8e13711311ffb43c683b5d`. Migration `00276` records that this shared hash is the previously asserted browser value and is not evidence that the two documents are identical. Both rows point at `/legal/terms`. That page states it is not final legal text. Legal review and GST review are pending. No approval evidence is recorded.

Acceptance rows are per agreement, version, and hash, and they are retained. A stale version or hash is rejected. A Buyer acceptance does not satisfy the Supplier agreement. A profile with both capabilities must accept both. Existing users receive 30 calendar days only after a rollout timestamp is recorded; the deadline instant is not inside the grace window. Enforcement is disabled. `rollout_at` is unset. Migration `00290` refuses activation while either current agreement is not approved. This working tree does not approve either agreement and does not set the rollout timestamp. Hosted application of `00276`, `00279`, `00284`, and `00290` was not queried.

## Comparison

Buyer comparison is identity-protected until reveal. The evaluation screen is `/rfq/:rfqId/evaluation`. Legal identity is a reveal result, not a column on the comparison the buyer uses before the decision. Local migration `00288` ranks persisted quotes as L1, L2, or L3 from landed cost, score, submission time, and quote id, and only quotes that pass `private.quote_is_comparison_eligible` are ranked. That same predicate gates allowance consumption. Hosted enforcement of this view is NOT VERIFIED.

## Clarification

Route `/rfq/:rfqId/clarification` exists. `close_clarification_for_evaluation` is cited by migration `00238` as the function that auto-seats `MANAGER` and `BUYER` members. That auto-seat must not be treated as a vote. The vote trigger requires a real appointment as well.

## Decision

Individual: the buyer awards. RWA: committee votes, then an owner or manager locks the award (`lock_and_reveal_award_atomic` checks `is_org_manager_or_above`). MSME: approval stages must be satisfied before lock (`pending` stage count) and before PO creation (`00245`).

OTP does not select the winning supplier. The justification is an argument to `lock_and_reveal_award_atomic` (`p_justification`).
