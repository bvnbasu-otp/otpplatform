# Release runbook

A release is a person’s git commit and git push, plus whatever hosting actually builds that SHA. Agents do not commit, push, or run hosted `supabase db push` unless a future task explicitly says so. This page does not invent a release train.

## Before a person commits and pushes `main`

1. Read [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) and [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md).
2. Follow [RELEASE_DOCUMENTATION_PROTOCOL.md](../15-change-management/RELEASE_DOCUMENTATION_PROTOCOL.md).
3. `pnpm test:vocab` and `pnpm db:migrate:check` are the checks CI runs before tests. They were not run for the documentation edit.
4. CI on `main` can `supabase db push` to project `qsuvtcezffomtwzwyrso`. The workflow file has no path filter. Pushing docs-only commits can still trigger that job if Actions runs.
5. `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY. That is DEFECT-02. Runtime behavior is unchanged. It is not the hosted migration.
6. Web hosting is separate. DEPLOYED REVISION NOT RE-VERIFIED.

## Owner authorization required

Each action below needs explicit owner authorization recorded before anyone performs it. Agents and the documentation do not grant it.

- Applying any SQL to a local shared, staging, or hosted database. This includes moving any `supabase/*.UNAPPLIED.sql` proposal into `supabase/migrations/`, where CI could push it.
- Deleting any account, including demo/QA accounts through [SUPERADMIN_DEMO_USER_DELETION.md](./SUPERADMIN_DEMO_USER_DELETION.md).
- Deploying web or edge functions.
- Turning on enforcement (EULA enforcement, `rollout_at`) or changing a messaging provider.

## Release gates for open workstreams (23 October 2026)

| Workstream | Current state | Gate before release |
| --- | --- | --- |
| SuperAdmin demo/QA deletion | Client implemented and tested with mocks. Server is unapplied proposal `00320`, which needs unapplied `00315`, `00316`, `00321`. **DEMO-USER DELETION — NOT READY FOR ENFORCEMENT.** The proposal now relies on `auth.uid()` and `auth.role()` rather than requiring the legacy singular role GUC in addition to modern JWT claims. | Owner authorization to apply in the order 00315 → 00316 → 00321 → 00320. Resolve the `00314` number collision (DEMO-DEL-07). Harden or accept the prerequisite-integrity limits (DEMO-DEL-08). Run the database-backed and PostgREST tests in section 7 of the workflow page, including DEMO-DEL-02. Get hosted-runtime proof. If the client ships first, the modal shows a server error and deletes nothing. |
| WhatsApp (WAHA) | Owner-confirmed demo provider | Do not describe it as production-grade. The operator workstation, tunnel, and `WORKING` session must be up for any send. No delivery receipts. Inbound refused (MSG-01). |
| SMS | Not available for the pilot | Do not enable or announce SMS. Changing provider needs owner authorization. |
| Contact Us submission | **CONTACT US — NOT DEPLOYMENT READY.** Path: `/contact-us` → edge `contact-enquiry` → validation → server-issued signed client identity → atomic 5/hour per-client allowance plus distinct fixed 200/hour endpoint emergency ceiling → `submit_contact_enquiry` (proposal `00322`, unapplied) → notification status. Forwarded network identity headers are ignored. Missing/short limiter secret, unavailable limiter, or failed write fails closed. Email relay (`POST /contact-email` on `scripts/whatsapp-bridge`, SMTP via Nodemailer) is implemented and unit-tested only — not runtime-verified, not deployed; without `CONTACT_EMAIL_RELAY_URL` and `CONTACT_EMAIL_RELAY_SECRET` the status is `NOT_CONFIGURED`. **No email has been sent.** | Owner authorization to apply `00322` and deploy the edge function; configure a strong `CONTACT_RATE_LIMIT_SECRET`; runtime-check credential persistence, concurrency, and emergency-ceiling behavior; set the hosted `CONTACT_EMAIL_RELAY_URL`/`CONTACT_EMAIL_RELAY_SECRET` and the bridge's `CONTACT_EMAIL_RELAY_SECRET`/`SMTP_*`, expose the bridge (port 3009) through an HTTPS tunnel, and prove one SMTP acceptance before any send claim (see [EMAIL.md](../09-integrations/EMAIL.md)); decide retention/privacy wording; add an admin screen; visually check print/PDF and mobile widths. |
| Support-ticket admin RPC hardening | `00323_support_ticket_rpc_hardening.UNAPPLIED.sql` revokes unsafe grants and requires authenticated identity plus `private.is_platform_admin()`. **IMPLEMENTATION REVIEW ONLY — NOT APPLIED.** | Owner authorization and database/PostgREST verification are required before promotion. Applied migration history remains unchanged. |

**Static versus runtime verification.** A passing static test (for example the SQL-text tests in `tests/security/demo-user-deletion-00320.test.ts`) or a mocked unit test shows only what source contains. It is not database, PostgREST, or hosted proof. Database-backed tests that print a `[SKIP REASON]` did not run. Record which kind of evidence backs each claim.

## Version identity

There is no release tag requirement in the application version (`0.1.0`). Tags `v*` and `release-*` are workflow triggers. Creating a tag is a human git operation.

## After the user pushes

Record the SHA, the Actions run URL if one exists, the Vercel deployment id if one exists, and the hosted migration list if someone with access reads it. None of those records were produced here. Do not write a release certificate without them.

P0–P4 stay closed. DEFECT-01 and DEFECT-03 are in local SQL `00246` and hosted NOT applied. DEFECT-02 is labelled; the script still writes Docker. SECURITY-01 is remediated in source and the edge function is not redeployed. None of these are LIVE-VERIFIED.
