# Release runbook

A release is a person’s git commit and git push, plus whatever hosting actually builds that SHA. Agents do not commit, push, or run hosted `supabase db push` unless a future task explicitly says so. This page does not invent a release train.

## Before a person commits and pushes `main`

1. Read [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) and [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md).
2. Follow [RELEASE_DOCUMENTATION_PROTOCOL.md](../15-change-management/RELEASE_DOCUMENTATION_PROTOCOL.md).
3. `pnpm test:vocab` and `pnpm db:migrate:check` are the checks CI runs before tests. They were not run for the documentation edit.
4. CI on `main` can `supabase db push` to project `qsuvtcezffomtwzwyrso`. The workflow file has no path filter. Pushing docs-only commits can still trigger that job if Actions runs.
5. `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY. That is DEFECT-02. Runtime behavior is unchanged. It is not the hosted migration.
6. Web hosting is separate. DEPLOYED REVISION NOT RE-VERIFIED.

## Version identity

There is no release tag requirement in the application version (`0.1.0`). Tags `v*` and `release-*` are workflow triggers. Creating a tag is a human git operation.

## After the user pushes

Record the SHA, the Actions run URL if one exists, the Vercel deployment id if one exists, and the hosted migration list if someone with access reads it. None of those records were produced here. Do not write a release certificate without them.

P0–P4 stay closed. DEFECT-01 and DEFECT-03 are in local SQL `00246` and hosted NOT applied. DEFECT-02 is labelled; the script still writes Docker. SECURITY-01 is remediated in source and the edge function is not redeployed. None of these are LIVE-VERIFIED.
