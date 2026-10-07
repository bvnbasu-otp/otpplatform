# Customer journeys

Two vocabularies exist. They are the same journey at different altitudes. Status: `IMPLEMENTED` as routes and copy. Completion of a real hosted transaction: `UNKNOWN`.

## Words

| Layer | Sequence | Source |
| --- | --- | --- |
| Product principle | TELL → REVIEW → DECIDE → TRACK | README; intake module is named TELL in `requirement-intake.ts` |
| Public site | Request → Compare → Decide → Purchase → Track | `PUBLIC_JOURNEY_STEPS` in `brand.ts` |
| Projection used by tracking | DRAFT → QUOTING → EVALUATING → AWARDED → PO_ISSUED → INVOICED → SETTLED, plus STALLED | `CanonicalGoldenState` and `deriveFivePointMilestoneProjection` in `packages/domain/src/types/track-milestone.ts` |

`RfqStatus` in `packages/domain/src/enums/procurement.ts` is a different set: `DRAFT`, `OPEN`, `CLARIFICATION`, `CLOSED`, `EVALUATING`, `AWARDED`, `CANCELLED`. The projection maps `OPEN` and `PUBLISHED` onto golden state `QUOTING`.

## Routes that carry the journey

From `apps/web/src/App.tsx`:

| Step | Route |
| --- | --- |
| Tell / request | `/intake` |
| Review before publish | `/requirements/:requirementId/rfq-review`, `/requirements/:requirementId/review-publish` |
| Decide / compare | `/rfq/:rfqId/evaluation` (also `/cockpit`, `/decision`, `/quotes`) |
| Committee | `/rfq/:rfqId/committee` |
| Award and reveal | `/rfq/:rfqId/award`, `/rfq/:rfqId/reveal` |
| Track | `/rfq/:rfqId/track`, `/purchase-orders/:poId` |
| Supplier quote | `/supplier/rfq/:rfqId/quote`, and `/q/:token` without an account |

## Golden state projection

`deriveFivePointMilestoneProjection` sets the golden state in this order: stalled if `isStalled`; else settled; else invoiced when an invoice is approved or paid, or when work-order progress is 100 and inspection passed or an invoice exists; else `PO_ISSUED` when a PO id or an issued/accepted/in-progress/completed PO status exists; else awarded; else evaluating; else quoting; else draft.

That function is a projection of the fields it is given. It is not itself a database trigger.

## Persona differences

| Persona | Decision |
| --- | --- |
| Individual | Direct award. No committee quorum in the RWA vote trigger, because that branch runs only for `org_type = COMMUNITY`. |
| RWA | Vote rules in [GOVERNANCE.md](../03-domains/GOVERNANCE.md). Quorum of 2 unconflicted recommend votes is inside `lock_and_reveal_award_atomic` (`00222`) when `org_type = COMMUNITY`. |
| MSME | Approval stages from `evaluate_and_stamp_approval_route_atomic` (`00237`). Award fails closed when the route applies and no stage exists (`00242`). |
