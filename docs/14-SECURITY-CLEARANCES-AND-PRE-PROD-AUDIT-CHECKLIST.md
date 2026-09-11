# 14. Pre-Production Security Clearance & Go-Live Audit Checklist

**Document Reference:** `SEC-AUDIT-OTP-2026-V1`  
**Classification:** RESTRICTED — INTERNAL COMPLIANCE & GOVERNANCE  
**Target Systems:** Open Trade & Procurement (OTP) Platform Core Services, Database Layer, Messaging Adapters & Network Gateways  
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
  2. Snyk / SonarQube / GitHub Dependency Graph signed report showing clean dependency manifest.
  3. Container image vulnerability scan (e.g., `trivy image` or Docker Scout) for `otp-prod-db`, `otp-prod-auth`, `otp-prod-rest`, `otp_whatsapp_gateway`.

### Control 1.2: Dynamic Application Security Testing (DAST) & Gray-Box Penetration Testing
- **Verification Description:** Conduct automated dynamic scans and manual authenticated/unauthenticated penetration testing against staging endpoints matching production configuration.
- **Pass/Fail Criteria:**
  - **Pass:** Zero High or Medium exploitable vulnerabilities identified across dynamic assessment endpoints; complete mitigation of OWASP Top 10 web vulnerabilities.
  - **Fail:** Any successful exploitation leading to remote code execution, session hijacking, unauthenticated resource access, or privilege escalation.
- **Required Evidence / Artifacts:**
  1. OWASP ZAP / Burp Suite Professional automated scan report.
  2. Formal third-party or internal VAPT Executive Summary & Remediation Attestation signed by lead tester.

### Control 1.3: Elimination of Developer Endpoints, Debug Handlers & Administrative Backdoors
- **Verification Description:** Ensure all debug routes, interactive SQL consoles, mock endpoints, demo reset scripts, and diagnostic inspection APIs are either entirely stripped from the production build or strictly gated behind verified platform superadmin roles.
- **Pass/Fail Criteria:**
  - **Pass:** 
    - Public requests to `/admin/sql`, `admin_execute_raw_sql`, `/api/debug/*`, `/admin/run-diagnostic` reject unauthenticated or non-admin callers with HTTP 401 Unauthorized or HTTP 403 Forbidden.
    - Frontend build flag `VITE_DEMO_MODE=false` strips persona switchers and test account seed helpers.
    - Database procedure `admin_purge_all_transactional_records` throws a fatal `SAFETY VIOLATION` unless explicitly supplied with cryptographic override token.
  - **Fail:** Any public endpoint or UI view exposing database internals, test tokens, or arbitrary SQL execution capabilities without SuperAdmin authentication.
- **Required Evidence / Artifacts:**
  1. Production bundle inspection confirming absence of developer-only mock modules.
  2. Automated curl/Postman test suite verifying 403 Forbidden on all administrative RPCs when invoked with anonymous, Buyer, or Supplier JWTs.
  3. Static code analysis report confirming `VITE_DEMO_MODE` evaluates to false in production builds.

### Control 1.4: Protection Against Broken Object Level Authorization (BOLA / IDOR)
- **Verification Description:** Validate that every request referencing an entity ID (RFQ UUID, Quote UUID, Organization UUID, Document Attachment ID, Work Order ID) is strictly bounded by tenant ownership and Row-Level Security (RLS).
- **Pass/Fail Criteria:**
  - **Pass:** Zero instances where Supplier A can inspect Supplier B’s quotes, or Buyer Org A can access Buyer Org B’s requirements, even when directly requesting the UUID via PostgREST or Edge Functions.
  - **Fail:** Any successful read, update, or deletion of a resource belonging to a different tenant.
- **Required Evidence / Artifacts:**
  1. Test execution transcript of `tests/security/award-closeout.test.ts` (18/18 tests passing).
  2. Test execution transcript of `tests/integration/rls-anti-leak.test.ts` validating zero cross-tenant leakage.

---

## 2. Identity, Authentication & Access Control (IAM & RBAC)

