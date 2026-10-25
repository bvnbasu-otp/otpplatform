# OTP security and release-readiness closure — 25 October 2026

## Verdict

**NOT READY FOR PILOT CERTIFICATION.**

The reported local functional run remains historical evidence and was not repeated because this closure changed no functional input. Diff review found material reproducibility and gate-integration defects: the authenticated Playwright suite is not invoked by the master runner or CI, CI appears to start the disposable stack without loading required seed identities, non-delivering transport settings are not encoded in the candidate, and generated-type reproduction is not documented sufficiently to replay. Certification remains blocked by those defects, unconfirmed credential/private-key/password rotation, founder disposition of ignored archives/backups/release bundles, and exact-SHA CI for an authorized immutable candidate. Hosted/deployed verification remains **BLOCKED — NOT AUTHORIZED**.

## Phase A — baseline and preservation

- Repository: `G:\My Drive\otp`
- Branch/upstream: `main` tracking `origin/main`
- HEAD and upstream: `519d424dbc35e14a7bc7a79af739fb1a69bc1367`
- Ahead/behind: `0/0`
- Index: empty at entry; no staging action was performed.
- Initial tracked worktree: 45 modified paths and seven deleted Vitest evidence paths.
- Initial untracked repository paths: nine (the prior evidence report, ESLint config, three regression helpers/tests, migration `00328`, and the no-quorum security test).
- All code, configuration, migration, test, generated, environment, archive, backup, and release artifacts pre-existed this closure task and were preserved.
- Tracked diff fingerprint excluding this report: Git object `3634445eae6069d71d01aea06e62a5de682e86df`.
- Redacted Gitleaks artifact: SHA-256 `e576b5d2501b7a9598f032003154ac0b2e6fb3371dd8408e65ea855dda98e6ec`.

### Seven preserved deletions

- `.vitest-formalization-gate-isolated.json` — baseline blob `bd6b79596e1cb96d25b13849bf58fbfacbecaddd`
- `.vitest-functional-run222.txt` — baseline blob `f32cccd600a8af257fcdfc0d50d90d3c090720a7`
- `.vitest-hmac-sql-parity-evidence.txt` — baseline blob `ea92e7e0693f5104377f2eac751d09072fcedf4e`
- `.vitest-module-run222-followup.txt` — baseline blob `5f401c9dd4185fc67aa8aa94ca3f3243949f0db4`
- `.vitest-security-crosscut-result.json` — baseline blob `949cda85c6f99682146f3da1e60fadc1e6eccefe`
- `.vitest-security-result.json` — baseline blob `706a249c1fcfff7c80326191c5b05aa3f55e58d1`
- `.vitest-security-wave1-result.json` — baseline blob `8d5e19c99bb711a3b66fcc35bd2235672c3a00ff`

### Preserved untracked repository artifacts at entry

- `docs/13-truth/PILOT_RECERTIFICATION_EVIDENCE_2026-10-25.md` — Git object `7801a4d8fff3a8b1c7a09b4ef0a2c3d13b14ad6c`
- `eslint.config.mjs` — `738b83ca254c22b55b1eb392b813f53b538c359b`
- `scripts/regression-results.ts` — `2b00ef92c879548876ac3f11e20f6f91ba76f3b6`
- `scripts/regression-rpc-scope.ts` — `b680cd0b60d97b30f67611b8ea96758ce5607514`
- `scripts/regression-target.ts` — `e2bbcb10ad6546ff45538a2081f7742ad212fadb`
- `supabase/migrations/00328_admin_test_runner_canonical_status_enum.sql` — `0a006e3c429f4312ae014eb6203c2383c544f44c`
- `tests/security/no-pilot-quorum-00325-database.test.ts` — `f992f0dc3cb9a43b7c677fb6537da22d4b28aabe`
- `tests/unit/regression-results.test.ts` — `363a26f93c69e526ae00bbe2b7cfdf2d5f017eeb`
- `tests/unit/regression-rpc-scope.test.ts` — `19ff81e37a6d6b9cb5b1118ede2c51d8ac82264f`

### Protected ignored/local artifact fingerprints

These hashes identify files without disclosing their contents:

- `.env` — SHA-256 `cb720b369ea1d2c232388042a5e802f37a29ebd339b828e67520169c2d0eb351`
- `.env.otp.production.local` — `13a755c9da7b91c3e67ead8e4af37bb44c364e3946aad944ae4936a9bd68cf48`
- `apps/web/.env` — `0484e05312d9b98caf57c256cd3eb38d3ca0844be97ddddabd67e318cad2c293`
- `archive/scratch/ondc-08a-operator/operator-secrets.json` — `c5bef78fe9c822a1a294f75b70d8f0e569faf81ad3cf8e72146931b852ccd0ab`
- `backups/otp_prod_backup_20260919_223132.sql` — `2243538644ac45f8b9974fef20a796a3dbf09df11d1557dd078dff268d1644f2`
- Commercial master MP4 — `63a425a47fc88edbb14776a8447d04c92b0f77549c2961c598207553cd0e21f2`
- Commercial vertical MP4 — `299e171955bdb81d510ac9a9de06ea9bec09381aabd06d1db0f336abf3cfe795`

Tracked repository content is represented by Git. Ignored environment, archive, backup, release, generated, local-stack, and production-media files are local artifacts and are not candidate source merely because they exist under the working directory.

## Phase B — secret-material reconciliation

### Scanner identity and totals

- Scanner: Gitleaks `8.30.1`, local directory mode, `--redact=100`, no upload.
- Primary artifact: `C:\Users\bloganat\AppData\Local\Temp\otp-gitleaks-final2.json`.
- Primary scan: approximately 194 MB, 10 MB per-target limit.
- Exact total: 67 findings: 45 `generic-api-key`, 19 `jwt`, two `gcp-api-key`, one `private-key`.
- Tracked: 23 = 20 test fixtures + one historical verification document + two immutable seed migrations.
- Ignored/untracked: 44 = 17 local environment/local-stack + 14 generated/release + 13 archive/backup.
- Counts reconcile exactly to the scanner artifact. No finding was suppressed.

Fingerprints below are SHA-256 prefixes of `path|start-line|end-line|rule`; they do not hash or reproduce secret values.

