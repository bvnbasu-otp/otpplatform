# OTP Adversarial Master Reconciliation — 2026-09-28

**Production:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso`  
**Auditor:** independent evidence agent (read-only mandate)

---

## Executive status

| Phase | Status |
|-------|--------|
| PHASE 1 | **BLOCKED** — agent shell `AccessTokenRequiredError` on `supabase migration list` |
| PHASE 2 | **NOT STARTED** — PHASE 1 BLOCKED |

**Object-level production catalog rows:** not captured in this pass.  
**Prior summary-only evidence:** `PROD_CONTAINMENT/OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_20260928_192326.txt` (count-only; not used as proof).

**Detailed evidence file (this pass):**  
`OTP Golden Reconstruction/PROD_CONTAINMENT/OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_DETAILED_20260928.txt`  
Contains the exact SELECT-only SQL script for the user to run in an authenticated PowerShell session.

---

## 1. Scope and mandate

Read-only production catalog audit post-migrations 00216–00219, plus adversarial backlog reconciliation against repository audit artifacts. No code, schema, or data mutations.

## 2. Phase 1 methodology

Attempt remote `supabase migration list`, then SELECT-only catalog SQL (sections 1A–1L). Agent shell could not authenticate to Supabase Management API.

## 3. Migration state (00215–00219)

**NOT PROVEN BY CATALOG** in this pass. User-reported pairing of 00216–00219 is not independently verified here.

## 4. Anon EXECUTE surface (eleven-function allowlist)

**NOT PROVEN BY CATALOG.** Run section 1C SQL in evidence file. Do not treat anon count = 11 as proof without function names and signatures.

## 5. PUBLIC EXECUTE on public routines

**NOT PROVEN BY CATALOG.** Run section 1D.

## 6. `demo_status` and maintenance/demo RPCs

**NOT PROVEN BY CATALOG.** Run section 1E.

## 7. Migration 00218 — RFQ status transition guard

**NOT PROVEN BY CATALOG.** Repository defines whitelist DRAFT→OPEN/CANCELLED, OPEN→CLARIFICATION/EVALUATING/CLOSED/CANCELLED, etc. (`supabase/migrations/00218_rfq_status_transition_whitelist.sql`). Live trigger and function body require section 1H/1G SQL.

## 8. Migration 00219 — RFQ approval stage direct-write guard

**NOT PROVEN BY CATALOG.** Repository defines `trg_guard_rfq_approval_stage_write` and internal flag `otp.approval_stage_internal`. Live catalog requires section 1I/1G SQL.

## 9. RLS on priority tables

**NOT PROVEN BY CATALOG.** Run section 1J.

## 10. Wallet, reward, and settlement-sensitive RPCs

**NOT PROVEN BY CATALOG.** Run sections 1F, 1G, 1K.

## 11. Payment recording and invoice authority

**NOT PROVEN BY CATALOG** (no live grants/RLS rows). Reconcile only after Phase 1 COMPLETE.

## 12. Org takeover, delegation, quorum, COI

**NOT PROVEN BY CATALOG.**

## 13. Milestone auth, reveal, purchase order authority

**NOT PROVEN BY CATALOG.**

## 14. Subscription payment and wallet redemption

**NOT PROVEN BY CATALOG.**

## 15. PIN, GSTIN, discovery, simulator paths

**NOT PROVEN BY CATALOG** for production; black-box audit (`OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md`) covers pre-login UX only.

## 16. Fee and legal copy consistency

**REPOSITORY / BLACK-BOX** — defect register D-01, D-02 in black-box audit; not re-validated here.

## 17. Admin allowlist and `/register` flows

**NOT PROVEN BY CATALOG.**

## 18. CI and false-green signals

**NOT STARTED** in this pass.

## 19. Sensitive routine grants consolidation

**NOT PROVEN BY CATALOG.** Run section 1K.

## 20. Per-control classification (1L)

**NOT PROVEN BY CATALOG** — placeholders in user SQL; must be filled from live query output.

## 21. Certification summary

See certification lines below.

---

## WHAT WE KNOW

- Agent shell failed with **AccessTokenRequiredError** on read-only `supabase migration list --project-ref qsuvtcezffomtwzwyrso`. This is an **auditor environment** issue, not evidence of a production defect.
- Repository contains migrations **00216–00219** with documented security intent (anon allowlist in 00216/00217, PUBLIC revoke in 00217, RFQ guards in 00218/00219).
- A prior agent-generated summary claimed migration ceiling **219**, **anon count 11**, **public count 0**, label **PASS** — insufficient for object-level certification.

## PROVEN

- Nothing about **live production catalog** from this agent pass.

## NOT PROVEN

- All Phase 1 sections 1A–1L against production.

## STILL BROKEN

- Not determined (Phase 1 blocked).

## NOT STARTED

- Phase 2 adversarial finding reconciliation (master register, clusters A/B/C).

## NEEDS BEHAVIOURAL TESTING

- Any control where only triggers or migration files exist (00218/00219) — **REQUIRES BEHAVIOURAL TEST** even after catalog proves presence.

## FIX NEXT

1. User runs migration list and SELECT script from detailed evidence file in authenticated PowerShell.
2. Re-run Phase 1 auditor with captured stdout or populate evidence file with actual rows.
3. Only then start Phase 2 reconciliation against `OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` and related registers.

---

## Certification

**PHASE 1:** INSUFFICIENT PRODUCTION EVIDENCE  

**PHASE 2:** NOT STARTED — PHASE 1 BLOCKED

---

*This report does not state that OTP is secure or that all vulnerabilities are fixed.*
