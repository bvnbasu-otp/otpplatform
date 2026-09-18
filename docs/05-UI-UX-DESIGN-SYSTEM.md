# 05. UI/UX Design System & Experience Specifications

## 1. Design Philosophy & Tone

The OTP Platform user interface is designed for **institutional authority, transparent decision-making, zero friction, and mobile-first operational excellence**:
- **Palette**: Slate and zinc neutrals paired with emerald accents (`#059669` / `#10b981`) for verified trust, indigo/purple for market intelligence, and amber/rose badges for review and contract gates.
- **Typography**: Highly legible system font stack (`Inter`, `-apple-system`, `sans-serif`) with monospace numbers (`font-mono`) for currency amounts, GSTINs, HSN codes, and quotation codes.
- **Density & Viewport Optimization**: High-information density tailored for commercial decision-makers with `100dvh` responsive shells, collapsible technical spec drawers, and form accordion virtualization for complex 30+ field specifications.
- **Responsive Architecture**: 100% mobile-first PWA. Works seamlessly on smartphones for on-site facility managers, contractors in the field, and executive committee tablets/desktops.

---

## 2. Key Screen Specifications

### 2.1 Multimodal Intake & Specification Builder (`/requirements/new`)
- **Modality Switcher**: One-click switching between Voice Dictation, Free-Text NLP Parsing, Document Upload, and Camera Photo Capture.
- **Instant Keyword & Quantity Extractor**: Real-time extraction of quantities, units (`L`, `KG`, `M`, `SQFT`, `HP`, `NOS`), and BIS attributes.
- **Inline Editing with Authority Boundary**: Pre-populated fields are presented with interactive quantity steppers and unit dropdowns, requiring explicit buyer confirmation before RFQ generation.
- **Starter Template Drawer**: Quick-load templates for standard institutional projects (Solar EPC, Commercial RO Plants, CCTV Surveillance, Gas Piping, Modular Furniture).

### 2.2 The 15-Step Linear Stage Navigator (`<ProcurementStageNavigator />`)
- **Monotonic Stepper**: Visual progress tracker showing steps 1 to 15 with dedicated icons and state badges.
- **Safe Historical Inspection**: Clicking completed historical steps loads the view in read-only audit mode without regressing the underlying state machine.

### 2.3 The Identity-Protected Quote Comparison Room (`/rfq/:rfqId/evaluation`)
- **Sealed Supplier Cards**: Displays cryptographic pseudonyms (`Supplier T74M`, `Supplier 9K2X`, `Supplier A7K3`) with distinct avatar badges.
- **Vendor Master Intelligence (VMI) Coarse Badges**: Displays anonymized performance badges (`EXEMPLARY`, `4.8 - 5.0 ★`, `95%+ On-Time`, `50+ Orders`) ensuring zero boutique vendor fingerprinting.
- **Side-by-Side Spec Diffing**: Highlights variances against Indian Standards baselines (e.g. panel efficiency, pipe gauge, warranty duration).
- **Multi-Factor Score Gauge**: Displays commercial vs technical vs SLA vs VMI score breakdown (e.g. 50/20/15/15 + GST bonus).

### 2.4 The Committee Voting & Enterprise Approval Room (`/rfq/:rfqId/committee`)
- **Conflict of Interest Gate**: Modal dialog requiring explicit sign-off before viewing normalized quotations.
- **Weighted Tally Board**: Real-time progress bar displaying voter turnout and quorum thresholds.
- **Enterprise Approval Matrix Banner**: Displays active approval tier (Tier 1 Manager `<₹5L`, Tier 2 VP `₹5L-₹25L`, Tier 3 CFO `>₹25L`), approver role requirements, and digital sign-off actions.

### 2.5 Contract Gate & Mutual Reveal Modal (`/rfq/:rfqId/contract`, `/rfq/:rfqId/reveal`)
- **Step 11 Contract Gate**: Interactive markdown contract viewer with SHA-256 document checksum and digital signature pad for authorized signatories.
- **Step 12 Mutual Reveal Certificate**: Irrevocable unmasking certificate displaying winner legal entity, GSTIN, phone, and billing details.
- **Web Share Action**: Native `navigator.share` integration for mobile sharing of award receipts, with automatic clipboard copy fallback.

### 2.6 Progressive Milestone Inspection & Dispute Console (`/purchase-orders/:poId`)
- **5-Point Inspection Checklist**: Interactive check-cards for Materials, Dimensions, Functional Testing, Safety, and Workmanship with photo evidence upload.
- **Dispute Exception Sheet**: Slide-over drawer to file disputes across 7 artifact types with 4 severity levels and real-time SLA countdown timers.

### 2.7 Super Admin Operations Console (`/admin`)
- **Multi-Tab Command Center**: Live Buyer Orders, Seller Orders, System Health, Support Tickets, Service Actions, Pre-Production Test Runner (1,355 Vitest tests), Buyer/Seller Debuggers, SQL Query Terminal, Database Backup/Restore, and Audit Logs.

---

## 3. Device Capabilities & Privacy Hardening

Implemented in `apps/web/src/hooks/useDeviceCapabilities.ts`:
1. **Camera Hardware Teardown**: Direct camera capture for site inspection photos and delivery receipts. On component unmount, all active media stream tracks are explicitly stopped (`track.stop()`) to release device hardware.
2. **Microphone Hardware Teardown**: Voice requirement dictation with immediate audio track teardown upon recording completion.
3. **Geolocation Fallback**: High-accuracy browser geolocation with smooth, graceful fallback to manual Indian PIN-code entry if permission is denied.
4. **Web Share API**: Native OS share sheet invocation on mobile browsers with clipboard fallback for desktop environments.
5. **Network Awareness**: Live connection state monitoring (`navigator.onLine`) with offline notification banners.
6. **Zero-PII Error Handling**: Global React Error Boundary stripping emails, phone numbers, and auth tokens before logging.