### Control 2.1: Multi-Factor Authentication (MFA / 2FA) for Elevated & Administrative Roles
- **Verification Description:** Enforce Time-based One-Time Password (TOTP) or hardware security key MFA for all accounts possessing `PLATFORM_ADMIN`, `OPS_ADMIN`, or organizational procurement committee voting privileges.
- **Pass/Fail Criteria:**
  - **Pass:** Direct password-only logins for elevated admin accounts are blocked from accessing `/admin/*` or administrative RPCs until a second factor (TOTP / WhatsApp OTP) is successfully verified.
  - **Fail:** Platform admin or governance committee accounts able to execute state-changing actions using single-factor credentials alone.
- **Required Evidence / Artifacts:**
  1. GoTrue MFA configuration schema dump (`auth.mfa_factors` and MFA enrollment policies).
  2. Security audit log verifying MFA challenge issuance and step-up authentication during admin console access.

### Control 2.2: Multi-Tenant Role-Based Access Control (RBAC) & Persona Segregation
- **Verification Description:** Verify that tenant side assignments (`BUYER`, `SUPPLIER`, `PLATFORM_ADMIN`) are strictly enforced at the database level and cannot be spoofed by manipulating JWT claims or client-side storage.
- **Pass/Fail Criteria:**
  - **Pass:**
    - `private.profile_side()` returns `NULL` for SuperAdmins (strictly impartial), `'BUYER'` for buyers, and `'SUPPLIER'` for suppliers.
    - Attempts by a Supplier user to call `submit_requirement` or cast a committee vote fail with database exception `P0001: Unauthorized`.
    - Buyer users are prohibited from inserting into `quotes` or altering quotation pricing.
  - **Fail:** Any privilege escalation permitting a user on one side of a procurement transaction to execute capabilities reserved for the other side or platform operations.
- **Required Evidence / Artifacts:**
  1. Automated RBAC test run (`packages/domain` and `tests/security` test suite).
  2. Schema definition for trigger `assert_active_role_held` and function `public.my_role_context()`.

### Control 2.3: Cross-Tenant Row-Level Security (RLS) & Committee Voting Integrity
- **Verification Description:** Verify that institutional governance controls (committee voting weights, identity-protected quotation masking, and award reveals) strictly protect vendor identity prior to formal contract award.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Active RFQ quotations queryable by buyers prior to award reveal ONLY return anonymized tokens (`anon-quote-XXXX`) and zero identifying supplier metadata (no business names, GSTINs, phone numbers, or unscrubbed PDF attachments).
    - Revealed awards become visible only to the winning supplier and authorized buyer committee members; losing suppliers receive an unrevealed outcome notice (`WON`/`NOT_SELECTED`) without competitor price disclosures.
  - **Fail:** Quotation queries or PostgREST endpoints leaking supplier identity or competitor unit pricing during the open quoting or evaluation stages.
- **Required Evidence / Artifacts:**
  1. PostgreSQL catalog query confirming RLS enabled on all 34 public tables (`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`).
  2. DDL audit of views `quotes_identity_protected` and `rfqs_supplier_masked`.

---

## 3. Data Privacy, Encryption & Key Management

### Control 3.1: Encryption in Transit & TLS Hardening
- **Verification Description:** Inspect Transport Layer Security configuration across all ingress controllers, reverse proxies, and API gateways.
- **Pass/Fail Criteria:**
  - **Pass:**
    - TLS 1.2 minimum enforced; TLS 1.3 preferred. Deprecated protocols (TLS 1.0, TLS 1.1, SSLv3) explicitly disabled.
    - Strong cipher suites enabled with Forward Secrecy (ECDHE-RSA-AES128-GCM-SHA256, ECDHE-RSA-AES256-GCM-SHA384).
    - HTTP Strict Transport Security (HSTS) enabled with `max-age=31536000; includeSubDomains; preload`.
    - Insecure HTTP traffic automatically redirected to HTTPS (HTTP 301).
  - **Fail:** Acceptance of plaintext HTTP connections, weak cipher suites, or SSL Labs grade lower than **A**.
- **Required Evidence / Artifacts:**
  1. Qualys SSL Labs report / `testssl.sh` execution log for authoritative production domain.
  2. Reverse proxy configuration (`nginx.conf`, Cloudflare SSL/TLS edge rule, or Kong Gateway ingress config).

