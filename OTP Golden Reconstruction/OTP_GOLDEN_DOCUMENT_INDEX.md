# OTP Golden Document Index

**Start here.**  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Migration files on disk:** `00001`–`00215`  
**Live database and deployed SHA:** UNKNOWN / REQUIRES VERIFICATION

## Authority levels

| Level | Use it for |
| --- | --- |
| 1 Current product truth | What OTP is, who it serves, what the screens claim |
| 2 Current technical truth | How the code maps states and data |
| 3 Security and governance | What the code enforces, and what is still open |
| 4 Pilot and release | Gates, issues, production verification |
| 5 Historical audits | Evidence. Not a certificate of today’s production |
| 6 Deferred | Explicitly not a current defect |

If two documents disagree, the higher authority level in this index wins for “what is true now”. Historical files win only as a record of what was written then.

## Current documents (this baseline)

| File | Purpose | Level | Verified against | Implementation | Production |
| --- | --- | --- | --- | --- | --- |
| `OTP_CURRENT_PRODUCT_TRUTH.md` | What OTP is today, capability matrix | 1 | Source at HEAD, 28 Sep | Describes the repo | Not a production certificate |
| `OTP_UX_BASELINE.md` | Intended simplicity, separate from bugs | 1 | Source and live public notes | Intent plus observations | Public site only |
| `OTP_PUBLIC_SITE_TRUTH.md` | Landing, about, FAQ, pricing, signup, legal | 1 | Live URL 28 Sep and source | Copy classified | Logged-out pages |
| `OTP_SUPPLIER_NETWORK_TRUTH.md` | Which supplier signals are real | 1 | Adapters and discovery mapper | Repo | Not live-queried |
| `OTP_FINANCIAL_TRUTH.md` | Three money streams and open conflicts | 1 | Domain policy and settlement UI | Repo | Not live-queried |
| `OTP_CONTRADICTION_REGISTER_CURRENT.md` | Unresolved conflicts | 1 | Cross-documents | Labels only | n/a |
| `OTP_PROCUREMENT_STATE_MACHINE.md` | DRAFT through SETTLED, plus STALLED | 2 | `track-milestone.ts` and migrations | Repo | Not walked live |
| `OTP_GOVERNANCE_MODEL.md` | Individual, RWA, MSME rules | 3 | Authorization chain and RWA gate | Domain vs DB called out | Not live |
| `OTP_SECURITY_BASELINE.md` | Controls and open findings | 3 | Migrations `00179`, `00181`, `00198`, `00199`, `00208`, `00210` | Repo | Grants UNKNOWN |
| `OTP_PILOT_READINESS.md` | Gates, no single score | 4 | The documents above | n/a | Gates not passed |
| `OTP_PRODUCTION_VERIFICATION_STATE.md` | What was and was not verified | 4 | `git rev-parse` and browser reports | SHA recorded | DB UNKNOWN |
| `OTP_MASTER_ISSUE_REGISTER.md` | Issues 01–32 and 28 Sep findings | 4 | R2-31, R2-32, later file reads | Status labels | None VERIFIED |
| `OTP_DEFERRED_FEATURES.md` | ONDC, BNI, and other non-goals | 6 | Adapters and FAQ | Stubs exist | Not live networks |
| `OTP_AUDIT_HISTORY.md` | Which old report may be cited | 5 | File names and stated limits | n/a | n/a |
| `DOCUMENTATION_INVENTORY_2026-09-28.md` | Every prior document and its disposition | 5 | File list | n/a | n/a |
| `OTP_DOCUMENTATION_CERTIFICATION_2026-09-28.md` | What this phase did and did not do | 4 | This phase | Docs only | Does not certify the product |

## Do not start with these

| Location | Why |
| --- | --- |
| `docs/00`–`docs/15` | Historical suite. Banner on `docs/00` points here. Claims 185 migrations and a certified pilot gate. |
| `README.md` before this baseline | Same certification language. The README is now an entry point only. |
| `R2-27-Final-Certification-Report.md` and `R2-30D-*` | Session certificates. Read `OTP_AUDIT_HISTORY.md` first. |
| `PROD_CONTAINMENT/` | Emergency SQL notes for a database that might be at or before `00195`. Not a migration. Not proof it was run. |
| `OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` | Logged-out evidence. Useful. Not a full product audit. |

## Rule for the next agent

Remediation may change code only in a later phase. If a golden document says PRODUCT DECISION or LEGAL DECISION, do not pick the answer in code. If it says PRODUCTION VERIFICATION, do not mark the issue fixed because the migration file is in git.
