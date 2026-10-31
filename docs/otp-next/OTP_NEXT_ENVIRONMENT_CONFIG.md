# OTP Next — Environment Configuration Guide

**Document Version:** 2.0.0  
**Target Environments:** Local Development, CI/CD Disposable Sandbox, Staging, Production (Vercel + Supabase)

---

## 1. Environment Classification & Safety Guardrails

The OTP platform enforces strict environment boundary validation via `@otp/domain/deployment-target` and the Vite build plugin `production-public-env-guard`:

1. **Local Development (`local`):**
   - Targets local Supabase container (`http://127.0.0.1:54321` or disposable port `58320+`).
   - `VITE_DEMO_MODE=true` allows full interactive inspection without production credentials.
2. **CI Disposable Sandbox (`non-production`):**
   - GitHub Actions executes in an isolated environment with ephemeral Supabase containers.
   - Non-production placeholders (`https://ci-validation.invalid`) prevent accidental leakage.
3. **Production (`production`):**
   - Hosted Supabase project in AWS Mumbai (`ap-south-1`): Project Ref `qsuvtcezffomtwzwyrso`.
   - Vercel Production deployment: Requires valid HTTPS Supabase API URL and public anon key.
   - **Production Guard:** A production bundle strictly refuses to build if `VITE_SUPABASE_URL` points to `localhost` or `127.0.0.1`.

---

## 2. Environment Variable Matrix

### A. Web Application (`apps/web/.env`)

| Variable Name | Required In | Purpose | Production Authority |
| :--- | :---: | :--- | :--- |
| `VITE_SUPABASE_URL` | All | Supabase API URL (PostgREST + Auth + Realtime) | `https://qsuvtcezffomtwzwyrso.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | All | Public anonymous client JWT key | Vercel Environment Variables |
| `VITE_OTP_DEPLOYMENT_TARGET` | Prod / CI | Deployment target classification (`production` / `non-production`) | `production` |
| `VITE_DEMO_MODE` | Optional | Toggles demo bypass for unauthenticated reviewers | `false` in Production |
| `VITE_SENTRY_DSN` | Optional | Sentry error monitoring DSN | Production Error Tracking |

### B. Database & CI/CD Pipeline (`.github/workflows/ci-cd.yml`)

| Variable Name | Scope | Purpose |
| :--- | :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets | CLI token for deploying migrations and Edge Functions |
| `SUPABASE_PROJECT_REF` | GitHub Secrets / Env | Hosted Supabase project ID (`qsuvtcezffomtwzwyrso`) |
| `SUPABASE_DB_PASSWORD` | GitHub Secrets | Database owner password for direct pooler connections |
| `DATABASE_URL` | GitHub Secrets | Direct PostgreSQL connection string for migration push |
| `DIRECT_URL` | GitHub Secrets | Unpooled direct connection for DDL migrations |

---

## 3. Production Configuration Secrets Checklist

Ensure the following secrets are configured in:
1. **GitHub Repository Secrets (`Settings -> Secrets and variables -> Actions`):**
   - `SUPABASE_ACCESS_TOKEN`: Valid personal access token from Supabase account.
   - `SUPABASE_PROJECT_REF`: `qsuvtcezffomtwzwyrso`.
   - `SUPABASE_DB_PASSWORD`: Production PostgreSQL password.
   - `DATABASE_URL`: Session mode connection pooler string.
   - `DIRECT_URL`: Direct port 5432 string.

2. **Vercel Project Environment Variables (`Settings -> Environment Variables`):**
   - `VITE_SUPABASE_URL`: `https://qsuvtcezffomtwzwyrso.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - `VITE_OTP_DEPLOYMENT_TARGET`: `production`
   - `VITE_DEMO_MODE`: `false`

---

## 4. Supabase Project Reference Details

- **Project Ref:** `qsuvtcezffomtwzwyrso`
- **Region:** `ap-south-1` (AWS Mumbai)
- **Database Engine:** PostgreSQL 15.x
- **Active Schema Migrations:** `00001` through `00331` (100% contiguous)
- **Public API Host:** `https://qsuvtcezffomtwzwyrso.supabase.co`
- **Supported Personas in Auth:** `INDIVIDUAL`, `RWA`, `MSME`, `SUPPLIER`