### Control 3.2: Encryption at Rest & Database Volume Protection
- **Verification Description:** Verify that all persistent database volumes, automated backups, file attachments (specifications, site photos, invoices), and secrets are encrypted at rest.
- **Pass/Fail Criteria:**
  - **Pass:**
    - PostgreSQL storage volumes encrypted using AES-256 (LUKS or cloud volume KMS encryption).
    - Sensitive columns (financial account numbers, personal mobile numbers, API secrets) encrypted at rest using PostgreSQL `pgcrypto` (`extensions.crypt` or authenticated symmetric encryption).
    - Database dump files (`.sql`) encrypted before archiving or off-site replication.
  - **Fail:** Unencrypted disk storage volumes, unencrypted database snapshots, or plaintext storage of high-risk personal data (PII).
- **Required Evidence / Artifacts:**
  1. Infrastructure configuration verifying encrypted block storage attachment (e.g. AWS EBS encrypted with KMS, GCP Persistent Disk with CMEK, or BitLocker/LUKS status).
  2. Storage bucket encryption policies verifying AES-256 / SSE-S3 / SSE-KMS enforcement.

### Control 3.3: Secret, Token & API Key Lifecycle Management
- **Verification Description:** Audit codebase, repository commit history, client-side application bundles, and environment configurations to verify zero exposure of production credentials.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Zero production secrets (`GOTRUE_JWT_SECRET`, `POSTGRES_PASSWORD`, `SERVICE_ROLE_KEY`, `WAHA_API_KEY`, `GMAIL_APP_PASSWORD`) present in source control, git history, or client-side Vite bundles.
    - Production `.env` files protected with strict POSIX permissions (`600` / read-only by application daemon).
    - Separation of keys: Development/staging keys are cryptographically distinct from production keys.
  - **Fail:** Any hardcoded production secret found in git history or publicly inspectable frontend JavaScript bundles.
- **Required Evidence / Artifacts:**
  1. `git log -p` / `gitleaks detect` scan report verifying zero credential leaks.
  2. Frontend bundle grep verifying `VITE_SUPABASE_ANON_KEY` contains only the public anonymous key and never the `SERVICE_ROLE_KEY`.

### Control 3.4: PII Masking & Document Metadata Sanitization
- **Verification Description:** Verify that personal identifiers, phone numbers, email addresses, and embedded document metadata are stripped or redacted in accordance with identity-protected procurement policies and data privacy regulations.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Uploaded tender photos undergo automated EXIF scrubbing (removal of GPS coordinates, camera serial numbers, device metadata).
    - Uploaded quotation PDF specifications undergo automated metadata scrubbing (removal of author names, company names, revision history).
    - Clarification chat messages sanitize phone numbers and email links prior to delivery.
  - **Fail:** Raw vendor or buyer contact information leaking through image EXIF tags, document properties, or unscrubbed chat streams.
- **Required Evidence / Artifacts:**
  1. Inspection output of test file processed through EXIF stripping pipeline (`exiftool` showing 0 location/camera metadata).
  2. Unit and integration tests for document sanitization pipeline (`packages/services/src/sanitizer`).

---

## 4. Network Perimeter, WAF & Open Protocol Compliance

### Control 4.1: Web Application Firewall (WAF) & DDoS Mitigation
- **Verification Description:** Verify that incoming traffic passes through an enterprise WAF capable of blocking malicious traffic patterns, rate-limiting abusive clients, and mitigating Layer 7 volumetric attacks.
- **Pass/Fail Criteria:**
  - **Pass:**
    - WAF active with Managed Rulesets enabled (OWASP Core Rule Set, Generic SQLi/XSS blocks).
    - Rate-limiting rules configured on sensitive endpoints:
      - Authentication (`/auth/v1/token`, `/auth/v1/otp`): max 5 requests/minute per IP.
      - Quotation submission (`/rest/v1/quotes`): max 30 requests/minute per authenticated user.
      - Public RFQ endpoints: max 60 requests/minute per IP.
    - Cloudflare / AWS Shield / custom ingress proxy DDoS mitigation active.
  - **Fail:** Absence of rate limiting on login/OTP endpoints allowing credential stuffing or brute-force password guessing; origin IP exposed directly to the public internet without reverse proxy protection.
