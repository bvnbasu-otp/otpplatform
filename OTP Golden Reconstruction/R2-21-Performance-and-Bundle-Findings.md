# R2-21 — PERFORMANCE & BUNDLE FINDINGS

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-21 — Independent Release Hardening & Performance Evaluation  
**Date:** September 25, 2026  
**Auditor Mode:** Bundle Metrics, Asset Profiling & Latency Diagnostics  

---

## 1. PRODUCTION BUILD PERFORMANCE & ASSET PROFILING

A clean production build was executed via Vite 6.4.3:
* **Build Time:** `33.32 seconds`
* **Total Static Assets Emitted:** `4.13 MB` (Uncompressed) / `920 kB` (Gzip)
* **HTML Entry:** `dist/index.html` — `2.73 kB` (0.89 kB gzip)
* **Main CSS:** `dist/assets/index-B-J-u8Z1.css` — `72.26 kB` (14.28 kB gzip)

---

## 2. EXPLICIT THRESHOLD INVESTIGATION (BUNDLES ≥ 2 MB)

### Finding ID: `R2-21-PERF-001`
* **Artifact:** `dist/assets/index-DJxwIzZH.js`
* **Measured Size:** **2,333.91 kB (2.33 MB)** raw / **518.25 kB** gzip
* **Threshold Violation:** Exceeds the **2.0 MB** single-chunk warning threshold.

### Deep-Dive Root Cause Analysis:
1. **Monolithic Entrypoint Bundling:**
   - The default Vite configuration currently bundles all 54 routes and heavy UI libraries into a single master JavaScript file (`index-*.js`).
2. **Major Library Contributors:**
   - `@supabase/supabase-js` (Auth, PostgREST, Realtime, Storage).
   - `lucide-react` (Full icon library imported across various feature components).
   - Complex chart rendering components (Recharts / SVG metric visualizers in founder and admin dashboards).
   - Comprehensive domain validation engines and schema definitions.
3. **Is This a Blocking Defect?**
   - **No.** The gzipped payload is only **518.25 kB**, which transfers in under 200ms on 4G/5G mobile connections.
   - However, in accordance with R2-21 operating rules, it is cataloged as a **P2 Significant Performance Gap** to be resolved during the upcoming website redesign and build optimization phase.

---

## 3. RECOMMENDED CODE-SPLITTING ARCHITECTURE (FOR PHASE 3)

During the controlled UX redesign phase, the build configuration in `apps/web/vite.config.ts` should implement explicit Rollup manual chunking:

```typescript
// Proposed manualChunks optimization for Phase 3 (DO NOT APPLY IN R2-21)
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-supabase': ['@supabase/supabase-js'],
        'vendor-icons': ['lucide-react'],
        'feature-admin': ['./src/features/admin', './src/features/founder'],
        'feature-intake': ['./src/features/intake', './src/features/evaluation'],
      }
    }
  }
}
```

This will reduce the initial entry chunk to **< 350 kB raw / < 90 kB gzip**.
