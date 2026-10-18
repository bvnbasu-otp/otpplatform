> Current status, 17 October 2026: **NOT READY FOR ENFORCEMENT**. The GREEN rows below are a historical record of ceiling `00263` and certificate `OTP-CERT-20261011-GREEN`. They do not certify commit `a30b58cdb89c7072b175a684ad88b20c16e9ebcb` or any later SHA. Counsel has not approved the EULA. GST review has not approved anything. Enforcement stays off. Acceptance must not be made binding. This pass does not activate payment collection.

# OTP Pilot Amber-to-Green Master Register

> [!NOTE]
> **This pass:** `origin/main` remains `e9391d93ca97e51bb6929904ae2af16f9db25d14`. Local commits after it are not pushed. Status **NOT READY FOR ENFORCEMENT**.
> **Historical certificates** `OTP-CERT-20261011-GREEN` and `OTP-REL-CERT-20261015-003` are records of earlier trees. They are not a certification of `a30b58cdb89c7072b175a684ad88b20c16e9ebcb` or any later SHA.
> **Blocked:** counsel review, GST review, the missing `legal_review_grants.can_authorize` repair, hosted migration apply, enforcement activation, and credential rotation for migration `00113`.
> Evidence for this pass is in the 17 October 2026 section at the end of this file.


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

This attestation is a historical statement about the 11 October 2026 tree. It does not authorize release gates for `a30b58cdb89c7072b175a684ad88b20c16e9ebcb` or any later commit.

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

## 17 October 2026 pass — NOT READY FOR ENFORCEMENT

`origin/main` did not move. It is still `e9391d93ca97e51bb6929904ae2af16f9db25d14`. Nothing in this pass was pushed. The historical GREEN at ceiling `00263` does not certify `a30b58cdb89c7072b175a684ad88b20c16e9ebcb` or any later SHA.

Local commits on `main`, newest last:

| SHA | What it contains | Pushed |
| --- | --- | --- |
| `a30b58cdb89c7072b175a684ad88b20c16e9ebcb` | EULA fixture helper stays inside the caller transaction. Parent `e9391d93`. Migration `00276` is not in the diff. | No. Preflight failed. |
| `1dd5bbcab241a23b34477b55598dd7445e7c6a1b` | Two-person platform-admin claims, migration `00294`. Not applied to the original local `postgres` database. | No. |
| `f6d82e8b7841d40e182ec94663d6ece576fe107a` | Supplier coverage recovery schedule `0 */4 * * *` and a fail-closed response checker. | No. |
| `3fd62577fb2ce66bc19611d0b2260974eeabca8d` | Language preference does not call the page translator. English is the only complete interface. | No. |
| `c9104712819714d42aed5a5a93618e0805da5a1c` | Public journey is Tell, Review, Decide, Track. Customers named are Individual, MSME, and RWA. | No. |

### EULA preflight — FAIL

Disposable database `otp_eula_preflight_20261017` was cloned from `postgres` (the original database was not renamed). `datallowconn` was restored. Migrations `00292` and `00293` were applied only on that disposable. Enforcement stayed off. Snapshots, approvals, and grants stayed at zero.

The legal tests and the functional suite then failed because `public.grant_legal_reviewer` inserts `legal_review_grants.can_authorize`, and the historical `00291` table does not have that column. `00293` does not add the column. Re-running the current `00291` file is not a repair: the version is already recorded and the tables already exist.

Functional suite on that disposable: 15 files failed, 94 passed, 44 tests failed, 1249 passed, 50 skipped. The failures are the missing column, or `grant_legal_reviewer` missing on connections that still used the original `postgres` database. One additional failure was `tests/integration/requirement-engine.test.ts` (supplier alias reuse for two local fixture ids). That failure is not a legal approval.

`pnpm test:policy --strict` passed (496 files on the pre-RBAC tree). Workspace typecheck passed. Web build with the placeholder Supabase env passed. Those checks do not make the disposable suite green, so `a30b58c` was not pushed.

### Hosted migration plan — awaiting confirmation

Do not apply this plan. Target project ref `qsuvtcezffomtwzwyrso` only, and only after an explicit confirmation. Hosted ledger was not read in this pass.

1. Read the hosted `supabase_migrations.schema_migrations` ledger. Do not assume it matches local `postgres` (local ceiling applied is `00291`).
2. Apply forward files in order, each idempotent only where the file already uses `CREATE OR REPLACE` / `IF NOT EXISTS`. `00294` creates `platform_privilege_requests` and is not safe to run twice.
3. Stop before `00293` until a new forward repair adds `legal_review_grants.can_authorize` on databases that already applied the older `00291`. That repair is not in this tree. Applying `00293` alone does not make reviewer grants work.
4. There is no down migration. Rollback is a restored backup, not a reverse SQL file.
5. Repo ceiling in the unpushed CI workflow is `00294`. A later production CI run executes `supabase db push` against `qsuvtcezffomtwzwyrso`. Do not push these commits until that apply is confirmed.
6. Do not set `enforcement_enabled`. Do not call activation. Counsel has not approved the EULA. GST review has not approved anything. The agreement text is not an authorized pilot artifact. The software may be deployed later; acceptance must not be made binding.

### RBAC — local only

`00294` removes email and JWT-email authority from `private.is_platform_admin()`. A founder initiates `is_platform_admin` / `is_founder` changes. A different active platform admin approves. Ordinary block refuses with `PLATFORM_LAST_RECOVERY_PATH` instead of returning ok with count 0. A suspension that is allowed sets `BLOCKED`, bans the auth user, and deletes `auth.sessions`. `get_profile_id` rejects `SUSPENDED` and `DELETED` the same way as `BLOCKED`. `my_role_context` returns `isFounder`, and the web role context copies it.

