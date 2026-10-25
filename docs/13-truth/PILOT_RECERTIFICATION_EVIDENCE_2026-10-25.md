# OTP pilot recertification evidence — 25 October 2026

## Verdict

**NOT READY FOR PILOT CERTIFICATION.** All authorized local functional, database, browser, static, generated-artifact, and master regression gates now pass. Certification remains blocked by unresolved secret-material disposition/rotation, no CI run for the dirty candidate, and the intentionally unauthorized hosted/deployed gate.

## Repository and evidence identity

- Repository: G:\My Drive\otp
- Branch: main, tracking origin/main
- Baseline HEAD and origin/main: 519d424dbc35e14a7bc7a79af739fb1a69bc1367
- The starting worktree was already dirty. Seven deleted Vitest evidence files were present and remain untouched. Staging was empty and remains unchanged.
- The final worktree is uncommitted, so there is no immutable final SHA.
- Final tracked-diff Git object fingerprint excluding this self-referential report: `3634445eae6069d71d01aea06e62a5de682e86df`. Untracked remediation artifacts are not represented by the baseline SHA.
- The latest CI run checked was [run 40109506328](https://github.com/bvnbasu-otp/otpplatform/actions/runs/40109506328), a push on SHA 519d424dbc35e14a7bc7a79af739fb1a69bc1367 with conclusion success. Its deploy job was skipped, and it did not include this session’s working-tree changes. A successful Vercel commit status on that SHA is historical; the current public deployment was not independently verified.

## Changes made in this session

- Replaced the no-op lint script with ESLint scoped to the regression and disposable database safety code; added a flat config and CI lint step.
- Made the regression runner fail closed on missing/skipped/unavailable results and per-suite hangs, and added result-accounting regression tests.
- Added positive disposable-target identity checks, complete local PostgREST readiness, and canonical isolated seed loading before mandatory RPC tests.
- Added forward migration `00328` for the stale administrative enum probe without relying on a historical rewrite.
- Repaired the below-quorum test fixture so registered-supplier discovery executes while award remains blocked.
- Reclassified the 13 deliberately `BLOCKED/NOT_VERIFIED` historical RPC probes to named mandatory replacement suites; the 12 genuinely executable database RPCs remain fail-closed and pass.
- Repaired live-flow quote finalization and authoritative committee appointments; the live battery now passes 25/25.
- Replaced the public-page lifecycle check with authenticated buyer/committee/reveal/PO journeys across desktop Chrome, mobile Chrome, and mobile WebKit.
- Removed tracked JWT/service-role fallbacks from runtime scripts and the location-coverage edge function. The demo seed now preserves an existing `is_demo` marker instead of attempting a forbidden false-to-true update.
- Generated database types twice from the disposable replay and proved identical SHA-256 output.
- Reconciled current-source documentation with the `00328` ceiling. Historical reports remain historical.
- Preserved pre-existing changes and deletions. No tests were weakened.

## Ten certification gates

1. **Implementation and requirement traceability — PASS (local).** Fail-closed accounting tests cover pass, fail, skip, missing report, unavailable endpoint, and empty execution. The historical 25-case RPC catalog is explicitly partitioned into 12 executable database checks and 13 non-executable labels mapped to mandatory unit/service/integration/live/browser evidence; no blocked probe is relabelled as passed.

2. **Automated tests — PASS (local).** Final master regression: **5,843 passed, 0 failed, 0 skipped, 0 blocked, 0 not-run**. Included web **2,350/2,350**, integration/security **1,474/1,474**, RPC **12/12**, smoke **13/13**, live flows **25/25**, and build. Regression accounting focused tests passed **28/28**.

3. **Static validation, typecheck, build, and generated artifacts — PASS.** Scoped ESLint passed, all four workspaces typechecked, strict source policy passed with **614 active test files**, migration inventory passed, master build passed, and two generations from database port 59002 produced an identical SHA-256 file hash.

4. **Migrations, fresh replay, and database security — PASS (disposable local).** Disposable project `otp-disposable-c25c1025` used API `127.0.0.1:59001`, database `127.0.0.1:59002`, and Docker project/workdir labels matching the isolated temporary workdir. Replay stages were **76 + 1 + 237 + 14**, ledger **328**, ceiling `00328`; migration-00077 empty-table preconditions were proven. Legal defaults were `enforcement_enabled=false`, `rollout_at IS NULL`. Focused security passed 26/26 and the full integration/security gate passed 1,474/1,474. Teardown left zero matching containers and volumes.

5. **User journeys and accessibility — PASS (isolated local).** Scrollbar/keyboard/mobile-overflow checks passed **6/6**. Authenticated sourcing journeys passed **12/12** across desktop Chrome, Pixel 5 Chrome, and iPhone 12 WebKit: buyer intake, sealed comparison with contact non-leakage, authoritative committee room, irreversible reveal receipt, and generated PO. Non-delivering local transports were used.

6. **Diff review, secrets, and preservation — FAIL.** Formatting and added-line checks pass, staging remains empty, and all seven pre-existing evidence deletions remain untouched. Gitleaks 8.30.1 scanned about **194 MB** with redaction and found **67** items: 23 tracked findings are 20 deliberate test fixtures, one historical verification document, and two immutable historical seed migrations; 44 ignored/untracked findings are 17 local environment items, 14 generated/release bundles, and 13 archive/backup items. One archived private-key finding and local/backup credential material require founder disposition and rotation. Two commercial videos over 10 MB were excluded by the documented scanner size limit. Tracked runtime fallback JWTs/service-role material were removed.

7. **CI tied to exact revision — BLOCKED.** The latest discoverable CI is [run 40109506328](https://github.com/bvnbasu-otp/otpplatform/actions/runs/40109506328), successful on baseline SHA `519d424dbc35e14a7bc7a79af739fb1a69bc1367`. It does not contain this dirty candidate.

8. **Documentation and reproducibility — PASS (local).** Current-source docs identify baseline SHA versus dirty-tree evidence, current `00328` ceiling, measured 15-minute suite timeout, local-only results, historical reports, no-waiver behavior, and legal defaults.

9. **Hosted/deployed verification — BLOCKED — NOT AUTHORIZED.** No deployment, hosted mutation, live recipient contact, or hosted verification was performed.

10. **Release boundary and evidence integrity — BLOCKED.** No commit, push, merge, rebase, tag, deploy, staging change, existing-database mutation, or external delivery occurred. The candidate is not an immutable revision and therefore cannot have exact-revision CI evidence.

## Commands and environments

- `pnpm lint` — PASS.
- Focused Vitest accounting/safety — PASS, 28/28.
- Focused disposable database/security — PASS, 26/26.
- `pnpm typecheck` — PASS, four workspace packages.
- `pnpm test:policy` — PASS, 614 active test files.
- `pnpm db:migrate:check` — PASS, contiguous 00001–00328.
- Generated database types — PASS, repeat generation from the disposable DB was byte-identical.
- Full master regression with 900,000 ms per-suite ceiling — PASS: 5,843/5,843, no skips/blocks/not-run.
- Disposable Supabase: `otp-disposable-c25c1025`, loopback API 59001, database 59002. WAHA/site probes were pinned to local port 9; no real recipient was contacted. Final teardown: zero containers/volumes.
- Playwright accessibility — PASS, 6/6. Authenticated sourcing lifecycle — PASS, 12/12.
- Gitleaks 8.30.1 broad redacted scan — FAIL, 67 classified findings; two >10 MB commercial videos excluded.

## Exact remaining actions

1. Rotate/revoke the exposed service-role credential removed from tracked edge source and any credential represented in archived backup/private-key findings; confirm rotation without publishing values.
2. Decide whether the ignored archive/backups and generated release bundles should be securely deleted, encrypted, or retained under an approved evidence policy; keep them out of a release candidate.
3. Review the dirty diff, separate pre-existing user work from this remediation, create an authorized immutable candidate revision, and run CI on that exact SHA.
4. Review exact-SHA CI and the redacted secret-scan disposition before changing the verdict.
5. Authorize hosted/deployed verification separately if desired; only then consider legal rollout, supplier contact, migrations, or deployment.

**Founder action:** Keep pilot certification and deployment on hold. Rotate the identified credential material, disposition the ignored archive/backups, then authorize a reviewed commit and exact-SHA CI cycle. Do not enable legal rollout, contact suppliers, apply hosted migrations, or deploy this dirty tree.
