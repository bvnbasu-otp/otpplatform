# Known limitations

Statuses are defined in [CAPABILITY_STATUS.md](./CAPABILITY_STATUS.md). This page is the limit, not a second verdict.

## Current working tree (24 October 2026)

- Local source ceiling is `00327`. No claim is made that `otp-local`, hosted Supabase, or Vercel runs this revision.
- `otp-local` was not started: its stopped database container identifies a different workdir while sibling components identify this workspace, and port 54322 belongs to another pre-existing stack.
- Contact storage has a 90-day retention boundary, but deployment must separately schedule the privileged bounded purge and establish legal-hold operations.
- Email remains configuration/provider dependent. WAHA remains a controlled demo dependency; gateway acceptance is not proof of recipient delivery. In-app delivery depends on authenticated subscriptions.
- There is no minimum-quote pilot waiver. Below-minimum RFQs continue discovery but cannot be awarded.
- Legal approval, rollout activation, payment collection and independently verified hosted deployment remain outside this local closure.

## Current working tree (16 October 2026)

- Local migration files run through `00290`. The CI workflow in this tree expects that file ceiling. Hosted `schema_migrations` was not queried. A local file and a workflow string are not hosted proof.
- Allowance consumption on the isolated database is the first comparison-eligible quote (`00286`, `00288`, `00289`). Publishing does not consume. Purchased credits expire with the subscription. Cross-month quotes fail closed. Hosted runtime of that rule is not verified.
- Buyer and Supplier EULA rows are version `v1.0-20261014` and share `sha256:7c8b0303d8a9e7019cf39e2df95000be05e527d91d8e13711311ffb43c683b5d`. That shared hash is not proof of two distinct approved documents. Both rows are `PENDING_LEGAL_APPROVAL`. `/legal/terms` says it is not final legal text. Legal review and GST review are pending.
- Enforcement is off and `rollout_at` is null. The 30-calendar-day grace period does not start until a rollout timestamp is recorded. `00290` refuses activation while either current agreement is unapproved. This tree does not approve the agreements or record that timestamp.
- The purchase simulator and checkout stay disabled. Passing local tests does not make the pilot green.

## Not observed

- Historical reconstruction note: the hosted Supabase project was not queried in that pass. Prior manual verification recorded there was `00245`. See the current working-tree section above for the file ceiling in this tree. That section does not convert the old note into hosted proof.
- DEPLOYED REVISION NOT RE-VERIFIED. `https://otpplatform-theta.vercel.app` was not read from a Vercel deployment record.
- Phase 2 executed no tests. Phase 1 ran 5 files / 78 tests (pricing entitlement, ONDC foundation, ONDC environment, Google GIS quota, Google Places pilot activation). That does not certify the hosted project.
- Google Cloud billing usage is not instrumented in this repository. The Postgres counter `google_places_daily_budget` is a daily reservation counter. 1500 is the application daily limit, not usage. An OTP monthly Google limit is NOT AUTHORITATIVELY CONFIGURED.

## Product limits that are in the code

