# OTP Platform — Master Documentation Suite
**Official Technical, Architectural & Operational Documentation Library**  
*Open Trade & Procurement (OTP) Platform — Identity-Protected Institutional Procurement*  
*Canonical Workspace:* `G:\My Drive\otp` | *Certified Baseline:* Phase 7.1 Final Closure & Re-Certification (Commit `c5c97ca`, Baseline `01198bc`) | *Last Updated:* September 2026

---

## Executive Summary

The **OTP (Open Trade & Procurement) Platform** is an enterprise-grade, identity-protected institutional procurement operating system tailored for the Indian institutional ecosystem (Resident Welfare Associations, Housing Societies, Educational Institutions, MSMEs, and Mid-Market Enterprises).

Unlike commercial auction houses, public tender directories, or vendor listing services, OTP enforces **strict identity protection during sourcing and evaluation**. Supplier identities remain cryptographically sealed until an immutable, justified award decision is recorded by authorized committee members or procurement managers.

The platform has achieved **Phase 7.1 Final Closure & Independent Re-Certification** following rigorous verification of all human-reported defects (P1–P4), UX telemetry scrub to the 6-Stage Commercial Procurement Lifecycle, complete passing of the 22 Formal Failure Paths suite (`failure-paths-regression.test.ts`), and full Technology Currency & Upgrade Resilience Audit with 185 contiguous migrations and 1,514+ automated verifications.

---

## Core Operational Parameters (Phase 7.1 Certified Baseline)

| Parameter | Production Value | Verification Status |
| :--- | :--- | :---: |
| **Live Public Endpoint** | `https://otpplatform-theta.vercel.app` | 🟢 HTTP 200 OK |
| **Local Application Port** | `http://localhost:3000` (Vite 6.4.3 PWA) | 🟢 HTTP 200 OK |
| **Canonical Workspace** | `G:\My Drive\otp` (Exclusively; secondary junctions/aliases strictly prohibited) | 🟢 Enforced |
| **Certification Status** | **CERTIFIED — UPGRADE RESILIENT** & **PHASE 7.1 FULLY CERTIFIED — PHASE 8 PILOT READINESS GATE OPEN** | 🟢 Certified |
| **Baseline / Certified Commits** | Baseline: `01198bc` | Candidate & Final Certified Commit: `c5c97ca` | 🟢 Verified |
| **Primary Super Administrator** | **Baskar Loganathan** (`bvnbasu@gmail.com`) | 🟢 Verified OWNER |
| **Containerized Services** | 6 Production Docker Containers (`otp-prod-*`) | 🟢 Healthy |
| **WhatsApp Gateway** | WAHA Paired Container (`otp_whatsapp_gateway`, Port `3008`) | 🟢 Session WORKING |
| **Email SMTP Gateway** | Gmail SMTP SSL (`bvnbasu@gmail.com`, Port `587`) | 🟢 Verified Live |
| **Support & Ticket Routing** | Centralized automated routing to `bvnbasu@gmail.com` | 🟢 Verified Live |
| **Public UX Lifecycle** | 6-Stage Commercial Procurement Lifecycle (`DRAFT` → `QUOTING` → `EVALUATING` → `AWARDED` → `PO_ISSUED` → `SETTLED`) | 🟢 Verified Live |
| **Linear State Machine** | 15-Step Monotonic Engine (`STEP_1_SPEC_SUBMITTED` $\rightarrow$ `STEP_15_STAR_RATING_JUSTIFICATION`) gated strictly for Admin | 🟢 Verified Live |
| **Core Procurement States** | 8 Canonical Lifecycle States (`DRAFT`, `QUOTING`, `EVALUATING`, `AWARDED`, `PO_ISSUED`, `INVOICED`, `SETTLED`, `STALLED`) | 🟢 Verified Live |
| **Financial Accounting** | Double-Entry Ledger, Non-Custodial Settlement, `0.50%` Supplier Platform Fee, `0.10%` Buyer Sourcing Reward, Organization Wallets | 🟢 Verified Live |
| **Vendor Intelligence (VMI)** | 35/30/20/15 Dimensional Scorecard (Quality, Delivery, SLA/Disputes, Commercial), Performance Tiers & Anonymized Badges | 🟢 Verified Live |
| **Enterprise Governance** | Multi-Tier Approval Matrix (<₹5L Tier 1, ₹5L–₹25L Tier 2, >₹25L Tier 3) with Anti-Bypass Guards | 🟢 Verified Live |
| **Tamper-Evident Contracts** | SHA-256 Hashed Markdown Contracts with Bilateral Digital Sign-Offs (Step 11 Contract Gate) | 🟢 Verified Live |
| **Inspections & Disputes** | 5-Point Milestone Inspection Checklists, Digital Signatures, 7 Dispute Artifacts, 4 Severity Levels, SLA Timers, 4-Tier Escalation | 🟢 Verified Live |
| **Multimodal Intake** | Voice, Text, Document, Photo Capture with Buyer Confirmation Authority Boundary & Local UUID Syntax Guards | 🟢 Verified Live |
| **Device & Privacy Hardening** | Camera & Microphone Track Teardown, Geolocation Fallback, Web Share, EXIF/PDF Metadata Scrubbing | 🟢 Verified Live |
| **SMS Gateway** | Permanently Disabled (Zero-Cost Communication Policy) | 🟢 Enforced |
| **Production Data Retention** | Permanent Retention of Production DB, Orders & Users (Migrations 00125, 00177+, 00184) | 🟢 Locked & Enforced |
| **Automated Test Battery** | **1,514+ Automated Verifications across 12 Layers** (100% Green, Zero Regressions) | 🟢 1,514+/1,514+ Passed |
| **Regression Suites** | 22 Failure Paths (`failure-paths-regression.test.ts`, 32/32 pass) & UX Telemetry Scrub (`ux-telemetry-abstraction.test.ts`) | 🟢 100% Pass |
| **Database Migrations** | **185 Contiguous Migrations** (`00001_enums.sql` through `00185_fix_list_org_members_joined_at.sql`) | 🟢 100% RLS / search_path |
| **Prohibited Vocabulary** | Zero tolerance for `bid`, `bids`, `bidder`, `bidders`, `bidding`, `blind` (407 source files scanned) | 🟢 0 Violations |
| **Runtime & Tooling** | Node >=20 (tested 20.x, 22.x, 24.x LTS), TypeScript 5.6.3, React 19.2.8, React Router 7.18.2, Vite 6.4.3, Vitest 5.0.0, Tailwind CSS 3.4.19, Supabase JS 2.112.4 | 🟢 Upgrade Resilient |
| **Payment Webhooks** | Multi-Gateway Cryptographic HMAC-SHA256 (Razorpay & Stripe) with Idempotent Ledger Settlement | 🟢 Verified Live |
| **Backup Encryption** | PBKDF2 (100k rounds) + AES-256-CBC with SHA-256 Checksums | 🟢 Verified Live |
| **SuperAdmin Immutability** | PostgreSQL Trigger & Whitelist Schema (`private_security.admin_whitelist`) | 🟢 Verified Live |
| **Route Security & RBAC** | Centralized `<ProtectedRoute>`, Single Authoritative Header, Resilient Workspace Loader, Guest Sourcing Redirect | 🟢 Verified Live |