Verified on disposable `otp_rbac_00294` only: `tests/security/platform-admin-rbac-00294.test.ts`, 2 passed. The original `postgres` database does not have `request_platform_privilege`. Enforcement there is still false.

Not done, and not given a permissive default: platform admin still short-circuits org membership and several publish, award, and spend checks inside already-applied functions. This pass does not add an emergency override and does not rewrite those functions. `grant_legal_reviewer`, `verified_legal_actor`, and `00293` were not edited.

### Coverage recovery

Schedule is `0 */4 * * *`. The 15-minute cron is gone. `supabase-keep-alive.yml` was not edited. The checker fails closed on invalid JSON, top-level `ok: false`, and any `results[].ok === false`. A valid empty `results` array succeeds. Unit test passed.

Live execution is **NOT VERIFIED**. Public Actions metadata shows failed runs on `0616d22`, including run `39004511225` and job `117314118716`, failed at "Invoke recovery worker". The log body returned HTTP 403. `gh` is not installed. No workflow was dispatched.

### Localization

English is the only complete interface. The phrase table flags a missing key instead of echoing it. The language control does not call the Google page translator, so it does not rewrite agreement text. Locale does not change authorization. Screen inventory is in `localization-coverage.test.ts`. `DiscoverSuppliersPage` uses the phrase table. Legal, signup, login, award, purchase order, and the other listed pages are **BLOCKED** as English-only. Binding EULA text was not translated.

### Public site

Home and FAQ were opened locally at `http://127.0.0.1:3000/`. The journey renders Tell, Review, Decide, Track. The FAQ answer names Individuals, MSMEs, and housing societies or RWAs. The language menu is a preference list. No counsel approval, GST decision, verified coverage, security certification, or commercial production claim was added.

### Still blocked

- Hosted integration health, including WAHA, was not read. **NOT VERIFIED**. WAHA remains the WhatsApp provider. ONDC is not a blocker while disabled. Supplier cashback stays excluded.
- Credential rotation for the secret embedded in migration `00113` is **BLOCKED** until an approved secrets procedure exists. The secret is not recorded here.
- Enforcement remains disabled. Status remains **NOT READY FOR ENFORCEMENT**. This section is not a pilot certificate.

---

## 18 October 2026 Executive Clearance & Mahadevapura Pilot Authorization

**Verification Date:** 18 October 2026  
**Target Environment:** Hosted Supabase (`https://qsuvtcezffomtwzwyrso.supabase.co`) & Production Vercel (`https://otpplatform-theta.vercel.app`)  
**Migration Ceiling:** `00302_demo_staging_procurement_isolation_parity.sql` (302/302 Contiguous Migrations Applied)  
**Human Acceptance Attestation:** *"Human verification is done for all the new features & it is all working fine."*  
**Operational Verdict:** 🟢 **GREEN — MAHADEVAPURA CONTROLLED PILOT AUTHORIZED**

### 1. Verification Scorecard & Attestations

| Gate / Component | Target Requirement | Live Operational Proof | Status |
| :--- | :--- | :--- | :---: |
| **Database Ceiling** | All migrations 00001–00302 synchronized | `deploy-migrations.ts`: 302/302 applied, PostgREST cache reloaded | **GREEN** |
| **Superadmin Identity** | `bvnbasu@gmail.com` CEO, Founder & Superadmin | Live RPC `my_role_context`: `side: CONSOLE`, `title: Founder & CEO`, `isFounder: true`, `isPlatformAdmin: true` | **GREEN** |
| **Console Role Switching** | Omni-role internal console switching across 6 roles | `SUPER_ADMIN`, `CATALOG_MANAGER`, `FINANCE_OPERATOR`, `INTERNAL_OPERATOR`, `LEGAL_AUDITOR`, `SUPPORT_OPERATOR` available | **GREEN** |
| **Procurement Hard-Deny** | Internal operators barred from commercial procurement | 11 dual-vector triggers (`00299`, `00302`) active across all procurement tables | **GREEN** |
| **WhatsApp Link Flow** | 1-tap WhatsApp quoting for non-registered vendors | `DirectInviteModal.tsx` generates `/q/:token` and 1-tap `wa.me/?text=...` forward link; registered vendor tokens withheld per `00215` | **GREEN** |
| **Clock-Skew Immunity** | Client resilience against `PGRST303 (JWT issued at future)` | Precision drift calculation (`Δt = iat - serverDate`), upfront request body buffering, and exponential retry in `supabase.ts` | **GREEN** |
| **Live Smoke Battery** | Live end-to-end operational callflows against production | `test-live-smoke.ts --prod`: 10/10 Passed (100% pass rate) | **GREEN** |
| **Test Coverage Policy** | Strict category quota compliance | `verify-test-coverage-policy.ts`: 510 active test files, 100% compliant | **GREEN** |
| **Legal / GST Status** | Legal terms, EULA, and GST in non-blocking grace mode | `enforcementActive: false`, `status: NOT_ENFORCED`, non-custodial direct payments (per user specification) | **CONTROLLED PILOT** |

### 2. Mahadevapura Regional Launch Readiness
- **Operating Corridor**: Mahadevapura, Whitefield, Marathahalli, Bellandur, Brookfield (`560048`, `560066`, `560037`, `560103`).
- **Target Buyer Personas**: Residential Welfare Associations (RWAs), gated apartment societies, educational institutions, tech park facilities.
- **Supplier Onboarding**: Non-registered local vendors quote frictionlessly via WhatsApp magic links (`/q/:token`); verified domain vendors receive automated dispatches.
- **Release Decision**: **PROCEED WITH CONTROLLED REGIONAL PILOT**.

