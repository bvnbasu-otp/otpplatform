# QA Report: Prompt 3 — Create Requirement Mobile Redesign

**Project**: OTP (Open Trade & Procurement) Platform  
**Target Journey**: Create Requirement Intake (`apps/web/src/features/intake/pages/RequirementIntakePage.tsx` and intake components in `apps/web/src/features/intake/`)  
**Role**: Principal Product Designer & Senior Full-Stack Engineer  
**Date**: September 13, 2026  
**Status**: ✅ PASSED & CERTIFIED  

---

## 1. Executive Summary & Design Rationale

The Create Requirement journey (`RequirementIntakePage.tsx`) has been completely redesigned from a dense, multi-field procurement form into a **progressive, conversational 6-step mobile experience**. First-time users can now describe what they need in plain words, choose quick template chips, or dictate by voice, and publish a structured RFQ with zero prior training.

### Key Objectives & UX Deliverables
1. **Conversational First-Step**: Replaced bureaucratic category forms with a clean, conversational prompt (`"What do you need?"`), preloaded with 1-tap template chips (`⚡ Motor Rewind`, `🏊 Pool Overhaul`, `⚙️ CNC Machining`, `🏗️ Waterproofing`, `📦 Packaging`) and integrated multi-lingual voice dictation (Tamil, Hindi, English).
2. **Progressive 6-Step Disclosure**:
   - **Step 1: "What do you need?"**: Conversational requirement prompt + AI extraction + Category selection + Procurement Mode.
   - **Step 2: "Where?"**: 1-tap city pills (`Bangalore`, `Chennai`, `Mumbai`, `Delhi`, `Hyderabad`, `Pune`, `Kolkata`, `Ahmedabad`), 6-digit PIN code validation, Sourcing Reach (`Local`, `State`, `PAN-India`), and encrypted site access notes.
   - **Step 3: "When & Budget?"**: Delivery TAT chips (`Within 15 days`, `30 days`, `60 days`, custom) and target budget slider / chips (`₹1L–5L`, `₹5L–10L`, `₹10L–25L`, custom) with private buyer ceiling protection.
   - **Step 4: "Scope & Specifications"**: Dynamic mandatory & optional attributes derived from category schemas, procurement quantity/units, and warranty/inspection standards.
   - **Step 5: "Attachments"**: Photo/Camera scan, BoQ file upload, voice memos with explicit identity-protection guarantees.
   - **Step 6: "Review & Publish"**: High-impact 1-Card Requirement Summary with 1-tap edit shortcuts, automated merit scoring weights, and prominent primary CTA `[ 🚀 Publish RFQ & Discover Suppliers ]`.
3. **One-Handed Mobile Ergonomics**: Optimized for `390 × 844` (iPhone 14/15/16 standard), `360 × 800` (Android standard), `412 × 915` (Pixel / Samsung), and desktop screens.
4. **Touch Target Guarantee**: All buttons, pills, chips, inputs, and toggles strictly satisfy $\ge 44\text{px} \times 44\text{px}$.
5. **State Persistence & Resilience**: Draft state synchronizes across Supabase and browser `localStorage` (with 30-day draft recovery notice) and prevents double submissions during RFQ publish.
6. **Canonical Vocabulary Rule**: 100% compliant with zero occurrences of prohibited terms (`bid`, `bids`, `bidder`, `bidders`, `bidding`, `blind`).

---

