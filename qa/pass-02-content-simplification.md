# OTP Platform — Pass 2: Content Simplification & UX Optimization Report

**Document ID:** `/qa/pass-02-content-simplification.md`  
**Date:** September 13, 2026  
**Audience:** Product Engineering, UX Architecture, Procurement Operations  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Executive Summary

In Pass 2 of the OTP Simplification Initiative, the platform was refactored to transition from an **information-dense, text-heavy application** to an **intuitive, action-oriented, mobile-first command center** using strict **Progressive Disclosure** principles.

### Key Metrics Before & After:
- **Landing Page Word Count:** Reduced from ~1,850 words to ~420 words (**-77% text reduction**).
- **Hero Layering:** Reduced from 5 competing text layers to the **3-element rule** (What OTP does, Why it matters, 1 Primary CTA).
- **Lifecycle Representation:** Replaced 3 competing models (5-step flow + 12-stage breakdown + 4 phase clocks) with **1 unified 5-step visual flow**.
- **Dashboard Information Architecture:** Converted from static marketing wall to **Command Center hierarchy** (1. Action Required, 2. Quick Express Sourcing, 3. Pipeline Tabs, 4. Dynamic Live Activity Feed).
- **Intake Cognitive Load:** Replaced bulky paragraph example cards with compact 1-click pill templates (`⚡ Motor Rewind`, `⚙️ CNC Shafts`, etc.) and hid the 5-slider scoring matrix behind a `[ ⚙️ Customize Weights ]` toggle.
- **Backend & Database Integrity:** **100% Preserved** (zero schema changes, zero RLS changes, zero breaking API changes).

---

## 2. Pages & Components Changed

| Page / Component | File Path | Type of Modification |
| :--- | :--- | :--- |
| **Site Content Matrix** | `apps/web/src/features/site/content/site-content.ts` | Copy consolidation, hero simplification, removal of defensive hedging copy. |
| **Landing Page** | `apps/web/src/features/site/pages/LandingPage.tsx` | Hero reduction, 5-step visual cards, progressive FAQ link, eliminated redundant 12-stage and 4-phase clock duplicates. |
| **Buyer Dashboard** | `apps/web/src/pages/DashboardPage.tsx` | Command Center refactoring: Action Required alerts, live activity feed, quick workspace tools, shortened action buttons. |
| **Intake Step 1 (Scope)** | `apps/web/src/features/intake/components/steps/ScopeClassificationStep.tsx` | Compact template chips, clean placeholder, progressive AI entity extraction display. |
| **Intake Step 4 (Sourcing)** | `apps/web/src/features/intake/components/steps/SourcingAndReviewStep.tsx` | Smart default scoring weights with progressive disclosure accordion for 5-slider fine tuning. |
| **Purchase Order Detail** | `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx` | Streamlined tax/statutory notices into crisp 1-line compliance badges and action-oriented state triggers. |

---

## 3. Granular Breakdown of Changes

### 3.1. Landing Page (`LandingPage.tsx` & `site-content.ts`)

#### Text Removed:
- **Hero Clutter:** Removed secondary marketing body text and multi-clause disclaimers in the hero header.
- **Redundant 12-Stage Lifecycle List:** Removed the 3-column "Source / Decide / Deliver" card group with 12 nested bullet items that duplicated the 5-step flow.
- **Phase Clocks Box:** Removed the 4-box phase clocks section ("Phase 1: Publishing and Quoting", etc.) that confused first-time buyers with internal timer mechanics.
- **Defensive Caveat Copy:** Removed defensive hedging ("The lowest quote isn't necessarily the best quote...") from the main hero fold.

#### Text Moved:
- **Technical Architecture, Salt/Hash Cryptography, ONDC Protocols:** Moved to `/faqs` with a clean one-line progressive disclosure prompt: `"Looking for technical mechanics, cryptographic hashes, or ONDC discovery protocols? Read Technical Architecture in FAQ →"`.

#### Components Simplified:
- **Hero:**
  - **What OTP Does:** `"Get competitive quotes without revealing identities."`
  - **Why It Matters:** `"Tell us what you need. OTP helps you discover suppliers, compare offers and make a decision."`
  - **Primary CTA:** Embedded `RequirementPrompt` (`[ Start Free → ]` with multilingual regional voice support).