- Buyer personas that resolve are Individual, RWA, and MSME. Enterprise claims fail closed.
- Monthly RFQ allowance does not roll. The annual quarterly bonus does not carry into the next quarter. Top-up credits are a separate balance in `evaluateRfqEntitlement`.
- Default billing mode is `PILOT_FREE` unless the caller passes `LIVE`. The web app was not found calling `resolveBillingMode`.
- A committee vote in a `COMMUNITY` organisation needs both an active qualifying appointment and a seat on that RFQ. A seat alone is not enough, because clarification close auto-seats `MANAGER` / `BUYER`. An estate or facility manager does not vote. `DECLARED_CONFLICT` recuses the voter on every org type covered by the `00238` trigger.
- `reveal_award` (`00244`) will not return identity or keep a reveal if purchase-order creation fails. `lock_and_reveal_award_atomic` can lock an award as `PENDING_REVEAL` without a purchase order when the supplier is not verified. Local `00246` also raises when auto-reveal does not receive a purchase-order id. Hosted NOT applied.
- `00245` does not rewrite purchase orders that already exist. Statutory GST split is `UNAVAILABLE` when the snapshot has no `isInterState` and both state codes are missing. Components stay 0 in that case. Transport stays inside the total and is not taxed again.
- Custom payment terms persist as `CUSTOM_TERMS` and do not invent a milestone split.
- WhatsApp runs through WAHA, the owner-confirmed demo provider. It depends on the operator's WAHA container, bridge, and tunnel. `SENT` means the gateway accepted the message. No delivery receipts are recorded. Inbound WAHA webhooks are refused (MSG-01). No session monitoring was found. A successful demo is not proof of production reliability. See [WHATSAPP.md](../09-integrations/WHATSAPP.md).
- SMS is not available for the pilot. No pilot flow sends SMS. Only the Twilio provider can, and Twilio is not a pilot provider. See [SMS.md](../09-integrations/SMS.md).
- Contact Us (`/contact-us`) cannot save an enquiry until the deferred proposal `supabase/public_contact_enquiries.DEFERRED.UNVERSIONED.sql` (former `00322`) is numbered, applied, and `contact-enquiry` is deployed. Both need owner authorization. Until then every submission tells the visitor it was not recorded and points to email or WhatsApp.
- No email is sent for Contact Us enquiries; there is no transport.
- Contact Us has no admin screen and no retention period.
- Contact Us has no repository-evidenced trusted proxy identity, so its uncommitted edge code ignores forwarded-IP headers. It uses a server-issued HMAC-signed client credential for an isolated 5/hour allowance and a separate 200/hour endpoint emergency ceiling. A caller can discard its credential to obtain a new identity, so the emergency ceiling remains necessary. Missing/short `CONTACT_RATE_LIMIT_SECRET` fails closed.
- Support admin RPC hardening is promoted in source as `supabase/migrations/00318_support_ticket_rpc_hardening.sql` (former proposal `00323`). It is uncommitted and not applied to otp-local or hosted. Any database still at the 00140 bodies keeps SEC-SUPPORT-01 until 00318 is authorized, applied, and runtime-verified.
- Signed-out visitors cannot submit support tickets. `create_support_ticket` is not executable by `anon`, and the public help modal now shows a log-in notice with a Contact Us link instead of a form. Anonymous ticket submission stays disabled until an abuse-controlled design is reviewed and approved.
- Support tickets record `routed_email = bvnbasu@gmail.com` (00140, kept by 00318). The help modal header names `bvnbasu+otp.demo.otp.support@gmail.com`; Gmail delivers both to the same mailbox, but the stored value and the displayed text differ. No email is sent for tickets.
- The privacy notice links to `/legal/privacy`, which is a placeholder page. The form has no consent checkbox, because no reviewed consent wording exists. That is an open decision.
- A4 print/PDF output and 320–430 px layouts were not checked visually.
- SuperAdmin demo/QA account deletion exists in the client only. Its server functions are the deferred, unversioned proposal `superadmin_demo_user_deletion.DEFERRED.UNVERSIONED.sql` (former `00320`), which needs the deferred audit actor registry, founder guard, and demo marker guard (former `00315`, `00316`, `00321`). Migration numbers `00315`–`00318` now belong to other, promoted migrations. Until the owner authorizes applying them, the UI cannot delete anything. The modal now sanitizes unknown backend errors, including the expected missing-RPC response. Open findings DEMO-DEL-01 to DEMO-DEL-08. See [SUPERADMIN_DEMO_USER_DELETION.md](../12-operations/SUPERADMIN_DEMO_USER_DELETION.md).
- Migration 00317 now removes `anon` EXECUTE from `discover_and_invite_for_rfq`; prior definitions unnecessarily exposed this buyer action even though its body rejected callers outside the owning organization. This tightening is uncommitted and not applied to otp-local or hosted.
- Buyers cannot waive the minimum-quote quorum from the evaluation cockpit. The database RPC is `public.waive_rfq_quote_quorum(uuid, text)` (00266); no UI control calls it. An unwired client wrapper for a non-existent `waive_min_quotes_and_evaluate` RPC was removed (uncommitted).
- No web code runs the notification dispatch queue. An unused client method that called a non-existent `process_notification_dispatch_queue_batch` RPC was removed. Delivery runs only through `packages/services` workers where configured.
- There is no admin stalled-order alert. An unimported helper that called a non-existent `admin_run_sql` RPC with embedded SQL was removed. No arbitrary-SQL RPC exists or is planned; admin diagnostics use the allowlisted `admin_run_diagnostic_query` (00262).
- `packages/database/src/generated/supabase.ts` is behind the migrations. It lacks `update_my_organization_name`, the `p_network` argument of `discover_and_invite_for_rfq`, and several support, invitation, and GST RPCs. Regenerating it needs a database and was not done.
- ONDC foundation status is `CREDENTIAL_GATED`. The `on_search` ingress NACKs unless a complete pre-production slot is present and the hosts are not production hosts. That is not a live network.
- Static Bengaluru electrical fixtures live in the library adapter. The buyer coverage edge path does not call them. They are not Google, OTP-registered, or GST-verified suppliers.
- Entitlement arithmetic is 3 RFQs a calendar month, plus one non-carrying quarterly bonus on a yearly plan. The old `WHY_5_RFQS_EXPLANATION` constant was removed. Local migration `00248` is the insert enforcement for that bonus. It is NOT applied to hosted.
- An ordinary client must not be the authority for that stored yearly plan. Local migration `00249` rejects an `anon` or `authenticated` change to `organizations.subscription_plan`, `subscription_status`, and `subscription_expires_at`, and rejects a client insert whose plan reads as `YEARLY`. Local migration `00250` makes `process_subscription_payment` return a simulation and does not write those columns. Source only. Hosted apply of both: NOT APPLIED. The local database still runs the `00233` body until `00250` is applied. A catalog-priced wallet debit remains a writer. TDS withholding stores the caller-supplied rate (0–20). OTP calculates withholding from that rate and does not determine or certify the legally applicable statutory TDS rate. The customer or their tax adviser remains responsible for that determination.
- `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY. It must not be used for hosted Supabase `qsuvtcezffomtwzwyrso`. Runtime behavior of the script is unchanged.

## Operational limits

- Git commit and git push are done by a person. This repository’s application does not commit or push.
- GitHub Actions does not publish the web bundle. Its production “deploy” step is a log message. It does contain `supabase db push` and a deploy of the `location-pin-coverage` function. Those steps were not executed here.
- DEFECT-01 and DEFECT-03 are in local SQL `00246` (hosted NOT applied). SECURITY-01 is remediated in source (function not redeployed). DEFECT-02 is labelled; the script still writes Docker. DOC-LEGACY-01 was removed. DOC-LEGACY-02 through DOC-LEGACY-05 remain. COPY-01 through COPY-03 were corrected in source. None are LIVE-VERIFIED. See [DOCUMENTATION_DISCOVERED_DEFECTS.md](./DOCUMENTATION_DISCOVERED_DEFECTS.md).
- `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY (DEFECT-02). CI writes hosted project ref `qsuvtcezffomtwzwyrso`. Vercel’s database is whatever `VITE_SUPABASE_URL` is set to in the Vercel project, which is not in this repo (`UNKNOWN`). The user owns git commit, git push, and hosted `supabase db push`.
