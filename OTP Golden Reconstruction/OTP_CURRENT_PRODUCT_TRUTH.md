# OTP Current Product Truth

**Authority:** Level 1 — current product truth  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Migration files on disk:** `00001` through `00215` (215 files)  
**Live application and live database:** UNKNOWN / REQUIRES VERIFICATION

This document describes the product that the repository implements. It is not a roadmap and it is not a certification.

## What OTP is

OTP (Open Trade & Procurement) is an identity-protected competitive sourcing product for buyers in India.

A buyer describes a requirement. Suppliers who are invited submit quotes under an alias. The buyer, or a committee where the buyer model requires one, chooses. The chosen supplier’s legal identity is shown after that decision. The buyer pays the supplier directly. OTP records the procurement. OTP does not, in the settlement screen that ships today, collect or hold the buyer’s payment to the supplier.

The public journey is:

**TELL → REVIEW → DECIDE → TRACK**

On the public site the same journey is labelled Request → Compare → Decide → Purchase → Track (`apps/web/src/features/site/content/site-content.ts`).

The product principle is:

> OTP does the procurement work. The customer makes the decision.

## Who it serves

| Participant | In the repository |
| --- | --- |
| Individual buyer | Signup type `INDIVIDUAL`. Persona config: no committee, fast-track intake, quorum 1 (`packages/domain/src/types/buyer-persona.ts`). |
| RWA / housing society | Signup type `COMMUNITY`. Persona `RWA`. Committee, quorum default 2, full-governance intake in the persona config. |
| MSME | Signup type `MSME`. Tax registration expected by the persona config. Fast-track intake. Delegates and spend rules exist in the domain authorization chain. |
| Supplier | Separate signup (`/signup?side=supplier`). Quotes under an alias until award reveal. |
| Platform operator | `private.is_platform_admin()` plus admin screens. See the security baseline. |

## What the buyer does

1. **Tell.** Describe the need in ordinary language. Location comes from the buyer’s address. The repository removed a hard-coded Tiruppur / 560001 fallback in an earlier remediation (issue 06). A Bengaluru city prefill on the public signup form is still present.
2. **Review.** Compare quotes on price, delivery, and warranty. Supplier legal names are withheld on the comparison view.
3. **Decide.** The buyer or the authorised committee awards. OTP does not select the winner.
4. **Track.** Purchase order, work milestones, invoice, and a recorded off-platform payment (UTR).

## What OTP does not currently do

- It is not a live ONDC marketplace.
- It is not a live BNI marketplace.
- It does not move buyer-to-supplier funds through OTP in the settlement flow that the UI describes.
- It does not prove GST verification by painting “GST verified” on a discovery card. That badge is hard-coded in the client. See the supplier-network truth.
- It does not have a production-verified database. Applying migrations `00196`–`00215` on the live project is UNKNOWN.

## Internal engines that are not the customer journey

The repository also contains a longer internal step list (a 15-step monotonic engine) and admin telemetry. Those are operator machinery. The customer-facing commercial states are the seven states plus `STALLED`, documented in `OTP_PROCUREMENT_STATE_MACHINE.md`.

## Capability matrix

Legend: **Repo** = present in this repository. **Tested** = automated test exists in the repo (static SQL contract tests are marked Static). **Live** = observed on the deployed application or live database in the 28 Sep 2026 review. Almost every live cell is NO or UNKNOWN.

| Capability | Implemented | Tested | Production verified | Status |
| --- | ---: | ---: | ---: | --- |
| Individual buyer | Partial | Yes (domain + signup tests) | Signup form only | Role exists. Award copy still says “committee consensus”. |
| RWA | Partial | Yes (domain gate tests) | Signup form only | Committee model is in domain code. Live vote not run. |
| MSME | Partial | Yes (persona tests) | Signup form only | GSTIN checksum is not enforced on `submit_signup_request`. |
| Supplier onboarding | Partial | Yes (registration outcome tests) | Public form only | Ends PENDING. Approval is an operator step. |
| Protected quotes | Yes (view) | Static SQL + client tests | UNKNOWN | `quotes_identity_protected` returns alias and commercial terms to org members. |
| Quote comparison | Yes (UI + view) | Yes | UNKNOWN | Signed-in comparison not exercised on 28 Sep. |
| Identity reveal | Yes (view + pages) | Static SQL | UNKNOWN | Reveal view exposes identity only when RFQ is `REVEALED` and quote is `SELECTED`. |
| Award | Yes | Static SQL for caller guard in `00199` | UNKNOWN | Guard is in the migration file. Live execution UNKNOWN. |
| Committee voting | Partial | Domain tests | UNKNOWN | Domain forbids individual and estate-manager votes. Server path not re-executed. |
| PO | Yes | Document-model tests | UNKNOWN | |
| Invoice | Yes | Balance-panel tests | UNKNOWN | |
| Settlement / UTR | Yes (record only) | CTA tests | Copy seen in source; live flow UNKNOWN | UI says OTP does not hold funds. |
| Wallet | Yes (tables + RPCs) | Domain policy tests | UNKNOWN | Credit RPC has an open security finding. |
| Supplier discovery | Partial | Client tests | UNKNOWN | Cards invent GST, distance, and availability. |
| GST verification | Partial | Domain checksum tests | UNKNOWN | Checksum exists. Signup RPC does not call it. `verify_supplier_gstin` records a submission for review. |
| ONDC | No live integration | Adapter tests | No | Adapter returns a fabricated supplier when enabled. FAQ says not live. |
| BNI | No live integration | Adapter tests | No | Stub adapter. FAQ says not live. |
| Notifications | Partial | Status-semantics tests | UNKNOWN | Delivery webhooks not established as live. |
| Admin | Yes | Account-lifecycle tests | UNKNOWN | Dangerous RPCs exist. Live grants UNKNOWN. |
| Founder telemetry | Partial | Some founder tests | UNKNOWN | `get_founder_executive_metrics` exists. No live dashboard was opened. |

## Related documents

- Lifecycle: `OTP_PROCUREMENT_STATE_MACHINE.md`
- Roles: `OTP_GOVERNANCE_MODEL.md`
- Suppliers: `OTP_SUPPLIER_NETWORK_TRUTH.md`
- Money: `OTP_FINANCIAL_TRUTH.md`
- Security: `OTP_SECURITY_BASELINE.md`
- Public copy: `OTP_PUBLIC_SITE_TRUTH.md`
