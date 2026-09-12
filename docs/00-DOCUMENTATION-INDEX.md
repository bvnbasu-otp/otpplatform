# OTP Platform — Master Documentation Suite
**Official Technical, Architectural & Operational Documentation Library**  
*Open Trade & Procurement (OTP) Platform — Identity-Protected Institutional Procurement*  
*Canonical Workspace:* `G:\My Drive\otp` | *Last Updated:* September 2026

---

## Executive Summary

The **OTP (Open Trade & Procurement) Platform** is an enterprise-grade, identity-protected institutional procurement operating system tailored for the Indian institutional ecosystem (Resident Welfare Associations, Housing Societies, Educational Institutions, MSMEs, and Mid-Market Enterprises).

Unlike commercial auction houses, public tender directories, or vendor listing services, OTP enforces **strict identity protection during sourcing and evaluation**. Supplier identities remain cryptographically sealed until an immutable, justified award decision is recorded by authorized committee members or procurement managers.

---

## Core Operational Parameters

| Parameter | Production Value | Verification Status |
| :--- | :--- | :---: |
| **Live Public Endpoint** | `https://otpplatform-theta.vercel.app` | 🟢 HTTP 200 OK |
| **Local Application Port** | `http://localhost:3000` (Vite PWA) | 🟢 HTTP 200 OK |
| **Canonical Workspace** | `G:\My Drive\otp` (Exclusively; secondary junctions/aliases strictly prohibited) | 🟢 Enforced |
| **Primary Super Administrator** | **Baskar Loganathan** (`bvnbasu@gmail.com`) | 🟢 Verified OWNER |
| **Containerized Services** | 6 Production Docker Containers (`otp-prod-*`) | 🟢 Healthy |
| **WhatsApp Gateway** | WAHA Paired Container (`otp_whatsapp_gateway`, Port `3008`) | 🟢 Session WORKING |
| **Email SMTP Gateway** | Gmail SMTP SSL (`bvnbasu@gmail.com`, Port `587`) | 🟢 Verified Live |
| **Support & Ticket Routing** | Centralized automated routing to `bvnbasu@gmail.com` | 🟢 Verified Live |
| **Core Procurement States** | 8 States (`DRAFT`, `QUOTING`, `EVALUATING`, `AWARDED`, `PO_ISSUED`, `INVOICED`, `SETTLED`, `STALLED`) | 🟢 Verified Live |
| **SMS Gateway** | Permanently Disabled (Zero-Cost Communication Policy) | 🟢 Enforced |
| **Production Data Retention** | Permanent Retention of Production DB, Orders & Users (Migration 00125+) | 🟢 Locked & Enforced |
| **Staging Verification Gate** | `pnpm gate:verify` (828 Automated Checks, 100% Pass Required) | 🟢 100% Passed (828/828) |
| **End-to-End Test Suite** | Vitest (235/235 Passed) + Live Smoke Suite (11/11 Passed) | 🟢 100% Passed |
| **Deployment Pipeline** | Gated Atomic Blue-Green Pipeline (`deploy-prod.ps1`) with Instant Rollback | 🟢 Dry-Run Verified |
| **Database Migrations** | 160 Tracked Migrations (`00001` to `00160`) via `otp_schema_migrations` | 🟢 Synced |
| **Prohibited Vocabulary** | Zero tolerance for `bid`, `bidder`, `bidding`, `blind` | 🟢 0 Violations |
| **Payment Webhooks** | Multi-Gateway Cryptographic HMAC-SHA256 (Razorpay & Stripe) | 🟢 Verified Live |
| **Backup Encryption** | PBKDF2 (100k rounds) + AES-256-CBC with SHA-256 Checksums | 🟢 Verified Live |
| **SuperAdmin Immutability** | PostgreSQL Trigger & Whitelist Schema (`private_security`) | 🟢 Verified Live |
| **Route Security & RBAC** | Centralized `<ProtectedRoute>` & Strict Deep-Link Preservation | 🟢 Verified Live |
| **E2E Automation** | Playwright & Vitest Multi-Tenant Sourcing Battery (631+ Tests) | 🟢 100% Passed |

---

## Documentation Library Map

This documentation library has been consolidated, standardized, and organized into 14 canonical documents plus the Standalone Operations Runbook:

### 1. Fundamentals, Positioning & Governance
- [**01. Platform Overview & Product Constitution**](./01-PLATFORM-OVERVIEW.md)  
  *Mission, Core Principles, Identity-Protected Sourcing Philosophy, Canonical Vocabulary Standard, Intellectual Property & Proprietary Innovations.*

- [**02. System Architecture & Technical Specifications**](./02-ARCHITECTURE.md)  
  *End-to-End System Architecture, Production Docker Compose Stack, Kong API Gateway, PostgREST, Realtime WebSockets, Zero-Cost Telephony.*

- [**03. Domain Model, Indian Standards & State Machines**](./03-DOMAIN-MODEL-AND-STATE-MACHINES.md)  
  *Core Domain Entities, Value Objects, Indian Standards Taxonomy (BIS, FSSAI, HSN/SAC), 8 Canonical Procurement Lifecycle States (`DRAFT`, `QUOTING`, `EVALUATING`, `AWARDED`, `PO_ISSUED`, `INVOICED`, `SETTLED`, `STALLED`), and Automated Settlement.*

### 2. Lifecycles, User Experience & Data Layer
- [**04. End-to-End Workflows & Interaction Sequences (Callflows)**](./04-WORKFLOWS-AND-CALLFLOWS.md)  
  *Fast Track (2-Step) Flow, Full Governance (4-Step) Committee Flow, Supplier Sourcing Callflows, and WhatsApp Real-Time Notification Sequences.*

