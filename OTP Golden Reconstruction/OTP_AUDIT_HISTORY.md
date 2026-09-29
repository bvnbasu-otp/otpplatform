# OTP Audit History

**Authority:** Level 5 — historical audits, with a pointer to what is current  
**Baseline date:** 28 September 2026

Current product truth is **not** in this file. It is in `OTP_GOLDEN_DOCUMENT_INDEX.md`.  
This file exists so a later agent cannot treat an old certification as live proof.

## How to read an old report

If the report says CERTIFIED, PILOT GATE OPEN, or “verified live”, check three things before believing it:

1. Which git SHA it names.
2. Whether it executed SQL on a database or only read files.
3. Whether it names the hosted project and a query result.

If any of the three is missing, the report is evidence of what that session believed, not evidence of production.

## Sequence

| When | Document | Who | Scope | Code | Live site | Live DB | What it concluded | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reconstruction, pre-R2 | `D0-*`, `F1`–`F9`, `R1-*` | Earlier reconstruction | Inventory and target architecture | Yes | No | No | Target model and gaps | Aspirational in places. Not current truth. |
| R2-02 through R2-19 | Matching `R2-*` reports | Implementation sessions | Buyer, RWA, MSME, supplier, intake, award, track | Yes | Mixed, often local | Often not | Feature reports and gap registers | Superseded by later R2 files and by this baseline. |
| R2-20 through R2-26 | Black-box and regression sets | Later hardening | Journeys, security, finance, mobile | Yes | Some | Not established as the current hosted DB | Many “fixed” claims | Re-opened by R2-31 where claims were false. |
| R2-27 | `R2-27-*` including ONDC and BNI truthfulness | Certification session | Market, stubs, security | Yes | Claimed in some files | Not this baseline’s proof | Final certification document in that series | `R2-28` is an evidence audit of R2-27. Do not skip R2-28. |
| R2-28 | `R2-28-Independent-R2-27-Evidence-Audit.md` | Independent of R2-27 | Whether R2-27’s evidence held | Yes | Review of claims | Review of claims | Some R2-27 proofs were weaker than the certificate | Still older than `00215`. |
| R2-29 to R2-30D | Pilot freeze, pricing, deployment notes | Release sessions | Commercial mode, promotions | Yes | Deployment notes name the Vercel URL | Not queried in this baseline | Pilot freeze and promotion gates | Commit subjects are not database proof. |
| 26 Sep 2026 | `R2-31-32-Issue-Root-Cause-Remediation-Report.md` | Local remediation | 32 issues, migration ceiling then `00198` | Yes | No | No — 371 live-DB tests skipped | Issues marked fixed with behavioural or static tests. Server items BLOCKED | HEAD then was not `7b1afc12`. |
| 27 Sep 2026 | `R2-32-Privileged-RPC-Identity-Masking-Server-Enforcement-Report.md` | Local remediation | SEC-1–7, issues 11, 13, 22. Added `00199` | Yes | No | **Explicitly never executed** | FIXED (static) | The report says the migration has never been run. |
| 27–28 Sep 2026 | `OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` | Browser, no repo | Public site and signup through PENDING | No | Yes, `otpplatform-theta.vercel.app` | No | Draft legal text, fee contradictions, pending login message, LaTeX, PIN banner, invalid GSTIN accepted | Stopped at login. Accounts left PENDING. |
| 28 Sep 2026 | Grok independent audit (this conversation, before this doc phase) | Repository review | Product, UX, security, money | Yes, through `00215` | No, except by reading the black-box notes | No | RED pilot. Wallet RPC. Unverified live schema. Fabricated discovery. | Did not exploit production. |
| 28 Sep 2026 | Logged-out browser pass, agent `2dd6a16a-c5e8-4c9c-a74a-538511974255` | No repository access | Public pages | No | Yes | No | Confirmed draft legal, fee split, `/register` → home, preview buttons, LaTeX | Did not sign in or submit signup. |
| 28 Sep 2026 | This documentation baseline | Documentation only | Reconcile the above to HEAD `7b1afc12` | Read | Used the two browser reports | No | Golden documents. No code changes. | Does not certify a pilot. |

## Documents that must not be used as the current certificate

- `docs/00` through `docs/15`, especially the Phase 7.1 “gate open” language and the 185-migration count.
- `R2-27-Final-Certification-Report.md` without `R2-28`.
- `R2-30D-Provenance-Cleanup-and-Full-Certification.md` as proof the hosted database is at `00215`.
- The git subject of `7b1afc12` (“certify OTP 00213-00215 production readiness”).

## Resulting actions of this baseline

Documentation only. Issue rows were re-labelled FIXED-UNVERIFIED or left OPEN. No application file, migration, or config was edited, except the historical banner added to `docs/00-DOCUMENTATION-INDEX.md` and the root README entry point.
