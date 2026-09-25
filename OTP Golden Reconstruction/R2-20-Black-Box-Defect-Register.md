# OTP Stage R2-20 — Black-Box Defect Register

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-20 — Human Black-Box Product Audit & Golden-Path Gap Discovery  
**Audit Baseline Commit:** `32334aae872c98ddc13d326985723c560534823b`  
**Ceiling Migration:** `00197_universal_org_role_lifecycle_succession_and_audit.sql`  
**Policy:** Strict Audit Only — No Code Mutations Performed  

---

## 1. Defect Classification System

Findings are classified according to canonical product engineering severity:
* **P0 — Release Blocker:** Severe security vulnerability, financial corruption, identity leakage, authorization bypass, data destruction, or completely blocked golden path.
* **P1 — Critical Defect:** Major user journey breakdown, synthetic data contamination in production, or significant functional correctness defect.
* **P2 — Significant Defect:** Important UX, performance, bundle size, accessibility, or operational gap affecting real users.
* **P3 — Improvement:** Usability enhancement, friction reduction, or UI refinement.
* **P4 — Observation:** Platform warning, architectural note, or documentation observation.

---

## 2. Summary Defect Tally

| Severity | Count | Status | Action Required Before Release |
| :--- | :--- | :--- | :--- |
| **P0 — Release Blocker** | **0** | Clean | None |
| **P1 — Critical** | **1** | Open | Mandatory closure prior to production rollout |
| **P2 — Significant** | **2** | Open | Recommended resolution in R2-21 |
| **P3 — Improvement** | **2** | Open | Targeted UX refinement |
| **P4 — Observation** | **1** | Open | Platform maintenance |
| **Total** | **6** | — | — |

---

## 3. Comprehensive Defect Records

---

### Finding ID: `F-20-01`

* **Severity:** **P1 — Critical**
* **Persona:** Individual Buyer / RWA Committee / MSME Procurement Manager
* **Route:** `/rfq/:rfqId/quotes`, `/rfq/:rfqId/evaluation`, `/rfq/:rfqId/cockpit`
* **Precondition:** A real buyer has published an RFQ and visits the evaluation cockpit before any suppliers have submitted quotations (`quotes.length === 0`).
* **Exact Steps:**
  1. As an authenticated buyer in production mode (`VITE_DEMO_MODE=false`), open an RFQ and navigate to `/rfq/<rfqId>/quotes`.
  2. Observe the empty state rendered by `<IdentityProtectedQuoteComparisonTable>`.
  3. Inspect the button visible beneath *"No quotes available for fair anonymous comparison yet."*
* **Expected Result:** The empty state should display an honest, professional status banner informing the buyer that invitations have been broadcast and quotations are actively awaited, with zero demo or simulation buttons.
* **Actual Result:** The UI renders an active primary button: `⚡ Simulate 4 Demo Quotes` (`data-testid="simulate-quotes-empty-state-btn"`). If clicked, it invokes `handleSimulateQuotes()` which executes `simulateQuotesForRfq(rfqId, { force: true })`, populating synthetic quotes into a real production tender.
* **Evidence:**
  - `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` line 661:
    ```tsx
    onSimulateQuotes={() => void handleSimulateQuotes()}
    ```
    This prop is passed unconditionally into `<IdentityProtectedQuoteComparisonTable>`, whereas header button line 614 and Q&A button line 741 have explicit `isDemoMode &&` guards.
  - `apps/web/src/features/rfq/components/IdentityProtectedQuoteComparisonTable.tsx` lines 101–113:
    ```tsx
    {onSimulateQuotes && (
      <div className="pt-2">
        <button onClick={onSimulateQuotes} data-testid="simulate-quotes-empty-state-btn">
          ⚡ Simulate 4 Demo Quotes
        </button>
      </div>
    )}
    ```
* **Affected Layer:** UI / Presentation Layer (`apps/web`)
* **Security Impact:** Low (does not leak credentials or bypass authorization).
* **Financial Impact:** Medium (contaminates real tender with fictitious prices and fake supplier rankings).
* **User Impact:** High (creates severe confusion for real buyers who may mistake synthetic test quotes for actual supplier commitments).
* **Regression Risk:** Very Low to resolve.
* **Likely Root Cause:** Incomplete propagation of `isDemoMode` guard to the empty-state comparison table prop in `EvaluationDecisionCockpit.tsx`.
* **Recommended Next Action:** Change line 661 in `EvaluationDecisionCockpit.tsx` to:
  `onSimulateQuotes={isDemoMode ? () => void handleSimulateQuotes() : undefined}`.

