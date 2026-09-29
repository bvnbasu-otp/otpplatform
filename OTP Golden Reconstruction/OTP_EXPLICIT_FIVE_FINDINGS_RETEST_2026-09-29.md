# OTP Explicit Five Findings Retest — 2026-09-29

**Production URL:** https://otpplatform-theta.vercel.app  
**Deploy this pass:** **BLOCKED** (Vercel/gh unavailable)  
**QA browser retest:** **NOT RUN** (no production deploy; credentials type-only, not persisted)

---

## 18. Summary table

| # | Finding | Pre-fix (28 Sep) | Post-fix code | Production retest 29 Sep |
| --- | --- | --- | --- | --- |
| 1 | Password + email verification | BLOCKED (inbox) | GoTrue mail on EMAIL signup | **NOT RE-VERIFIED** |
| 2 | WhatsApp confirmation failure | REPRODUCED | Channel-honest UI + HTTP body parse | **NOT RE-VERIFIED** |
| 3 | Workspace pane error | BLOCKED / intermittent | Permissions normalize | **NOT RE-VERIFIED** |
| 4 | Buyer vs supplier separation | BLOCKED / product issue | Side reconciliation | **NOT RE-VERIFIED** |
| 5 | Wallet / rewards | BLOCKED | No change | **DEFERRED** |

---

## A. Finding 1 — Email verification

**Fix:** EMAIL-channel `submitSignupRequest` invokes `signInWithOtp` and surfaces `resolveSupabaseEmailDispatch` status.  
**Inbox proof:** **BLOCKED** — Gmail not opened in this pass.  
**Label:** **PRODUCTION DELIVERY NOT YET OBSERVABLE**

## B. Finding 2 — WhatsApp confirmation

**Fix:** Primary confirmation follows verification channel; guaranteed phone notice separated; structured edge failures not misclassified as network-unknown when JSON body present.  
**Handset / WA delivery:** **NOT OBSERVED**

## C. Finding 3 — Workspace pane

**Fix:** Prevent `permissions.includes` on undefined in account/workspace chrome.  
**First-login on production:** **NOT RE-VERIFIED**

## D. Finding 4 — Persona / `/supplier/quotes`

**Fix:** `reconcilePortalSide` + route guard + `resolvePortalRole` for supplier-only accounts with stale BUYER portal side.  
**SUPPLIER-A/B on live site:** **NOT RE-VERIFIED** (no deploy)

## E. Finding 5 — Wallet

**Status:** **PRODUCT DECISION — DEFER** (no wallet code changes)

## F. QA personas

Seven QA accounts **not exercised** in browser this pass.

## G. Conclusion

Code remediation complete locally; **PRODUCTION BEHAVIOUR NOT RE-VERIFIED** until deploy and authenticated retest.
