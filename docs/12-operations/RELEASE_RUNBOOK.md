# Release runbook

A release is a person’s git commit and git push, plus whatever hosting actually builds that SHA. Agents do not commit, push, or run hosted `supabase db push` unless a future task explicitly says so. This page does not invent a release train.

## 24 October local closure candidate

- Source ceiling: `00328`; CI must match exactly. Migrations `00319`–`00324` resolve the six former deferred areas in dependency order; `00325` disables pilot quote-quorum waiver, `00326` enforces RWA/MSME committee tenure, `00327` isolates notification dispatch, and `00328` forward-repairs the canonical administrative enum probe.
- A release requires a fresh exact-manifest disposable run, ledger `328`, post-migration grant/RLS/behavior checks, generated types from that disposable, and all safe gates. The old 318- and 327-row disposable runs are not evidence for this chain.
- `otp-local` is not a validation target while stopped and identity-inconsistent. Port 54322 currently belongs to `otp-clean`; do not start or repair either stack in this run.
- Hosted Supabase and Vercel remain read-only/unknown unless identity is independently verified with already-authorized access. Never use linked CLI state.
- No pilot minimum-quote waiver exists. Discovery may continue below the threshold, but award insertion must fail until actual FINAL quotes meet `min_quotes_required`.
- Contact enquiry PII has a 90-day database retention boundary and service-role-only bounded purge. Scheduling and legal-hold operations are deployment concerns.
- Email delivery is config-gated; WAHA is a controlled demo dependency; in-app dispatch is local code. Tests use mocks/sinks only and must not contact recipients.

## Before a person commits and pushes `main`