---

### Finding ID: `F-20-02`

* **Severity:** **P2 — Significant**
* **Persona:** All Personas (especially mobile users in Tier-2/3 regional markets on 3G/4G)
* **Route:** All routes (Global Application Bundle)
* **Precondition:** Initial page load from a clean browser cache.
* **Exact Steps:**
  1. Execute `pnpm build` (`vite build apps/web`).
  2. Inspect output bundle assets and console warnings.
* **Expected Result:** Code-split route chunks where the initial entry bundle is under 500 kB, with secondary feature pages (admin, founder, fulfillment, governance) fetched dynamically on navigation.
* **Actual Result:** Monolithic production chunk `dist/assets/index-DJxwIzZH.js` measures **2,333.22 kB (2.33 MB minified, 518.13 kB gzipped)**, triggering Vite build warning:
  `(!) Some chunks are larger than 1500 kB after minification.`
* **Evidence:**
  - `apps/web/src/App.tsx` lines 1–54 statically imports all 40+ pages and feature views synchronously at startup.
  - Production build log:
    ```text
    dist/assets/index-DJxwIzZH.js  2,333.22 kB │ gzip: 518.13 kB
    ```
* **Affected Layer:** Build & Packaging / Performance (`apps/web`)
* **Security Impact:** None.
* **Financial Impact:** None.
* **User Impact:** High initial load latency (3–6 seconds on constrained mobile networks), higher bounce rates, poor First Contentful Paint (FCP).
* **Regression Risk:** Low to Medium (requires wrapping dynamic imports with `<Suspense fallback={<PageSkeleton />} />`).
* **Likely Root Cause:** Rapid feature implementation prioritized explicit imports over dynamic `React.lazy()` route splitting.
* **Recommended Next Action:** Split heavy routes (`AdminDashboardPage`, `FounderDashboardPage`, `PurchaseOrderDetailPage`, `EvaluationDecisionCockpitPage`, `OrgMembersPage`) into `React.lazy()` chunks with route-level Suspense boundaries.

---

### Finding ID: `F-20-03`

* **Severity:** **P2 — Significant**
* **Persona:** Buyer & Supplier
* **Route:** `/purchase-orders/:poId`, `/supplier/purchase-orders/:poId`
* **Precondition:** A purchase order is viewed where the database table `purchase_order_line_items` has 0 rows.
* **Exact Steps:**
  1. Navigate to an active or generated Purchase Order (`/purchase-orders/<poId>`).
  2. Scroll down to the *"Commercial Contract Line Items & BoQ Itemization"* section.
* **Expected Result:** If granular line items were not submitted by the supplier, the PO should display an honest single contract line item reflecting the agreed scope and exact total contract value.
* **Actual Result:** The client invokes `derivePoLineItems()`, which uses regex pattern matching on the RFQ title to fabricate synthetic line items (e.g. *"Premium Exterior Emulsion & Silicone Primer"*, HSN *"3209"*, 55%/30%/15% cost allocations).
* **Evidence:**
  - `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx` lines 68–270 and line 1209:
    ```tsx
    const lineItems = dbLineItems.length > 0 
      ? dbLineItems 
      : derivePoLineItems(order.totalAmount, order.rfqTitle);
    ```
* **Affected Layer:** UI / Presentation Layer (`apps/web`)
* **Security Impact:** None.
* **Financial Impact:** Medium (generates unverified tax breakdowns and HSN codes on an official legal purchase order document).
* **User Impact:** High potential for dispute if a supplier or buyer reviews a legally binding PO containing items neither party specified.
* **Regression Risk:** Very Low.
* **Likely Root Cause:** Legacy demo fallback helper was retained in production view logic instead of an honest single-line contractual summary.
* **Recommended Next Action:** Eliminate `derivePoLineItems()` fallback; render an honest single-line summary representing the total contract value whenever granular BoQ line items are absent.

---

### Finding ID: `F-20-04`