### Local environment and local-stack findings — 17

- `F-001` — `.env:4`; `jwt`; ignored; fingerprint `f9583661d640`. `VITE_SUPABASE_ANON_KEY`; project-scoped local configuration. Risk: medium until project identity and key age are confirmed. Disposition: retain access-restricted only while needed, replace during Supabase key rotation, then securely remove stale copies.
- `F-002`/`F-003` — `.env.otp.production.local:14-15`; `generic-api-key`/`jwt`; ignored; fingerprints `0c850a6ed1ad`, `3d67ce54e1b7`. `SUPABASE_ANON_KEY`; production-labeled configuration. Risk: medium (public client credential, but stale project access/configuration risk). Disposition: replace together with the Supabase key transition and rebuild clients.
- `F-004`/`F-005` — `.env.otp.production.local:18-19`; `generic-api-key`/`jwt`; ignored; fingerprints `50d54fcd5c2a`, `a55b2af9c28f`. `SUPABASE_SERVICE_ROLE_KEY`. Risk: critical; potentially privileged and previously copied into tracked runtime source. Disposition: authorized Supabase project owner must revoke/rotate immediately and confirm by key identifier/time only.
- `F-006` — `.env.otp.production.local:23`; `generic-api-key`; ignored; fingerprint `9874b8642228`. `SUPABASE_ACCESS_TOKEN`. Risk: critical account/project-management access. Disposition: authorized Supabase account owner must revoke and issue a least-privilege replacement if still required.
- `F-007`/`F-008` — `.env.otp.production.local:53-54`; `generic-api-key`/`jwt`; ignored; fingerprints `a9368fcc21b8`, `95786fe9b889`. `VITE_SUPABASE_ANON_KEY`; duplicate production client material. Risk/disposition: same Supabase client-key transition; remove duplicates after verified replacement.
- `F-009` — `.env.otp.production.local:73`; `gcp-api-key`; ignored; fingerprint `e03b8ad3679e`. Google Places key. Risk: high if unrestricted or billable. Disposition: GCP project owner rotates, restricts to required APIs/referrers/IPs, verifies old key disabled.
- `F-010` — `.env.otp.production.local:77`; `gcp-api-key`; ignored; fingerprint `ef2fa219f7e9`. Google Maps key. Risk/disposition: same GCP owner action, with separate restrictions if this is a distinct key.
- `F-011` — `.env.otp.production.local:109`; `generic-api-key`; ignored; fingerprint `8556aeb90b1c`. Meta webhook verify token. Risk: high for webhook integrity if active. Disposition: Meta Business/app administrator replaces the token and updates the receiver atomically.
- `F-012` — `.env.otp.production.local:221`; `generic-api-key`; ignored; fingerprint `046261d0018e`. WAHA API key. Risk: high if the gateway is reachable. Disposition: WAHA operator rotates it and confirms old-key rejection without publishing either value.
- `F-013` — `apps/web/.env:4`; `jwt`; ignored; fingerprint `734caf1949e5`. Web local Supabase client key. Risk/disposition: confirm project, replace with the intended local/project key, remove stale copy.
- `F-054`/`F-055` — `supabase/.temp/start-secrets/supabase_edge_runtime_otp-local/env/docker.env:2-3`; `jwt`; ignored; fingerprints `69ebb0a09dc1`, `4d4296a2e239`. Disposable/local Supabase anon/service JWTs. Risk: low only if the local stack is isolated and stopped. Disposition: remove through normal local-stack teardown after recoverability is confirmed.
- `F-056`/`F-057` — the same local-stack file at lines 5-6; `generic-api-key`; ignored; fingerprints `aa38138bbc0c`, `d1682c2a65f9`. Local runtime secrets. Risk/disposition: same local-stack teardown; never promote to hosted configuration.

Status: **potentially live; rotation not confirmed**. The filename and variable names establish affected services but not liveness. No credential was tested against a live endpoint.

### Generated/release findings — 14

- `F-014`/`F-015` — `apps/web/dist_prev/assets/index-DpIFK4Zp.js:1,292`; `jwt`; ignored; fingerprints `6bf3b01a8d50`, `4f913f1195a5`.
- `F-016`/`F-017` — `apps/web/releases/release_20260919_111830/assets/index-ungrgPZo.js:1,294`; `jwt`; ignored; `8eea7bc8cf92`, `d9d5b7772118`.
- `F-018`/`F-019` — `apps/web/releases/release_20260919_131430/assets/index-Bdsgcn3M.js:1,292`; `jwt`; ignored; `7ac9b09d80cd`, `f0b7cc2cee6c`.
- `F-020`/`F-021` — `apps/web/releases/release_20260919_142139/assets/index-V-vGvkOu.js:1,292`; `jwt`; ignored; `8a399dc3d56a`, `50f4b69a314b`.
- `F-022`/`F-023` — `apps/web/releases/release_20260919_201652/assets/index-BtfYFmsi.js:1,292`; `jwt`; ignored; `57dba22b6640`, `2d7011f8d8c9`.
- `F-024`/`F-025` — `apps/web/releases/release_20260919_223142/assets/index-DpIFK4Zp.js:1,292`; `jwt`; ignored; `6fe94113e87a`, `e6396bf6ff8c`.
- `F-044` — `packages/services/dist/services/financial-control-5c6.test.js:101`; `generic-api-key`; ignored; `1b83a6fc264b`.
- `F-045` — `packages/services/dist/services/phase6-group5-communications-milestones-disputes.test.js:388`; `generic-api-key`; ignored; `a23ff8bcb8b2`.

Classification/evidence: generated browser release bundles contain legacy project client JWTs; generated service test bundles duplicate source fixtures. Risk: medium for stale project configuration and accidental redistribution, low for the duplicated nonfunctional test fixtures. Proposed disposition: exclude all from the candidate; preserve until the founder confirms they are not the sole recoverable release; then securely delete stale releases or move an encrypted, access-controlled evidence copy outside the worktree. Regenerate only after credential transition. Do not deploy these bundles.

### Archive/backup findings — 13

