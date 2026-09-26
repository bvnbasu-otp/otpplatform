# OTP — Open Trade & Procurement

> **Identity-Protected Competitive Sourcing**

**OTP is an identity-protected competitive sourcing platform.**

### The Market Opportunity

Many procurement tools do: **RFQ → Quote → Compare → Award**

OTP owns a different category: **Identity-Protected Competitive Sourcing**

> **"Let suppliers compete on the requirement—not on who the buyer is, who the other suppliers are, or who knows whom."**

---

⚠️ **IP Protection Notice:** This repository contains potentially patentable technical implementation details. Do not publicly disclose detailed architecture, cryptographic mechanisms, or implementation flows before patent assessment. Product workflow demonstrations to friendly pilots are safe. See [Platform Overview & IP Protection](docs/01-PLATFORM-OVERVIEW.md) for guidance.

---

Requirement-first, location-aware, network-agnostic. OTP connects buyers (individual, MSME, community, local business, institution) to open supplier networks (ONDC, BNI, associations, direct, local registry) and runs **Identity-Protected Competitive Sourcing** through award, fulfillment, contract governance, and market intelligence.

**Two distinct procurement experiences, same platform:**
- **⚡ Fast Track (2-step, 3-5 min)** — Individual/MSME with real-time AI parsing, smart defaults, direct award
- **🏛️ Full Governance (4-step, 12-15 min)** — RWA/Enterprise with mandatory committee voting, multi-tier approval matrix, and detailed justification

Both flows maintain 100% identity protection until award and contract sign-off.

### Three Pillars of Identity-Protected Competitive Sourcing

#### 🔐 1. Identity Protection
Buyer/supplier identities remain cryptographically sealed (`Supplier T74M`) according to procurement state and role, preventing commercial bias and favoritism.

#### ⚖️ 2. Bias-Resistant Governance
Quotes are normalized and presented for evaluation without identity information, scored via multi-factor weighting (50% Commercial, 20% Technical, 15% SLA, 15% VMI Scorecard).

#### 🔎 3. Auditable Decision Trail
Every action, evaluation, vote, contract hash, and reveal is recorded in an immutable append-only ledger with SHA-256 cryptographic verification.

---

## 🚀 Phase 7.1 Certified Production Capabilities & Milestones

1. **Phase 7.1 Re-Certification & Human Defect Closure**:
   - **Baseline:** `01198bc` | **Final Certified Commit:** `c5c97ca`
   - **Certification Status:** **CERTIFIED — UPGRADE RESILIENT** & **PHASE 7.1 FULLY CERTIFIED — PHASE 8 PILOT READINESS GATE OPEN**
   - **Closed P1/P2 Defects:**
     - Migration 00185: Fixed `joined_at` column reference in `list_org_members` RPC.
     - Attachments/Voice notes local UUID syntax guard preventing runtime URI parsing exceptions.
     - Guest unauthenticated draft review & login sourcing redirect preserving draft state across auth.
     - Resilient workspace loading with persistent subscription and wallet balance visibility.
     - Single authoritative role header with duplicate badge removal.
     - Obsolete binary toggle removal from profile preferences.
2. **UX Telemetry Abstraction & 6-Stage Commercial Lifecycle**:
   - Clean 6-Stage Commercial Procurement Lifecycle (`DRAFT` → `QUOTING` → `EVALUATING` → `AWARDED` → `PO_ISSUED` → `SETTLED`) across all public touchpoints and user-facing views.
   - Internal 15-step linear pipeline and prototype telemetry gated strictly behind admin capability.
   - Verified via dedicated regression suite `ux-telemetry-abstraction.test.ts`.
3. **22 Formal Failure Paths Regression Suite**:
   - Complete verification of failure modes F01–F22 in `failure-paths-regression.test.ts` (32/32 tests passing).
4. **Technology Currency & Upgrade Resilience Audit**:
   - Node >=20 (tested 20.x, 22.x, 24.x LTS), TypeScript 5.6.3, React 19.2.8, React Router 7.18.2, Vite 6.4.3, Vitest 5.0.0, Tailwind CSS 3.4.19, Supabase JS 2.112.4.
   - 185 Contiguous SQL Migrations (00001–00185) with hardened `SECURITY DEFINER SET search_path` and 100% RLS enforcement.
   - Non-custodial financial invariants, balanced double-entry ledger, `0.50%` platform fee, and `0.10%` buyer sourcing reward.
   - **1,514+ automated verifications passing across 12 layers** (100% green, zero regressions).