1. Read [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) and [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md).
2. Follow [RELEASE_DOCUMENTATION_PROTOCOL.md](../15-change-management/RELEASE_DOCUMENTATION_PROTOCOL.md).
3. `pnpm test:vocab` and `pnpm db:migrate:check` are the checks CI runs before tests. They were not run for the documentation edit.
4. CI on `main` can `supabase db push` to project `qsuvtcezffomtwzwyrso`. The workflow file has no path filter. Pushing docs-only commits can still trigger that job if Actions runs.
5. `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY. That is DEFECT-02. Runtime behavior is unchanged. It is not the hosted migration.
6. Web hosting is separate. DEPLOYED REVISION NOT RE-VERIFIED.
7. Migration `00077` executes a destructive purge. `scripts/deploy-migrations.ts` refuses any apply that crosses it, and the CI production job refuses a push when the remote ledger lacks `00077` (`HISTORICAL_PURGE_BLOCK`). Never run 00077 against an existing database. `scripts/sync-supabase-cloud.ps1` is retired and always exits 1.

## Owner authorization required

Each action below needs explicit owner authorization recorded before anyone performs it. Agents and the documentation do not grant it.

- Applying any SQL to a local shared, staging, or hosted database. This includes numbering and moving any `supabase/*.DEFERRED.UNVERSIONED.sql` proposal into `supabase/migrations/`, where CI could push it.
- Pushing a commit that contains migrations `00315`-`00318`. They were promoted in source on 24 October 2026 and CI `EXPECTED_CEILING` is `00318`, so a push to `main` lets the production job apply them. They have not been applied to any local or hosted database by this change.
- Deleting any account, including demo/QA accounts through [SUPERADMIN_DEMO_USER_DELETION.md](./SUPERADMIN_DEMO_USER_DELETION.md).
- Deploying web or edge functions.
- Turning on enforcement (EULA enforcement, `rollout_at`) or changing a messaging provider.

## Release gates for open workstreams (23 October 2026)

| Workstream | Current state | Gate before release |
| --- | --- | --- |
| SuperAdmin demo/QA deletion | Client implemented and tested with mocks. Server is deferred, unversioned proposal `superadmin_demo_user_deletion.DEFERRED.UNVERSIONED.sql` (former `00320`), which needs the deferred audit actor registry (former `00315`), founder guard (former `00316`), and demo marker guard (former `00321`). Migration numbers `00315`-`00318` now belong to other, promoted migrations. **DEMO-USER DELETION — NOT READY FOR ENFORCEMENT.** The proposal now relies on `auth.uid()` and `auth.role()` rather than requiring the legacy singular role GUC in addition to modern JWT claims. | Owner authorization to number and apply, after the ceiling in force, in the order audit actor registry → founder guard → demo marker guard → demo user deletion. The former `00314` collision (DEMO-DEL-07) is removed by renaming the supplier-address proposal to an unversioned name. Harden or accept the prerequisite-integrity limits (DEMO-DEL-08). Run the database-backed and PostgREST tests in section 7 of the workflow page, including DEMO-DEL-02. Get hosted-runtime proof. If the client ships first, the modal reports that deletion is unavailable without exposing the raw server error, and deletes nothing. |
| WhatsApp (WAHA) | Owner-confirmed demo provider | Do not describe it as production-grade. The operator workstation, tunnel, and `WORKING` session must be up for any send. No delivery receipts. Inbound refused (MSG-01). |
| SMS | Not available for the pilot | Do not enable or announce SMS. Changing provider needs owner authorization. |
| Contact Us submission | **CONTACT US — NOT DEPLOYMENT READY.** Path: `/contact-us` → edge `contact-enquiry` → validation → server-issued signed client identity → atomic 5/hour per-client allowance plus distinct fixed 200/hour endpoint emergency ceiling → `submit_contact_enquiry` (deferred proposal `public_contact_enquiries.DEFERRED.UNVERSIONED.sql`, former `00322`, unapplied) → notification status. Forwarded network identity headers are ignored. Missing/short limiter secret, unavailable limiter, or failed write fails closed. Email relay (`POST /contact-email` on `scripts/whatsapp-bridge`, SMTP via Nodemailer) is implemented and unit-tested only — not runtime-verified, not deployed; without `CONTACT_EMAIL_RELAY_URL` and `CONTACT_EMAIL_RELAY_SECRET` the status is `NOT_CONFIGURED`. **No email has been sent.** | Owner authorization to number and apply the contact enquiries proposal and deploy the edge function; configure a strong `CONTACT_RATE_LIMIT_SECRET`; runtime-check credential persistence, concurrency, and emergency-ceiling behavior; set the hosted `CONTACT_EMAIL_RELAY_URL`/`CONTACT_EMAIL_RELAY_SECRET` and the bridge's `CONTACT_EMAIL_RELAY_SECRET`/`SMTP_*`, expose the bridge (port 3009) through an HTTPS tunnel, and prove one SMTP acceptance before any send claim (see [EMAIL.md](../09-integrations/EMAIL.md)); decide retention/privacy wording; add an admin screen; visually check print/PDF and mobile widths. |
| Support-ticket admin RPC hardening | Promoted in source as `supabase/migrations/00318_support_ticket_rpc_hardening.sql` (former proposal `00323`). EXECUTE stays with `authenticated` only; the function bodies require a trusted authenticated `auth.uid()` plus `private.is_platform_admin()`. **NOT APPLIED to otp-local or hosted.** Disposable-database proof exists from 24 October 2026 (project `otp-disposable-18cd037e42`, 00001–00318, ledger 318 rows, torn down). That evidence is historical and was not rerun. Migration 00317 changed after that run, so the disposable manifest no longer matches the current chain. Signed-out visitors cannot create tickets (`create_support_ticket` has no `anon` EXECUTE); the help modal shows a log-in notice instead of a form (uncommitted). | Owner authorization to push. Read-only ledger check of the target before push. Hosted ledger and PostgREST verification after any application. Anonymous ticket submission needs a separate abuse-controlled design and migration. |

**Static versus runtime verification.** A passing static test (for example the SQL-text tests in `tests/security/demo-user-deletion-00320.test.ts`) or a mocked unit test shows only what source contains. It is not database, PostgREST, or hosted proof. Database-backed tests that print a `[SKIP REASON]` did not run. Record which kind of evidence backs each claim.

## Version identity

There is no release tag requirement in the application version (`0.1.0`). Tags `v*` and `release-*` are workflow triggers. Creating a tag is a human git operation.

## After the user pushes

Record the SHA, the Actions run URL if one exists, the Vercel deployment id if one exists, and the hosted migration list if someone with access reads it. None of those records were produced here. Do not write a release certificate without them.

P0–P4 stay closed. DEFECT-01 and DEFECT-03 are in local SQL `00246` and hosted NOT applied. DEFECT-02 is labelled; the script still writes Docker. SECURITY-01 is remediated in source and the edge function is not redeployed. None of these are LIVE-VERIFIED.
