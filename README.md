# OTP — Open Trade & Procurement

> **Tell us what you need. Let suppliers compete. You decide.**

**OTP is an identity-protected competitive sourcing platform.**

### The Market Opportunity

Many procurement tools do: **RFQ → Quote → Compare → Award**

OTP owns a different category: **Identity-Protected Competitive Sourcing**

> **"Let suppliers compete on the requirement—not on who the buyer is, who the other suppliers are, or who knows whom."**

---

⚠️ **IP Protection Notice:** This repository contains potentially patentable technical implementation details. Do not publicly disclose detailed architecture, cryptographic mechanisms, or implementation flows before patent assessment. Product workflow demonstrations to friendly pilots are safe. See [Platform Overview & IP Protection](docs/01-PLATFORM-OVERVIEW.md) for guidance.

---

Requirement-first, location-aware, network-agnostic. OTP connects buyers (individual, MSME, community, local business, institution) to open supplier networks (ONDC, BNI, associations, direct, local registry) and runs **Identity-Protected Competitive Sourcing** through award, fulfillment, and market intelligence.

**Two distinct procurement experiences, same platform:**
- **⚡ Fast Track (2-step, 3-5 min)** — Individual/MSME with real-time AI parsing, smart defaults, direct award
- **🏛️ Full Governance (4-step, 12-15 min)** — RWA/Enterprise with mandatory committee voting, detailed justification

Both flows maintain 100% identity protection until award.

### Three Pillars of Identity-Protected Competitive Sourcing

#### 🔐 1. Identity Protection

Buyer/supplier identities remain protected according to procurement state and role.

#### ⚖️ 2. Bias-Resistant Governance

Quotes are normalized and presented for evaluation without unnecessary identity information.

#### 🔎 3. Auditable Decision Trail

Every action, evaluation, vote, negotiation and reveal is recorded and traceable.

---

**OTP is an identity-protected competitive sourcing platform.**

OTP is **not** apartment/RWA software, an IndiaMART clone, anonymous marketplace, ERP, ONDC replacement, or supplier advertising platform. Communities are **Pilot 1** of a horizontal platform, not the product definition.

---

## 🔐 Identity Protection

OTP's opportunity is the **specific implementation and combination** of these capabilities working together:

**Requirement**  
→ supplier discovery  
→ identity masking  
→ competitive RFQ  
→ quote normalization  
→ negotiation/audit  
→ committee voting  
→ award  
→ identity reveal  
→ PO  
→ work order  
→ completion  
→ invoice/payment

This **complete, integrated system** is what differentiates OTP from ordinary vendor-management software.

**Example:** Three suppliers submit ₹98k/7 days/2-year warranty, ₹92k/15 days/1-year warranty, and ₹1.02L/5 days/3-year warranty. OTP normalizes them into **Price + Delivery + Warranty + Specification + Supplier Score + Market Intelligence**, then committee members vote on normalized scores **without necessarily knowing supplier identity**. That's **governance + competitive sourcing** that ordinary vendor management software doesn't provide.

**Potential IP:** The implementation uses an identity-protected procurement protocol (protected identity/token system, controlled disclosure, cryptographically protected quotes, controlled visibility, staged reveal) that may represent defensible IP. See [Architecture](docs/02-ARCHITECTURE.md) and [Product Constitution](docs/01-PLATFORM-OVERVIEW.md) for details worth investigating with patent professionals.

**The Real Moat:** The accumulated **supplier intelligence dataset** — categories, GST verification, geography, quote history, response rate, delivery performance, price history, award history, quality scores, committee feedback, RFQ-to-award conversion, and market price benchmarks. OTP is designed from Day 1 so that **every completed RFQ creates reusable market intelligence**. This dataset can become more valuable than the software itself, and competitors cannot easily reproduce historical procurement intelligence.

---

## Documentation

The complete platform documentation is organized into 14 canonical documents in [`docs/`](docs/00-DOCUMENTATION-INDEX.md). See the [**Master Documentation Index**](docs/00-DOCUMENTATION-INDEX.md) for the full library map.

