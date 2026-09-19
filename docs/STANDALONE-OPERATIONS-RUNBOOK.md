# OTP Platform — Master Operations Runbook & Automation Guide

This document is the **sole authoritative operational runbook** for maintaining, testing, deploying, backing up, and troubleshooting the OTP Platform **standalone without requiring AI assistants (Antigravity, Claude, or Cursor)**.

---

## 1. The Unified Operations Command: `.\scripts\otp.ps1`

A single, self-contained PowerShell master CLI is located at:
```powershell
Set-Location "G:\My Drive\otp"
.\scripts\otp.ps1 <command>
```

### Quick Command Reference:

| Command | Action | When to Use |
|---|---|---|
| `.\scripts\otp.ps1 start` | Boots all Docker containers (with strict `127.0.0.1` loopback bindings), runs DB migrations (187 migrations), and launches local web preview on port 3000. | After PC reboot or host restart. |
| `.\scripts\otp.ps1 status` | Diagnostic check: displays container states, loopback port listeners (3000, 3008, 5432, 8000, 54321), DB integrity lock, and live URL response. | Anytime to verify system health. |
| `.\scripts\otp.ps1 test` | Runs web unit test suite + live un-mocked smoke test battery. | Fast verification after local code edits. |
| `.\scripts\otp.ps1 gate` | Executes the strict **12-Layer Staging Verification Gate** (1,514+ automated verifications, 100% green required). | Pre-flight check before production promotion. |
| `.\scripts\otp.ps1 deploy` | **Full Production Deployment Pipeline**: Dispatches `STARTING` alert -> Gate (1,514+ verifications) -> DB Backup -> Migrations (185) -> Bundle build -> Live Smoke -> `COMPLETED` alert. | When deploying changes to production live. |
| `.\scripts\otp.ps1 rollback` | **Instant Rollback**: Swaps active `apps/web/dist` with `apps/web/dist_prev`, restarts web server, and dispatches emergency `ROLLBACK` email & WhatsApp alerts. | If production encounters an unexpected issue. |
| `.\scripts\otp.ps1 backup` | Dumps production database (`otp-prod-db`) to `backups/` and prunes backups older than 30 days. | Before manual DB maintenance or on-demand snapshot. |
| `.\scripts\otp.ps1 alert` | Dispatches test email (Gmail SMTP) and WhatsApp (WAHA) alerts to verify communication channels. | To test admin notification delivery. |
| `.\scripts\otp.ps1 stop` | Safely stops containers and background server processes without data loss. | Clean shutdown before host maintenance. |

---

## 2. Standard Operating Procedures (Playbooks)

### Playbook A: After Every Code, Feature, or Migration Change

Whenever you modify any frontend code (`apps/web/src`), backend functions, or write a new SQL migration in `supabase/migrations/`:

```powershell
# Step 1: Open PowerShell as Administrator and navigate to the canonical root
Set-Location "G:\My Drive\otp"

# Step 2: Run the full gated deployment pipeline
.\scripts\otp.ps1 deploy
```

#### What `.\scripts\otp.ps1 deploy` does automatically:
1. **Dispatches Start Alert**: Sends an automated email and WhatsApp message to Baskar (`bvnbasu@gmail.com` and `919972967530@c.us`) that maintenance/deployment has started.
2. **Executes Staging Gate**: Runs all 1,514+ verifications across 184 active test files (`pnpm gate:verify`). **If even 1 test fails, the process halts immediately and production is left untouched on the old code flow.**
3. **Creates Zero-Loss Backup**: Dumps the production PostgreSQL database to `backups/otp_prod_backup_<timestamp>.sql`.
4. **Applies Migrations**: Scans `supabase/migrations/*.sql` against `public.otp_schema_migrations` and `supabase_migrations.schema_migrations` (migrations `00001` through `00187`) and applies only new incremental migrations via `pnpm db:migrate:deploy`.
5. **Asserts Data Integrity**: Verifies that Buyer/Supplier orders, wallets, organizations, and user accounts are 100% retained.
6. **Compiles Web Bundle**: Builds the latest React bundle into `apps/web/dist`, keeping `apps/web/dist_prev` for instant rollback.
7. **Verifies Live Smoke**: Executes real, un-mocked call flows (Kong, SuperAdmin login, Buyer login, Supplier login, WAHA WhatsApp gateway, password reset OTP).
8. **Auto-Rollback Guard**: If any smoke check fails, it immediately restores `apps/web/dist_prev` and dispatches an emergency `ROLLBACK` alert.
9. **Dispatches Completion Alert**: Sends a final success email and WhatsApp notification with the live tunnel endpoint.