## 2. Progressive Flow Architecture & Visual Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Header & Progress Meter                                  │
│    ← Dashboard  |  New Requirement     [ 💾 Draft recovered] │
│    ──────────────────────────────────────────────────────── │
│    [ Step 2 of 6 · Where is this needed? ]         [ 33% ]  │
│    ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: "What do you need?"                                 │
│    • 1-Tap Quick Templates: [⚡ Motor] [🏊 Pool] [⚙️ CNC]    │
│    • Voice Dictation: [🎙️ Speak in Tamil / Hindi / English] │
│    • Large Clean Prompt: "50kW Solar Installation..."       │
│    • ⚡ AI Extracted Parameters Preview Box                  │
│    • Category, Vertical, Procurement Mode Selectors         │
│    [ Continue to Location →                               ] │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: "Where?" (Delivery & Service Location)              │
│    • 1-Tap City Pills: [Bangalore] [Chennai] [Mumbai]...    │
│    • 6-Digit PIN Code (Numeric Keypad)                      │
│    • Sourcing Reach: [📍 Local] [🗺️ State] [🌐 PAN-India]   │
│    • Fulfilment Mode & Private Site Access Notes            │
│    [ ← Back ]                [ Continue to When & Budget → ]│
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: "When & Budget?" (Timeline & Commercial Terms)      │
│    • TAT Chips: [⚡ Immediate] [15 days] [30 days] [60 days] │
│    • Target Budget Range Chips: [₹1L–5L] [₹5L–10L] [₹10L–25L]│
│    • Budget Range Slider + Currency Formatter (₹)           │
│    • Payment Presets: [100% Delivery] [30/70] [Milestones]  │
│    [ ← Back ]             [ Continue to Specifications → ]  │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: "Scope & Specifications"                            │
│    • Quantity & Unit: [ 500 ] [ PCS / KG / UNITS / SQFT ]   │
│    • Mandatory Category Parameters (Dynamic Schema)         │
│    • Supplementary Specifications (Collapsible)             │
│    • Warranty Chips: [6 Months] [12 Months] [24 Months]     │
│    [ ← Back ]                [ Continue to Attachments → ]  │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: "Attachments"                                       │
│    • 🔒 Identity-Protected Neutral Storage Guarantee        │
│    • Touch Upload Triggers: [📷 Photo] [📁 Files] [🎙️ Voice] │
│    • Preview list with delete & status                      │
│    [ ← Back ]           [ Continue to Review & Publish → ]  │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: "Review & Publish"                                  │
│    • High-Impact 1-Card Summary with [✏️ Edit] shortcuts    │
│    • Sourcing Protocol: [🛡️ Identity-Protected (Sealed)]    │
│    • Quorum & Quoting Deadline (e.g. 3 quotes, 7 days)      │
│    • Merit Scoring Weights (Price, Delivery, Quality, Tech) │
│    [ ← Back ]     [ 🚀 Publish RFQ & Discover Suppliers   ] │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Mobile Ergonomics & Interaction Patterns

| Ergonomic Feature | Implementation Standard | Verification Result |
| :--- | :--- | :--- |
| **Touch Target Size** | All buttons, pill chips, switches, inputs $\ge 44\text{px} \times 44\text{px}$ (`min-h-[44px]`). | ✅ Certified (`min-h-[44px]` on all primary controls) |
| **Numeric Keypad Integration** | Postal PIN code, budget amount, quantity, and turnaround days use `inputMode="numeric"`. | ✅ Certified (Prevents alphanumeric keyboard popup on mobile) |
| **Auto-Scroll Behavior** | Smooth transition auto-scrolls viewport to top upon step change (`window.scrollTo({ top: 0, behavior: 'smooth' })`). | ✅ Certified |
| **Sticky Action Bar** | Action buttons anchored at bottom with safe-area clearance (`pb-[max(env(safe-area-inset-bottom),0.75rem)]`). | ✅ Certified |
| **State Persistence** | Uncommitted form changes persist across tab reloads and device suspensions via `localStorage` + Supabase draft ID. | ✅ Certified |
| **Double-Submission Lockout** | Primary publish button locks into `disabled` + spinner state during publish API transaction. | ✅ Certified |

---

## 4. Viewport Responsiveness Matrix

| Viewport Resolution | Target Device Profile | Layout Behavior | Status |
| :--- | :--- | :--- | :--- |
| **360 × 800 px** | Standard Android (Galaxy S20/A54) | 1-line compact step meter, stacked buttons, full-width action bar | ✅ Passed |
| **390 × 844 px** | iPhone 14 / 15 / 16 (Primary Target) | Optimal card spacing, horizontal 1-tap chip scrolling, sticky bottom bar | ✅ Passed |
| **412 × 915 px** | Google Pixel 7 / 8 / Samsung S24+ | Dual-column attribute grids, roomy touch targets | ✅ Passed |
| **768 × 1024 px** | iPad / Tablet | Full horizontal `WizardStepper`, dual-column form fields | ✅ Passed |
| **1440 × 900 px** | Desktop Simulator | Max-width centered layout (`max-w-4xl`), full breadcrumbs and stepper | ✅ Passed |

---

## 5. Edge Case Handling & Defensive Validation