| Document | Purpose |
|:---|:---|
| [**00. Master Documentation Index**](docs/00-DOCUMENTATION-INDEX.md) | Canonical index, platform status, and documentation library map |
| [**01. Platform Overview & Constitution**](docs/01-PLATFORM-OVERVIEW.md) | Mission, Core Principles, Identity Protection standard, Canonical Vocabulary, IP notice |
| [**02. Architecture & Technical Specs**](docs/02-ARCHITECTURE.md) | End-to-end architecture, Docker stack, Kong Gateway, Realtime, Zero-cost telephony |
| [**03. Domain Model & State Machines**](docs/03-DOMAIN-MODEL-AND-STATE-MACHINES.md) | Domain entities, Indian Standards taxonomy (BIS, FSSAI, HSN/SAC), 8 canonical lifecycle states |
| [**04. Workflows & Callflows**](docs/04-WORKFLOWS-AND-CALLFLOWS.md) | Fast Track (2-step) flow, Full Governance (4-step) flow, WhatsApp callflows |
| [**05. UI/UX Design System**](docs/05-UI-UX-DESIGN-SYSTEM.md) | Visual token architecture, Mobile-first PWA, Identity-protected comparison & voting rooms |
| [**06. Database & RLS Policies**](docs/06-DATABASE-AND-RLS-POLICIES.md) | PostgreSQL 15 schema, 140 applied migrations, cryptographic RPCs, RLS policies, operational RPCs |
| [**07. Security, Privacy & Backups**](docs/07-SECURITY-PRIVACY-BACKUP.md) | Media EXIF sanitization, PDF redaction, daily automated backups, disaster recovery |
| [**08. Demo Mode vs Production**](docs/08-DEMO-PILOT-VS-PRODUCTION.md) | Synthetic demo isolation, benchmark RWA org, 16 verified domain suppliers |
| [**09. Feature Specifications**](docs/09-MODULE-FEATURE-SPECIFICATIONS.md) | Detailed feature guide for Super Admin Console, Buyer Portal, and Supplier Portal |
| [**10. Deployment & Live Tunnel**](docs/10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md) | Production Docker Compose, Cloudflare Tunnel watchdog, secrets, SSL configuration |
| [**11. Testing & Regression Suite**](docs/11-TESTING-AND-REGRESSION-SUITE.md) | 820 test inventory, master regression pipeline (`pnpm test:regression`), superadmin test center |
| [**12. Maintenance & Alerts Pipeline**](docs/12-MAINTENANCE-AND-ALERTS-PIPELINE.md) | Fast Server Refresh (`update-live.ps1`), dual pre/post maintenance alerts (Email + WhatsApp) |
| [**13. Go-Live & Pilot Readiness**](docs/13-GO-LIVE-AND-PILOT-READINESS-CHECKLIST.md) | Go-live verification checklist, friendly pilot protocol, 140 migrations, 9.5/10 scorecard |

## Monorepo Structure

```
otp/
├── docs/                 Product and architecture docs
├── apps/
│   └── web/              React web app (presentation layer)
├── packages/
│   ├── domain/           Types, enums, pure domain rules
│   ├── database/         Repositories and data access
│   ├── services/         Service interfaces and implementations
│   ├── ui/               Shared UI components
│   └── config/           Shared TypeScript / tooling config
├── supabase/             Migrations, Edge Functions, seed
├── tests/                Unit and integration tests
├── scripts/              Dev and ops scripts
└── README.md
```

## MVP Golden Path (Pilot 1)

**10 HP Borewell Motor Winding** — local facility service in Bengaluru. Same engine for MSME, textile, or local business pilots:

Requirement → Discovery (open networks) → RFQ → Identity-Protected Evaluation → Committee Vote → Award → Reveal → PO → Work Order → Invoice → Payment → Performance → Market Intelligence → Audit

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind, shadcn-style UI, Vite, PWA
- **Backend:** Supabase (PostgreSQL, Auth, RLS, Edge Functions, Storage)
- **Monorepo:** pnpm workspaces

## Getting Started

### Prerequisites

- **Node.js 20+**
- **pnpm 9.15+** — enable via Corepack (bundled with Node):
  ```bash
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
  ```
  On Windows, if `corepack enable` fails with `EPERM` you need an elevated
  PowerShell (Corepack writes shims into the Node install directory).
  Alternative: install pnpm directly with `npm install -g pnpm@9.15.0`, or use
  Volta / fnm.
- **Supabase CLI** — <https://supabase.com/docs/guides/cli>

### First run

```bash
# Install dependencies
pnpm install

# Start Supabase locally
pnpm db:start

# Run database migrations + seed the borewell walkthrough
pnpm db:reset

# Start web app (http://localhost:3000)
pnpm dev
```

The dev server runs on **port 3000** (`strictPort`), matching the Supabase auth
redirect URLs in [supabase/config.toml](supabase/config.toml).

### Production & Testing

- **Master Regression Suite:** `pnpm test:regression` (579 tests, 100% pass across 12 layers)
- **Pre-Deployment Gate:** `pnpm gate:verify`
- **Full Architecture & Production Review:** [15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md](docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md)
- **Deployment Operations:** [10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md](docs/10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md)

## Engineering Rules

- TypeScript strict mode
- Business logic in `packages/domain` and `packages/services` — not in React components
- Database access in `packages/database` repositories
- Server-side identity-protected evaluation — no supplier PII in client payloads pre-reveal
- External supplier networks via `SupplierNetworkPort` adapters (discovery only)
- All state transitions generate audit events

## License

Proprietary — OTP Platform
#   o t p p l a t f o r m  
 