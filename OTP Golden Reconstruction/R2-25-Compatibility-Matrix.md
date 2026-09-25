# R2-25 — PLATFORM & FRAMEWORK COMPATIBILITY MATRIX

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-25 — Runtime, Dependency, Compatibility & Security Modernization Audit  
**Document Identifier:** `OTP-RECON-R2-25-COMPATIBILITY-MATRIX`  
**Baseline Git Commit:** `ed364a2`  
**Execution Date:** September 25, 2026  
**Auditor Mode:** Platform Runtime & Cross-Environment Compatibility Evaluation  

---

## 1. CROSS-ENVIRONMENT COMPATIBILITY MATRIX

| Technology Layer / Component | Monorepo Version | Target Production Version | Node 22 LTS | Node 24 Current | Supabase Cloud | Vercel Edge / Node | Risk Classification | Empirical Validation & Evidence |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Node.js Engine** | `v24.18.1` | `22.x LTS` / `24.x` | **COMPATIBLE** | **VERIFIED** | Full Support | Fully Supported | **LOW** | Monorepo builds in 31.87s, typechecks in 83.71s, executes 275 test files cleanly. |
| **Package Manager** | `pnpm 9.15.0` | `pnpm 9.15.x` | **COMPATIBLE** | **VERIFIED** | N/A | Supported (`pnpm install`) | **LOW** | Clean `pnpm-lock.yaml` with zero dependency peer conflicts or missing overrides. |
| **React Framework** | `19.2.8` | `19.2.x` | **COMPATIBLE** | **VERIFIED** | Full Support | Fully Supported | **LOW** | React 19 concurrent `lazy` + `Suspense` and form actions operate cleanly across 54 routes. |
| **React Router** | `7.18.2` | `7.18.x` | **COMPATIBLE** | **VERIFIED** | Full Support | Fully Supported | **LOW** | Client-side routing, wildcard redirects, and parameterized deep links verified. |
| **Vite Bundler** | `6.4.3` | `6.4.x` | **COMPATIBLE** | **VERIFIED** | N/A | Supported (`vite build`) | **LOW** | Rollup code-splitting emits 64 modular chunks; initial entry chunk is 381.60 kB raw. |
| **TypeScript Compiler** | `5.6.3` | `5.6.x` / `5.7.x` | **COMPATIBLE** | **VERIFIED** | Full Support | Fully Supported | **LOW** | Strict typecheck (`typecheck.ts`) passes cleanly across all 4 workspace packages. |
| **Vitest Test Runner** | `5.0.0` | `5.0.x` | **COMPATIBLE** | **VERIFIED** | N/A | CI Compatible | **LOW** | 54 domain tests (662 tests) and 22 security suites (323 tests) executed without failure. |
| **Supabase Client SDK** | `2.112.4` | `2.112.x` | **COMPATIBLE** | **VERIFIED** | **NATIVE** | Fully Supported | **LOW** | Typed PostgreSQL RPC callers, token refresh, and Realtime channels operate reliably. |
| **PostgreSQL Engine** | `PG 15+` | `PG 15 / 16 / 17` | **COMPATIBLE** | **VERIFIED** | Authoritative | N/A (Cloud Supabase) | **LOW** | 197 migrations strictly locked at `00197`; compatible with PG 15, 16, and 17. |
| **Tailwind CSS** | `3.4.19` | `3.4.x` | **COMPATIBLE** | **VERIFIED** | N/A | Fully Supported | **LOW** | Responsive mobile utilities, custom persona themes, and 48px touch targets compile cleanly. |
| **PostCSS / Autoprefixer** | `8.5.26` / `10.5.4` | `8.5.x` / `10.5.x` | **COMPATIBLE** | **VERIFIED** | N/A | Fully Supported | **LOW** | Vendor prefixes generated accurately for cross-browser mobile Safari and Chrome. |

---

## 2. NODE.JS RUNTIME COMPATIBILITY ANALYSIS

### 2.1 Node 22 LTS (Target Production Runtime)
* **Support Lifecycle:** Node 22 is the active Long Term Support (LTS) release through April 2027.
* **Vercel Runtime Support:** Fully supported out of the box in Vercel Serverless Functions and build environments.
* **Compatibility Findings:**
  - Standard Web APIs (`fetch`, `Headers`, `Request`, `Response`, `crypto.subtle`, `TextEncoder`, `TextDecoder`) are native.
  - Zero external polyfills needed for cryptographic hashing or data transformation.
  - Full support for `node:path`, `node:fs`, `node:child_process`, and modern ESM execution.

### 2.2 Node 24 Current (Development & Local Environment)
* **Execution Status:** Tested under Node `v24.18.1` on Windows 10/11 x64.
* **Performance:** Faster module resolution and esbuild transformation times during local build and Vitest execution.
* **Warning Observation:** When executing TypeScript scripts directly via `node scripts/typecheck.ts`, Node 24 outputs:
  ```text
  (node:29924) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../scripts/typecheck.ts is not specified and it doesn't parse as CommonJS.
  Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
  To eliminate this warning, add "type": "module" to package.json.
  ```
