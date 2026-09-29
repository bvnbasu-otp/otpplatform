# OTP Governance Model

**Authority:** Level 3 — current governance truth  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

Two layers exist. Do not collapse them.

1. **Domain engine** — `packages/domain/src/identity/authorization-chain.ts` and `packages/domain/src/types/rwa-governance.ts`. Pure functions. They run when the application calls them.
2. **Database** — RLS, award RPC (`00199`), organisation role migrations (`00190`, `00196`, `00197`). They run when the migration has been applied and the RPC is used.

A rule that exists only in the domain engine is **IMPLEMENTED in domain, call-site dependent**. It is not automatically a database invariant.

## Identity chain (as coded)

The file header lists thirteen stages. The implementation evaluates them in order:

Person → authenticated identity → persona context → organisation → eligibility → membership → role → responsibility → delegation → authority → transaction → effective date → audit attribution.

Persona values in the chain: `INDIVIDUAL`, `RWA`, `MSME`, `SUPPLIER`, `PLATFORM_ADMIN`.

The chain’s own comment says authority does not bleed across personas. That is the intended invariant of this module. A live test that one human’s RWA vote cannot satisfy an MSME approval was not run for this baseline.

## Individual

| Rule | Where | Status |
| --- | --- | --- |
| No committee | `BUYER_PERSONA_CONFIGS.INDIVIDUAL.requiresGovernanceCommittee = false`. Quorum 1. Role list `OWNER`. | Domain config |
| No committee vote | `CAST_COMMITTEE_VOTE` returns `ERR_INDIVIDUAL_NO_COMMITTEE_VOTING`. | Domain engine |
| Direct award | Comment in the chain: “direct 1-click authority for personal intake/RFQs/PO without committee.” The vote block is the enforced branch. Other actions fall through. | INTENDED for non-vote actions |
| UI | `AwardPage.tsx` labels the justification “Recorded Committee Consensus” with no persona check found in that block. | Presentation does not follow the domain rule |

There is no delegate or quorum model for an individual in the persona config.

## RWA

Canonical role ids in the domain engine (`CANONICAL_RWA_ROLES`):

`PRESIDENT`, `VICE_PRESIDENT`, `SECRETARY`, `JOINT_SECRETARY`, `TREASURER`, `ESTATE_MANAGER`, `COMMITTEE_MEMBER`.

Signup and persona config also use coarser labels (`OWNER`, `MANAGER`, `COMMITTEE_MEMBER`, `APPROVER`, `VIEWER`). Both lists are in the repository. They are not the same list. **PRODUCT DECISION is not required to notice the mismatch; implementers must not assume a signup role string equals a canonical RWA role id.**

| Actor | Domain rule | Database |
| --- | --- | --- |
| Resident without appointment | Role id `RESIDENT_MEMBER` cannot `CAST_COMMITTEE_VOTE` (`ERR_RESIDENT_NOT_COMMITTEE`). | NOT VERIFIED as a trigger. |
| Committee member | May vote unless COI is declared (`ERR_COI_RECUSAL`). | Vote tables exist. Live ballot: NOT VERIFIED. |
| Explicit appointment | Modelled as an active role assignment with `effectiveFrom` / `effectiveTo`. | `00190` / `00197` add org role lifecycle. Live office change: NOT VERIFIED. |
| Estate / facility manager | Responsibility `OPERATIONS`. `CAST_COMMITTEE_VOTE` fails with `ERR_ESTATE_MANAGER_CANNOT_VOTE`. `canVote` helper returns false for this role. | NOT VERIFIED as a trigger on the vote RPC. |
| First RFQ | `evaluateRwaCommitteeRfqGate`: needs an active President or Secretary, and at least two active assignments. An estate manager alone does not satisfy the executive-lead check. | **Call site in the publish UI: NOT FOUND** (only the governance experience test calls it). Do not describe this as a live server block. |
| Quorum | Persona default 2. Charter text in `organization-charter.ts`: collective procurement above the operational limit needs quorum (minimum 2 votes). Award RPC in `00199` keeps prior quorum / COI / anti-self-approval text (static test asserts those lines were not removed). | Static only. |
| Weights | Weighted tally UI exists (`WeightedTallyTable.tsx`). The numeric weight each office carries: read from the assignment when the vote is cast. A single weight table was not re-derived for this baseline. | NOT VERIFIED IN PRODUCTION. |
| Term | Charter and chain describe a 365-day term. Past decisions stay attributed to the person who acted. | Column support is in the role-lifecycle migrations. Live expiry job: NOT VERIFIED. |
| Anti-self-approval | Domain: the creator cannot approve their own delegated spend (`ERR_ANTI_SELF_APPROVAL_VIOLATION`). | Kept inside the award function by the `00199` line-diff test. Live: NOT VERIFIED. |

The customer-facing string `canVote = false` appears in the RWA agreement modal and on the estate-manager home card. That string is an internal flag, not the rule. The rule is the vote refusal above.

## MSME

Canonical ids in the domain engine: `PRIMARY_OWNER`, `MANAGER`, `MEMBER`, `DELEGATE`.

Persona config roles: `OWNER`, `MANAGER`, `BUYER`, `APPROVER`, `VIEWER`. Same caution as RWA: two vocabularies.

| Rule | Where |
| --- | --- |
| No committee requirement | `requiresGovernanceCommittee = false`. Default quorum 1. |
| Tax registration expected | `requiresTaxRegistration = true` in the persona config. Signup does not run `validateGstin`. |
| Delegation | Active delegation has start, expiry, spend cap, and a ban on self-delegation. |
| Anti-self-approval | Same domain error as RWA when the creator approves delegated spend. The public MSME agreement labels this “PA-09”. PA-09 is an internal id. |
| Spend tiers | `packages/domain/src/types/approval-matrix.ts` lists amount tiers and role names. Whether every tier is enforced inside `lock_and_reveal_award_atomic`: the `00199` test says the previous tier text was kept. Live amounts: NOT VERIFIED. |

## Audit attribution

The chain’s last stage builds an attribution tuple in memory (person, role, time, action). Database audit rows are written by individual RPCs, not by that TypeScript stage. A UI action that never calls the chain does not get a chain tuple.

**NOT VERIFIED IN PRODUCTION** for a real vote, award, or role change.

## What this baseline will not claim

- That a former committee member is locked out the moment `effectiveTo` passes, on the live database.
- That quorum cannot be bypassed by a direct API call on production, until `00199` is confirmed applied and the vote RPC is re-tested there.
- That the estate manager cannot draft an RFQ. The domain gate is about committee readiness, and it is not wired to the publish page in the search performed for this baseline.