---

### Playbook B: After System Reboot / Computer Restart

When your Windows host restarts:

```powershell
# Step 1: Open PowerShell as Administrator
Set-Location "G:\My Drive\otp"

# Step 2: Start all platform services
.\scripts\otp.ps1 start

# Step 3: Verify system status
.\scripts\otp.ps1 status
```

#### Expected Status Output:
- **Port 3000**: `[ONLINE] Web App (Vite / Preview)`
- **Port 3008**: `[ONLINE] WAHA WhatsApp Gateway`
- **Port 5432**: `[ONLINE] Production PostgreSQL (otp-prod-db)`
- **Port 8000**: `[ONLINE] Production Kong API Gateway`
- **Port 54321**: `[ONLINE] Staging Kong Gateway`
- **Port 54322**: `[ONLINE] Staging PostgreSQL (supabase_db_otp-local)`
- **Integrity Lock**: `HEALTHY (Zero Data Loss Verified)`
- **Live Tunnel**: `[HTTP 200 OK]`

---

### Playbook C: Quick Development & Fast Verification

When actively coding and testing locally:

```powershell
Set-Location "G:\My Drive\otp"

# 1. Run unit tests only (fast)
pnpm test:unit

# 2. Run live smoke battery
pnpm test:smoke

# 3. Or run both together via the CLI:
.\scripts\otp.ps1 test
```

---

### Playbook D: Emergency Manual Rollback

If an unexpected behavior is observed in production after a release:

```powershell
Set-Location "G:\My Drive\otp"

# Execute instant rollback to previous verified release
.\scripts\otp.ps1 rollback
```

---

### Playbook E: Production Database Backup & Health Inspection

```powershell
Set-Location "G:\My Drive\otp"

# 1. Create a binary database snapshot on demand
.\scripts\otp.ps1 backup

# 2. Inspect active database metrics and order counts
.\scripts\otp.ps1 status
```

---

## 3. Underlying Standalone Scripts Matrix

| Purpose | Script / Command | Description |
|---|---|---|
| **Staging Gate** | `pnpm gate:verify` | Executes 1,514+ verifications across all platform layers and issues certificate. |
| **Unit Tests** | `pnpm test:domain; pnpm test:services; pnpm test:database; pnpm test:web` | Runs all workspace package Vitest test suites. |
| **Edge Functions Tests** | `pnpm test:functions` | Runs Deno unit tests for Edge Functions (`_shared/`, `payment-webhook/`). |
| **Typecheck** | `pnpm typecheck` | Strict zero-error TypeScript typecheck across monorepo packages. |
| **Vocabulary Check** | `pnpm test:vocab` | Scans for zero prohibited procurement terms (`bid`, `bids`, `bidder`, `blind`). |
| **Live Smoke** | `pnpm test:smoke` | Runs un-mocked checks against live running containers. |
| **Full Deploy** | `.\scripts\deploy-prod.ps1` | Production deployment script with Staging Gate, backup, build, and auto-rollback. |
| **Fast Update** | `.\scripts\update-live.ps1` | Fast server refresh, backup, migration sync, bundle rebuild, and live smoke test. |
| **DB Backup** | `.\scripts\backup-prod-db.ps1` | Timestamped dump of `otp-prod-db` to `backups/`. |
| **Alerts** | `.\scripts\send-maintenance-alert.ps1 -Stage <STARTING|COMPLETED|ROLLBACK>` | Dispatches dual-channel Gmail SMTP and WAHA WhatsApp alerts. |
| **Platform Boot** | `.\scripts\start-platform.ps1` | Standalone platform orchestrator for containers and web app. |
| **Shutdown** | `.\scripts\stop-platform.ps1` | Graceful shutdown of Docker containers and background processes. |

