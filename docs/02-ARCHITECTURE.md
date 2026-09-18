# 02. System Architecture & Technical Specifications

## 1. High-Level Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT TIERS                                          │
│  ┌────────────────────────┐   ┌────────────────────────┐   ┌─────────────────────────┐  │
│  │   Buyer Portal (PWA)   │   │  Supplier Portal (PWA) │   │ Super Admin Console     │  │
│  │   React 19 + Vite 6    │   │  React 19 + Vite 6     │   │ Cross-Tenant Ops        │  │
│  │  - Multimodal Intake   │   │  - Quoting Desk        │   │  - SQL Query Terminal   │  │
│  │  - 15-Step Linear Nav  │   │  - Milestone Progress  │   │  - Lifecycle Diagnostics│  │
│  │  - VMI Comparison Room │   │  - Invoice Upload      │   │  - 1,355 Test Runner    │  │
│  └───────────┬────────────┘   └───────────┬────────────┘   └────────────┬────────────┘  │
└──────────────┼────────────────────────────┼─────────────────────────────┼───────────────┘
               │                            │                             │
               ▼                            ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        EDGE ROUTING & VERCEL GLOBAL CDN                                 │
│  Endpoint: https://otpplatform-theta.vercel.app                                         │
│  Global Edge Distribution & Automatic SSL/TLS Termination                               │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION NGINX INGRESS (UID 101)                               │
│  - Multi-Stage Unprivileged Alpine Runner (`deploy/Dockerfile.web`)                     │
│  - Mozilla Grade A+ Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type)      │
│  - Gzip Level 6 Compression & 1-Year Immutable Asset Caching                            │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            KONG API GATEWAY (Port 8000)                                 │
│  - JWT Bearer Authentication Router                                                     │
│  - Rate Limiting & SSL Termination                                                      │
│  - CORS Preflight & Security Headers                                                    │
└───────┬───────────────────────────┬───────────────────────────────┬─────────────────────┘
        │                           │                               │
        ▼                           ▼                               ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌─────────────────────────────────┐
│   GoTrue Auth Engine  │   │  PostgREST API Engine │   │   Supabase Realtime Engine      │
│   (otp-prod-auth)     │   │   (otp-prod-rest)     │   │    (otp-prod-realtime)          │
│   - Email OTP & Pass  │   │   - Auto OpenAPI      │   │   - Postgres WAL CDC Listener   │
│   - JWT Claims        │   │   - RLS Policy Bound  │   │   - Live Quote & Message Feeds  │
└───────────┬───────────┘   └───────────┬───────────┘   └─────────────────┬───────────────┘
            │                           │                                 │
            └───────────────────────────┼─────────────────────────────────┘
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL 15 DATABASE (Port 5432)                              │
│  Container: otp-prod-db                                                                 │
│  - 183 Applied Production Migrations (00001 to 00183)                                   │
│  - Row Level Security (RLS) on all core tables                                          │
│  - Security Definer Functions (private_security schema, SuperAdmin Immutability Triggers)│
│  - Cryptographic Masking Views (quotes_identity_protected, rfqs_supplier_masked)        │
│  - Sliding-Window Rate Limiting Engine & Materialized Composite Analytics Indexes        │
│  - Double-Entry Financial Accounting Ledger & Organization Wallets Schema               │
│  - Vendor Master Intelligence (VMI) Scorecards & Tiering Models                         │
│  - Multi-Tier Enterprise Approval Matrix & Anti-Bypass Triggers                         │
│  - Tamper-Evident Contract Registries (SHA-256 Hashes & Bilateral Digital Signatures)   │
│  - Progressive Milestone Inspections & 4-Tier Dispute Escalation Hierarchy              │
└───────────────────────────────────────┬─────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────┴─────────────────────────────────────────────────┐
│                         EXTERNAL GATEWAYS & ADAPTERS                                    │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  WhatsApp Gateway (WAHA Paired Container)│  │ Universal SMTP Relay Engine         │  │
│  │  Container: otp_whatsapp_gateway         │  │ Host: Gmail SMTP TLS / SendGrid / SES│ │
│  │  Port: 3008 (Session: Baskar Loganathan) │  │ Auto-switch dev/prod environments   │  │
│  │  Status: WORKING (Zero per-msg cost)     │  │ RFC 2822 Multipart MIME payload     │  │
│  └──────────────────────────────────────────┘  └─────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Payment Gateway Webhook Verifier        │  │ ERP Exporters (Tally & Zoho)        │  │
│  │  Razorpay / Stripe HMAC-SHA256 Signatures│  │ Tally Prime XML Balanced Vouchers   │  │
│  │  Idempotent DB Settlement RPC            │  │ Zoho Books JSON Invoice Payloads    │  │
│  └──────────────────────────────────────────┘  └─────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Device & Hardware Adapters              │  │ ONDC Beckn Protocol Adapter         │  │
│  │  Camera / Mic Hardware Track Teardown    │  │ BAP Network Discovery & Quote Ingest │ │
│  │  Geolocation Fallback & Web Share API    │  │ Ed25519 Request Signing             │  │
│  └──────────────────────────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Production Container Stack (`docker-compose.prod.yml`)