- **Required Evidence / Artifacts:**
  1. Cloudflare WAF / AWS WAF security dashboard configuration export.
  2. Automated rate-limiting benchmark test proving HTTP 429 Too Many Requests response upon exceeding threshold.

### Control 4.2: Open Protocol (ONDC / Beckn) Cryptographic Signing & Network Compliance
- **Verification Description:** When interacting with open commerce networks (ONDC / Beckn), verify that all outgoing transaction requests are digitally signed and incoming callbacks are cryptographically verified against the network registry.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Digital Signatures: Outgoing requests include an `Authorization` header with valid Ed25519 digital signature generated using platform private signing key.
    - Verification: Incoming network callbacks (`on_search`, `on_select`, `on_init`, `on_confirm`) verify the sender's signature against the ONDC Registry public key cache; invalid signatures reject with HTTP 401 Unauthorized.
    - Protocol Key Isolation: ONDC signing keys are stored in a dedicated Hardware Security Module (HSM) or encrypted secrets vault, strictly isolated from standard web server processes.
  - **Fail:** Acceptance of unsigned or invalidly signed network transaction payloads; private protocol keys exposed in application logs or standard disk storage.
- **Required Evidence / Artifacts:**
  1. Cryptographic validation test report verifying rejection of spoofed/tampered Beckn payloads.
  2. Public key registration record from the ONDC / Beckn Network Registry sandbox or staging portal.

### Control 4.3: Port Hardening & Network Isolation
- **Verification Description:** Audit external port exposure to ensure that only designated HTTPS and reverse proxy ports are accessible from public networks, while databases and internal microservices remain strictly bound to private container networks or localhost.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Publicly accessible ports: Strictly `443` (HTTPS) and `80` (redirect to 443).
    - Database port `5432`, internal REST port `3000`, auth engine `9999`, and WhatsApp gateway `3008` bound strictly to `127.0.0.1` or internal Docker bridge network (`otp-network`).
  - **Fail:** Direct public internet exposure of PostgreSQL (`5432`), internal Redis/cache services, or administrative container management daemons.
- **Required Evidence / Artifacts:**
  1. External Nmap port scan of production IP/domain proving closed status for ports 5432, 3000, 9999, 3008, 22.
  2. Production Docker Compose file (`docker-compose.prod.yml`) verifying host bindings are set to `127.0.0.1:<port>` or omitted in favor of internal bridge networking.

---

## 5. Immutable Audit Logging, Telemetry & Incident Response

### Control 5.1: Immutable Audit Trail for Governance & Financial Actions
- **Verification Description:** Ensure all state-changing operational and procurement actions produce an append-only, tamper-evident audit record in `audit_events`.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Capture of all critical event types: `rfq.created`, `rfq.published`, `quote.submitted`, `quote.withdrawn`, `committee.vote_recorded`, `award.decided`, `award.revealed`, `contract.signed`, `admin.user_role_updated`, `admin.supplier_status_toggled`.
    - Immutability: Database RLS policies and table triggers strictly forbid `UPDATE` and `DELETE` statements on `audit_events` for all users, including application service accounts.
    - Audit records include: `event_type`, `actor_id` (authenticated profile UUID), `organization_id`, `entity_type`, `entity_id`, `created_at` (server-enforced `now()`), and detailed `payload`.
  - **Fail:** Capability to modify, backdate, or delete audit event rows; unlogged administrative role changes or RFQ status transitions.
- **Required Evidence / Artifacts:**
  1. SQL definition of `audit_events` showing absence of update/delete permissions:
     `REVOKE UPDATE, DELETE ON audit_events FROM public, authenticated, service_role;`
  2. Automated test verifying database rejection of attempted `DELETE FROM audit_events`.

### Control 5.2: Security Information & Event Management (SIEM) Telemetry
- **Verification Description:** Validate that application logs, authentication anomalies, database errors, and system events are streamed to a centralized, protected monitoring and alerting platform.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Real-time alerting configured for critical security anomalies:
      - 5+ consecutive failed login attempts on an administrative account within 5 minutes.
      - Any invocation of destructive database procedures (e.g. `admin_purge_all_transactional_records`).
      - Rate of HTTP 401/403 errors exceeding 5% of total traffic.
      - Disconnection or fatal error in messaging bridges (WAHA WhatsApp gateway, SMTP).
    - Logs contain zero sensitive plaintext secrets, passwords, or full credit card / bank account numbers.
  - **Fail:** Lack of alerting on suspicious spikes in authorization failures; logging of raw passwords or JWT secrets.
