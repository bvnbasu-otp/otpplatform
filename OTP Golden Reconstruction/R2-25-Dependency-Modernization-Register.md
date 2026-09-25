# R2-25 — DEPENDENCY MODERNIZATION REGISTER

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-25 — Runtime, Dependency, Compatibility & Security Modernization Audit  
**Document Identifier:** `OTP-RECON-R2-25-DEPENDENCY-REGISTER`  
**Baseline Git Commit:** `ed364a2`  
**Execution Date:** September 25, 2026  
**Auditor Mode:** Dependency Inventory, Supply Chain Integrity & Modernization Analysis  

---

## 1. MONOREPO DEPENDENCY INVENTORY

The monorepo manages dependencies through `pnpm-lock.yaml` with explicit override pinning:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      OTP MONOREPO DEPENDENCY TREE INVENTORY                            │
├──────────────────────────┬──────────────────────┬──────────────────────────────────────┤
│ Package Name             │ Declared Specifier   │ Resolved Lockfile Version            │
├──────────────────────────┼──────────────────────┼──────────────────────────────────────┤
│ react                    │ ^19.0.0              │ 19.2.8                               │
│ react-dom                │ ^19.0.0              │ 19.2.8                               │
│ react-router-dom         │ ^7.1.1               │ 7.18.2                               │
│ @supabase/supabase-js    │ ^2.49.1              │ 2.112.4                              │
│ typescript               │ 5.6.3                │ 5.6.3 (Strictly Pinned)              │
│ vite                     │ ^6.0.6 (>=6.4.3)     │ 6.4.3                                │
│ vitest                   │ ^2.1.8 (>=3.2.6)     │ 5.0.0                                │
│ tailwindcss              │ ^3.4.17              │ 3.4.19                               │
│ autoprefixer             │ ^10.4.20             │ 10.5.4                               │
│ postcss                  │ ^8.4.49              │ 8.5.26                               │
│ tsx                      │ ^4.19.2              │ 4.23.12                              │
│ pg                       │ ^8.13.3              │ 8.23.0                               │
│ @types/pg                │ ^8.11.11             │ 8.23.1                               │
│ @types/react             │ ^19.0.2              │ 19.2.18                              │
│ @types/react-dom         │ ^19.0.2              │ 19.2.5                               │
│ @types/node              │ ^22.10.2             │ 22.20.1                              │
│ @vitejs/plugin-react     │ ^4.3.4               │ 4.7.0                                │
│ esbuild                  │ (pnpm override)      │ 0.28.2 (>=0.25.0)                    │
└──────────────────────────┴──────────────────────┴──────────────────────────────────────┘
```

---

## 2. SUPPLY CHAIN INTEGRITY & PINNING STRATEGY

### 2.1 Explicit Overrides in `package.json`
To protect against transitive dependency vulnerabilities and build-time supply chain drift, the root `package.json` enforces strict overrides:
```json
"pnpm": {
  "overrides": {
    "typescript": "5.6.3",
    "esbuild": ">=0.25.0",
    "vite": ">=6.4.3",
    "vitest": ">=3.2.6"
  }
}
```

### 2.2 Security Evaluation of Overrides
* **TypeScript 5.6.3:** Pinned strictly across all workspace packages (`apps/web`, `packages/domain`, `packages/database`, `packages/services`). Ensures identical AST parsing and compiler output across development and CI.
* **esbuild >=0.25.0:** Overridden to eliminate upstream security notices regarding development server directory traversal. Currently resolved to `0.28.2`.
* **Vite >=6.4.3:** Overridden to resolve historical dev-server middleware edge cases. Currently resolved to `6.4.3`.
* **Vitest >=3.2.6:** Overridden to maintain modern test runner concurrency. Currently resolved to `5.0.0`.

---

## 3. DEPENDENCY MODERNIZATION REGISTER & UPGRADE ROADMAP

| Package Name | Category | Current Version | Modernization Candidate | Recommended Action | Risk Level | Rationale & Migration Notes |
| :--- | :--- | :---: | :---: | :--- | :---: | :--- |
| **react / react-dom** | Core Runtime | `19.2.8` | `19.2.x` | **MAINTAIN (Locked)** | **LOW** | Modern React 19 track. Fully stable. |
| **react-router-dom** | Core Routing | `7.18.2` | `7.18.x` | **MAINTAIN (Locked)** | **LOW** | Clean client-side SPA routing across 54 routes. |
| **@supabase/supabase-js** | Backend Client | `2.112.4` | `2.112.x` | **MAINTAIN (Locked)** | **LOW** | Stable 2.x generation. Native RPC support. |
| **typescript** | Compiler | `5.6.3` | `5.7.x` | **DEFER (Controlled)** | **LOW** | Pinned at 5.6.3; upgrade during dedicated dev tool pass. |
| **vite** | Bundler | `6.4.3` | `6.4.x` | **MAINTAIN (Locked)** | **LOW** | Emits optimized ES2022 Rollup chunks. |
| **vitest** | Test Harness | `5.0.0` | `5.0.x` | **MAINTAIN (Locked)** | **LOW** | Fast test runner executing 275 test suites. |
| **tailwindcss** | Styling | `3.4.19` | `3.4.x` / `4.0.x` | **MAINTAIN (v3 track)** | **MEDIUM (v4)** | Tailwind v4 involves `@theme` syntax migration; maintain v3 for stability. |
| **tsx** | Script Runner | `4.23.12` | `4.23.x` | **MAINTAIN (Locked)** | **LOW** | Fast execution of workspace maintenance scripts. |
| **pg / @types/pg** | Database Driver | `8.23.0` | `8.23.x` | **MAINTAIN (Locked)** | **LOW** | Native PostgreSQL driver for direct migration scripts. |

---

## 4. AUDIT RECOMMENDATIONS FOR FUTURE MODERNIZATION PHASES

1. **Root `package.json` Module Declaration:**
   - Add `"type": "module"` to root `package.json` to inform Node 24 that top-level scripts are ES modules.
2. **Lockfile Retention:**
   - Prohibit unpinned `pnpm update` commands on production deployment servers.
   - Maintain strict `pnpm install --frozen-lockfile` in CI/CD pipelines.
3. **Zero-Runtime Domain Isolation:**
   - Maintain `@otp/domain` as a pure, zero-dependency package containing only pure mathematical, statutory tax, and cryptographic business logic.

---
*End of Stage R2-25 Dependency Modernization Register*
