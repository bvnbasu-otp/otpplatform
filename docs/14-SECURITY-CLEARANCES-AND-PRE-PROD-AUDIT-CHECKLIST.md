# 14. Pre-Production Security Clearance & Go-Live Audit Checklist

**Document Reference:** `SEC-AUDIT-OTP-2026-V2`  
**Classification:** RESTRICTED — INTERNAL COMPLIANCE & GOVERNANCE  
**Target Systems:** Open Trade & Procurement (OTP) Platform Core Services, Database Layer, Messaging Adapters & Network Gateways  
**Certified Baseline:** Series-6 Production Security Baseline  
**Auditor Role:** Lead Information Security & Compliance Auditor  
**Framework Alignment:** 
- ISO/IEC 27001:2022 (A.8.20 Network Security, A.8.24 Use of Cryptography, A.8.28 Secure Coding)
- SOC 2 Type II (Trust Services Criteria: Security, Confidentiality, Processing Integrity)
- NIST SP 800-53 Rev. 5 (AC - Access Control, SC - System and Communications Protection, AU - Audit and Accountability)
- OWASP Application Security Verification Standard (ASVS) v4.0.3 Level 2
- ONDC / Beckn Transaction Protocol Security & Signing Guidelines
- Digital Personal Data Protection (DPDP) Act 2023 / GDPR

---

## 1. Vulnerability & Penetration Testing (VAPT) & Application Hardening

### Control 1.1: Static Application Security Testing (SAST) & Software Composition Analysis (SCA)
- **Verification Description:** Scan 100% of custom application source code (frontend React/Vite, backend TypeScript Edge Functions, PostgreSQL PL/pgSQL routines) and third-party dependencies for known vulnerabilities, CVEs, insecure dependencies, and license compliance.
- **Pass/Fail Criteria:**
  - **Pass:** Zero (0) Critical or High severity CVEs in `node_modules` or Docker container bases; zero unresolved SAST security findings (CWE-89 SQLi, CWE-79 XSS, CWE-94 Code Injection).
  - **Fail:** Any unmitigated Critical or High severity vulnerability in the dependency tree or custom codebase.
- **Required Evidence / Artifacts:**
  1. `pnpm audit --audit-level=high` clean terminal output.
  2. Container image vulnerability scan for `otp-prod-db`, `otp-prod-auth`, `otp-prod-rest`, `otp_whatsapp_gateway`.
  3. Clean workspace typecheck across all 4 packages (`pnpm typecheck`).

### Control 1.2: Dynamic Application Security Testing (DAST) & Gray-Box Penetration Testing
- **Verification Description:** Conduct automated dynamic scans and manual authenticated/unauthenticated penetration testing against staging endpoints matching production configuration.
- **Pass/Fail Criteria:**
  - **Pass:** Zero High or Medium exploitable vulnerabilities identified across dynamic assessment endpoints; complete mitigation of OWASP Top 10 web vulnerabilities.
  - **Fail:** Any successful exploitation leading to remote code execution, session hijacking, unauthenticated resource access, or privilege escalation.

### Control 1.3: Elimination of Developer Endpoints, Debug Handlers & Administrative Backdoors
- **Verification Description:** Ensure all debug routes, interactive SQL consoles, mock endpoints, demo reset scripts, and diagnostic inspection APIs are either entirely stripped from the production build or strictly gated behind verified platform superadmin roles.
- **Pass/Fail Criteria:**
  - **Pass:** 
    - Public requests to `/admin/sql`, `admin_execute_raw_sql`, `/api/debug/*`, `/admin/run-diagnostic` reject unauthenticated or non-admin callers with HTTP 401 Unauthorized or HTTP 403 Forbidden.
    - Frontend build flag `VITE_DEMO_MODE=false` strips persona switchers and test account seed helpers.
    - Database procedure `admin_purge_all_transactional_records` throws a fatal `SAFETY VIOLATION` unless explicitly supplied with cryptographic override token.
  - **Fail:** Any public endpoint or UI view exposing database internals, test tokens, or arbitrary SQL execution capabilities without SuperAdmin authentication.

