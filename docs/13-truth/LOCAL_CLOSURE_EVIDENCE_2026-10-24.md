# Local closure evidence — 24 October 2026

## Scope and target separation

- Source baseline: `main` at `17c2a2ed6b11e92f5078c94a2f3acc2dd49d5ae1`; pre-existing working changes were preserved.
- Final disposable: `otp-disposable-h24c1024`, workdir under the Windows user temp directory, ports 58320–58329, database 58322. It had no copied env or link state. The exact source chain 00001–00327 applied, and all ten configured seed files then passed in repository order.
- Proposal behavior harness: separate disposable `otp-disposable-b24c1024`, ports 57220–57229, stopped at 00314 so promoted migrations could be installed only inside rolled-back tests.
- `otp-local`: not started or repaired. Its stopped database container identifies a different workdir while sibling containers identify this workspace; port 54322 belongs to the pre-existing `otp-clean` stack.
- Hosted Supabase and Vercel: not inspected or changed because no independently verified target identity and authorized access were established. No linked CLI command was used.

## Exact migration evidence

- Ledger: 327 rows, maximum `00327`.
- Manifest hash for `00317_rfq_category_service_coverage_guard.sql`: `e01a84fce1666baaeb019476c86b42b93769fc2a85b38893f355b990d9550538`.
- Disposable catalog proof: anonymous discovery execution denied; authenticated discovery execution retained; waiver execution denied to anon/authenticated/service role; notification queue and role-assignment direct DML denied; contact storage and notification queue RLS enabled; award-quorum and role-write triggers enabled; legal defaults remained `false`/`NULL`; contact retention column is mandatory.
- Pre-00077 proof returned `HISTORICAL_PURGE_TARGET_EMPTY`. No retained database was reset, seeded, truncated or recreated.
- Database types were generated only from `postgresql://127.0.0.1:58322/postgres?sslmode=disable` through the loopback/port allow-listing wrapper.

## Implemented closure

- `00315`–`00318`: organization rename, discovery grant/category/coverage and support hardening.
- `00319`–`00324`: supplier business address, audit actor registry, founder guard, demo marker, transactional demo deletion and rate-limit-first contact enquiries.
- `00325`: no pilot quote-quorum waiver; actual FINAL quote count is checked at award insertion.
- `00326`: one-calendar-year RWA/MSME appointments, one active holder, appointment-plus-seat voting, COI and estate/facility-manager denial, current-vote quorum and RPC-only assignment writes.
- `00327`: mandatory dispatch idempotency, bounded recipient address, recipient/admin reads and service-role-only enqueue.
- Signed-out navigation hides Help & Support while login/contact guidance remains. Desktop scrollbar/focus and mobile horizontal-overflow contracts are covered locally; Playwright package execution remains an environment gate.

## Channel truth

- In-app: implemented local event/read/subscription paths; hosted realtime not verified.
- Email: config-gated; retry/idempotency and safe mock/MIME paths tested; no mailbox/provider delivery was attempted.
- WhatsApp: WAHA remains a controlled demo dependency. Gateway acceptance is not recipient delivery; no message was sent.
- Contact: storage has 90-day retention and privileged bounded purge. Deployment must separately schedule purge, configure relay, and establish legal-hold operations.

## No-waiver proof

Below-minimum RFQs remain discoverable and can continue receiving quotes. `waive_rfq_quote_quorum` is fail-closed and ungranted, new waiver flags are blocked, and award insertion counts actual FINAL quotes. There is no pilot exception path.

## Authorization gates

Manual approvals remain separate for commit, push, hosted database deployment, Vercel deployment, provider secrets/sessions, retention scheduling, legal rollout and production activation. This evidence does not grant any of them.