- **Required Evidence / Artifacts:**
  1. Alert configuration rules export (e.g., Datadog, Prometheus/Alertmanager, Grafana, Cloudflare Logpush, or AWS CloudWatch Alarms).
  2. Incident Notification webhook verification test (automated notification delivery to designated Security Operations Slack/WhatsApp channel).

### Control 5.3: Formal Incident Response & Rollback Procedures
- **Verification Description:** Verify that documented, rehearsed Standard Operating Procedures (SOPs) exist for handling security incidents, system breaches, and emergency rollbacks.
- **Pass/Fail Criteria:**
  - **Pass:**
    - Documented Emergency Maintenance Mode Procedure (`admin_set_maintenance_mode(true)`) tested and verified to restrict public traffic while preserving administrative access.
    - Automated point-in-time recovery (PITR) and database restoration procedures documented and verified with an operational test restore completed within $< 15$ minutes.
    - Security contact / vulnerability disclosure policy published and operational.
  - **Fail:** Untested disaster recovery procedures; inability to isolate compromised accounts or place the platform into maintenance mode within $< 2$ minutes.
- **Required Evidence / Artifacts:**
  1. Incident Response Runbook (`docs/STANDALONE-OPERATIONS-RUNBOOK.md` and `docs/12-MAINTENANCE-AND-ALERTS-PIPELINE.md`).
  2. Disaster recovery restoration drill certificate (`backups/staging-gate-cert.json`).

---

## 6. Pre-Production Security Clearance Sign-Off Matrix

The following operational security clearance score represents the formal evaluation conducted prior to issuing production deployment authorization.

| Domain Ref | Operational Security Domain | Responsible Lead | Target Standard | Current Audit Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Vulnerability & Penetration Testing (VAPT) | AppSec Engineer | Zero High/Critical Findings | 🟢 **PASSED** |
| **SEC-02** | Identity, Authentication & RBAC Isolation | IAM & Backend Lead | Zero Cross-Tenant Leakage | 🟢 **PASSED** |
| **SEC-03** | Data Privacy, Encryption & Secret Mgmt | Security Architect | TLS 1.2+, AES-256, 0 Leaked Secrets | 🟢 **PASSED** |
| **SEC-04** | Network Perimeter, WAF & Protocol Compliance | DevOps / Infra Lead | Ports Hardened, WAF/Rate Limits Active | 🟢 **PASSED** |
| **SEC-05** | Immutable Audit Logging & Telemetry Alerting | Compliance Officer | Tamper-Proof Logs, Real-Time Alerts | 🟢 **PASSED** |
| **SEC-06** | Disaster Recovery, Backup & Incident Response | Operations Lead | RTO $< 15$m, RPO $< 1$h, Drills Verified | 🟢 **PASSED** |

---

## 7. Executive Sign-Off & Production Authorization

### Clearance Decision
- [x] **FULL CLEARANCE GRANTED**: The system meets all mandatory security thresholds and compliance baselines. Transition to Live Production Mode is authorized.
- [ ] **CONDITIONAL CLEARANCE**: Transition authorized subject to resolution of listed minor exceptions within specified timeframe.
- [ ] **CLEARANCE REJECTED**: Critical vulnerabilities or compliance deficiencies remain unmitigated. Production deployment blocked.

### Attestation Signatures

```text
Lead Information Security & Compliance Auditor:
Name: ___________________________________     Date: 2026-09-08
Signature: ______________________________     Verdict: APPROVED

Chief Information Security Officer (CISO) / Security Director:
Name: ___________________________________     Date: 2026-09-08
Signature: ______________________________     Verdict: APPROVED

Head of Software Engineering:
Name: ___________________________________     Date: 2026-09-08
Signature: ______________________________     Verdict: APPROVED

Infrastructure & Cloud Operations Lead:
Name: ___________________________________     Date: 2026-09-08
Signature: ______________________________     Verdict: APPROVED
```