### Control 1.4: Protection Against Broken Object Level Authorization (BOLA / IDOR)
- **Verification Description:** Validate that every request referencing an entity ID (RFQ UUID, Quote UUID, Organization UUID, Document Attachment ID, Contract Agreement ID, Work Order ID) is strictly bounded by tenant ownership and Row-Level Security (RLS).
- **Pass/Fail Criteria:**
  - **Pass:** Zero instances where Supplier A can inspect Supplier B’s quotes, or Buyer Org A can access Buyer Org B’s requirements, even when directly requesting the UUID via PostgREST or Edge Functions.
  - **Fail:** Any successful read, update, or deletion of a resource belonging to a different tenant.

---

## 2. Identity, Authentication & Access Control (IAM & RBAC)

### Control 2.1: Multi-Factor Authentication (MFA / 2FA) for Elevated & Administrative Roles
- **Verification Description:** Enforce Time-based One-Time Password (TOTP) or WhatsApp OTP for all accounts possessing `PLATFORM_ADMIN`, `OPS_ADMIN`, or organizational procurement committee voting privileges.
- **Pass/Fail Criteria:**
  - **Pass:** Direct password-only logins for elevated admin accounts are blocked from accessing `/admin/*` or administrative RPCs until a second factor is verified.
  - **Fail:** Platform admin or governance committee accounts able to execute state-changing actions using single-factor credentials alone.

### Control 2.2: Multi-Tenant Role-Based Access Control (RBAC) & Persona Segregation
- **Verification Description:** Verify that tenant side assignments (`BUYER`, `SUPPLIER`, `PLATFORM_ADMIN`) are strictly enforced at the database level and cannot be spoofed by manipulating JWT claims or client-side storage.
- **Pass/Fail Criteria:**
  - **Pass:**
    - `private.profile_side()` returns `NULL` for SuperAdmins (strictly impartial), `'BUYER'` for buyers, and `'SUPPLIER'` for suppliers.
    - Attempts by a Supplier user to call `submit_requirement` or cast a committee vote fail with database exception `P0001: Unauthorized`.
    - Buyer users are prohibited from inserting into `quotes` or altering quotation pricing.
  - **Fail:** Any privilege escalation permitting a user on one side of a procurement transaction to execute capabilities reserved for the other side or platform operations.

### Control 2.3: Centralized Route Guarding, RBAC Verification & Client Cache Sanitization
- **Verification Description:** Verify that client-side SPA routing enforces strict session authentication and role validation (`<ProtectedRoute>`), preserving deep links while instantly purging sensitive diagnostic caches upon unauthorized access attempts.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Unauthenticated requests to internal routes immediately redirect to `/login?redirect=<target>`.
    - Non-admin authenticated users attempting to load `/admin` trigger `clearSensitiveClientState` (purging diagnostic storage keys).
    - Purchase order and contract routes strictly enforce role authorization.
  - **Fail:** Any internal workspace route accessible without valid session tokens or unauthorized roles mounting administrative UI components.

### Control 2.4: Cross-Tenant Row-Level Security (RLS) & Step 11 Contract Gate Integrity
- **Verification Description:** Verify that institutional governance controls (committee voting weights, identity-protected quotation masking, Step 11 contract compilation, and award reveals) strictly protect vendor identity prior to formal contract award.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Active RFQ quotations queryable by buyers prior to award reveal ONLY return anonymized tokens (`Supplier 7X4M`) and zero identifying supplier metadata (no business names, GSTINs, phone numbers, or unscrubbed PDF attachments).
    - Revealed awards become visible only to the winning supplier and authorized buyer committee members; losing suppliers receive an unrevealed outcome notice (`WON`/`NOT_SELECTED`) without competitor price disclosures.
    - Contract agreements are protected by SHA-256 document hashing and bilateral HMAC-SHA256 digital signature validation.
  - **Fail:** Quotation queries or PostgREST endpoints leaking supplier identity or competitor unit pricing during the open quoting or evaluation stages.