---

## Documentation Library Map

The platform technical documentation is organized into 15 canonical specifications in [`docs/`](./00-DOCUMENTATION-INDEX.md), supported by the Standalone Operations Runbook and the Historical QA Archive:

### 1. Fundamentals, Positioning & Governance
- [**00. Reconstruct Product Constitution v1.0 (Freeze Draft)**](./RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md)  
  *Supreme Product Definition, Core Product Invariant ("OTP does the procurement work. The customer makes the decision."), 3 Buyer Personas (Individual, RWA, MSME — Enterprise explicitly excluded), Universal Governance & Succession, 2-Stage Supplier Lifecycle, Address Snapshots, Financial Architecture, Truthful Verifications, and Reconstruction Rules.*

- [**01. Platform Overview & Product Constitution**](./01-PLATFORM-OVERVIEW.md)  
  *Mission, Core Principles, Identity-Protected Sourcing Philosophy, Canonical Vocabulary Standard, Intellectual Property & Proprietary Innovations, Series-6 Monotonic Workflow Architecture.*

- [**02. System Architecture & Technical Specifications**](./02-ARCHITECTURE.md)  
  *End-to-End System Architecture, Production Docker Compose Stack, Kong API Gateway, PostgREST, Realtime WebSockets, Zero-Cost Telephony, Device & Privacy Integrations.*

