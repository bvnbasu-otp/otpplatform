# OTP Master Issue Register

**Authority:** Level 4 — issue status as of this baseline  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

Original 32-issue source: `R2-31-32-Issue-Root-Cause-Remediation-Report.md` (26 Sep 2026, local tree, highest migration then `00198`).  
Follow-on source: `R2-32-Privileged-RPC-Identity-Masking-Server-Enforcement-Report.md` (27 Sep 2026, migration `00199` added, **never executed** on a database in that session).  
Later migrations `00200`–`00215` exist at HEAD. They were not re-certified as a suite in this documentation phase.  
28 Sep audits: pre-login black-box, Grok repository audit, logged-out browser pass. See `OTP_AUDIT_HISTORY.md`.

Status meanings:

| Status | Meaning |
| --- | --- |
| OPEN | Still wrong in the files, or still undecided. |
| FIXED-UNVERIFIED | A later change in the repo addresses it. Tests may be static. Production not shown. |
| VERIFIED | Proven on the live application or live database. **None of the rows below are VERIFIED.** |
| PRODUCTION-VERIFICATION | The repo may be fixed and the live database is unknown. |
| PRODUCT-DECISION / LEGAL-DECISION | Do not close in code until an owner decides. |
| DEFERRED | Explicitly out of the current remediation. |
| DUPLICATE | Same defect as another id. |

## Issues 01–32

| ID | Area | Current status | Repository state | Production | Next action |
| --- | --- | --- | --- | --- | --- |
| 01 | Public content | FIXED-UNVERIFIED for titles/dates in the R2-31 pass. Remaining copy conflicts are FIN-* and LEG-* | Canonical title work landed. Contradictions remain. | Public pages seen 28 Sep still show draft legal text and fee conflicts | Do not re-open the title work. Track FIN/LEG separately. |
| 02 | Logos / favicon | FIXED-UNVERIFIED | Asset test described in R2-31 | Not re-checked pixel by pixel | None until a visual pass |
| 03 | Admin lifecycle | FIXED-UNVERIFIED | Audited block/unblock path; hard-delete UI removed in that pass | UNKNOWN | Re-test on a database before relying on it |
| 04 | Referral ₹0 and safe URL | FIXED-UNVERIFIED | Domain tests for ₹0 and URL sanitising | UNKNOWN | Keep ₹0 until a product decision says otherwise |
| 05 | Address persistence | FIXED-UNVERIFIED | Client uses RPC. `00199` adds ownership check on update (static) | UNKNOWN | Confirm `00199` applied before pilot |
| 06 | Intake prefill | FIXED-UNVERIFIED | Tiruppur / fake PIN fallback removed in that pass. Bengaluru prefill on signup remains (observation) | UNKNOWN | Do not restore fake PIN |
| 07 | Idempotent publish | FIXED-UNVERIFIED | Client tests in R2-31 | UNKNOWN | Live publish still required |
| 08 | No synthetic quotes on real RFQs | FIXED-UNVERIFIED and PRODUCTION-VERIFICATION | Client guard plus `00198` wrapper. Live stub flag UNKNOWN | UNKNOWN | Read the settings row before pilot |
| 09 | A4 PDF | FIXED-UNVERIFIED for PO document model. DEFERRED for comparison and decision-receipt print | `procurement-document` tests | UNKNOWN | Do not treat all print buttons as done |
| 10 | Governance charter on profile | FIXED-UNVERIFIED as display. DEFERRED: no charter table for admin bulk editing | Charter panel mounted | UNKNOWN | Display only |
| 11 | Milestone steps | FIXED-UNVERIFIED | `00199` trigger text plus client change. R2-32: migration not executed there | UNKNOWN | Execute on a database, then on production only after verification |
| 12 | One settlement CTA | FIXED-UNVERIFIED | `settlement-state.ts` tests | UNKNOWN | Copy still part of FIN-1 |
| 13 | TDS base | FIXED-UNVERIFIED | `00199` server-derived base, one live row. Static tests | UNKNOWN | Same as 11 |
| 14 | Invoice balances from data | FIXED-UNVERIFIED | Placeholder phone and “Assigned Supplier” removed in that pass | UNKNOWN | Live invoice |
| 15 | Real completion blockers | FIXED-UNVERIFIED | Blocker list tests | UNKNOWN | Live PO |
| 16 | Footer at 320px | FIXED-UNVERIFIED | Static class tests only. R2-31 says not device-rendered | 28 Sep mobile pass did not fully stress footer overlap | Device check still open |
| 17 | Address fields visible | FIXED-UNVERIFIED | Card changes. `delivery_instructions` column absent (shares landmark) | UNKNOWN | Do not invent a column |
| 18 | Voice permission copy | FIXED-UNVERIFIED | Tests in R2-31 | UNKNOWN | None |
| 19 | IST timestamps | FIXED-UNVERIFIED on golden-journey surfaces. DEFERRED for some admin screens | Formatter tests | UNKNOWN | None for pilot buyer path |
| 20 | Buyer name hidden from supplier | FIXED-UNVERIFIED | Client guards. `00199` SEC-7 rewrites the masked view. Static | UNKNOWN | Confirm view on live DB |
| 21 | Places quota label | FIXED-UNVERIFIED | Shared UTC window | Places key UNKNOWN | Do not claim Places is live |
| 22 | 3 RFQ allowance | FIXED-UNVERIFIED | `00199` trigger. Static. Admins bypass | UNKNOWN | Confirm trigger exists live |
| 23 | Public chrome labels | OPEN | R2-31 removed “Procurement Cockpit” phrases. `MobileSimulatorFrame` still wraps `SiteLayout`. Live site showed Desktop/Mobile buttons on 28 Sep | Seen live | Remove the frame from customer pages in a later code phase. Not in this doc phase. |
| 24 | One public journey | FIXED-UNVERIFIED | `PublicJourney` Request→Track. Live landing matched on 28 Sep | Public page only | None |
| 25 | Homepage CTA count | FIXED-UNVERIFIED | R2-31 reduced CTAs. Not re-counted on 28 Sep beyond the hero | Partial live look | None unless a new CTA appears |
| 26 | Provenance hidden publicly | FIXED-UNVERIFIED | Render test for anonymous vs founder | Not re-opened while logged out | None |
| 27 | No technical public FAQ | OPEN | Architecture tab removed in R2-31. Pricing and agreements still show PA-09, LaTeX, “Institutional Procurement OS” | Seen live | Content fix in a later phase. Legal pages are LEG-1, not this row. |
| 28 | Supplier RFQ payload | FIXED-UNVERIFIED | Client allow-list. Server column grant in `00199` SEC-6. Static | UNKNOWN | Live supplier session |
| 29 | Honest notification status | FIXED-UNVERIFIED for copy semantics. Delivery webhooks not established | Status helper tests | UNKNOWN | Do not show “delivered” without a provider receipt |
| 30 | OTP not shown as success when unknown | FIXED-UNVERIFIED | App copy. `00208` revokes legacy code-return functions in repo | UNKNOWN | Confirm `00208` on live DB |
| 31 | Scroll model | FIXED-UNVERIFIED | Static layout tests. Not device-proven in R2-31 | Partial | Device pass |
| 32 | Duplicate bottom CTAs | FIXED-UNVERIFIED for the shell rule. DEFERRED docks inside admin and active-RFQ pages | Nav tests | UNKNOWN | None for first public pages |