---

## 3. Data Privacy, Encryption & Key Management

### Control 3.1: Encryption in Transit & TLS Hardening
- **Verification Description:** Inspect Transport Layer Security configuration across all ingress controllers, reverse proxies, and API gateways.
- **Pass/Fail Criteria:**
  - **Pass:**
    - TLS 1.2 minimum enforced; TLS 1.3 preferred. Deprecated protocols explicitly disabled.
    - HTTP Strict Transport Security (HSTS) enabled with `max-age=31536000; includeSubDomains; preload`.
    - Insecure HTTP traffic automatically redirected to HTTPS (HTTP 301).
  - **Fail:** Acceptance of plaintext HTTP connections, weak cipher suites, or SSL Labs grade lower than **A**.

### Control 3.2: Encryption at Rest & Database Volume Protection
- **Verification Description:** Verify that all persistent database volumes, automated backups, file attachments, and secrets are encrypted at rest.
- **Pass/Fail Criteria:**
  - **Pass:**
    - PostgreSQL storage volumes encrypted using AES-256.
    - Database dump files encrypted using PBKDF2 (100k rounds) + AES-256-CBC before archiving.
  - **Fail:** Unencrypted disk storage volumes or unencrypted database snapshots.

### Control 3.3: Hardware Device Teardown & Metadata Sanitization
- **Verification Description:** Verify that browser camera and microphone streams are completely stopped upon unmount, and that uploaded media/PDFs have EXIF GPS coordinates and author metadata scrubbed.
- **Pass/Fail Criteria:**
  - **Pass:**
    - All media stream tracks invoke `track.stop()` upon component unmount.
    - Uploaded images have EXIF GPS coordinates and device serials scrubbed before storage.
    - Uploaded PDFs have author names and company metadata stripped.
  - **Fail:** Active camera/microphone streams left running in the background; raw EXIF GPS coordinates present in stored assets.

---

## 4. Pre-Production Security Clearance Sign-Off Matrix

| Domain Ref | Operational Security Domain | Responsible Lead | Target Standard | Current Audit Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Vulnerability & Penetration Testing (VAPT) | AppSec Engineer | Zero High/Critical Findings | 🟢 **PASSED** |
| **SEC-02** | Identity, Authentication & RBAC Isolation | IAM & Backend Lead | Zero Cross-Tenant Leakage | 🟢 **PASSED** |
| **SEC-03** | Data Privacy, Encryption & Secret Mgmt | Security Architect | TLS 1.2+, AES-256, 0 Leaked Secrets | 🟢 **PASSED** |
| **SEC-04** | Network Perimeter, WAF & Protocol Compliance | DevOps / Infra Lead | Ports Hardened, Rate Limits Active | 🟢 **PASSED** |
| **SEC-05** | Immutable Audit Logging & Telemetry Alerting | Compliance Officer | Tamper-Proof Logs, Real-Time Alerts | 🟢 **PASSED** |
| **SEC-06** | Disaster Recovery, Backup & Incident Response | Operations Lead | RTO $< 15$m, RPO $< 1$h, Drills Verified | 🟢 **PASSED** |
| **SEC-07** | Automated Regression & Staging Gate | QA Lead | 1,514+ Verifications Passed (100% Green) | 🟢 **PASSED** |

---

## 5. Executive Sign-Off & Production Authorization

### Clearance Decision
- [x] **FULL CLEARANCE GRANTED**: The system meets all mandatory security thresholds and compliance baselines under the Phase 7.1 architecture. Status: **CERTIFIED — UPGRADE RESILIENT** & **PHASE 7.1 FULLY CERTIFIED — PHASE 8 PILOT READINESS GATE OPEN**.
- [ ] **CONDITIONAL CLEARANCE**: Transition authorized subject to resolution of listed minor exceptions within specified timeframe.
- [ ] **CLEARANCE REJECTED**: Critical vulnerabilities or compliance deficiencies remain unmitigated. Production deployment blocked.