5. **15-Step Strict Monotonic Engine**: End-to-end sequential workflow from `STEP_1_SPEC_SUBMITTED` to `STEP_15_STAR_RATING_JUSTIFICATION` with single-instance integrity.
6. **Vendor Master Intelligence (VMI)**: 35/30/20/15 dimensional scorecard (Quality 35%, Delivery 30%, SLA/Disputes 20%, Commercial 15%) with performance tiers (`PLATINUM`, `GOLD`, `SILVER`, `BRONZE`) and anonymized coarse badges.
7. **Multi-Tier Enterprise Approval Matrix**: Financial threshold governance (<₹5L Tier 1 Manager, ₹5L–₹25L Tier 2 VP, >₹25L Tier 3 CFO) with anti-bypass guards, self-approval prevention, and sequential sign-offs.
8. **Tamper-Evident Contract Operations**: Deterministic legal markdown contracts compiled at Step 11 (Contract Gate) with SHA-256 document checksums and bilateral digital signatures.
9. **Non-Custodial Double-Entry Financial Accounting**: Transparent `0.50%` supplier platform fee, `0.10%` buyer sourcing reward, Organization Wallets, statutory tax splitting (CGST/SGST/IGST), TDS (194C/194J/194Q), and automated ERP exports (Tally Prime XML & Zoho Books JSON).
10. **Progressive Milestone Inspections & Dispute Escalation**: 5-point quality checklist with photo evidence and digital sign-offs, paired with a 4-tier dispute resolution hierarchy across 7 artifact types with SLA timers.
11. **Intelligent Multimodal Buyer Intake**: Voice dictation, natural language parsing, document extraction, and photo capture governed by a strict **Buyer Confirmation Authority Boundary**.
12. **Device & Privacy Hardening**: Browser camera and microphone hardware stream track teardown, geolocation fallback, Web Share API, and automated EXIF/PDF metadata scrubbing.

---

## Documentation

The complete platform documentation is organized into 15 canonical documents in [`docs/`](docs/00-DOCUMENTATION-INDEX.md), supported by the Standalone Operations Runbook and the Historical QA Archive in [`archive/qa/`](archive/qa/README.md).

| Document | Purpose |
|:---|:---|
| [**00. Master Documentation Index**](docs/00-DOCUMENTATION-INDEX.md) | Canonical index, platform status, and documentation library map |
| [**01. Platform Overview & Constitution**](docs/01-PLATFORM-OVERVIEW.md) | Mission, Core Principles, Identity Protection standard, Canonical Vocabulary, IP notice |
| [**02. Architecture & Technical Specs**](docs/02-ARCHITECTURE.md) | End-to-end architecture, Docker stack, Kong Gateway, Realtime, Zero-cost telephony |
| [**03. Domain Model & State Machines**](docs/03-DOMAIN-MODEL-AND-STATE-MACHINES.md) | 15-step linear monotonic engine, Indian Standards (BIS/HSN), VMI scorecards, Approval Matrix, Ledger |
| [**04. Workflows & Callflows**](docs/04-WORKFLOWS-AND-CALLFLOWS.md) | Fast Track, Full Governance, Multimodal Intake, Omnichannel Communications, Milestone & Dispute Callflows |
| [**05. UI/UX Design System**](docs/05-UI-UX-DESIGN-SYSTEM.md) | Visual token architecture, Mobile-first PWA (`100dvh`), Comparison & Voting rooms, Device Capabilities |
| [**06. Database & RLS Policies**](docs/06-DATABASE-AND-RLS-POLICIES.md) | PostgreSQL 15 schema, 185 applied migrations (00001–00185), financial tables, cryptographic RPCs, RLS policies |
| [**07. Security, Privacy & Backups**](docs/07-SECURITY-PRIVACY-BACKUP.md) | Media EXIF sanitization, PDF redaction, hardware teardown, PBKDF2/AES-256 automated backups |
| [**08. Demo Mode vs Production**](docs/08-DEMO-PILOT-VS-PRODUCTION.md) | Synthetic demo isolation, benchmark RWA org, 16 verified domain suppliers across 5 verticals, migration 00184 |
| [**09. Feature Specifications**](docs/09-MODULE-FEATURE-SPECIFICATIONS.md) | Detailed feature guide for Super Admin Console (`/admin`), Buyer Portal, Supplier Portal, Contracts, Wallets |
| [**10. Deployment & Live Tunnel**](docs/10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md) | Production Docker Compose, Vercel Global Edge CDN, gated blue-green deployment pipeline |
| [**11. Testing & Regression Suite**](docs/11-TESTING-AND-REGRESSION-SUITE.md) | 1,514+ automated verifications across 12 layers (100% green), 22 failure paths suite, UX telemetry suite |
| [**12. Maintenance & Alerts Pipeline**](docs/12-MAINTENANCE-AND-ALERTS-PIPELINE.md) | Zero-data-loss maintenance (`update-live.ps1`), 185 migrations, DB snapshots, dual alerts (Gmail + WhatsApp) |
| [**13. Go-Live & Pilot Readiness**](docs/13-GO-LIVE-AND-PILOT-READINESS-CHECKLIST.md) | Go-live verification checklist, friendly pilot protocol, 185 migrations, Phase 8 Pilot Readiness Gate Open |
| [**14. Security Clearances & Pre-Prod Audit**](docs/14-SECURITY-CLEARANCES-AND-PRE-PROD-AUDIT-CHECKLIST.md) | Enterprise VAPT, SAST/DAST, Zero-BOLA/IDOR, MFA, cryptographic signing, immutable audit logs |
| [**15. Production Readiness & CTO Clearance**](docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md) | 50-domain review, Phase 7.1 baseline certification, Upgrade Resilience audit, CTO clearance verdict |
| [**Standalone Operations Runbook**](docs/STANDALONE-OPERATIONS-RUNBOOK.md) | Self-contained operational CLI (`.\scripts\otp.ps1`), maintenance, backups, and disaster recovery |

