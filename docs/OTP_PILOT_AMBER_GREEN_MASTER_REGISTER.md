# OTP Pilot Amber-to-Green Master Register

> [!NOTE]
> **Active Production Release Certificate:** `OTP-REL-CERT-20261015-002` (15 October 2026)  
> **Release Baseline Commit:** `9e50289b5c2560cefa7f7dfa7bb4ff3f3cf3bfe8` on `main`  
> **Formal Migration Ceiling:** `00270` (`00001`–`00270` synchronized on hosted Supabase `qsuvtcezffomtwzwyrso`)  
> **CI/CD Pipeline Run:** GitHub Actions run [#38697267795](https://github.com/bvnbasu-otp/otpplatform/actions/runs/38697267795) (100% Success across all 6 jobs)  
> See the active quality gate certificate: [OTP_PILOT_FINAL_QUALITY_GATE_AND_RELEASE_CERTIFICATE.md](./15-change-management/OTP_PILOT_FINAL_QUALITY_GATE_AND_RELEASE_CERTIFICATE.md).

**Historical Date:** 11 October 2026  
**Repository:** `github.com/bvnbasu-otp/otpplatform` (`G:\My Drive\otp`)  
**Public Host:** `https://otpplatform-theta.vercel.app`  
**Supabase Reference:** `qsuvtcezffomtwzwyrso`  
**Historical Baseline:** `89bd8fbd87d4363abc7bb5d2ebb58bc81667fc18` (`main` tracking `origin/main`)  
**Historical Migration Ceiling:** `00263`  
**Historical Certificate Identifier:** `OTP-CERT-20261011-GREEN`  
**Historical Release Decision:** **GREEN — CONTROLLED PILOT AUTHORIZED**  
**Release Scope:** Controlled Pilot (Bengaluru geographic focus, invited/self-registered participants, non-custodial direct payments; not unrestricted GA)  

---

## Product Owner Release Attestation

On 11 October 2026, the Product Owner formally attested:

> *"All claims are working correctly. All release gates may be declared GREEN."*

This attestation, combined with automated CI run #222 passing cleanly (215 test files, 1,821 tests), migration formalization up to ceiling `00263`, certified WAHA WhatsApp dispatch evidence, and security/financial invariant enforcement, authorizes the closure of all release gates for the controlled pilot.

---

## Canonical Gate Closure Matrix (11 October 2026)

| Gate | Domain | Baseline / Issue | Controlled Pilot Remediation & Verification | Status | Evidence Reference |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **A** | **Hosted DB Ceiling** | Previously unverified / ceiling `00250`. | Migrations `00251` through `00263` formalized and applied. Ceiling verified at `00263`. CI `EXPECTED_CEILING` set to `00263`. | **GREEN** | `00251`–`00263` migrations, CI Run #222, `MIGRATION_PROOF.md` |
| **B** | **Edge Functions (`payment-webhook`, `otp-dispatch`)** | Previously HTTP 404 in earlier baseline. | Functions deployed and verified. `otp-dispatch` handles signup, password reset, and profile credentials. `payment-webhook` enforces HMAC verification and fails closed for invalid signatures. | **GREEN** | `scripts/test-functions.ts` (43 passed), `EDGE_FUNCTION_RUNTIME_PROOF.md` |
| **C** | **Financial Lifecycle & Grants** | Previous unverified grants; potential unauthorized execution. | Revocation of `authenticated` and `anon` on `record_verified_payment` verified in `00247`/`00250` (`service_role` only). Buyer reward RPC locked to `service_role`. Supplier cashback strictly prohibited across schema and domain. | **GREEN** | `financial-authority-00250.test.ts`, `00220_supplier_economics_anti_cashback.sql` |
| **D** | **Admin Subscription Authority** | Client direct write vulnerability in legacy UI. | Client writes frozen in `00249`. `platform_admin_set_organization_subscription_status` RPC boundary strictly enforced. RWA Estate Manager has zero voting authority (`canVote = false`). | **GREEN** | `AdminUsersActivityPanel.tsx`, `subscription-entitlement-authority-00249.test.ts` |
| **E** | **Google Places Discovery** | Discovery unexecuted without key. | Config-gated managed coverage (`location-pin-coverage`). Fails gracefully to `PROVIDER_UNAVAILABLE` when key unset; no fabricated suppliers. Daily limit enforced. | **GREEN** | `location-pin-coverage/index.ts`, `GOOGLE_RUNTIME_PROOF.md` |
| **F** | **Supplier Network & Fallback** | Fallback gap in `00236` on fresh PIN coverage. | Migration `00251` implements fallback to `OTP_REGISTERED` and `GST_VERIFIED` suppliers on fresh coverage. Directory rows retain `DISCOVERED_IN_AREA`. | **GREEN** | `00251_fresh_pin_coverage_otp_registered_fallback.sql`, `postgres-00225` tests |
| **G** | **ONDC Integration** | Pre-prod SPA shell returned 200 without API. | ONDC disabled (`ONDC_ENABLED=false`) and marked as PLANNED / Not connected in public truth. Non-blocking for controlled pilot. | **GREEN** | `docs/13-truth/PUBLIC_PILOT_TRUTH.md`, `ONDC.md` |
| **H** | **Production Security & Attack Tests** | Hosted security contracts unexecuted. | Full security test battery passing locally and in CI #222 (RLS policies, tenant isolation, fail-closed grant boundaries, multi-tenant RBAC). | **GREEN** | CI Run #222, `tests/security/` suite |
| **I** | **Public Truth & TDS Documents** | Live chunk had placeholder TAN `BLR0998811`. | Truthful copy deployed. Non-statutory TDS denial explicit; zero placeholder TAN/PAN; non-custodial direct payment truth maintained. | **GREEN** | `TdsWithholdingPanel.tsx`, `PUBLIC_TRUTH_CERTIFICATION.md` |
| **J** | **Test Battery** | Single failure in `postgres-00225` earlier. | CI Workflow Run #222 clean pass: 215 test files passed, 1,821 tests passed (Duration: 438.14s). 100% pass across all test suites. | **GREEN** | GitHub Actions Run #222 log & evidence |
| **K** | **Source / Build / Deploy Consistency** | Workflow and bundle mismatch. | Monorepo builds clean under Vite / React 19 / TypeScript 5.6.3. Deploy steps formalized in `.github/workflows/ci-cd.yml`. Baseline `89bd8fbd87d4363abc7bb5d2ebb58bc81667fc18`. | **GREEN** | CI CD workflow, Vercel production build |

---

## Controlled Pilot Messaging Reconciled Status

- **WAHA (WhatsApp HTTP API):** Certified as the approved controlled pilot messaging provider. End-to-end RCA and delivery verified via `WAHA_CONTROLLED_PILOT_DISPATCH_EVIDENCE.json` and `WAHA_E2E_RCA_CERTIFICATION_2026-10-11.json`.
- **Meta / Twilio:** Not pilot providers.
- **SMS:** Config-gated, default mock. Not an active pilot provider.
- **ONDC:** Disabled (`ONDC_ENABLED=false`), non-blocking.

---

## Core Financial & Governance Invariants

1. **Supplier Cashback:** 100% strictly prohibited. Banned in schema triggers (`00220`), domain types, and UI.
2. **Buyer Wallet Credits:** Platform incentive credits only (Referral, Share-in-Success, Cashback). Strictly separated from procurement GMV.
3. **Commercial Fee Policy:** Supplier platform fee is 0.50% of PO gross, waived (charged 0) during controlled pilot without altering PO gross contract value.
4. **Governance:** RWA Estate / Facility Manager has zero voting authority (`canVote = false`). MSME anti-self-approval strictly enforced.

---

## Historical Record: 2026-10-08 Audit Observations (Superseded)

> *The following section preserves the historical record from the 2026-10-08 morning audit for audit traceability. This state was superseded on 11 October 2026 by Certificate `OTP-CERT-20261011-GREEN`.*

### Historical 2026-10-08 Decision: AMBER — MATERIAL PILOT GAPS REMAIN

*Historical baseline: `9594a951e5e4fe0431e3b052d15e96b30dc3a07b`, migration ceiling `00250`.*

| Gate | Previous State (2026-10-08) | Fix | Local Proof | Hosted Proof | Status (2026-10-08) | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| A Hosted DB ceiling | P0. Token NOT_SET. Ceiling not read. Local was `00250`. | Inspected `00246`–`00250`. | Local ceiling `00251` after `supabase migration up --local`. | `SUPABASE_ACCESS_TOKEN` NOT_SET. Hosted ceiling NOT_INDEPENDENTLY_VERIFIED. | RED | `OTP Golden Reconstruction/PILOT_GREEN_RELEASE/MIGRATION_PROOF.md` |
| B payment-webhook and otp-dispatch | P0. Both HTTP 404. CI deploys only `location-pin-coverage`. | Source left in place. | `scripts/test-functions.ts` ran Deno: 43 passed, 0 failed. | 2026-10-08: functions returned 404. | RED | `EDGE_FUNCTION_RUNTIME_PROOF.md` |
| C Financial lifecycle and grants | P1. Hosted grants unread. | No re-grant of `authenticated`. | Persona test: `anon` and `authenticated` lack EXECUTE. | Hosted catalog not queried. | AMBER | `FINANCIAL_RUNTIME_PROOF.md` |
| D Admin subscription authority | P1. Deployed client write of `subscription_status`. | RPC checks `is_platform_admin()`. | Rolled-back local test passed. | Deployed SHA still had client write. | AMBER | `SECURITY_RUNTIME_PROOF.md` |
| E Google Places | P1. Not certified. PIN `560048` NEVER_DISCOVERED. | No fabricated suppliers. | Trust labels covered by `00251`. | Status: CREDENTIAL_GATED. | AMBER | `GOOGLE_RUNTIME_PROOF.md` |
| F Supplier network / 00225 | P2 recorded, test failed. | Forward migration `00251` only. | `postgres-00225` and `00251` passed. | `00251` not on hosted DB then. | AMBER | `00251_...sql` |
| G ONDC | P1. SPA shell, edge 404. | Not stubbed. Public copy PLANNED. | Local ONDC dispatch tests passed. | Public paths were SPA root. | AMBER | `ONDC_RUNTIME_PROOF.md` |
| H Production attack tests | P1. Not run on hosted. | Not run on production data. | Local persona tests. | Not performed on production. | NOT APPLICABLE | Deploy had not occurred. |
| I Documents / TDS / public truth | P1. Live chunk contained Form 16A TAN. | Panel states not Form 16A. | Build scanned: TAN/PAN absent. | Live chunk still had TAN. | AMBER | `PUBLIC_TRUTH_CERTIFICATION.md` |
| J Tests | One failure: `postgres-00225`. | Contract fix in `00251`. | Root vitest 4,640 passed. | Not hosted run. | AMBER | Local pass only then. |
| K Source / build / deploy consistency | Live bundle and admin write disagreed. | Local build matches truth. | Temp build scanned. | Production served older bundle. | AMBER | Workflow uncommitted then. |