### Security items that were “BLOCKED” on 26 Sep and edited on 27 Sep

| ID | Was | Now | Note |
| --- | --- | --- | --- |
| SEC-1 award RPC | OPEN, anon grant | FIXED-UNVERIFIED | `00199` text. Not executed in R2-32. Production UNKNOWN. Also tracked as contradiction SEC-1. |
| SEC-2 bulk delete | OPEN | FIXED-UNVERIFIED | Deactivate, not hard delete, in `00199` text. |
| SEC-3 / SEC-4 admin RPCs | OPEN | FIXED-UNVERIFIED and PRODUCTION-VERIFICATION | Sweep is in `00199`. Live catalog UNKNOWN. |
| SEC-5 address update | OPEN | FIXED-UNVERIFIED | Ownership check in `00199` text. |
| SEC-6 / SEC-7 identity columns | OPEN | FIXED-UNVERIFIED | `00199` text. |

Do not mark these VERIFIED.

## Findings opened on 28 Sep 2026

| ID | Severity | Area | Status | Evidence | Next action |
| --- | --- | --- | --- | --- | --- |
| AUD-SEC-001 | Critical | Wallet | FIXED-UNVERIFIED | `00216` rewrites `credit_buyer_settlement_reward_atomic`; anon revoked. | Apply `00216` on staging; verify grants live. |
| AUD-SEC-002 | Critical if live DB is old | Admin RPC | PRODUCTION-VERIFICATION | `PROD_CONTAINMENT/README.md` versus migrations `00199`–`00215` | Read-only catalog query. Do not assume. |
| AUD-SEC-003 | High | Admin identity | OPEN | Email allowlist in `is_platform_admin()` (`00179`) | Security design. Not a copy fix. |
| AUD-SEC-004 | Medium | Quote views | OPEN | `anon` grant on masked views | Defence in depth after AUD-SEC-002 |
| AUD-UX-001 / SUP-1 | High | Discovery | FIXED-UNVERIFIED | `rfq-lifecycle.ts` / `SupplierCard` truthful mapping | Live discovery session |
| AUD-TRUST-001 / FIN-1 | High | Money | PRODUCT-DECISION | See contradiction register | Owner decides before copy or fee code changes |
| AUD-LEGAL-001 / LEG-1 | High | Legal | LEGAL-DECISION | Live draft banners | Counsel |
| AUD-UX-002 / SUP-2 | Medium | Signup | FIXED-UNVERIFIED | PIN banner neutral copy | Signup UX pass |
| AUD-GST-001 | Medium | Signup | FIXED-UNVERIFIED | GSTIN UI no longer claims registry lookup | Signup UX pass |
| AUD-UX-003 / GOV-1 | Medium | Award | FIXED-UNVERIFIED | Committee label conditional on `rfqOrgId` | Award flow live |
| AUD-UX-005 / REL-1 | High | Routing | FIXED-UNVERIFIED | `/register` → `/signup` | Public route check |
| AUD-UX-006 / REL-2 | Medium | Chrome | FIXED-UNVERIFIED | Simulator frame removed from `SiteLayout` | Public site |
| AUD-UX-004 | Low | Pricing | FIXED-UNVERIFIED | LaTeX replaced with plain language | Public pricing |

## Duplicates

| ID | Same as |
| --- | --- |
| AUD-UX-001 | SUP-1, SUP-4 |
| AUD-TRUST-001 | FIN-1, FIN-2, FIN-3 |
| AUD-LEGAL-001 | LEG-1, LEG-2 |
| AUD-UX-005 | REL-1 |
| AUD-UX-006 | REL-2 and the remainder of issue 23 |
| Issue 20 and 28 server half | SEC-6, SEC-7 |

## Explicitly not closed

Anything whose only evidence is “the migration file exists” or “a unit test renders markup”.