- `F-029` — `archive/OTP Golden Reconstruction/Taxonomy/OTP-TAXONOMY-03A-READONLY-VERIFICATION.md:292`; `generic-api-key`; ignored; fingerprint `cc018a8a2ddb`. Archived duplicate of historical verification material. Risk: medium until its credential is confirmed inactive. Disposition: encrypted/restricted evidence retention or authorized secure deletion.
- `F-030` — `archive/scratch/ondc-08a-operator/generate.ts:47`; `generic-api-key`; ignored; `3b6b1a40f45f`. ONDC operator key-generation scratch material. Risk: high because it is adjacent to private-key output. Disposition: ONDC key custodian reviews locally, rotates affected pre-production keys, then securely deletes or encrypts the scratch set.
- `F-031` — `archive/scratch/ondc-08a-operator/operator-secrets.json:4`; `generic-api-key`; ignored; `a5a23421be8a`. ONDC signing private material. Risk: critical.
- `F-032` — the same file at line 5; `private-key`; ignored; `4114e0363a61`. PEM private key. Risk: critical.
- `F-033` — the same file at line 6; `generic-api-key`; ignored; `4c3c9db54892`. ONDC encryption private material. Risk: critical.
- `F-034` — the same file at line 9; `generic-api-key`; ignored; `c158594f20ee`. ONDC pre-production encryption private key. Risk: critical.
- `F-035` — `backups/legacy_docs/CONFIGURATION-COMPLETE-SUMMARY.md:49`; `generic-api-key`; ignored; `cb19f29d7401`. Demo reset secret. Risk: high if the reset endpoint exists.
- `F-036`/`F-037` — `backups/legacy_docs/MANUAL-SUPABASE-CONFIG.md:311,371`; `generic-api-key`; ignored; `136b8a48ab9b`, `6f7541c5ac2b`. Demo reset secret copies. Risk: high.
- `F-038` — `backups/legacy_docs/MESSAGING-META-WHATSAPP-SETUP.md:131`; `generic-api-key`; ignored; `ea1bd439674b`. Meta app secret. Risk: critical if active.
- `F-039`/`F-040` — `backups/legacy_docs/README-QUICK-START.md:15,37`; `generic-api-key`; ignored; `dc31062950eb`, `b0813fc6271d`. Demo reset secret copies. Risk: high.
- `F-041` — `backups/otp_prod_backup_20260919_223132.sql:32122`; `generic-api-key`; ignored; `e16075794589`. Credential-like production database backup material. Risk: critical because type/liveness is not safely established from redacted evidence.

Proposed disposition for `F-031`–`F-034`: the authorized ONDC subscriber/operator key custodian must generate new signing and encryption keypairs, update the authorized ONDC registry/runtime through the approved mechanism, confirm the old public-key identifiers are retired, and only then authorize secure deletion or encrypted evidence retention. For `F-035`–`F-041`, the Supabase/Meta application owners must rotate the demo reset, Meta app, and unknown backup-held credential material. The SQL backup must remain quarantined and access-restricted until recoverability and legal retention requirements are confirmed.

Status: **potentially live; rotation not confirmed**.

### Tracked findings — 23

The following 20 findings occur only in test source and are used as deliberate parser/signature/authentication fixtures, not runtime configuration:

- `F-026` — `apps/web/src/features/contact/contact-enquiry-server.test.ts:510`; `generic-api-key`; tracked; `7b516bb71413`.
- `F-027` — `apps/web/src/features/org/org.test.ts:98`; `generic-api-key`; tracked; `ccfb40d80590`.
- `F-028` — `apps/web/src/features/subscription/payment-webhook.test.ts:6`; `generic-api-key`; tracked; `e330b8863cbf`.
- `F-043` — `packages/domain/src/types/operational-oversight.test.ts:78`; `generic-api-key`; tracked; `72f0b86de9c0`.
- `F-046` — `packages/services/src/gis/google-maps-location-adapter.test.ts:71`; `generic-api-key`; tracked; `ba45a2a9c0c8`.
- `F-047`/`F-048`/`F-049` — `packages/services/src/gis/google-places-pilot-activation.test.ts:190,228,259`; `generic-api-key`; tracked; `9e32325ab648`, `771b874a9947`, `3f0455145537`.
- `F-050` — `packages/services/src/notifications/notification-queue-worker.test.ts:194`; `generic-api-key`; tracked; `596a9ab7da6e`.
- `F-051` — `packages/services/src/services/financial-control-5c6.test.ts:125`; `generic-api-key`; tracked; `60122aec29cf`.
- `F-052` — `packages/services/src/services/phase6-group5-communications-milestones-disputes.test.ts:461`; `generic-api-key`; tracked; `782456f6189f`.
- `F-053` — `scripts/test-live-smoke.ts:297`; `generic-api-key`; tracked; `db89fec7085c`.
- `F-058` — `supabase/functions/_shared/contact/email-relay.test.ts:15`; `generic-api-key`; tracked; `8951e33e0800`.
- `F-059` — `supabase/functions/_shared/messaging/providers/waha.test.ts:250`; `generic-api-key`; tracked; `638dda74c724`.
- `F-060`/`F-061` — `supabase/functions/payment-webhook/index.test.ts:6,43`; `generic-api-key`; tracked; `f5ac08b1d1cf`, `0c88789a6cfe`.
- `F-064` — `tests/security/cross-module-golden-journey-redteam.test.ts:666`; `generic-api-key`; tracked; `1fa665906ec5`.
- `F-065` — `tests/security/pricing-entitlement-redteam.test.ts:717`; `generic-api-key`; tracked; `d0d24b7901fd`.
- `F-066`/`F-067` — `tests/unit/whatsapp-bridge-relay.test.ts:21-22`; `generic-api-key`; tracked; `ce2be7673c36`, `a55bf0623c27`.

Supporting evidence: each value is confined to test code or a test-only smoke fixture and is exercised as input to mocked/local validation rather than loaded as deployed configuration. Risk: low, but intentionality alone is not a waiver. Disposition: retain as nonfunctional fixtures; use clearly invalid fixture prefixes in a future maintenance change where that does not weaken format/signature coverage. Do not suppress globally.

The remaining tracked findings require stronger retention controls:

- `F-042` — `OTP Golden Reconstruction/Taxonomy/OTP-TAXONOMY-03A-READONLY-VERIFICATION.md:292`; `generic-api-key`; tracked; `2a268a5a0414`. Historical verification document. Risk: medium until the owning service confirms it is inactive. Disposition: preserve historical evidence and rotate if active; do not rewrite history under this task.
- `F-062` — `supabase/migrations/00113_seed_real_super_admin_bvnbasu.sql:22`; `generic-api-key`; tracked; `17ffd8d84439`.
- `F-063` — `supabase/migrations/00158_seed_buyer_account_bvnbasu_yahoo.sql:33`; `generic-api-key`; tracked; `9f6bf23407d6`.

`F-062`/`F-063` are immutable historical seed migrations, not runtime fallbacks. Risk: high if the seeded material was reused in any hosted or reachable environment. Disposition: preserve migration history, confirm the seeded accounts/credentials are disabled or rotated in every non-disposable environment, and use a forward migration for any repository-side retirement needed after owner confirmation.

### Commercial videos omitted by the broad scan

- `production/commercial/OTP_Commercial_Think_Beyond_The_Password_MASTER_FINAL.mp4` — 10,925,167 bytes.
- `production/commercial/OTP_Commercial_Think_Beyond_The_Password_VERTICAL_9x16.mp4` — 12,960,288 bytes.

Both exceeded the broad scan's 10 MB documented target limit. Each was scanned separately, locally, with Gitleaks `8.30.1`, full redaction, and a 20 MB target limit. Both scans exited `0` and reported no leaks. This closes scanner-pattern coverage for the two files; it does not constitute a visual privacy/content release approval.

## Required founder/owner rotation actions

No rotation has yet been confirmed. Perform actions through each service's approved console or key-management process, never by sending values in chat or committing them.

1. **Supabase owner/project administrator:** revoke the exposed service-role credential and personal/access token; transition stale anon/client keys; confirm old key identifiers disabled; rotate the removed hard-coded administrative/initial passwords (including the personal-looking account) and rotate or disable credentials seeded by migrations `00113` and `00158` if they ever reached a non-disposable environment.
2. **ONDC subscriber/operator key custodian:** rotate signing and encryption keypairs represented by `operator-secrets.json`; update authorized pre-production registry/runtime records; confirm old public-key IDs retired.
3. **Google Cloud project owner:** rotate Places and Maps keys, restrict APIs and referrers/IPs, and confirm old keys disabled.
4. **Meta Business/app administrator:** rotate the app secret and webhook verification token, updating receiver configuration atomically.
5. **WAHA operator:** rotate the API key and confirm the old key no longer authenticates.
6. **OTP application owner:** rotate `DEMO_RESET_SECRET` and identify/rotate the credential-like material in the production SQL backup.

Acceptable non-disclosing confirmation for each item: service, credential type, old key identifier/fingerprint suffix, rotation/revocation timestamp, responsible owner, new key storage location/class (not value), and evidence that the old key is disabled. Do not test old credentials from this repository.

## Phase C — diff and preservation review

All changes below pre-existed Phase A of this closure task. Attribution to recertification remediation is based on the prior evidence report and implementation inspection; this task added only this report.

### Required recertification remediation

- Regression fail-closed accounting: `scripts/run-master-regression.ts`, `scripts/regression-results.ts`, `scripts/regression-target.ts`, `scripts/regression-rpc-scope.ts`, related unit tests, disposable validation helper/tests, and CI workflow. They address missing/skipped/unavailable/timeout false-green behavior and unsafe target ambiguity.
- Disposable database and RPC safety: `scripts/disposable-migration-validation.ts`, `scripts/local-db-contract-run.mjs`, `scripts/p0-gaps-contract-run.mjs`, SQL-parity helper, affected security tests, and no-quorum test. They address verified loopback identity/readiness, isolated seed use, canonical role/status contracts, and below-quorum discovery/award behavior.
- Migration reconciliation: forward migration `00328`, migration history/runbook/truth docs, and migration formalization tests. It addresses the stale `rfq_phase` enum probe without rewriting applied history.
- Live/browser remediation: `scripts/run_live_automated_tests.ts` and `e2e/sourcing-full-lifecycle.spec.ts`. They address final-quote eligibility, authoritative committee appointments, authenticated personas, sealed-contact non-leakage, reveal receipt, and PO visibility.
- Tracked credential correction: web Supabase setup/tests, runtime scripts, and location coverage edge function/shared auth. They remove tracked JWT/service-role fallbacks and require environment-provided credentials.
- Demo seed correction: `supabase/seed_demo_environment.sql` and seed security tests. They avoid an invalid `is_demo` false-to-true rewrite.
- Static/CI correction: `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`, and `.github/workflows/ci-cd.yml`. They replace the no-op lint gate with a deliberately narrow real ESLint scope and run it in CI.

### Evidence/documentation

- `docs/13-truth/PILOT_RECERTIFICATION_EVIDENCE_2026-10-25.md`
- `README.md`, `docs/README.md`
- `docs/07-database/MIGRATION_HISTORY.md`
- `docs/11-TESTING-AND-REGRESSION-SUITE.md`
- `docs/12-operations/RELEASE_RUNBOOK.md`
- `docs/13-truth/CAPABILITY_STATUS.md`
- `docs/13-truth/KNOWN_LIMITATIONS.md`
- This closure report.

### Pre-existing user work and unexplained/protected changes

- The seven deleted Vitest evidence files are pre-existing user deletions. They were not restored, recreated, staged, or otherwise changed.
- No current code/configuration change was created by this closure task, so none is claimed as newly authored here.
- Ignored `dist`, release, archive, backup, environment, local-stack, media, and package cache artifacts remain outside the candidate inventory unless explicitly selected later.

### Review conclusions and limits