- [**03. Domain Model, Indian Standards & State Machines**](./03-DOMAIN-MODEL-AND-STATE-MACHINES.md)  
  *Core Domain Entities, Indian Standards Taxonomy (BIS, FSSAI, HSN/SAC), 6-Stage Commercial Lifecycle mapped to 15-Step Strict Linear Engine, 22 Formal Failure Paths (F01–F22), VMI Scorecards, Multi-Tier Enterprise Approval Matrix, Tamper-Evident Contract Operations, Double-Entry Financial Accounting Ledger, and Non-Custodial Settlement.*

### 2. Lifecycles, User Experience & Data Layer
- [**04. End-to-End Workflows & Interaction Sequences (Callflows)**](./04-WORKFLOWS-AND-CALLFLOWS.md)  
  *Fast Track (2-Step) Intake, Full Governance (4-Step) Committee Flow, Multimodal Requirement Capture (Voice with UUID syntax guard, Text, Document, Photo), Guest Draft Review & Login Sourcing Redirect, Resilient Workspace Loading with Persistent Wallet Balances, Omnichannel Communications, Milestone Inspections, and Dispute Escalation Sequences.*

- [**05. UI/UX Design System & Experience Specifications**](./05-UI-UX-DESIGN-SYSTEM.md)  
  *Visual Token Architecture, Responsive Mobile-First PWA, 6-Stage Commercial Procurement Lifecycle UX, Complete Removal of Internal 15-Step / Prototype Telemetry from Public Views (Admin Gated), Single Authoritative Role Header, Identity-Protected Comparison Room, Committee Voting Room, Decision Receipts, Support Help Modal Sheet, Universal Home Navigation, Camera/Microphone Track Teardown, and Device Capabilities.*

- [**06. Database Schema, Migrations & Row-Level Security (RLS)**](./06-DATABASE-AND-RLS-POLICIES.md)  
  *PostgreSQL 15 Schema, 185 Contiguous Migrations (`00001` - `00185`), Migration 00184 Clean State Reset, Migration 00185 `joined_at` Member RPC Fix, Core Entity Tables, Financial Ledgers, Wallet Balances, Scorecard Tables, Cryptographic RPCs, Identity-Protected Views, Hardened `search_path`, and Cross-Tenant RLS Policies.*

### 3. Security, Operations & Deployment
- [**07. Security, Privacy & Backup/Restore Posture**](./07-SECURITY-PRIVACY-BACKUP.md)  
  *Photo EXIF & PDF Metadata Sanitization, Voice Note Local URI Parsing Guards, Contact Redaction, Device Permissions, PBKDF2/AES-256 Automated Database Backups (`backup-prod-db.ps1`), 30-Day Retention, Disaster Recovery, and Contract SHA-256 Hashes.*

- [**08. Demo/Pilot Mode vs. Production Architecture**](./08-DEMO-PILOT-VS-PRODUCTION.md)  
  *Synthetic Demo Isolation, Migration 00184 Production Clean State Reset, Benchmark RWA Organization, 16 Verified Domain Suppliers across 5 Verticals, Demo Scenarios & Reset State.*

- [**09. Comprehensive Feature Specifications by Module**](./09-MODULE-FEATURE-SPECIFICATIONS.md)  
  *Detailed Feature Guide across Super Admin Console (`/admin` with SQL Query Terminal, Buyer/Seller Troubleshooter, Telemetry & Support Tickets), Buyer Portal (`/requirements`, `/rfq`), Supplier Portal (`/supplier`), Contract Gate, Milestone Inspections, Single Authoritative Role Header, Workspace Loading Resilience, and Dispute Management.*

- [**10. Deployment, Production Operations & Vercel Edge Hosting**](./10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md)  
  *Gated Blue-Green Deployment Pipeline (`deploy-prod.ps1`), Staging Gate Enforcement, Static Vercel Edge CDN Hosting, Node >=20 / Vite 6.4.3 / React 19.2.8 Runtime, Production Zero-Downtime Old-Code Protection.*

### 4. Quality Assurance, Testing & Maintenance
- [**11. Testing Architecture, Master Regression & Superadmin Test Center**](./11-TESTING-AND-REGRESSION-SUITE.md)  
  *1,514+ Automated Verifications across 12 Layers, 22 Formal Failure Paths Regression Suite (`failure-paths-regression.test.ts`), UX Telemetry Abstraction Regression Suite (`ux-telemetry-abstraction.test.ts`), Staging Verification Gate, Master Regression Suite (`pnpm test:regression`), Staging Gate Certificate, and Superadmin Interactive Test Runner (`/admin?tab=tests`).*