- [**05. UI/UX Design System & Experience Specifications**](./05-UI-UX-DESIGN-SYSTEM.md)  
  *Visual Token Architecture, Responsive Mobile-First PWA, Identity-Protected Comparison Room, Committee Voting Room, Decision Receipts, Support Help Modal Sheet, and Universal Home Navigation.*

- [**06. Database Schema, Migrations & Row-Level Security (RLS)**](./06-DATABASE-AND-RLS-POLICIES.md)  
  *PostgreSQL 15 Schema, 160 Applied Migrations (`00001` - `00160`), Core Entity Tables, Cryptographic RPCs, Identity-Protected Views, and Cross-Tenant RLS Policies.*

### 3. Security, Operations & Deployment
- [**07. Security, Privacy & Backup/Restore Posture**](./07-SECURITY-PRIVACY-BACKUP.md)  
  *Photo EXIF & PDF Metadata Sanitization, Social Handle Redaction, Daily Automated Database Backups (`backup-prod-db.ps1`), 30-Day Retention, Disaster Recovery.*

- [**08. Demo/Pilot Mode vs. Production Architecture**](./08-DEMO-PILOT-VS-PRODUCTION.md)  
  *Synthetic Demo Isolation, Benchmark RWA Organization, 39 Verified Domain Suppliers, Demo Scenarios & Reset State.*

- [**09. Comprehensive Feature Specifications by Module**](./09-MODULE-FEATURE-SPECIFICATIONS.md)  
  *Detailed Feature Guide across Super Admin Console (`/admin` with SQL Query Terminal, Buyer Troubleshooter, Seller Troubleshooter, Telemetry & Support Tickets), Buyer Portal (`/requirements`, `/rfq`), and Supplier Portal (`/supplier`).*

- [**10. Deployment, Production Operations & Vercel Edge Hosting**](./10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md)  
  *Gated Blue-Green Deployment Pipeline (`deploy-prod.ps1`), Staging Gate Enforcement, Static Vercel Edge CDN Hosting, Production Zero-Downtime Old-Code Protection.*

### 4. Quality Assurance, Testing & Maintenance
- [**11. Testing Architecture, Master Regression & Superadmin Test Center**](./11-TESTING-AND-REGRESSION-SUITE.md)  
  *Staging Verification Gate (828 Tests across 12 Layers), Master Regression Suite (`pnpm test:regression`), Staging Gate Certificate, and Superadmin Interactive Test Runner (`/admin?tab=tests`).*

- [**12. Maintenance, Updates & Real-Time Alert Pipeline**](./12-MAINTENANCE-AND-ALERTS-PIPELINE.md)  
  *Zero-Data-Loss Maintenance Pipeline (`update-live.ps1`), Mandatory Pre-Maintenance DB Snapshots, Hard Production Safety Locks, Automated Dual Pre/Post Alerts (Gmail SMTP + WhatsApp WAHA).*

### 5. Launch Readiness, Audits & Playbooks
- [**13. Go-Live, Friendly Pilot & Production Readiness Checklist**](./13-GO-LIVE-AND-PILOT-READINESS-CHECKLIST.md)  
  *Pre-Flight Security Hardening, Supplier Network Stub Controls (Friendly Pilot vs Live Dispatch), 16 Standardized Verified Domain Suppliers, Communications Telephony, ONDC Integration Roadmap, and Pilot Execution Protocol.*

- [**14. Pre-Production Security Clearance & Go-Live Audit Checklist**](./14-SECURITY-CLEARANCES-AND-PRE-PROD-AUDIT-CHECKLIST.md)  
  *Enterprise VAPT, SAST/DAST, Zero-BOLA/IDOR Enforcement, Multi-Factor Authentication, Cryptographic Key Isolation, ONDC/Beckn Digital Signing, and Immutable Audit Logging.*

- [**15. Production Readiness Review & Official CTO Clearance Report**](./15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md)  
  *50-Domain Comprehensive Review, Competitive Matrix, Risk Register, Data Retention Schedule, Mobile Viewport Audit, 20-Item Backlog Resolution, and CTO Pilot Clearance Verdict.*

- [**Standalone Operations Runbook**](./STANDALONE-OPERATIONS-RUNBOOK.md)  
  *Self-contained operational playbooks (`.\scripts\otp.ps1`), routine maintenance, disaster recovery, zero-data-loss upgrades, and background daemon lifecycle without AI assistance.*

---

## Canonical Procurement Vocabulary Standard

All OTP Platform code, user interfaces, documentation, and database entities strictly adhere to the **Canonical Procurement Vocabulary Standard**:

| Strictly Prohibited Term | Canonical Standard | Institutional Rationale |
| :--- | :--- | :--- |
| ❌ `blind` | ✅ **Identity-Protected / Masked / Anonymized** | Emphasizes cryptographic privacy and bias protection rather than lack of vision. |
| ❌ `bid` / `bids` | ✅ **Quote / Quotation / Commercial Proposal** | OTP is an institutional procurement system, NOT a speculative auction or gambling room. |
| ❌ `bidder` / `bidders` | ✅ **Supplier / Qualified Vendor / Candidate** | Participants are commercial entities providing engineering, goods, and institutional services. |
| ❌ `bidding` | ✅ **Quoting / Sourcing Window / Evaluation** | Reflects deliberate, structured comparison based on technical specification and commercial value. |