- Regression aggregation fails required suites on invalid/missing reports, nonzero exits, zero tests, required skips, unavailable endpoints, and per-step timeout.
- Disposable target resolution requires a marker-bound disposable project/workdir, loopback API and DB ports, matching container identity, no link state, complete API keys, and absence of remote DB environment variables.
- The 12 database RPC cases actually executing their labels are separated from 13 historical labels mapped to replacement suites. The mapping is documented and unit-tested, but its test only counts entries and does not prove mapped suites exist. The claimed Playwright replacement is not invoked by a package script, the master runner, or CI; metadata-sanitizer labels map only to the broad web suite, WhatsApp delivery maps to messaging unit tests, and AI parsing maps to a browser test that only fills a text box. Replacement accounting is not fail-closed end to end.
- Migration `00328` is technically sound and the `00328` ceiling is consistent. Its header inaccurately says historical migration `00261` was corrected for fresh replays even though `00261` remains unchanged; correct the comment, not historical migration content.
- Live-flow fixtures now insert quotes directly as `FINAL` with service-role authority rather than exercising the real finalization path. Committee appointments use the authoritative RPC, but votes still use service-role insertion and cleanup failures are only logged, which can make reruns fail on active-role uniqueness.
- Browser tests use authenticated seeded identities and assert real pages, but are not wired into a reproducible gate. Their leak check is narrower than the previous assertion because it covers only `<main>` and `@otp.test`/`@otpdemo.test` addresses. The intake test fills but does not publish or verify supplier matching; the committee test does not cast a vote. The prior “12/12 authenticated sourcing lifecycle” result must not be treated as complete candidate evidence.
- CI starts the disposable stack but does not load the seed identities used by REST-gated tests such as `qa-buyer@otp.test`; the functional CI job is therefore expected to fail or behave differently once previously skipped tests execute.
- CI teardown checks for `.otp-disposable-marker.json`, while the validator writes `.otp-disposable-validation.json`, so teardown is skipped. If the filename is corrected alone, teardown still refuses because the job has exported `SUPABASE_URL`, `VITE_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, all forbidden by the validator's environment-cleanliness check.
- The non-delivering WAHA/site settings used for the reported local run exist only in that process environment. The candidate and CI do not encode them; the smoke script still defaults to the local WAHA gateway and can count an offline liveness check as passing.
- Generated-type reproducibility lacks a recorded command, compared artifact, and hashes. The generator's direct `supabase` process invocation is also not Windows-reproducible in the same way already corrected elsewhere.
- Current truth documents conflict: some retain the earlier failing RPC/browser state and disposable project/port while the prior evidence report claims the later passing run.
- The live/smoke scripts are now loopback-only while one still loads the production-labeled local environment by default; intended hosted-use behavior is undocumented.
- Timeout coverage is incomplete: only whole suite commands have the configurable timeout; individual RPC, readiness, seed-count, Docker seed, and Docker inspection calls can hang. A zero timeout disables suite protection, and Windows shell termination may not terminate the spawned test process.
- `scripts/run-master-regression.ts` has TypeScript error `TS4104` because a readonly ID list is passed where mutable `string[]` is required. It executes under `tsx`, but current `pnpm typecheck` and scoped lint do not cover this error.
- The staging gate checks report `sourceSha` against HEAD but does not establish report freshness for a dirty tree or require complete disposable-project identity. This is less concerning in clean ephemeral CI, but insufficient as local candidate evidence.
- Runtime credential fallbacks were removed. The remaining `missing-supabase-anon-key` sentinel is not a credential, though fail-fast startup would be clearer future hardening.
- ESLint is genuinely invoked but only for eight CLI-listed files. The config's `files` block does not create that scope, `@eslint/js` is unused, and other edited scripts/edge functions are not covered.
- Assertions were not broadly deleted merely to obtain green results, but browser anti-leak coverage was narrowed and the evidence claims exceed what the spec proves.

## Phase D — proportionate reverification

No functional, database, migration, workflow, code, configuration, or test input changed during this closure, so the previously reported executions were not repeated. They remain historical run results, but diff review invalidated treating them as a complete final-candidate gate:

- Master regression: 5,843/5,843.
- Required executable RPCs: 12/12.
- Live flows: 25/25.
- Authenticated sourcing lifecycle: reported 12/12, but not wired into a repository gate and narrower than the claim.
- Accessibility: 6/6.
- Disposable replay/security, lint, typecheck, policy, build, migration continuity: previously reported PASS.
- Generated-type reproducibility: evidence insufficient to reproduce; status **BLOCKED**.
- Candidate CI behavior: **BLOCKED** pending seed loading and exact-SHA execution.
- Non-delivering transport safety: **BLOCKED** until encoded in the reproducible gate configuration.

New targeted verification:

- Reconciled the redacted 67-finding artifact against Git tracking state: exact 23/44 split and exact category totals.
- Scanned the two broad-scan-excluded commercial videos locally with a raised 20 MB target limit: both PASS, no findings.
- `git diff --check`: PASS before this report; rerun after this report is recorded in final state below.

No hosted verification was performed. The GitHub CLI was not available in this shell, so the prior read-only CI evidence was not refreshed. The latest documented CI remains run `40109506328`, successful on baseline SHA `519d424dbc35e14a7bc7a79af739fb1a69bc1367`; it is not candidate evidence.

## Phase E — commit-readiness package

### Candidate inclusion recommendation

The current tree is **not commit-ready**. Before requesting staging authorization, correct and target-verify the Playwright gate wiring, CI seed loading, non-delivering transport configuration, generated-type reproduction, migration `00328` inconsistency, and truth-document contradictions. Then include only the reviewed tracked modifications and intended untracked remediation/evidence files. Keep ignored environment files, local-stack secrets, archives, backups, old release bundles, generated `dist` output, media, and package caches outside the commit.

One commit is technically coherent because the changes jointly repair the recertification gate and its evidence. If review size requires splitting, use:

1. Regression/disposable DB/migration/test remediation.
2. Runtime credential fallback removal and authenticated live/browser remediation.
3. CI/lint and truth/evidence documentation.

Do not split migration `00328` from its test/history updates, or regression accounting from its unit tests.

### Outstanding blockers

- Credential and private-key liveness/rotation confirmations are pending.
- Removed hard-coded administrative/initial password rotation confirmations are pending.
- Founder disposition of archives, backups, stale release bundles, and local environment copies is pending.
- Authenticated browser checks are not wired into the master runner or CI.
- CI disposable setup does not load the seed identities required by REST-gated tests.
- CI disposable teardown checks the wrong marker and conflicts with its exported environment.
- Non-delivering notification transports are not encoded in candidate/CI configuration.
- Generated database type reproduction is not independently reproducible from the recorded evidence.
- RPC replacement mappings are nominal rather than enforced for several labels.
- Runner timeout coverage and the uncovered `TS4104` error require correction.
- The live-flow test bypasses actual quote finalization and does not fail on cleanup errors.
- The `00328` header comment, narrowed browser leak assertions, and contradictory truth docs require correction/review.
- The candidate is still a dirty working tree, not an immutable SHA.
- Exact-SHA CI is pending and must be run only after explicit staging/commit/push authorization.
- Hosted/deployed verification remains separately unauthorized.

## Commands and exit status

- `git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git rev-parse --verify '@{upstream}'; git status --short --branch; git diff --cached --name-status` — exit `0`; HEAD/upstream `519d424...`, index empty.
- `git rev-list --left-right --count HEAD...origin/main` — exit `0`; `0 0`.
- `git diff --numstat; git diff --summary; git diff --check; git status --porcelain=v2` — exit `0`.
- PowerShell read-only aggregation of `C:\Users\bloganat\AppData\Local\Temp\otp-gitleaks-final2.json` by `RuleID`, `File`, and Git tracking state — exit `0`; 67 findings, with no secret field emitted.
- `gitleaks.exe dir production/commercial/OTP_Commercial_Think_Beyond_The_Password_MASTER_FINAL.mp4 --redact=100 --no-banner --max-target-megabytes=20 --report-format=json --report-path=...\otp-video-master-gitleaks.json --exit-code=1` — exit `0`; no leaks found.
- `gitleaks.exe dir production/commercial/OTP_Commercial_Think_Beyond_The_Password_VERTICAL_9x16.mp4 --redact=100 --no-banner --max-target-megabytes=20 --report-format=json --report-path=...\otp-video-vertical-gitleaks.json --exit-code=1` — exit `0`; no leaks found.
- Targeted redacted Gitleaks scan of this new closure report — exit `0`; no leaks found.
- Final `git diff --check` — exit `0`.
- Final `git diff --cached --quiet` — exit `0`; staging remains empty.
- Final worktree counts: 45 modified, seven deleted, ten untracked (the tenth is this new report), zero staged.
- `gh run list --limit 3 --json databaseId,headSha,status,conclusion,event,workflowName,url,createdAt` — command unavailable (`gh` not installed); no hosted action was triggered.
- No test command was run because only evidence documentation changed and the functional inputs remained unchanged.

## Authorization boundary

No file was staged, committed, pushed, merged, rebased, tagged, deployed, or used to mutate a hosted/existing database. No credential was accessed against a service or rotated. No real recipient was contacted.

Required next authorization sequence:

1. Owners complete and attest the rotations above.
2. Founder authorizes archive/backup/release disposition; perform only the specifically authorized local action.
3. Reconcile a final secret scan after those files or credentials change.
4. Correct and target-verify the reproducibility/gate defects listed above; update this report from actual results.
5. Founder reviews the corrected package and explicitly authorizes exact candidate paths for staging/commit/push.
6. Run CI on the resulting exact SHA and review all checks against that SHA.
7. Seek separate authorization for any hosted migration, hosted/deployed verification, legal rollout, or real supplier/customer communication.

Local readiness does not imply deployment authorization.

## Phase F — Surgical artifact disposition decision package and candidate review (Workstreams 3 & 4)

### Reconciled inventory counts

All 67 scanner findings identified in the redacted Gitleaks scan evidence reconcile exactly across repository tracking and physical file state. No finding was omitted, suppressed, or modified:
- **Tracked findings (23):** 20 intentional test fixtures, 1 historical verification document, 2 immutable seed migrations.
- **Ignored local environment / stack findings (17):** 13 local/project `.env` items, 4 disposable local-stack items.
- **Generated / release-bundle findings (14):** 12 web client release/preview bundle findings across 6 files, 2 compiled service test bundle findings across 2 files. Total: 14 findings across 8 distinct files.
- **Archive / backup findings (13):** 6 ONDC operator scratch/secret findings across 2 files, 6 legacy documentation finding copies across 4 files, 1 archived duplicate verification finding, 1 production SQL backup finding. Total: 13 findings across 8 distinct files.

### Explicit statement of artifact non-mutation

**NO ARTIFACT WAS DELETED, MOVED, REWRITTEN, ENCRYPTED IN PLACE, STAGED, COMMITTED, OR MUTATED BY THIS PHASE.** All 16 physical files identified in the generated/release and archive/backup findings remain at their exact disk locations with unchanged byte counts and verified cryptographic hashes. Staging remains empty.

### Detailed per-item disposition decision package

#### 1. Generated and release-bundle artifacts (14 findings across 8 files)

| Finding ID | Repository-relative path | Line(s) | Scanner rule | Git status | Size (bytes) | Sensitive content | Dev / reproducibility / audit necessity | Proposed disposition | Required approval / evidence |
|---|---|---|---|---|---|---|---|---|---|
| `F-014` | `apps/web/dist_prev/assets/index-DpIFK4Zp.js` | 1 | `jwt` | Untracked, ignored | 1,952,170 | Embedded Supabase anon JWT | None for dev/candidate build; historical rollback preview only | Secure local deletion, or move encrypted copy to cold storage outside worktree | Founder approval to purge historical preview build directory |
| `F-015` | `apps/web/dist_prev/assets/index-DpIFK4Zp.js` | 292 | `jwt` | Untracked, ignored | 1,952,170 | Embedded Supabase anon JWT duplicate | None | Secure local deletion (same as `F-014`) | Same as `F-014` |
| `F-016` | `apps/web/releases/release_20260919_111830/assets/index-ungrgPZo.js` | 1 | `jwt` | Untracked, ignored | 1,928,733 | Embedded legacy Supabase anon JWT | Historical release bundle; not required for candidate build or CI | Retain in external encrypted archive if required for audit; delete local worktree copy | Founder confirmation whether external release archive exists |
| `F-017` | `apps/web/releases/release_20260919_111830/assets/index-ungrgPZo.js` | 294 | `jwt` | Untracked, ignored | 1,928,733 | Embedded legacy JWT duplicate | None | Same as `F-016` | Same as `F-016` |
| `F-018` | `apps/web/releases/release_20260919_131430/assets/index-Bdsgcn3M.js` | 1 | `jwt` | Untracked, ignored | 1,927,560 | Embedded legacy Supabase anon JWT | Historical release bundle | Same as `F-016` | Same as `F-016` |
| `F-019` | `apps/web/releases/release_20260919_131430/assets/index-Bdsgcn3M.js` | 292 | `jwt` | Untracked, ignored | 1,927,560 | Embedded legacy JWT duplicate | None | Same as `F-016` | Same as `F-016` |
| `F-020` | `apps/web/releases/release_20260919_142139/assets/index-V-vGvkOu.js` | 1 | `jwt` | Untracked, ignored | 1,927,812 | Embedded legacy Supabase anon JWT | Historical release bundle | Same as `F-016` | Same as `F-016` |
| `F-021` | `apps/web/releases/release_20260919_142139/assets/index-V-vGvkOu.js` | 292 | `jwt` | Untracked, ignored | 1,927,812 | Embedded legacy JWT duplicate | None | Same as `F-016` | Same as `F-016` |
| `F-022` | `apps/web/releases/release_20260919_201652/assets/index-BtfYFmsi.js` | 1 | `jwt` | Untracked, ignored | 1,951,340 | Embedded legacy Supabase anon JWT | Historical release bundle | Same as `F-016` | Same as `F-016` |
| `F-023` | `apps/web/releases/release_20260919_201652/assets/index-BtfYFmsi.js` | 292 | `jwt` | Untracked, ignored | 1,951,340 | Embedded legacy JWT duplicate | None | Same as `F-016` | Same as `F-016` |
| `F-024` | `apps/web/releases/release_20260919_223142/assets/index-DpIFK4Zp.js` | 1 | `jwt` | Untracked, ignored | 1,952,170 | Embedded legacy Supabase anon JWT | Historical release bundle | Same as `F-016` | Same as `F-016` |
| `F-025` | `apps/web/releases/release_20260919_223142/assets/index-DpIFK4Zp.js` | 292 | `jwt` | Untracked, ignored | 1,952,170 | Embedded legacy JWT duplicate | None | Same as `F-016` | Same as `F-016` |
| `F-044` | `packages/services/dist/services/financial-control-5c6.test.js` | 101 | `generic-api-key` | Untracked, ignored | 43,550 | Nonfunctional test mock fixture (duplicated from TS source) | Ephemeral build artifact; cleanly regenerated by `pnpm build` | Delete via standard workspace build clean (`pnpm clean` / purge `dist/`) | Founder approval to clean ignored workspace build cache |
| `F-045` | `packages/services/dist/services/phase6-group5-communications-milestones-disputes.test.js` | 388 | `generic-api-key` | Untracked, ignored | 29,280 | Nonfunctional test mock fixture (duplicated from TS source) | Ephemeral build artifact; cleanly regenerated by `pnpm build` | Delete via standard workspace build clean (same as `F-044`) | Same as `F-044` |

#### 2. Archive and backup artifacts (13 findings across 8 files)

| Finding ID | Repository-relative path | Line(s) | Scanner rule | Git status | Size (bytes) | Sensitive content | Dev / reproducibility / audit necessity | Proposed disposition | Required approval / evidence |
|---|---|---|---|---|---|---|---|---|---|
| `F-029` | `archive/OTP Golden Reconstruction/Taxonomy/OTP-TAXONOMY-03A-READONLY-VERIFICATION.md` | 292 | `generic-api-key` | Untracked, ignored | 26,103 | Historical verification API token string | Duplicate audit copy; root file is tracked in Git | Secure deletion of redundant ignored copy, or restrict offline; verify credential inactive | Founder approval for duplicate removal; service owner verification of token status |
| `F-030` | `archive/scratch/ondc-08a-operator/generate.ts` | 47 | `generic-api-key` | Untracked, ignored | 2,670 | Key generation parameters; adjacent to private keys | None for runtime/candidate | Move to secure offline key management archive or delete after key rotation confirmation | ONDC key custodian confirmation of active registry keys |
| `F-031` | `archive/scratch/ondc-08a-operator/operator-secrets.json` | 4 | `generic-api-key` | Untracked, ignored | 596 | ONDC signing private material (CRITICAL) | None for candidate/CI | Immediate quarantine; rotate in ONDC registry, then securely delete from disk or move to HSM/vault | ONDC key custodian rotation confirmation & founder deletion approval |
| `F-032` | `archive/scratch/ondc-08a-operator/operator-secrets.json` | 5 | `private-key` | Untracked, ignored | 596 | PEM private key block (CRITICAL) | None for candidate/CI | Same as `F-031` | Same as `F-031` |
| `F-033` | `archive/scratch/ondc-08a-operator/operator-secrets.json` | 6 | `generic-api-key` | Untracked, ignored | 596 | ONDC encryption private material (CRITICAL) | None for candidate/CI | Same as `F-031` | Same as `F-031` |
| `F-034` | `archive/scratch/ondc-08a-operator/operator-secrets.json` | 9 | `generic-api-key` | Untracked, ignored | 596 | ONDC pre-production encryption private key (CRITICAL) | None for candidate/CI | Same as `F-031` | Same as `F-031` |
| `F-035` | `backups/legacy_docs/CONFIGURATION-COMPLETE-SUMMARY.md` | 49 | `generic-api-key` | Untracked, ignored | 14,956 | Hardcoded demo reset secret | Historical documentation | Redact secret in place (placeholder), or vault offline; rotate active `DEMO_RESET_SECRET` | Service owner rotation confirmation & founder approval for doc redaction/purge |
| `F-036` | `backups/legacy_docs/MANUAL-SUPABASE-CONFIG.md` | 311 | `generic-api-key` | Untracked, ignored | 11,639 | Demo reset secret copy | Historical documentation | Same as `F-035` | Same as `F-035` |
| `F-037` | `backups/legacy_docs/MANUAL-SUPABASE-CONFIG.md` | 371 | `generic-api-key` | Untracked, ignored | 11,639 | Demo reset secret copy | Historical documentation | Same as `F-035` | Same as `F-035` |
| `F-038` | `backups/legacy_docs/MESSAGING-META-WHATSAPP-SETUP.md` | 131 | `generic-api-key` | Untracked, ignored | 16,802 | Meta WhatsApp app secret (CRITICAL) | Historical documentation | Redact secret in place; rotate Meta app secret in Meta Business dashboard | Meta administrator rotation confirmation & founder approval for doc redaction |
| `F-039` | `backups/legacy_docs/README-QUICK-START.md` | 15 | `generic-api-key` | Untracked, ignored | 3,452 | Demo reset secret copy | Historical documentation | Same as `F-035` | Same as `F-035` |
| `F-040` | `backups/legacy_docs/README-QUICK-START.md` | 37 | `generic-api-key` | Untracked, ignored | 3,452 | Demo reset secret copy | Historical documentation | Same as `F-035` | Same as `F-035` |
| `F-041` | `backups/otp_prod_backup_20260919_223132.sql` | 32122 | `generic-api-key` | Untracked, ignored | 2,677,788 | Production database record secret (CRITICAL / UNRESOLVED subtype) | Disaster recovery backup; not needed in dev worktree | Retain strictly in encrypted, access-controlled offline backup storage; remove unencrypted worktree copy | Founder and legal/data protection officer approval for offline archival and worktree removal |

### Unresolved classifications

1. **`F-041` (`backups/otp_prod_backup_20260919_223132.sql:32122`):** Marked `UNRESOLVED (safely treated as critical sensitive data)`. Inspecting line 32122 cannot be performed safely in this context without risking dumping production database dump records or exposing actual customer/user attributes. The item is classified as critical production database material requiring quarantine and offline encrypted storage.
2. **Potentially live status of unrotated credentials (`F-001`–`F-013`, `F-031`–`F-041`):** Liveness is marked `UNRESOLVED (treated as potentially active)`. No credential was tested against live endpoints to avoid side-effects and lockouts.

### Candidate review package (No commit)

- **Exact baseline SHA:** `519d424dbc35e14a7bc7a79af739fb1a69bc1367` (`HEAD` and `origin/main` ahead/behind `0/0`).
- **Tracked diff summary:** 45 modified files, 7 deleted files, 0 staged files.
  - Modifies core regression runners, contracts, type mappings, demo seed safety, test fixtures, documentation.
- **Untracked artifact summary (10 files):**
  - `docs/13-truth/PILOT_RECERTIFICATION_EVIDENCE_2026-10-25.md` (`7801a4d8fff3a8b1c7a09b4ef0a2c3d13b14ad6c`)
  - `docs/13-truth/SECURITY_RELEASE_CLOSURE_2026-10-25.md` (this report)
  - `eslint.config.mjs` (`738b83ca254c22b55b1eb392b813f53b538c359b`)
  - `scripts/regression-results.ts` (`2b00ef92c879548876ac3f11e20f6f91ba76f3b6`)
  - `scripts/regression-rpc-scope.ts` (`b680cd0b60d97b30f67611b8ea96758ce5607514`)
  - `scripts/regression-target.ts` (`e2bbcb10ad6546ff45538a2081f7742ad212fadb`)
  - `supabase/migrations/00328_admin_test_runner_canonical_status_enum.sql` (`0a006e3c429f4312ae014eb6203c2383c544f44c`)
  - `tests/security/no-pilot-quorum-00325-database.test.ts` (`f992f0dc3cb9a43b7c677fb6537da22d4b28aabe`)
  - `tests/unit/regression-results.test.ts` (`363a26f93c69e526ae00bbe2b7cfdf2d5f017eeb`)
  - `tests/unit/regression-rpc-scope.test.ts` (`19ff81e37a6d6b9cb5b1118ede2c51d8ac82264f`)
- **Preserved deletions:** All 7 pre-existing Vitest evidence deletions confirmed untouched and match baseline blob hashes (`bd6b7959...`, `f32cccd6...`, `ea92e7e0...`, `5f401c9d...`, `949cda85...`, `706a249c...`, `8d5e19c9...`).
- **Empty index verification:** Confirmed empty (`git diff --cached` exit 0, no staged paths).
- **Targeted checks run in this phase:**
  - Read-only git baseline inspection (`git rev-parse`, `git status`, `git ls-files -d`): PASS.
  - Blob and object hash verification of untracked and deleted files: PASS.
  - Cryptographic verification (SHA-256) of protected local artifacts (`.env`, `.env.otp.production.local`, `apps/web/.env`, `operator-secrets.json`, `otp_prod_backup_20260919_223132.sql`, commercial videos): PASS, all match baseline fingerprints.
  - `git diff --check`: PASS (exit code 0, no whitespace or merge marker defects).
- **Reused functional evidence:**
  - Master regression (5,843/5,843), executable database RPCs (12/12), live flows (25/25), accessibility (6/6), authenticated journeys (12/12). Reused because no functional or code inputs changed during this review.
- **Unresolved credential and artifact risks:**
  - Liveness/rotation confirmations for service-role, access token, ONDC private keys, GCP keys, Meta secrets, and WAHA keys remain pending with owners.
  - Ignored sensitive artifacts remain on disk awaiting founder-approved disposition.
  - Working tree remains dirty; no immutable commit SHA exists yet.
- **Readiness score before and after:**
  - **Before:** NOT READY FOR PILOT CERTIFICATION.
  - **After:** NOT READY FOR PILOT CERTIFICATION.
  - **Rubric justification:** Evidence completeness is improved by full surgical inventory and disposition planning, but Gate 6 remains FAIL until founder-approved disposition and verified owner rotations occur; Gate 7 remains BLOCKED until an immutable commit SHA is authorized and CI runs against it. No gates transitioned to PASS.

### Exact-SHA CI authorization boundary

1. Founder reviews this candidate review package and explicitly authorizes staging the approved remediation file set.
2. Staged diff is verified against the approved candidate set prior to commit.
3. Commit is created on `main`, generating an exact, immutable candidate SHA.
4. CI workflow is triggered specifically on that exact SHA.
5. All CI jobs are evaluated honestly; no skips or missing tests are masked.
6. Push, deployment, and hosted verification remain strictly unauthorized until separate explicit authorization is granted.