* **Severity:** **P3 — Improvement (Hidden Complexity)**
* **Persona:** Individual Buyer
* **Route:** `/rfq/:rfqId/quotes` $\rightarrow$ `/rfq/:rfqId/award` $\rightarrow$ `/purchase-orders/:poId`
* **Precondition:** An Individual Buyer wishes to award a quote for a simple domestic service (e.g., plumbing or appliance repair).
* **Exact Steps:**
  1. Buyer clicks *"Award Quote"* in the Cockpit.
  2. Lands on `/rfq/:rfqId/award`.
  3. Must click *"Lock Award Decision"* and wait for locks to register.
  4. Must then click *"Confirm Award & Issue Purchase Order"*.
  5. Must then click *"View Digital Purchase Order"*.
* **Expected Result:** A clean, 1-click consumer checkout: *"Accept Quote & Place Order"* that atomically locks, unmasks, and creates the order in a single operation.
* **Actual Result:** The buyer is subjected to a 3-step institutional governance ceremony designed for RWA committee voting.
* **Evidence:**
  - `apps/web/src/features/award/pages/AwardPage.tsx` lines 835–865.
* **Affected Layer:** UX / Journey Orchestration
* **Security Impact:** None.
* **Financial Impact:** None.
* **User Impact:** Cognitive friction; feels like an enterprise procurement ERP rather than a consumer-friendly service platform.
* **Regression Risk:** Low.
* **Likely Root Cause:** Unified award page shared between RWA and Individual personas without persona-aware fast-tracking.
* **Recommended Next Action:** Add a streamlined 1-click award flow for `isIndividualBuyer === true`.

---

### Finding ID: `F-20-05`

* **Severity:** **P3 — Improvement (Accessibility & Mobile Touch Targets)**
* **Persona:** Mobile Users & Screen Reader Users
* **Route:** `/rfq/:rfqId/quotes`, `/purchase-orders/:poId`
* **Precondition:** Navigating on small viewports (360×800) or using keyboard/screen reader accessibility tools.
* **Exact Steps:**
  1. Inspect interactive buttons on the Evaluation Cockpit and Inspection Panel.
* **Expected Result:** All clickable targets meet WCAG 2.1 AA / AAA standards ($\ge 44 \times 44\text{ px}$); icon buttons have explicit `aria-label` attributes.
* **Actual Result:** Several action buttons use `min-h-[36px]` (e.g. `EvaluationDecisionCockpit.tsx:619, 635`); emoji icons (`<span>📊</span>`, `<span>⚡</span>`, `<span>📥</span>`) lack descriptive screen-reader text.
* **Evidence:**
  - `EvaluationDecisionCockpit.tsx` lines 619, 635 (`min-h-[36px]`).
* **Affected Layer:** UI / Accessibility & Mobile Usability
* **Security Impact:** None.
* **Financial Impact:** None.
* **User Impact:** Accidental mis-clicks on mobile devices; screen readers announce raw unlabelled characters.
* **Regression Risk:** Very Low.
* **Likely Root Cause:** Desktop-first CSS sizing applied to utility buttons.
* **Recommended Next Action:** Standardize all clickable action buttons to `min-h-[44px]` and add `aria-label` to icon-only triggers.

---

### Finding ID: `F-20-06`

* **Severity:** **P4 — Observation (Runtime Deprecation Warning)**
* **Persona:** Platform Developers / CI Pipeline
* **Route:** Build Toolchain / Test Scripts
* **Precondition:** Executing tests under Node.js `v24.x`.
* **Exact Steps:**
  1. Run `pnpm test:functions`.
* **Expected Result:** Test suite passes with zero warning logs.
* **Actual Result:** Test passes completely (42/42), but logs Node deprecation warning:
  `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities...`
* **Evidence:**
  - `scripts/test-functions.ts` line 25 invokes child process with `shell: true`.
* **Affected Layer:** Platform Scripts (`scripts/`)
* **Security Impact:** Low (developer test script only).
* **Financial Impact:** None.
* **User Impact:** None on end users.
* **Regression Risk:** Very Low.
* **Likely Root Cause:** Stricter child process argument validation introduced in Node.js 24.
* **Recommended Next Action:** Update `scripts/test-functions.ts` to pass arguments as an array to `execFile` or `spawn` without `shell: true`.