- [**12. Maintenance, Updates & Real-Time Alert Pipeline**](./12-MAINTENANCE-AND-ALERTS-PIPELINE.md)  
  *Zero-Data-Loss Maintenance Pipeline (`update-live.ps1`), 185 Contiguous SQL Migrations Sync, Mandatory Pre-Maintenance DB Snapshots, Hard Production Safety Locks, Automated Dual Pre/Post Alerts (Gmail SMTP + WhatsApp WAHA).*

### 5. Launch Readiness, Audits & Playbooks
- [**13. Go-Live, Friendly Pilot & Production Readiness Checklist**](./13-GO-LIVE-AND-PILOT-READINESS-CHECKLIST.md)  
  *Pre-Flight Security Hardening, 185 Migrations, Supplier Network Stub Controls (Friendly Pilot vs Live Dispatch), 16 Standardized Verified Domain Suppliers, Communications Telephony, ONDC Integration Roadmap, and Phase 8 Pilot Readiness Gate Open.*

- [**14. Pre-Production Security Clearance & Go-Live Audit Checklist**](./14-SECURITY-CLEARANCES-AND-PRE-PROD-AUDIT-CHECKLIST.md)  
  *Enterprise VAPT, SAST/DAST, Zero-BOLA/IDOR Enforcement, Multi-Factor Authentication, Search Path Hardening Across All 185 Migrations, Non-Custodial Double-Entry Ledger Verification, Upgrade Resilience Audit, ONDC/Beckn Digital Signing, and Immutable Audit Logging.*

- [**15. Production Readiness Review & Official CTO Clearance Report**](./15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md)  
  *50-Domain Comprehensive Review, Phase 7.1 Final Closure & Baseline Certification, 185 Migrations, 1,514+ Tests, Technology Currency & Upgrade Resilience Audit, Risk Register, Data Retention Schedule, and CTO Clearance Verdict.*

- [**Standalone Operations Runbook**](./STANDALONE-OPERATIONS-RUNBOOK.md)  
  *Self-contained operational playbooks (`.\scripts\otp.ps1`), routine maintenance, disaster recovery, zero-data-loss upgrades, and background daemon lifecycle without AI assistance.*

---

## Historical & Superseded QA Archive (`archive/qa/`)

Historical milestone passes, early UI redesign exploration notes, and legacy QA audit logs have been systematically archived into [`archive/qa/`](../archive/qa/README.md) to preserve historical compliance without cluttering the active documentation suite:

| Archive Section | Contents |
| :--- | :--- |
| **Legacy Phase 1-3 Passes** | `phase1-activity-profile-mobile.md`, `phase1-execution-settlement-mobile.md`, `phase1-governance-award-mobile.md`, `phase1-supplier-experience-mobile.md`, `phase2-super-admin-control-tower.md`, `phase3-public-experience-auth.md` |
| **Historical Passes 01-05** | `pass-01-content-ia-audit.md` through `pass-05-final-information-audit.md`, `content-priority-matrix.md` |
| **UX Redesign Notes** | `buyer-home-mobile-redesign.md`, `create-requirement-mobile.md`, `mobile-shell-redesign.md`, `quote-comparison-mobile.md`, `ux-implementation-report.md`, `ux-master-action-plan.md` |
| **Legacy Phase Reports (B-F)**| `phase-b-*` (Functional), `phase-c-*` (Security), `phase-d-*` (Integrations), `phase-e-*` (Data State), `phase-f-*` (Release Candidate) |
| **Interim UAT & Roadmaps** | `uat-internal-simulation-report.md`, `post-qa-lifecycle-roadmap.md` |

---

## Canonical Procurement Vocabulary Standard

All OTP Platform code, user interfaces, documentation, and database entities strictly adhere to the **Canonical Procurement Vocabulary Standard**:

| Strictly Prohibited Term | Canonical Standard | Institutional Rationale |
| :--- | :--- | :--- |
| ❌ `blind` | ✅ **Identity-Protected / Masked / Anonymized** | Emphasizes cryptographic privacy and bias protection rather than lack of vision. |
| ❌ `bid` / `bids` | ✅ **Quote / Quotation / Commercial Proposal** | OTP is an institutional procurement system, NOT a speculative auction or gambling room. |
| ❌ `bidder` / `bidders` | ✅ **Supplier / Qualified Vendor / Candidate** | Participants are commercial entities providing engineering, goods, and institutional services. |
| ❌ `bidding` | ✅ **Quoting / Sourcing Window / Evaluation** | Reflects deliberate, structured comparison based on technical specification and commercial value. |