---

## 4. Key Platform Ports & Credentials Cheat Sheet

> [!NOTE]
> **Strict Loopback Policy**: All production internal ports are strictly bound to `127.0.0.1` (loopback only) to eliminate network interface exposure.

- **Public Web App (Vercel Edge)**: `https://otpplatform-theta.vercel.app`
- **Git Repository**: `https://github.com/bvnbasu-otp/otpplatform.git`
- **Local Web App**: `http://localhost:3000` (Vite PWA)
- **Kong Production Gateway**: `http://127.0.0.1:8000` (Port `8000`, strictly loopback)
- **GoTrue Production Auth Engine**: `http://127.0.0.1:9999` (Port `9999`, strictly loopback)
- **WAHA WhatsApp Gateway**: `http://127.0.0.1:3008` (Port `3008`, strictly loopback)
- **Production PostgreSQL**: `127.0.0.1:5432` (`otp-prod-db`, strictly loopback) | Password: `SuperSecretProdPostgresPassword2026!`
- **Kong Staging Gateway**: `http://localhost:54321` (Port `54321`)
- **Staging PostgreSQL**: `127.0.0.1:54322` (`supabase_db_otp-local`) | Password: `postgres`
- **SuperAdmin Accounts**:
  - `bvnbasu@gmail.com` / `Admin@OTP2026!`
  - `admin@otp.test` / `password`

---

## 5. Core Procurement Lifecycle Architecture (8 States & 15 Steps)

The OTP platform user interface, dashboard filters, Kanban consoles, and detail views map the 15-step linear monotonic engine into **8 Core Procurement Lifecycle States**:

| # | Core State | 15-Step Linear Coverage | Description & Key Activities | Canonical Route |
|---|---|---|---|---|
| 1 | `DRAFT` | Step 1 | Multimodal Requirement Intake (Voice/Text/Doc/Photo) & Specification authoring | `/requirements/:id` |
| 2 | `QUOTING` | Steps 2–5 | RFQ Publication, PAN-India Supplier Discovery, Market Intelligence & Anonymous Quoting | `/requirements/:id/discover` |
| 3 | `EVALUATING` | Steps 6–9 | Identity-Protected Comparison Matrix, VMI Badges & Committee Quorum Voting | `/rfq/:id/evaluation`, `/rfq/:id/committee` |
| 4 | `AWARDED` | Steps 10–12 | Multi-Signature Decision Lock, Step 11 Contract Gate & Step 12 Mutual Identity Reveal | `/rfq/:id/contract`, `/rfq/:id/reveal` |
| 5 | `PO_ISSUED` | Step 13 | Purchase Order Acceptance, 0–100% Milestones & Delivery Inspection | `/purchase-orders/:id` |
| 6 | `INVOICED` | Step 14 | 5-Point Milestone Inspection Signoff, Commercial GST Tax Invoice Review | `/purchase-orders/:id?stage=invoiced` |
| 7 | `SETTLED` | Step 15 | Double-Entry Reconciliation, 0.50% Fee, 0.10% Wallet Reward, 1–5 Star Rating & Closeout | `/purchase-orders/:id?stage=settled` |
| 8 | `STALLED` | Exceptions | Diagnostic exception overlay (>24h inactivity) with 1-click unblock action | Interactive drawer on all pages + Dashboard filter |

### Bi-directional Stepper & Stage Navigator
Mounted across all stage detail views via `<ProcurementStageNavigator />` ([`apps/web/src/features/lifecycle/components/ProcurementStageNavigator.tsx`](file:///G:/My%20Drive/otp/apps/web/src/features/lifecycle/components/ProcurementStageNavigator.tsx)). Allows seamless, non-destructive navigation back-and-forth between completed stages without losing order context.
