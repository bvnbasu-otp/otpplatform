# Vercel

Status of the config: `IMPLEMENTED` in `vercel.json`. DEPLOYED REVISION NOT RE-VERIFIED. No `.vercel` project file is in the repo, and no Vercel deployment API was read. `vercel.json` does not name a database. The SPA uses `VITE_SUPABASE_URL` from the Vercel project environment. That value is not in the repository, so the Vercel production database target is `UNKNOWN`.

## Build

| Key | Value |
| --- | --- |
| Framework | `vite` |
| Install | `pnpm install` |
| Build | `pnpm --filter @otp/web build` |
| Output | `apps/web/dist` |
| Rewrites | All paths to `/index.html` |

## Headers

`vercel.json` sets nosniff, frame deny, XSS protection, referrer policy, HSTS, a permissions policy (camera off, microphone self, geolocation off, payment self), and a content security policy. The CSP names Supabase, Sentry, Razorpay, Stripe, and ONDC hosts. See [INTEGRATION_CATALOG.md](../09-integrations/INTEGRATION_CATALOG.md).

## How a release reaches Vercel

Not proven from this repository. GitHub Actions does not publish the bundle (comment in `ci-cd.yml`, and the production deploy step only logs). A Vercel Git integration may exist outside the repo. Do not document it as fact.

The URL `https://otpplatform-theta.vercel.app` is the default in `scripts/deploy-prod.ps1` and is named in the README. Naming the URL is not a deployment record.