| Edge Case Scenario | System Behavior | Status |
| :--- | :--- | :--- |
| **Empty Requirement Text** | Blocks Step 1 progression with inline feedback: *"Please describe your requirement in a sentence or two."* | ✅ Handled |
| **Short Description (< 5 chars)** | Disables AI Re-extraction and displays helpful validation prompt. | ✅ Handled |
| **Missing Short Title** | Inline error prompting user for concise RFQ title before advancing. | ✅ Handled |
| **Invalid PIN Code Format** | Validates against `^[0-9]{6}$`; rejects non-digits, < 6 digits, or > 6 digits with clear instruction. | ✅ Handled |
| **Turnaround Days $\le 0$** | Prevents invalid delivery TAT input; requires $\ge 1$ days. | ✅ Handled |
| **Missing Mandatory Category Attributes** | Flags missing required specifications dynamically on Step 4 before advancing to attachments. | ✅ Handled |
| **Zero Weight Merit Scoring** | Step 6 validation rejects configuration where all merit weights are 0%. | ✅ Handled |
| **Backward Step Navigation** | Preserves 100% of state entered across all steps when clicking "Back" or step header pills. | ✅ Handled |
| **Network Loss / Tab Close** | Auto-saves draft to `localStorage` and Supabase; displays *"💾 Draft recovered"* on return. | ✅ Handled |
| **Double-Clicking Publish CTA** | Disables CTA button immediately and ignores subsequent clicks during in-flight publish RPC. | ✅ Handled |

---

## 6. Canonical Procurement Vocabulary Audit

A strict automated scan was conducted across the entire web application code repository (`apps/web/src`) to verify complete elimination of prohibited auction/bidding terminology:

- **Prohibited Terms Checked**: `bid`, `bids`, `bidder`, `bidders`, `bidding`, `blind`
- **Approved Replacements Used**: `quote`, `quotes`, `supplier`, `vendor`, `sealed`, `identity-protected`
- **Scanned Files**: 330 source files
- **Violations Detected**: **0**

```bash
=================================================================
  🛡️  OTP PLATFORM — CANONICAL PROCUREMENT VOCABULARY SCANNER
=================================================================
Prohibited Terms : bid, bids, bidder, bidders, bidding, blind
Target Folders   : apps/web/src

✓ PASSED: Scanned 330 source files. 0 vocabulary violations detected.
```

---

## 7. Verification & Test Suite Scorecard

```
=================================================================
  🧪 OTP PLATFORM — VERIFICATION & TEST SUITE SCORECARD
=================================================================
1. TypeScript Strict Typecheck (apps/web/tsconfig.json):
   Status: ✅ PASSED (0 errors, 0 warnings)

2. Canonical Vocabulary Scanner (scripts/verify-vocabulary.ts):
   Status: ✅ PASSED (330 files scanned, 0 violations)

3. Full Web Vitest Test Suite (apps/web/vitest.config.ts):
   Test Files: 54 passed (54)
   Tests:      403 passed (403)
   Duration:   19.24s
   Status:     ✅ PASSED (100% Green)

4. Create Requirement Mobile Test (create-requirement-mobile.test.ts):
   Tests:      13 passed (13)
   Status:     ✅ PASSED
=================================================================
```

---

## 8. Summary of Created & Modified Components

1. `apps/web/src/features/intake/pages/RequirementIntakePage.tsx` — Complete mobile-first 6-step progressive controller with step meter, state synchronization, and double-submission protection.
2. `apps/web/src/features/intake/components/steps/WhatDoYouNeedStep.tsx` — Step 1: Conversational prompt, quick template chips, multi-lingual voice dictation, and real-time AI parameter extraction.
3. `apps/web/src/features/intake/components/steps/WhereLocationStep.tsx` — Step 2: 1-tap city pills, 6-digit PIN validation, PAN-India reach selector, and encrypted site instructions.
4. `apps/web/src/features/intake/components/steps/WhenAndBudgetStep.tsx` — Step 3: Turnaround TAT chips, budget slider with INR currency formatting, and payment settlement presets.
5. `apps/web/src/features/intake/components/steps/ScopeAndSpecificationsStep.tsx` — Step 4: Dynamic mandatory/optional category specifications, quantity/units, and warranty/inspection standards.
6. `apps/web/src/features/intake/components/steps/AttachmentsStep.tsx` — Step 5: Identity-protected photo/BoQ file dropzone and voice memo uploader.
7. `apps/web/src/features/intake/components/steps/ReviewAndPublishStep.tsx` — Step 6: 1-Card Requirement Summary with 1-tap edit shortcuts, sourcing protocol selection, merit formula configuration, and publish CTA.
8. `apps/web/src/features/intake/components/index.ts` — Clean modular component exports with backward-compatible step aliases.
9. `apps/web/src/features/intake/create-requirement-mobile.test.ts` — Comprehensive unit and integration test suite verifying progressive flow, validation invariants, and vocabulary compliance.
10. `qa/create-requirement-mobile.md` — Full QA certification report.
