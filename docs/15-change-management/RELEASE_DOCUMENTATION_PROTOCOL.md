# Release documentation protocol

Documentation is a release artifact in the same change round as the code it describes. This file is the lifecycle. It does not authorise an agent to commit, push, or deploy.

## Lifecycle

Discover → Fix → Test → Migrate → Verify → Document → Public Truth → Commit → Push → Deploy → Runtime Verify → Release Certificate

| Step | Who | What “done” means |
| --- | --- | --- |
| Discover | Whoever is changing the product | The behaviour is read from code, SQL, or config. Unknowns stay `UNKNOWN`. |
| Fix | The task that is allowed to edit code | Phase 3 remediated SECURITY-01 in source, DEFECT-01 and DEFECT-03 in local SQL `00246`, and labelled DEFECT-02. Hosted apply and redeploy were not done. |
| Test | The person or agent that task names | Record the exact files and counts. Do not cite a suite that was not run. |
| Migrate | The user, for hosted databases | Local migration files can be written only when a task allows code changes. Hosted `supabase db push` is manual. |
| Verify | The same change round | Compare the change with tests and with the migration files. Hosted verify needs a read the operator performs. |
| Document | The same change round | Update the canonical tree, starting with [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) if a status changes. |
| Public Truth | The same change round | Update [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md) so customer-facing claims match the status table. |
| Commit | The user | `git commit` is manually performed by the user. Agents must not commit unless a future task explicitly says so. |
| Push | The user | `git push` is manually performed by the user. Agents must not push unless a future task explicitly says so. |
| Deploy | The user | Hosted `supabase db push` and any production deploy are manually performed by the user. Agents must not authenticate or apply hosted migrations, and must not deploy unless a future task explicitly says so. |
| Runtime Verify | After deploy, by someone who can read the running system | Hosted migration list, deployed SHA, and a live call if the change depends on one. Until that read exists, write HOSTED DATABASE CEILING NOT RE-VERIFIED and DEPLOYED REVISION NOT RE-VERIFIED. |
| Release Certificate | After runtime verify | A note that names the SHA, the hosted migration ceiling actually read, the deployment id, and the tests that passed. This phase does not issue that certificate. |

## Twelve reconciliation points

Every release round checks these. A gap is written as `UNKNOWN` or left open. It is not filled with a guess.

1. Code — the functions and files that implement the change.
2. Tests — the tests actually executed, with counts.
3. Migrations — local files, and which `CREATE OR REPLACE` is latest.
4. Hosted database — a read of the hosted project, or an explicit statement that it was not re-verified.
5. Git — branch, SHA, and that commit/push were or were not done.
6. Deployment — which path runs (CI project `qsuvtcezffomtwzwyrso`, Vercel, or Docker `otp-prod-db`). `deploy-prod.ps1` is labelled LOCAL DOCKER ONLY. Its runtime target is still Docker.
7. Runtime evidence — a call, a log, or `UNKNOWN`.
8. Internal docs — the canonical page for that domain.
9. CAPABILITY_STATUS — the single status authority. No second status file.
10. Public truth — [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md) and, when a task allows source edits, the website copy.
11. Roadmap and limitations — [LIVE_VS_PLANNED.md](../13-truth/LIVE_VS_PLANNED.md) and [KNOWN_LIMITATIONS.md](../13-truth/KNOWN_LIMITATIONS.md).
12. Release evidence — the certificate inputs above. Absence of a Vercel revision or a hosted migration read is stated, not assumed.

## This phase

Phase 2 updated documentation only. Commits 0. Pushes 0. Deploys 0. Hosted writes 0. Application files changed 0.
