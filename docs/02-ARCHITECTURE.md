# 02. System Architecture & Technical Specifications

## 1. High-Level Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT TIERS                                          │
│  ┌────────────────────────┐   ┌────────────────────────┐   ┌─────────────────────────┐  │
│  │   Buyer Portal (PWA)   │   │  Supplier Portal (PWA) │   │ Super Admin Console     │  │
│  │   React 19 + Vite 6    │   │  React 19 + Vite 6     │   │ Cross-Tenant Ops        │  │
│  └───────────┬────────────┘   └───────────┬────────────┘   └────────────┬────────────┘  │
└──────────────┼────────────────────────────┼─────────────────────────────┼───────────────┘
               │                            │                             │
               ▼                            ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        EDGE ROUTING & CLOUDFLARE LIVE TUNNEL                            │
│  Endpoint: https://incoming-reductions-incoming-stevens.trycloudflare.com              │
│  Auto-Restart Watchdog Daemon: scripts/start-live-tunnel.ps1                            │
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
│  - 156 Applied Production Migrations (00001 to 00156)                                   │
│  - Row Level Security (RLS) on all core tables                                          │
│  - Security Definer Functions (private_security schema, SuperAdmin Immutability Triggers)│
│  - Cryptographic Anonymous Masking Views (quotes_identity_protected, rfqs_supplier_masked)│
│  - Sliding-Window Rate Limiting Engine & Materialized Composite Analytics Indexes        │
└───────────────────────────────────────┬─────────────────────────────────────────────────┘
                                        │
┌───────────────────────────────────────┴─────────────────────────────────────────────────┐
│                         EXTERNAL GATEWAYS & ADAPTERS                                    │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  WhatsApp Gateway (WAHA Paired Container)│  │ Universal SMTP Relay Engine         │  │
│  │  Container: otp_whatsapp_gateway         │  │ Host: AWS SES / SendGrid / Mailpit  │  │
│  │  Port: 3008 (Session: Baskar Loganathan) │  │ Auto-switch dev/prod environments   │  │
│  │  Status: WORKING (Zero per-msg cost)     │  │ RFC 2822 Multipart MIME payload     │  │
│  └──────────────────────────────────────────┘  └─────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Payment Gateway Webhook Verifier        │  │ ERP Exporters (Tally & Zoho)        │  │
│  │  Razorpay / Stripe HMAC-SHA256 Signatures│  │ Tally Prime XML Balanced Vouchers   │  │
│  │  Idempotent DB Settlement RPC            │  │ Zoho Books JSON Invoice Payloads    │  │
│  └──────────────────────────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Production Container Stack (`docker-compose.prod.yml`)

The entire OTP production backend runs via 6 consolidated, orchestrated Docker containers:

| Service Name | Container Name | Base Image / Build | Port | Memory / CPU | Responsibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **db** | `otp-prod-db` | `supabase/postgres:15.1.1.130` | `127.0.0.1:5432` | 2GB / 2 cores | Primary database, RLS policies, migrations, cryptographic RPCs. |
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
4. **Cloudflare Live Tunnel**:
   - Secure outbound tunnel routing traffic from port 3000 to `https://strange-lenses-frequency-salvation.trycloudflare.com`.
   - Bypasses need for static IP, NAT port forwarding, or domain renewal fees during production pilots.

---

## 4. Network Security & Perimeter Defense

- **Port Exposure Policy**: PostgreSQL (`5432`) binds strictly to `127.0.0.1`. Internal microservices (`auth`, `rest`, `realtime`) are inaccessible from the public internet. Only Kong Gateway (`8000`), WAHA (`3008`), and Vite (`3000`) listen on host interfaces.
- **Data Protection at Rest**: All application data resides in Docker volumes backed by NTFS daily backups located at `G:\My Drive\otp\backups\`.
- **Cross-Tenant Isolation**: Row-Level Security (RLS) is hardcoded into PostgreSQL. Even if a compromised client sends raw PostgREST requests, the database rejects queries attempting to select rows belonging to another organization.