- **5-Step Visual Flow:**
  - `01 Tell us what you need` (1 heading, 1 sentence).
  - `02 Suppliers compete privately` (1 heading, 1 sentence).
  - `03 Compare the offers` (1 heading, 1 sentence).
  - `04 Your team decides` (1 heading, 1 sentence).
  - `05 Award and execute` (1 heading, 1 sentence).

---

### 3.2. Buyer Dashboard (`DashboardPage.tsx`)

#### Text Removed:
- Static marketing sidebars: `"Zero-Fee Direct Settlement (OTP never touches trade funds...)"`.
- Static governance boilerplate: `"Quorum Decision Model: Merit-Based Multi-Criteria..."`.

#### Components Simplified:
- **Top Bar:** Single-row high-density status header with organization name, org type badge, and active subscription countdown badge (`⚡ 30d left`).
- **Hero Action:** `"What do you need?"` 1-box instant AI fast-track procurement bar.
- **Command Center Side Panels:**
  1. **Pipeline Summary:** Live 4-box grid (Active Tenders, Action Required, In Execution, Completed) + 1-click `"Review Pending Actions →"` button.
  2. **Recent Activity Feed:** Real-time event stream showing recent quotes received and milestone updates.
  3. **Workspace Tools:** Direct shortcuts to Team Members and Sourcing Reports.
- **Row Action Buttons:** Shortened into concise, scannable verbs: `Details`, `Matrix`, `Vote →`, `Award →`, `Track Order →`.

---

### 3.3. Requirement Intake Wizard (`ScopeClassificationStep.tsx` & `SourcingAndReviewStep.tsx`)

#### Text & Cognitive Load Reductions:
- **Scope Classification (Step 1):** Replaced 4 full-sentence example paragraphs with 4 compact, iconized template chips:
  - `⚡ Motor Rewind`
  - `⚙️ CNC Shafts`
  - `🧵 Cotton Yarn`
  - `📹 CCTV System`
- **Sourcing & Scoring (Step 4):**
  - Displays smart normalized scoring weights as neat pill badges (e.g. `Price: 50%`, `Delivery: 30%`, `Warranty: 20%`).
  - Hides the complex 5-slider mathematical weighting editor behind a `[ ⚙️ Customize Weights ▼ ]` button. Users only see slider mechanics if they explicitly choose to adjust weights.

---

### 3.4. Purchase Order & Fulfillment (`PurchaseOrderDetailPage.tsx`)

#### Text & UI Streamlining:
- Replaced 4-line legal/statutory warning box with a crisp 1-sentence contract badge:
  `"Direct Contract: This Purchase Order is a binding commercial contract directly between Buyer and Supplier. Settlement occurs directly between parties. [GST Verified ✓]"`
- Retained full contract compliance while eliminating negative emotional friction.

---

## 4. Mobile Responsiveness (390×844 Viewport Optimization)

All modified views adhere strictly to the 390×844 viewport standards:
- **Zero Horizontal Scrolling:** Tables and grids fold cleanly on mobile screens (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`).
- **Primary CTAs Above the Fold:** In the mobile viewport, the primary prompt and `Start Free` buttons appear in the top 300px.
- **Touch Targets:** Buttons and chips maintain a minimum height of 36px with adequate spacing for thumb navigation.
- **Adaptive Font Hierarchy:** Responsive headings (`text-xl sm:text-2xl lg:text-4xl`) prevent awkward line wrapping on small screens.

---

## 5. Functionality Preservation & Regression Verification

### Preserved Subsystems Checklist:
- [x] **Database Schemas & RLS:** All tables, views, and row-level security policies untouched.
- [x] **Authentication & Role Resolution:** `resolvePortalRole()` and JWT claims remain 100% compatible.
- [x] **AI Requirement Parsing:** Rule-based and LLM intake parsers retain full field mapping.
- [x] **Merit-Based Scoring Engine:** Weight normalization and multi-criteria mathematical evaluations function identically.
- [x] **Committee Voting & Quorum:** Weighted ballots, COI declarations, and audit logs remain intact.
- [x] **Identity Protection & Unmasking:** Cryptographic salt-protected alias generation and contract gate unmasking logic preserved.
- [x] **Fulfillment & GST PO Generation:** Status state machines (`DRAFT` → `ISSUED` → `ACCEPTED` → `COMPLETED`) remain functional.

---

## 6. Conclusion

Pass 2 has successfully resolved the text-density and cognitive overload issues diagnosed in Pass 1. The OTP platform now presents a modern, trustworthy, and streamlined experience that empowers buyers to start in seconds while preserving full institutional governance and auditability when needed.
