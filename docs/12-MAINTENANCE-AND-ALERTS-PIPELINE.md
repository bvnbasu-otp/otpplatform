# 12. Maintenance, Updates & Real-Time Alert Pipeline

## 1. Zero-Data-Loss Production Maintenance Standard

> [!IMPORTANT]
> **Production Preservation Invariant**: Whenever any routine weekly/daily maintenance, patch application, bug fix, or feature enhancement is performed, the **Production Database, Buyer & Supplier Orders, and User/Organization profiles must be unconditionally preserved**.

To prevent accidental data truncation or data loss during maintenance:
1. **Hardware-Grade Safety Lock**: `public.platform_environment_settings` tags the production database with `lock_destructive_ops = true`. Destructive SQL statements (`TRUNCATE`, `DROP TABLE`, or unconditional `DELETE`) are strictly forbidden.
2. **Purge RPC Guard**: `admin_purge_all_transactional_records(p_confirmation_token text)` rejects any call on production without the explicit token `PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN`.
3. **Migration Ledger Tracking (`public.otp_schema_migrations`)**: All migrations (currently `00001` through `00138`) are tracked in an immutable ledger. Maintenance scripts only apply unapplied migrations incrementally, ensuring zero risk of re-running destructive scripts.
4. **Automated Integrity Assertion**: Stored procedure `public.assert_production_data_integrity()` verifies supplier counts, order retention, and SuperAdmin role purity before and after maintenance cycles.
5. **Strict Host Port Hardening**: Production microservices (`otp-prod-auth` on 9999, `otp_whatsapp_gateway` on 3008, `otp-prod-gateway` on 8000, and `otp-prod-db` on 5432) must be strictly bound to loopback `127.0.0.1` to prevent external exposure during container restarts.

---

## 2. Maintenance Pipeline (`scripts/update-live.ps1`)

All routine updates, server refreshes, and maintenance routines follow [`scripts/update-live.ps1`](file:///G:/My%20Drive/otp/scripts/update-live.ps1):

### Pipeline Execution Workflow:
1. **Pre-Maintenance Alert**: Sends real-time notification (Email + WhatsApp) that maintenance is commencing.
2. **Mandatory Pre-Maintenance Snapshot**: Automatically calls [`scripts/backup-prod-db.ps1`](file:///G:/My%20Drive/otp/scripts/backup-prod-db.ps1), generating a timestamped pg_dump physical backup in `backups/`.
3. **Pre-Maintenance Data Integrity Assertion**: Invokes `assert_production_data_integrity()` to verify production baseline.
4. **Incremental Migration Sync**: Checks `public.otp_schema_migrations` and applies only new, unapplied SQL migrations.
5. **Frontend Bundle Compilation**: Compiles web bundle via `pnpm --filter @otp/web build` (targeting `es2022`).
6. **Container Port Hardening Check**: Verifies that all production container ports remain bound strictly to `127.0.0.1`.
7. **PostgREST Schema Cache Reload**: Dispatches `NOTIFY pgrst, 'reload schema'` to update API routing in memory without downtime.
8. **Post-Maintenance Smoke Battery**: Runs `scripts/test-live-smoke.ts` verifying all 11 operational call flows (including SuperAdmin login, Buyer login, Supplier login, Supplier Contact login `contact26@otpdemo.test`, WAHA WhatsApp gateway, and database password reset RPC).
9. **Post-Maintenance Alert**: Sends completion alert with status, duration, and migration count.

```powershell
Set-Location "G:\My Drive\otp"
.\scripts\update-live.ps1
```

---

## 3. Automated Dual Pre- and Post-Maintenance Alerts

To ensure complete administrative transparency, [`scripts/send-maintenance-alert.ps1`](file:///G:/My%20Drive/otp/scripts/send-maintenance-alert.ps1) dispatches real-time notifications over two independent channels:

### 3.1 Channel 1: Transactional Email via Gmail SMTP
- **Sender**: `bvnbasu@gmail.com` (TLS port 587)
- **Recipient**: `bvnbasu@gmail.com`
- **Subject**: `[OTP PLATFORM] Maintenance Alert: STARTING` and `COMPLETED`
- **Content**: Detailed operational parameters, applied migration counts, container health status, and live URL.

### 3.2 Channel 2: Real-Time WhatsApp Message via WAHA
- **Gateway**: WAHA Headless WhatsApp Engine (`http://127.0.0.1:3008`)
- **Recipient**: Baskar Loganathan (`+91 99729 67530`)
- **Message Format**:
  ```
  🛡️ [OTP PLATFORM] Maintenance COMPLETED
  Workspace: G:\My Drive\otp
  URL: https://otpplatform-theta.vercel.app
  Migrations: 156 Synced
  Containers: 6 Healthy (127.0.0.1 Hardened)
  Data Integrity: VERIFIED (Orders & Users Retained)
  Status: All Systems Operational
  ```

---

## 4. Production Rollback Protocol

If a post-maintenance smoke test fails or an unexpected regression occurs:
1. **Automatic Frontend Rollback**: The deployment script automatically reverts `apps/web/dist` from the pre-deployment `apps/web/dist_prev` snapshot in under 1 second.
2. **Database Rollback**: If a schema migration fails, the transaction is rolled back. If manual recovery is needed, restore from the mandatory pre-maintenance dump in `G:\My Drive\otp\backups\`:
   ```powershell
   docker exec -i otp-prod-db psql -U postgres -d postgres < "backups/otp_prod_backup_<timestamp>.sql"
   ```
3. **Emergency Alert Dispatch**: A high-priority emergency alert is immediately dispatched via Email and WhatsApp indicating the rollback and cause.

---

## 5. Runbook & Disaster Recovery Verification Drill

To execute a periodic verification of the operational runbook, disaster recovery procedures, and security baseline:

```powershell
Set-Location "G:\My Drive\otp"

# Step 1: Verify Port Invariant (Zero 0.0.0.0 Exposure)
$ports = docker ps --filter "name=otp-prod" --format "{{.Names}}: {{.Ports}}"
Write-Host $ports
# Verify: All entries show 127.0.0.1:<port>

# Step 2: Test Database Backup Creation
.\scripts\backup-prod-db.ps1
# Verify: Timestamped dump generated in backups/ and older backups pruned

# Step 3: Test Point-in-Time Recovery Drill (on isolated test database)
# Verify Recovery Time Objective (RTO < 15 minutes)

# Step 4: Run Dependency Audit
pnpm audit
# Verify: "No known vulnerabilities found"

# Step 5: Full Staging Gate Promotion Check
pnpm gate:verify
# Verify: 852/852 tests pass (100% green) across all 12 platform layers
```
