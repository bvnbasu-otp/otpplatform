# 10. Deployment, Production Operations & Vercel Edge Hosting

## 1. Production Deployment Architecture

The OTP Platform is deployed with a decoupled architecture utilizing containerized backend services, an atomic blue-green deployment pipeline, and Vercel Global Edge CDN for the web application:

- **Canonical Repository Path**: `G:\My Drive\otp`
- **Frontend Edge CDN**: Vercel (`https://otpplatform-theta.vercel.app`)
- **Container Engine**: Docker Desktop with Docker Compose v2
- **Orchestration File**: [`docker-compose.prod.yml`](file:///G:/My%20Drive/otp/docker-compose.prod.yml)
- **Public URL**: `https://otpplatform-theta.vercel.app`
- **Internal Web Server**: Vite 6 PWA listening on `0.0.0.0:3000` (serving `apps/web/dist`)
- **Staging / Pre-Production Gateway**: Port `54321` (Kong) / Port `54322` (Staging Postgres)
- **Production Database**: Port `5432` (`otp-prod-db`, Supabase Postgres 15 with 183 migrations)

### 1.1 Sole Authoritative Production Codebase Policy
- **Primary Canonical Workspace**: `G:\My Drive\otp`
- **Exclusivity Requirement**: All platform operations, builds, container bind mounts, test batteries, and maintenance scripts run exclusively from `G:\My Drive\otp`.
- **Prohibition of Alternate Paths / Junctions**: Creating secondary aliases, drive mappings, or directory junctions (such as `C:\otp`) is strictly prohibited to prevent path drift, conflicting workspace states, and symlink recursion.

---

## 2. Zero-Data-Loss & Production Data Retention Mandate

> [!IMPORTANT]
> **Permanent Retention Guarantee**: Whenever any changes, bug fixes, enhancements, security patches, new features, or daily/weekly maintenance are deployed, the **Production Database, Buyer/Supplier Orders, and User/Organization details are permanently retained**.

To guarantee data preservation across all operational cycles, Migrations `00125` and `00177` established hardware-grade database locks:

1. **Environment Classification & Destructive Operation Locking (`public.platform_environment_settings`)**:
   - `otp-prod-db` is permanently tagged with `environment = 'PRODUCTION'`, `is_production = true`, and `lock_destructive_ops = true`.
   - The database configuration enforces `app.environment = 'production'` at the PostgreSQL GUC level.
2. **Hard Safety Lock on Destructive Purge RPC**:
   - The stored procedure `admin_purge_all_transactional_records(p_confirmation_token text)` unconditionally halts execution on any database where `is_production = true` or `current_setting('app.environment') = 'production'`.
   - Execution is strictly blocked with `SQLSTATE P0001 (SAFETY VIOLATION)` unless the caller provides the explicit, unambiguous token:
     `PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN`.
   - Even when executed with the override token, core profiles, organizations, and platform administrative roles are preserved.
3. **Automated Production Integrity Assertion (`assert_production_data_integrity`)**:
   - A dedicated verification RPC audits production health before and after deployments.
   - Verifies supplier directory integrity (at least 15 verified domain suppliers).
   - Verifies buyer/seller order retention, wallet balance records, and organization integrity.
   - Asserts SuperAdmin purity: confirms that platform administrators (`bvnbasu@gmail.com`, `admin@otp.test`) hold 0 buyer/supplier organization memberships.

---

## 3. Staging Pre-Flight Verification Gate (`pnpm gate:verify`)

> [!CAUTION]
> **Strict Promotion Gate**: Under no circumstances is code promoted to production without passing the Staging Verification Gate. If any test case fails in developer, tester, pre-prod, staging, or demo environments, **the production website continues running on the old code flow uninterrupted**.

Before any production deployment or maintenance action, the full verification battery is executed via:
```powershell
Set-Location "G:\My Drive\otp"
pnpm gate:verify
```

### Staging Gate Verification Battery:
1. **POLICY**: Canonical Procurement Vocabulary Scanner (`bid`, `bidder`, `bidding`, `blind` = 0 violations).
2. **DOMAIN**: Business logic, GST validation, VMI scorecards, Approval Matrix, Contract Gate, Wallets & Rewards (`@otp/domain` - 297 tests).
3. **SERVICES**: Discovery engines, communications queue, and external network adapters (`@otp/services` - 331 tests).
4. **DATABASE**: Entity mappers, ledger persistence, and data serialization (`@otp/database` - 1 test).
5. **WEB**: React components, multimodal intake, device capabilities, and state machine tests (`@otp/web` - 726 tests).
6. **INTEGRATION**: Live PostgREST RLS security, role separation, and cryptographic hashing.
7. **DEMO_E2E**: End-to-end multi-role buyer/seller walkthrough scenarios.
8. **POSTGRES**: Database engine security benchmarks and RPC assertions.
9. **SMOKE**: Live operational checks against running microservices and auth container.
10. **LIVE_FLOWS**: Real-time end-to-end multi-actor procurement simulations.
11. **BUILD**: Clean production TypeScript compilation (`pnpm typecheck`) and asset packaging.

**Staging Gate Certificate**:
When all tests pass (100% green across 1,355 Vitest tests), the runner generates a digitally signed JSON certificate at:
`G:\My Drive\otp\backups\staging-gate-cert.json`
The production deployment pipeline validates this certificate timestamp before proceeding.

---

## 4. Gated Atomic Blue-Green Deployment Pipeline (`scripts/deploy-prod.ps1`)

The production deployment pipeline (`scripts/deploy-prod.ps1`) orchestrates an atomic release cycle designed to guarantee zero downtime and immediate rollback capability:

```powershell
# Standard deployment (runs staging gate, snapshot, migrations, staged build, atomic swap, smoke test)
.\scripts\deploy-prod.ps1

# Dry-run validation (validates all stages without modifying live files or database)
.\scripts\deploy-prod.ps1 -DryRun

# Force deployment (bypasses staging gate only in documented emergencies)
.\scripts\deploy-prod.ps1 -SkipGate
```

### Key Safety Guarantees:
- **Mandatory Pre-Deployment Physical Snapshot**: PostgreSQL binary dump created in `backups/` before any SQL is executed.
- **Tracked Incremental Migrations**: Schema migrations are tracked in `public.otp_schema_migrations` (183 migrations). Only unapplied migrations are executed. Destructive `DROP TABLE` or `TRUNCATE` operations are strictly rejected.
- **Isolated Staging Directory**: The new web build compiles into a timestamped directory (`apps/web/releases/release_<timestamp>`), preventing partial or corrupted builds from touching the live site.
- **Atomic Release Promotion**: The live `apps/web/dist` is swapped in milliseconds. The previous working build is kept as `apps/web/dist_prev`.
- **Automated Post-Deployment Smoke & Auto-Rollback**: If post-deployment smoke tests fail, `dist` is immediately replaced with `dist_prev`, returning users to the last known working release.

---

## 5. Docker Compose Stack (`docker-compose.prod.yml`)

The consolidated production Docker Compose stack manages 6 microservices:

```yaml
version: '3.8'

services:
  db:
    container_name: otp-prod-db
    image: supabase/postgres:15.1.1.130
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - ./supabase/volumes/db/data:/var/lib/postgresql/data
    restart: unless-stopped

  auth:
    container_name: otp-prod-auth
    image: supabase/gotrue:v2.158.1
    environment:
      GOTRUE_SMTP_HOST: smtp.gmail.com
      GOTRUE_SMTP_PORT: 587
      GOTRUE_SMTP_USER: bvnbasu@gmail.com
    restart: unless-stopped

  rest:
    container_name: otp-prod-rest
    image: postgrest/postgrest:v12.2.0
    restart: unless-stopped

  realtime:
    container_name: otp-prod-realtime
    image: supabase/realtime:v2.30.23
    restart: unless-stopped

  kong:
    container_name: otp-prod-gateway
    image: kong:2.8.1
    ports:
      - "0.0.0.0:8000:8000"
    restart: unless-stopped

  whatsapp:
    container_name: otp_whatsapp_gateway
    image: otp-waha-paired:latest
    ports:
      - "0.0.0.0:3008:3000"
    restart: unless-stopped
```

---

## 6. Vercel Global Edge CDN Deployment

The frontend web application is hosted on Vercel's global edge network:
- **Production URL**: `https://otpplatform-theta.vercel.app`
- **GitHub Repository**: `bvnbasu-otp/otpplatform` (`main` branch)
- **Framework Preset**: Vite / React 19
- **Build Command**: `pnpm --filter @otp/web build`
- **Output Directory**: `apps/web/dist`
- **Automatic SSL/TLS**: Managed automatically by Vercel with zero-configuration global HTTPS.
- **Continuous Deployment**: Every push to `main` triggers a live atomic build and deployment on Vercel.