---

## Monorepo Structure

```
otp/
├── apps/
│   └── web/              React 19 + Vite 6 PWA (Presentation Layer)
├── packages/
│   ├── domain/           Types, enums, pure DDD business logic, tax math, state machines
│   ├── database/         Repositories, Supabase DB client bindings
│   ├── services/         Hexagonal service layer, external adapters, communications queue
│   ├── ui/               Shared UI components & design tokens
│   └── config/           Shared TypeScript / tooling config
├── supabase/
│   ├── migrations/       PostgreSQL 15 SQL migrations (00001 through 00185)
│   └── functions/        Deno Edge Functions (payment-webhook, etc.)
├── docs/                 Canonical platform specifications (00 to 15 + Runbook)
├── archive/
│   └── qa/               Archived historical QA passes & legacy milestone reports
├── qa/
│   └── release/          Active release certification & operational checklists
├── scripts/              Ops, build, test, backup, and deployment automation
├── tests/                Master integration, security, demo, and functional test suites
└── README.md
```

---

## MVP Golden Path (Pilot 1)

**10 HP Borewell Motor Winding** — local facility service in Bengaluru. Same engine for MSME, textile, or local business pilots:

Requirement → Discovery → RFQ → Identity-Protected Evaluation → Market Intelligence → Committee Vote → Award → Contract Gate → Reveal → PO → Work Order → Inspection → Invoice → Payment → Performance → Audit

---

## Tech Stack

- **Frontend:** React 19.2.8, React Router 7.18.2, TypeScript 5.6.3, Tailwind CSS 3.4.19, Vite 6.4.3, PWA, Lucide Icons
- **Backend:** Supabase (PostgreSQL 15, Supabase JS 2.112.4, GoTrue Auth, RLS, PostgREST, Realtime, Storage)
- **Monorepo:** pnpm 9.15 workspaces
- **Messaging:** Self-hosted WAHA (WhatsApp Web API) + Gmail SMTP (TLS 587)
- **Testing:** Vitest 5.0.0, Playwright, Deno Test

---

## Getting Started

### Prerequisites

- **Node.js >=20** (tested on 20.x, 22.x, 24.x LTS)
- **pnpm 9.15+** — enable via Corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
  ```
- **Supabase CLI** — <https://supabase.com/docs/guides/cli>

### First run

```bash
# Install dependencies
pnpm install

# Start Supabase locally
pnpm db:start

# Run database migrations (00001 - 00185) + seed demo data
pnpm db:reset

# Start web app (http://localhost:3000)
pnpm dev
```

The dev server runs on **port 3000** (`strictPort`), matching the Supabase auth redirect URLs in [supabase/config.toml](supabase/config.toml).

---

## Production & Testing

- **Master Automated Test Battery:** `pnpm test` (**1,514+ automated verifications across 12 layers, 100% green**)
- **TypeScript Workspace Check:** `pnpm typecheck` (zero compilation errors)
- **Canonical Vocabulary Check:** `pnpm test:vocab` (0 violations)
- **Test Policy Enforcement:** `pnpm test:policy` (100% coverage append compliant)
- **Staging Verification Gate:** `pnpm gate:verify`
- **Failure Paths Regression Suite:** `failure-paths-regression.test.ts` (32/32 tests passed)
- **UX Telemetry Abstraction Suite:** `ux-telemetry-abstraction.test.ts` (100% commercial view compliance)
- **Full Architecture & Production Review:** [15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md](docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md)
- **Deployment Operations:** [10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md](docs/10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md)
- **Standalone Operations CLI:** `.\scripts\otp.ps1`

---

## Engineering Rules

- TypeScript strict mode across all workspace packages
- Business logic in `packages/domain` and `packages/services` — never in React components
- Database access in `packages/database` repositories
- Server-side identity-protected evaluation — zero supplier PII in client payloads pre-reveal
- External supplier networks via `SupplierNetworkPort` adapters (discovery only)
- Non-custodial settlement: direct buyer-to-supplier payments with double-entry ledger tracking
- All state transitions generate immutable audit events

---

## Product Leadership & Ownership

- **Author & Creator:** Baskar Loganathan (`bvnbasu@gmail.com`)
- **Product Manager & Lead Architect:** Baskar Loganathan
- **CEO & Founder:** Baskar Loganathan

---

## License

Proprietary — OTP Platform
