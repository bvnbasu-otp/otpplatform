# OTP Consolidated Remaining Bug Register — 2026-09-29

**Production:** https://otpplatform-theta.vercel.app  
**Repository baseline (pre-deploy):** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Local remediation:** app-layer fixes only; migrations **00216–00219** preserved; **00220 not created**

---

## 18. Status table (explicit five findings + scanned legacy items)

| ID | Topic | Classification | Notes |
| --- | --- | --- | --- |
| **F-1** | Account-creation / verification email | **FIXED — NEEDS PRODUCTION VERIFICATION** | EMAIL-channel signup now calls GoTrue `signInWithOtp`; inbox delivery still requires Gmail |
| **F-2** | WhatsApp registration confirmation false failure | **FIXED — NEEDS PRODUCTION VERIFICATION** | Primary confirmation follows chosen channel; HTTP 503 bodies parsed; WA guaranteed notice separated |
| **F-3** | Workspace pane crash | **FIXED — NEEDS PRODUCTION VERIFICATION** | Missing `permissions` normalized; regression tests added |
| **F-4** | Buyer/supplier persona & `/supplier/quotes` | **FIXED — NEEDS PRODUCTION VERIFICATION** | `reconcilePortalSide` + route guard + portal role resolution |
| **F-5** | Wallet / rewards by persona | **PRODUCT DECISION — DEFER** | No accounting change |
| REL-1 | `/register` dead route | **FIXED — NEEDS PRODUCTION VERIFICATION** | Redirect to `/signup` in `App.tsx` (uncommitted with remediation) |
| REL-2 | Desktop/mobile simulator on public site | **CONFIRMED BUG — FIX NOW** (partial) | `SiteLayout` copy/simulator trimmed in working tree; **not deployed** |
| SUP-1 | Fabricated GST verified badge | **CONFIRMED BUG — FIX NOW** (partial) | `SupplierCard` / lifecycle truthfulness edits in tree; **not deployed** |
| SUP-2 | PIN “suppliers ready” banner | **PRODUCT DECISION — DEFER** | Honesty vs product promise |
| SUP-4 | Fabricated distance/availability | **CONFIRMED BUG — FIX NOW** (partial) | `rfq-lifecycle.ts` edits in tree; **not deployed** |
| GOV-1–3 | Committee copy / gate wiring | **PRODUCT DECISION — DEFER** / **INSUFFICIENT EVIDENCE** | Unless one-line copy bug |
| FIN-1–4 | Fee / wallet commercial copy | **PRODUCT DECISION — DEFER** | Do not reopen 00216 economics |
| LEG-1–2 | Legal placeholders | **PRODUCT DECISION — DEFER** | |
| SEC-1 | Hosted migration parity | **BLOCKED — EXTERNAL DEPENDENCY** | Deploy tooling unavailable this pass |
| N-01 | No verification email (black-box) | **FIXED — NEEDS PRODUCTION VERIFICATION** | Same root as F-1 |
| D-04 | Wrong WhatsApp confirmation when Email chosen | **FIXED — NEEDS PRODUCTION VERIFICATION** | Same root as F-2 |
| RWA same-org QA | Committee / invite flows | **BLOCKED — EXTERNAL DEPENDENCY** | Gmail invite acceptance not automatable |

---

## A. Scope

Consolidated register after remediation pass 2026-09-29. Security migrations **00216–00219** unchanged. No **00220**.

## B. Fixed in code this pass (local)

| Bug | Root cause (one line) |
| --- | --- |
| F-1 | EMAIL registrants never invoked GoTrue mail — only WhatsApp onboarding-notify ran |
| F-2 | Non-2xx edge responses treated as network-unknown; EMAIL users saw WA failure as primary |
| F-3 | `activeRole.permissions` could be non-array → `PermissionChips` threw in workspace shell |
| F-4 | Stale `active_portal_side=BUYER` with `SUPPLIER_FOUNDER` active role mis-routed guards/dashboard |

## C. Deferred / unchanged

Wallet rewards (F-5), commercial fee copy, admin allowlist, legal placeholders, RWA economics.

## D. Production state

**Deploy: BLOCKED** (Vercel/gh CLI not available in agent shell). Production behaviour **not re-verified** on live URL for F-1–F-4.

## E. Migration 00220

**NO** — no persistent defect requiring new SQL.

## F. Tests (local)

55/55 on certification bundle (00216 security + new regressions). See `OTP_CONSOLIDATED_REGRESSION_CERTIFICATION_2026-09-29.md`.

## G. Secrets

No QA passwords written to repository or reports.
