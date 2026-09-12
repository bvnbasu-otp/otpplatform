# 07. Security, Privacy & Backup/Restore Posture

## 1. Identity Protection & Privacy Engineering

The OTP Platform enforces privacy through automated sanitization pipelines preventing accidental data leakage:

### 1.1 EXIF Metadata Stripping (Photos & Images)
- When suppliers upload project site photos or product catalogs, images are processed before storage.
- **Removed Attributes**:
  - GPS Coordinates (Latitude, Longitude, Altitude)
  - Camera Serial Numbers & Device Models
  - Original Creation Timestamps & Owner Metadata
- Prevents buyers or committee members from deducing vendor geographic location prior to award.

### 1.2 PDF Document Sanitization
- Tender documents and datasheets uploaded to requirements or quotes pass through an automated metadata scrubber.
- **Removed Fields**: Author name, Organization, Creator tool, File title, and Revision history.

### 1.3 Personal Contact & Social Media Redaction
- All messages sent across supplier clarification threads pass through a regex sanitization filter.
- **Patterns Masked**:
  - Indian Mobile Numbers: `+91 [0-9]{10}`, `[6-9][0-9]{9}`
  - Email Addresses: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
  - Social Media Links: Twitter/X handles, LinkedIn profiles, Instagram tags, WhatsApp invite links.

---

## 2. Automated Production Database Backups & AES-256 Encryption

Database backups are managed via the automated PowerShell utility located at [`scripts/backup-prod-db.ps1`](file:///G:/My%20Drive/otp/scripts/backup-prod-db.ps1):

### 2.1 Backup Execution & Encryption Architecture
- Executes a full `pg_dump` against container `otp-prod-db`.
- **AES-256-CBC Encryption**: Derives a 256-bit symmetric key using PBKDF2 (`Rfc2898DeriveBytes`) with **100,000 iterations** and a 16-byte cryptographically secure random salt (`RNGCryptoServiceProvider`).
- Prepends salt (16 bytes) and initialization vector (16 bytes) to the encrypted payload.
- Generates timestamped encrypted SQL archives:
  `G:\My Drive\otp\backups\otp_prod_backup_YYYYMMDD_HHMMSS.sql.enc`
- **SHA-256 Cryptographic Checksum**: Generates an accompanying `.sha256` integrity manifest for tamper verification.
- Average execution time: **4.8 seconds** (approx 1.0 MB dump size).

### 2.2 Retention & Auto-Pruning Policy
- **30-Day Rolling Window**: Backups older than 30 days are automatically detected and pruned to prevent disk exhaustion.
- **Zero-Downtime Guarantee**: Dumps run concurrently without locking tables or interrupting active RFQ quoting windows.

---

## 3. Disaster Recovery & Automated Restoration Engine

Restoration and disaster recovery are automated via [`scripts/restore-prod-db.ps1`](file:///G:/My%20Drive/otp/scripts/restore-prod-db.ps1):

### 3.1 Verification & Restoration Workflow
- **SHA-256 Validation**: Validates the archive against its `.sha256` checksum before attempting decryption.
- **In-Memory Decryption**: Decrypts the AES-256 payload using the provided encryption key without writing unencrypted dumps to persistent disk.
- **Syntax & Header Checks**: Verifies PostgreSQL dump header integrity.
- **Dry-Run Mode (`-VerifyOnly`)**: Verifies archive decryption and schema validity without modifying live database tables.

```powershell
# Verify backup integrity without applying changes
.\scripts\restore-prod-db.ps1 -VerifyOnly

# Restore latest encrypted backup into production container
.\scripts\restore-prod-db.ps1 -Force
```

---

## 4. Platform Security & Immutability Protections

### 4.1 Cryptographic Payment Webhook Verification
- Implemented in `supabase/functions/payment-webhook/index.ts`.
- **Razorpay**: Validates HMAC-SHA256 hex digest against `x-razorpay-signature`.
- **Stripe**: Validates 300-second timestamp freshness window and HMAC-SHA256 signature against `stripe-signature`.
- **Timing Safe Comparison**: Uses constant-time byte comparisons (`timingSafeEqual`) to prevent timing attacks.
- **Idempotent Ledger Settlement**: Stored procedure `record_verified_payment()` enforces uniqueness on `gateway_event_id`.

### 4.2 SuperAdmin Account Immutability
- Migration `00152_immutable_platform_admin_role.sql` establishes schema `private_security` with `admin_whitelist`.
- PostgreSQL trigger `enforce_superadmin_immutability` blocks `DELETE`, privilege revocation (`is_platform_admin = false`), status changes to `BLOCKED`/`SUSPENDED`, or email modifications on whitelisted administrator accounts.

### 4.3 PII-Sanitizing Error Boundary & Telemetry
- Global React Error Boundary (`apps/web/src/components/ErrorBoundary.tsx`) catches unhandled exceptions.
- Telemetry sanitizer (`apps/web/src/lib/telemetry.ts`) redacts email addresses, 10-digit Indian phone numbers, Bearer JWT tokens, and API passwords before passing payloads to loggers or monitoring systems.

### 4.4 Pre-Award Attachment Anti-Leak Sanitization
- `packages/domain/src/enums/attachment.ts` enforces `sanitizeAttachmentFilename()` (`Supplier-XXXX_doc_1.pdf`) and asserts zero metadata leaks (EXIF, author, company, device model) prior to the irrevocable award stage.

### 4.5 Centralized Route Guarding & Client State Sanitization
- Implemented in `apps/web/src/features/auth/ProtectedRoute.tsx`.
- **Session & Role Verification**: Rejects unauthenticated visits to internal workspace views and redirects with preserved destination queries (`/login?redirect=...`).
- **Administrative Diagnostic Cache Purging**: Calls `clearSensitiveClientState` to sanitize `sessionStorage` and `localStorage` of sensitive keys prefixed with `admin_`, `diagnostic_`, `sensitive_`, and `otp_admin_` when an unauthorized navigation occurs.
- **Strict Role-Based Access Control (RBAC)**: Enforces role isolation across public routes, regular workspace routes, and elevated paths (`/admin`, `/purchase-orders`).