The OTP production backend runs via 6 consolidated, orchestrated Docker containers:

| Service Name | Container Name | Base Image / Build | Port | Memory / CPU | Responsibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **db** | `otp-prod-db` | `supabase/postgres:15.1.1.130` | `127.0.0.1:5432` | 2GB / 2 cores | Primary database, RLS policies, 183 migrations, ledger schemas, cryptographic RPCs. |
| **auth** | `otp-prod-auth` | `supabase/gotrue:v2.158.1` | Internal `9999` | 512MB / 1 core | User identity, JWT generation, password hashing, email OTP. |
| **rest** | `otp-prod-rest` | `postgrest/postgrest:v12.2.0` | Internal `3000` | 512MB / 1 core | High-performance RESTful API over PostgreSQL tables & RPCs. |
| **realtime** | `otp-prod-realtime` | `supabase/realtime:v2.30.23` | Internal `4000` | 512MB / 1 core | WebSocket streaming for live quote arrival, chat, and vote tallies. |
| **kong** | `otp-prod-gateway` | `kong:2.8.1` | `0.0.0.0:8000` | 512MB / 1 core | Central reverse proxy, route routing, authorization headers. |
| **whatsapp** | `otp_whatsapp_gateway`| `otp-waha-paired:latest` | `0.0.0.0:3008` | 1GB / 1 core | WhatsApp Web API engine, persistent paired session, zero per-msg cost. |

---

## 3. Zero-Cost Infrastructure Principles

Unlike legacy SaaS procurement platforms requiring thousands of dollars monthly for Twilio SMS, SendGrid tiers, and cloud database hosting, OTP operates on a **zero-cost production footprint**:

1. **WhatsApp Gateway (WAHA)**:
   - Self-contained headless browser session (`otp_whatsapp_gateway`) running WhatsApp Web.
   - Paired to Super Administrator mobile: **`+91 99729 67530`** (Baskar Loganathan).
   - Cost: **₹0 per message** (bypasses Meta Cloud API fees while delivering 100% reliable Indian mobile deliverability).
2. **Transactional Email (Gmail SMTP)**:
   - Powered by standard TLS on `smtp.gmail.com:587` via authenticated App Password.
   - Cost: **₹0** for up to 500 transaction emails/day (sufficient for institutional pilots and early production).
3. **SMS Communication**:
   - Permanently disabled in configuration (`MESSAGING_PROVIDER=waha`).
   - Prevents unbudgeted telco balance depletion while standardizing on WhatsApp (the dominant channel for Indian vendors).
4. **Vercel Edge Hosting**:
   - High-availability global static CDN serving the frontend SPA at `https://otpplatform-theta.vercel.app`.
   - Continuous deployment integration on `main` branch with instant zero-downtime rollouts.

---

## 4. Frontend Route Security & Centralized RBAC Guard Architecture

The frontend routing system in `apps/web/src/App.tsx` enforces a 3-tier perimeter guard using the centralized `<ProtectedRoute>` component (`apps/web/src/features/auth/ProtectedRoute.tsx`):

1. **Tier 1: Explicit Public Whitelist**
   - Marketing & Legal: `/`, `/pricing`, `/faqs`, `/about-us`, `/legal/:topic`.
   - Authentication & Recovery: `/login`, `/signup`, `/reset-password`.
   - Stateless WhatsApp/SMS Quick-Quote: `/q/:token` (stateless token credential).
   - Maintenance Fallback: `/maintenance`.

2. **Tier 2: Authenticated Workspace Layout**
   - All internal routes (`/dashboard`, `/requirements/*`, `/rfq/*`, `/notifications`, `/profile`, `/org/members`) are enclosed in `<RequireAuth><RequireRole><AppLayout /></RequireRole></RequireAuth>`.
   - Unauthenticated visits automatically capture the full URL and query parameters and redirect to `/login?redirect=<target>`.
   - Accounts on administrative hold (`isBlocked`) are halted before workspace mounting.
   - Accounts with unassigned roles (`needsOnboarding`) are routed to the role onboarding screen.

3. **Tier 3: Strict Role-Based Access Control (RBAC)**
   - **SuperAdmin Console (`/admin` and all sub-routes)**: Enforces `<ProtectedRoute requireAdmin>` requiring verified platform administrator privileges. Unauthorized attempts immediately purge sensitive diagnostic caches (`clearSensitiveClientState`) and redirect to login.
   - **Purchase Orders & Work Orders (`/purchase-orders`, `/purchase-orders/:poId`, `/supplier/purchase-orders`, `/supplier/work-orders/:woId`)**: Enforces `<ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>`.
   - **Contract Gate & Approvals (`/rfq/:rfqId/contract`, `/rfq/:rfqId/approval`)**: Restricts access based on enterprise approval matrix roles and signing authority.

4. **Edge Function Runtime Standard**
   - Deno Edge Functions in `supabase/functions/` (e.g. `payment-webhook/index.ts`) utilize ESM execution guards (`if (import.meta.main)`) to ensure testing and CI importing do not inadvertently bind network listening sockets.
   - Standardized permission tasks (`deno test --allow-env --no-lock`) in `supabase/functions/deno.json` ensuring clean test execution across Deno 1.x and 2.x runtimes.
