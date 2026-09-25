# R2-25 — CONTROLLED MODERNIZATION PLAN

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-25 — Runtime, Dependency, Compatibility & Security Modernization Audit  
**Document Identifier:** `OTP-RECON-R2-25-MODERNIZATION-PLAN`  
**Baseline Git Commit:** `ed364a2`  
**Execution Date:** September 25, 2026  
**Auditor Mode:** Phased Roadmap & Controlled Evolution Architecture  

---

## 1. CONTROLLED MODERNIZATION PHILOSOPHY & INVARIANTS

The OTP modernization roadmap adheres to four foundational governance invariants:
1. **Zero Business Logic Drift:** All mathematical tax rules, democratic quorum thresholds, 4-pillar quote scorecards, and identity protection guarantees remain non-negotiable.
2. **Strict Migration Ceiling at `00197`:** No database schema alterations or migrations permitted during modernization passes.
3. **Preservation of Protected Assets (`PA-01` .. `PA-10`):** All 10 protected assets must maintain 100% test pass status in `tests/security/` and `packages/domain/`.
4. **Code-Splitting Preservation:** Maintain route-level lazy loading and vendor chunking to ensure entry JS bundle stays under **500 kB raw / 100 kB gzip**.

---

## 2. PHASED MODERNIZATION ROADMAP

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        OTP PHASED MODERNIZATION ROADMAP                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: Build & Tooling Optimization (ESM packaging, Vite 6 config refinements)        │
│ PHASE 2: Developer Ergonomics & Strict Type Inference (TypeScript 5.7+ evaluation)     │
│ PHASE 3: Presentation & Component Styling Hardening (Controlled Tailwind evolutions)   │
│ PHASE 4: Continuous Security & Supply Chain Automation (Dependency pinning & CI gates) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. PHASE 1: BUILD & TOOLING OPTIMIZATION

* **Objective:** Eliminate Node 24 dual-parse ESM warnings and optimize monorepo script execution.
* **Target Actions:**
  1. Add `"type": "module"` to root `package.json`.
  2. Maintain `"allowImportingTsExtensions": true` in `apps/web/tsconfig.json` for seamless `@otp/messaging` Deno function imports.
  3. Ensure `tsx` executes all operational scripts with zero performance overhead.
* **Risk Level:** **VERY LOW.** Does not touch runtime application code.

---

## 4. PHASE 2: DEVELOPER ERGONOMICS & STRICT TYPE VERIFICATION

* **Objective:** Enhance compile-time safety across workspace package boundaries.
* **Target Actions:**
  1. Maintain strict monorepo typecheck script (`scripts/typecheck.ts`).
  2. Keep `@otp/domain` exports strictly synchronized across `@otp/database`, `@otp/services`, and `apps/web`.
  3. Validate that all RPC wrappers in `@otp/services` strictly adhere to typed PostgreSQL schema outputs.
* **Risk Level:** **LOW.** Verified via continuous typecheck gate.

---

## 5. PHASE 3: PRESENTATION & COMPONENT STYLING HARDENING

* **Objective:** Maintain mobile-first responsive ergonomics and accessibility standards.
* **Target Actions:**
  1. Retain Tailwind CSS `v3.4.19` stable configuration.
  2. Defer major Tailwind v4 upgrade to dedicated future redesign sprints to prevent unexpected CSS class utility deprecations.
  3. Enforce minimum 44px / 48px touch targets across all mobile views.
  4. Preserve sticky bottom action bars and collapsible BoQ bottom drawers.
* **Risk Level:** **LOW.** Fully validated against the mobile viewport test battery.

---

## 6. PHASE 4: SECURITY & SUPPLY CHAIN AUTOMATION

* **Objective:** Maintain zero-vulnerability posture and immutable disaster recovery backups.
* **Target Actions:**
  1. Maintain explicit `pnpm.overrides` for `typescript`, `esbuild`, `vite`, and `vitest`.
  2. Run automated red-team security test suites (`tests/security/`) in pre-commit hooks.
  3. Maintain AES-256 encrypted production backup script (`scripts/backup-prod-db.ps1`) with 30-day retention and SHA-256 checksum verification.
* **Risk Level:** **LOW.** Continuous automated verification.

---

## 7. MODERNIZATION GATE SIGN-OFF CRITERIA

Before any future modernization change is accepted into the codebase, it must satisfy all 6 automated quality gates:
1. `node scripts/typecheck.ts` $\longrightarrow$ 0 errors across 4 packages.
2. `node scripts/scan-canonical-vocabulary.cjs` $\longrightarrow$ 0 vocabulary violations.
3. `node scripts/check-test-coverage-policy.cjs --strict` $\longrightarrow$ 100% policy compliance.
4. `vitest run packages/domain/` $\longrightarrow$ 54/54 test files passed (662/662 tests).
5. `vitest run tests/security/` $\longrightarrow$ 22/22 test files passed (323 passed, 0 failed).
6. `vite build apps/web` $\longrightarrow$ Clean build with entry chunk $\le 500\text{ kB}$.

---
*End of Stage R2-25 Controlled Modernization Plan*