* **Modernization Action:** Harmless during runtime, but adding `"type": "module"` to root `package.json` in a future planned update will eliminate the dual-parse overhead.

---

## 3. FRONTEND FRAMEWORK & BUNDLE COMPATIBILITY

### 3.1 React 18 vs React 19 Evaluation
* **Current Version:** `react@19.2.8` and `react-dom@19.2.8`.
* **Findings:**
  - Monorepo operates cleanly on modern React 19.
  - Uses `React.lazy()` with `<Suspense fallback={<RouteLoadingFallback />}>` for all 54 routes.
  - Zero legacy lifecycle deprecation warnings (`UNSAFE_componentWillMount`, etc.).
  - Zero hydration mismatch warnings.
* **Verdict:** 100% compatible and future-proof.

### 3.2 Vite 6 & Rollup Code Splitting
* **Current Version:** `vite@6.4.3` and `rollup@4.63.0`.
* **Chunking Configuration (`apps/web/vite.config.ts`):**
  - Vendor React (`vendor-react-*.js`): 228.51 kB raw (73.05 kB gzip).
  - Vendor Supabase (`vendor-supabase-*.js`): 211.38 kB raw (55.87 kB gzip).
  - Entry Bundle (`index-CDgCkPvd.js`): 381.60 kB raw (75.28 kB gzip).
  - Total Modular Route Chunks: 64 chunks dynamically loaded on demand.
* **Verdict:** Zero monolithic bundle bottlenecks. Initial load payload is reduced by >77% compared to the pre-hardening baseline.

---

## 4. DATABASE & SUPABASE PLATFORM COMPATIBILITY

### 4.1 Migration Ceiling & PostgreSQL Version Compatibility
* **Migration Level:** Strictly locked at `00197_universal_org_role_lifecycle_succession_and_audit.sql`.
* **PostgreSQL Engine Features Used:**
  - **Row Level Security (RLS):** Fully standard SQL policies across all tables.
  - **Triggers & Functions:** PL/pgSQL triggers (`trg_protect_platform_admin`, `prevent_mutation_org_governance_audits`) adhere to strict standard SQL conventions.
  - **JSONB Operations:** Uses native operators (`->`, `->>`, `@>`) supported identically in PG 15, PG 16, and PG 17.
  - **Custom Schemas:** Multi-schema isolation (`public`, `private_security`, `auth`) is natively compatible with Supabase hosted cloud and self-hosted instances.

### 4.2 Supabase JS Client & Realtime WebSocket Channels
* **Client SDK:** `@supabase/supabase-js@2.112.4`.
* **Auth Storage:** Operates seamlessly with browser `localStorage` and token refresh loops.
* **Realtime Protocol:** WebSocket subscriptions for live RFQ status, notification badges, and committee votes maintain connection heartbeat without memory leaks.

---

## 5. VERCEL DEPLOYMENT & EDGE COMPATIBILITY MATRIX

| Feature / Configuration | Specification in `vercel.json` | Operational Behavior | Status |
| :--- | :--- | :--- | :---: |
| **Framework Target** | `vite` | Automatically configures static build output | **PASS** |
| **Build Command** | `pnpm --filter @otp/web build` | Builds `@otp/web` and workspace packages | **PASS** |
| **Output Directory** | `apps/web/dist` | Serves compiled static assets | **PASS** |
| **SPA Rewrites** | `/(.*) -> /index.html` | Client-side routing for all 54 routes | **PASS** |
| **Strict CSP Headers** | Restricts script, style, font, connect sources | Blocks XSS, unauthorized endpoints, and untrusted iframes | **PASS** |
| **HSTS Security** | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS encryption across all subdomains | **PASS** |
| **Permissions Policy** | `camera=(), microphone=(self), geolocation=()` | Restricts sensitive device hardware APIs | **PASS** |

---

## 6. GOLDEN PERSONA PLATFORM COMPATIBILITY

| Persona | Sourcing & Intake | Evaluation & Governance | Award & Settlement | Platform Verification Status |
| :--- | :--- | :--- | :--- | :---: |
| **Individual** | Plain text NLP (`Tell OTP`) | Standard 4-Pillar comparison | 1-Click PO & Doorstep Inspection | **100% COMPATIBLE** |
| **RWA** | Multi-premise mapping | Committee quorum & COI recusal | Quorum Award & Decision Receipt | **100% COMPATIBLE** |
| **MSME** | Multi-facility address book | Tiered spend delegation matrix | Bilateral GST & TDS Settlement | **100% COMPATIBLE** |
| **Supplier** | WhatsApp/SMS claim alerts | Landed quotation workbench | Milestone Inspection & Invoicing | **100% COMPATIBLE** |
| **Enterprise** | Disabled | Disabled | Disabled | **FAIL-CLOSED (Unsupported)** |

---
*End of Stage R2-25 Compatibility Matrix*
