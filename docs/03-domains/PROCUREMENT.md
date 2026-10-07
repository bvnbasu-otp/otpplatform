# Procurement

Status: `IMPLEMENTED` as domain types, routes, and SQL functions listed here. A completed hosted procurement was not observed.

Journey map: [CUSTOMER_JOURNEYS.md](../01-product/CUSTOMER_JOURNEYS.md).

## Requirement

`packages/domain/src/types/requirement-intake.ts` describes four intake questions: what is needed, where, commercial details (including payment terms), and confirmation. Personas in that file are Individual, RWA, and MSME.

`RequirementStatus` (`packages/domain/src/enums/procurement.ts`): `DRAFT`, `SUBMITTED`, `RFQ_CREATED`, `QUOTING`, `NEGOTIATION`, `EVALUATION`, `AWARDED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

## RFQ

`RfqStatus`: `DRAFT`, `OPEN`, `CLARIFICATION`, `CLOSED`, `EVALUATING`, `AWARDED`, `CANCELLED`.

Publishing an RFQ is gated by entitlement in domain code (`evaluateRfqEntitlement`). The database function that consumes the allowance was not re-derived in this pass. Hosted enforcement of the count of 3 is `UNKNOWN`.

## Comparison

Buyer comparison is identity-protected until reveal. The evaluation screen is `/rfq/:rfqId/evaluation`. Legal identity is a reveal result, not a column on the comparison the buyer uses before the decision. The exact masked view columns were not re-listed field by field in this pass beyond price, GST, delivery, and warranty named in public copy (`site-content.ts` journey body and pillars).

## Clarification

Route `/rfq/:rfqId/clarification` exists. `close_clarification_for_evaluation` is cited by migration `00238` as the function that auto-seats `MANAGER` and `BUYER` members. That auto-seat must not be treated as a vote. The vote trigger requires a real appointment as well.

## Decision

Individual: the buyer awards. RWA: committee votes, then an owner or manager locks the award (`lock_and_reveal_award_atomic` checks `is_org_manager_or_above`). MSME: approval stages must be satisfied before lock (`pending` stage count) and before PO creation (`00245`).

OTP does not select the winning supplier. The justification is an argument to `lock_and_reveal_award_atomic` (`p_justification`).
