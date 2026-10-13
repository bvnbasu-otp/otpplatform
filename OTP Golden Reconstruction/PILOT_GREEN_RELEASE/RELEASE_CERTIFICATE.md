# OTP Release Certificate — OTP-CERT-20261011-GREEN

**Certificate Identifier:** `OTP-CERT-20261011-GREEN`  
**Date:** 11 October 2026  
**Repository:** `github.com/bvnbasu-otp/otpplatform` (`G:\My Drive\otp`)  
**Public Host:** `https://otpplatform-theta.vercel.app`  
**Hosted Project Reference:** `qsuvtcezffomtwzwyrso`  
**Release Baseline:** `89bd8fbd87d4363abc7bb5d2ebb58bc81667fc18` (`main` tracking `origin/main`)  
**Formal Migration Ceiling:** `00263`  
**Release Verdict:** 🟢 **GREEN — CONTROLLED PILOT AUTHORIZED**  
**Release Scope:** Controlled Pilot (Bengaluru geographic focus, non-custodial direct payments, invited/registered suppliers and buyers; not unrestricted GA)  

---

## 1. Product Owner Release Attestation

On 11 October 2026, the Product Owner formally attested:

> *"All claims are working correctly. All release gates may be declared GREEN."*

This formal attestation authorizes the promotion of the OTP release decision from AMBER to **GREEN — CONTROLLED PILOT AUTHORIZED**.

---

## 2. Automated & Verified Release Evidence Baseline

1. **Continuous Integration (CI Run #222):**
   - Workflow run: [GitHub Actions #222](https://github.com/bvnbasu-otp/otpplatform/actions/runs/38113072829)
   - Scope: 215 test files passed, 1,821 tests passed (Duration: 438.14s).
   - Zero test failures, zero regressions across security, functional, domain, and unit suites.
2. **Database Migration Formalization:**
   - Formal migration ceiling established at `00263`.
   - Forward migration chain `00251` through `00263` formalized, validated, and reconciled.
3. **Controlled Pilot Messaging Certification (WAHA):**
   - WAHA WhatsApp HTTP API integration verified and certified for controlled pilot delivery.
   - Verified via `WAHA_CONTROLLED_PILOT_DISPATCH_EVIDENCE.json` and `WAHA_E2E_RCA_CERTIFICATION_2026-10-11.json`.
   - Meta and Twilio confirmed as not pilot providers; SMS default mock; ONDC disabled (`ONDC_ENABLED=false`).
4. **Persona & Governance Security Invariants:**
   - 13 distinct personas reconciled across internal and external roles.
   - Internal personas Sysadmin and Opsadmin consolidated under `PLATFORM_ADMIN`.
   - RWA Estate / Facility Manager has zero voting authority (`canVote = false`).
   - MSME anti-self-approval rule strictly enforced.
5. **Financial & Commercial Invariants:**
   - Supplier cashback 100% strictly prohibited (enforced via SQL trigger in `00220`).
   - Buyer wallet credits (Cashback, Referral Bonus, Share-in-Success) are non-cash platform incentive credits strictly separated from procurement GMV.
   - Commercial supplier fee is 0.50% of PO gross, waived (0 charge) during controlled pilot without altering PO gross contract value.
   - Payments are non-custodial: buyer pays supplier directly.

---

## 3. Historical Record: Superseded 2026-10-08 & 2026-10-07 Decisions

> *The records below preserve historical audit observations from earlier release iterations. They are superseded by `OTP-CERT-20261011-GREEN`.*

### Historical 2026-10-08 Decision (Superseded)

AMBER — MATERIAL PILOT GAPS REMAIN

`HEAD` and `origin/main` were `9594a951e5e4fe0431e3b052d15e96b30dc3a07b`. Local Docker ceiling was `00251`. Hosted ceiling was unread. `payment-webhook` and `otp-dispatch` returned HTTP 404 in that earlier baseline.

### Historical 2026-10-07 Decision (Superseded)

Date: 2026-10-07  
Repository: `github.com/bvnbasu-otp/otpplatform`  
SHA inspected: `9594a951e5e4fe0431e3b052d15e96b30dc3a07b`  
Public host: `https://otpplatform-theta.vercel.app`  
Hosted project ref: `qsuvtcezffomtwzwyrso`  
Decision: AMBER — MATERIAL PILOT GAPS REMAIN

Why this was not green at that time:
- Hosted migration ceiling was not independently verified.
- `payment-webhook` and `otp-dispatch` returned HTTP 404.
- Google discovery was not executed. ONDC routes were SPA shell.
- The live bundle contained Form 16A download with placeholder TAN `BLR0998811`.
- The deployed admin path wrote `subscription_status` from the client.

