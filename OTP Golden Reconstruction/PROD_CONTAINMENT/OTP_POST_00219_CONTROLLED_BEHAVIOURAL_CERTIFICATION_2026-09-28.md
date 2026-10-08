# OTP POST-00219 Controlled Behavioural Certification — 2026-09-28

**Site:** https://otpplatform-theta.vercel.app  
**Date:** 2026-09-28  
**QA label:** QA-AUDIT-2026-09  
**Migration ceiling (operator claim):** 00219 (not re-verified via Supabase CLI in this pass)  
**Auditor role:** Independent black-box behavioural certification (not code review, not migration apply, not pentest).

---

## Executive summary

**Posture: PARTIAL CERTIFICATION — LOGIN READY; FIXTURES & PAIRS INCOMPLETE**

**7 / 7** QA password logins succeeded. Unauthorized API attempts exercised in this pass **failed closed** where tested (anon privileged RPCs, non-admin signup review, approval-stage direct write, cross-supplier reads returning **400**, empty cross-org RFQ reads). **No** unauthorized **write** or cross-tenant **data disclosure** was demonstrated.

**Fixture retest (this pass):** **RWA same-org membership remains BLOCKED** (member org id unchanged; invite acceptance requires mailbox). **Supplier personas not established in UI** (buyer cockpit for supplier accounts). **QA RFQ / quote not created.** **Paired behavioural closure: 2** full pairs; **6** unauthorized-only denials (not upgraded to full verification per pairing rule).

| Summary | Value |
|---------|------:|
| QA login successes | **7 / 7** |
| Behaviourally verified control rows | **8** |
| Behaviourally failed | **0** |
| Blocked | **29** |
| Product issues (not security) | **4** |
| Insufficient evidence (unpaired) | **5** |
| Not reproduced | **2** |
| Product decision required | **1** |
| Paired controls fully closed | **2** |
| Unauthorized-only verified denials | **6** |
| New migration candidates | **0** |
| Production DB modified | **NO** |
| Security config modified | **NO** |
| Real financial settlement | **NO** |
| Passwords written to repo reports | **NO** |

---

## Phase 0 — Identity matrix (summary)

See `OTP_POST_00219_QA_IDENTITY_FINAL_MATRIX_2026-09-28.md` (login row still **7/7**; org/persona gaps unchanged).

**Key outcomes this pass:**

- All seven emails: Auth password grant **HTTP 200**.
- `get_my_profile` **ok: true** for all seven.
- **RWA-A-MEMBER** `active_organization_id` **≠** **RWA-A-ADMIN** → **BLOCKED** for same-org role pair tests.
- **SUPPLIER-A / SUPPLIER-B:** `SUPPLIER_FOUNDER` in API; UI **Buyer** pilot dashboard; `/supplier/quotes` → **`/dashboard`** for both.
- **SUPPLIER-B** `active_organization_id` **null** (supplier record present).

---

## UI / route evidence (7-identity Playwright)

- Workspace pane error string: **not reproduced** on `/dashboard` for all seven.
- WhatsApp onboarding error strings searched: **not reproduced** (referral “Share on WhatsApp” may appear; not delivery-tested).
- **RWA-A-ADMIN:** `/org/members` workbench with **+ Invite** (invite not completed — mailbox **BLOCKED**).

---

## Tooling and constraints

| Item | Status |
|------|--------|
| cursor-ide-browser | **Failed** — “No browser tab available” |
| Playwright (headless) | **7/7** login + routes + `/org/members` |
| Gmail | **BLOCKED** |
| QA RFQ label QA-AUDIT-2026-09 | **Not created** |
| Payments | **Not performed** |
| Ephemeral automation script with credentials | **Deleted** after run |

---

## Certification statement

This pass **certifies** production **QA identity login readiness (7/7)** and **limited** runtime evidence that several denial paths **reject** obvious unauthorized API attempts **where exercised**.

This pass **does not certify** RWA same-org governance, supplier workspace separation, RFQ/quote lifecycle, invoice/payment isolation, or full **00216–00219** positive paths — those remain **BLOCKED**, **INSUFFICIENT EVIDENCE**, or **product gaps**.

**Secrets handling:** QA passwords used only for Auth/UI field entry in ephemeral automation; **no passwords, OTPs, or session tokens** in PROD_CONTAINMENT reports.

---

## Evidence index

| Artifact | Location |
|----------|----------|
| Fixture retest | `OTP_POST_00219_QA_FIXTURE_RETEST_2026-09-28.md` |
| Control matrix | `OTP_POST_00219_BEHAVIOURAL_CONTROL_MATRIX_2026-09-28.md` |
| Findings 1–5 | `OTP_POST_00219_EXPLICIT_FINDINGS_RETEST_2026-09-28.md` |
| Remaining risks | `OTP_POST_00219_REMAINING_RISK_REGISTER_2026-09-28.md` |

---

## Section 19 — Executive counts

| Metric | Count |
|--------|------:|
| **BEHAVIOURALLY VERIFIED** | **8** |
| **BEHAVIOURALLY FAILED** | **0** |
| **BLOCKED** | **29** |
| **NOT APPLICABLE** | **1** |
| **PRODUCT ISSUE — NOT SECURITY** | **4** |
| **INSUFFICIENT EVIDENCE** | **5** |
| **NOT REPRODUCED** | **2** |
| **PRODUCT DECISION REQUIRED** | **1** |
| Confirmed **P0** security | **0** |
| Confirmed **P1** security | **0** |
| Confirmed **P2** / **P3** | **2** / **3** |
| New migration candidates | **0** |
| Production DB directly modified | **NO** |
| Security config modified | **NO** |
| Real financial settlement | **NO** |
| QA identities — login success | **7 / 7** |
| Paired controls fully closed | **2** |
| Unauthorized-only verified denials | **6** |
