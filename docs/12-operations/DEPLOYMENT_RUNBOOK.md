# Deployment runbook

Do not treat this page as permission to deploy. Git commit, git push, and hosted `supabase db push` are manually performed by the user. This reconstruction did not deploy.

## Facts

| Path | What it does | Status |
| --- | --- | --- |
| Person commits and pushes `main` | Git operation. Not an app feature. User-owned. | Human-operated |
| `.github/workflows/ci-cd.yml` production job | `supabase link`, `supabase db push --linked` against project ref `qsuvtcezffomtwzwyrso`, `supabase functions deploy location-pin-coverage`, then a step that only prints “DEPLOYING DIRECTLY TO PRODUCTION” | Push and function deploy are in the file. Web deploy step is not a deploy. A run was not observed. |
| `vercel.json` | How Vercel should build if Vercel builds the repo | Config `IMPLEMENTED`. DEPLOYED REVISION NOT RE-VERIFIED. Database target `UNKNOWN` (`VITE_SUPABASE_URL` is not in the repo). |
| `pnpm deploy:prod` → `scripts/deploy-prod.ps1` | `docker exec` against container `otp-prod-db`, applies SQL files, default site URL `https://otpplatform-theta.vercel.app` | DEFECT-02 labelled LOCAL DOCKER ONLY. Runtime behavior unchanged. Not the hosted project. Not run. |
| `pnpm deploy` → `scripts/deploy.ps1` | Local pipeline script with Production/Staging/Demo parameters. Production container name in that script is also `otp-prod-db`. | Not run. |

## Order a person should assume until a run is observed

1. Confirm the git SHA a person intends to ship.
2. CI on `main`, when the production job runs, pushes migrations to hosted project ref `qsuvtcezffomtwzwyrso`. `deploy-prod.ps1` writes Docker container `otp-prod-db` and is labelled LOCAL DOCKER ONLY (DEFECT-02). Do not run the script as the hosted migration. The user owns the hosted `supabase db push`. Local files include `00246`. Hosted apply of `00246` is a separate manual step and was not done.
3. Confirm how the SPA is published. The Actions file does not publish it.
4. Do not claim the public URL matches the SHA until the deployment record says so.

## Forbidden from this documentation task

Supabase CLI, `db push`, auth changes, hosted writes, and deploys were not performed and are not a step in “updating the docs”.
