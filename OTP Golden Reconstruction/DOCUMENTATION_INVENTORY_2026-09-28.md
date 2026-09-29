# OTP Documentation Inventory — 28 September 2026

**Authority:** Level 5 — inventory of documents, not product truth.
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`
**Current entry point:** `OTP Golden Reconstruction/OTP_GOLDEN_DOCUMENT_INDEX.md`

Historical files were not deleted. `Current? = No` means do not treat the file as the baseline for remediation.

## Hierarchy

| Level | Meaning | Where |
| ----- | ------- | ----- |
| 1 | Current product truth | Golden product, UX, public site, supplier, financial, contradiction register |
| 2 | Current technical truth | Procurement state machine |
| 3 | Security and governance | Security baseline, governance model |
| 4 | Pilot and release | Pilot readiness, production verification, issue register, this certification |
| 5 | Historical evidence | This inventory, audit history, docs/00-15, R2 and F and D0 files, containment notes, black-box |
| 6 | Deferred | `OTP_DEFERRED_FEATURES.md` |

## Documents written for this baseline

| Document | Purpose | Current? | Conflicts? | Superseded? | Action |
| -------- | ------- | -------- | ---------- | ----------- | ------ |
| `OTP Golden Reconstruction/OTP_GOLDEN_DOCUMENT_INDEX.md` | Navigation and authority levels | Yes | No | No | Trust this first |
| `OTP Golden Reconstruction/OTP_CURRENT_PRODUCT_TRUTH.md` | What OTP is in this repository | Yes | Records open conflicts | No | Trust for product scope |
| `OTP Golden Reconstruction/OTP_PROCUREMENT_STATE_MACHINE.md` | Customer states and limits | Yes | Internal 15-step engine still exists | No | Trust for lifecycle labels |
| `OTP Golden Reconstruction/OTP_SUPPLIER_NETWORK_TRUTH.md` | Which supplier signals are real | Yes | UI cards disagree | No | Trust over adapter names |
| `OTP Golden Reconstruction/OTP_FINANCIAL_TRUTH.md` | Three money streams | Yes | FIN-1 to FIN-4 open | No | Do not resolve FIN rows |
| `OTP Golden Reconstruction/OTP_SECURITY_BASELINE.md` | Controls and open findings | Yes | Live grants unknown | No | Trust for source findings |
| `OTP Golden Reconstruction/OTP_GOVERNANCE_MODEL.md` | Individual, RWA, MSME | Yes | Two role vocabularies | No | Trust the call-site limits |
| `OTP Golden Reconstruction/OTP_UX_BASELINE.md` | Simplicity principle and observations | Yes | Current UI misses it | No | Intent, not a bug list |
| `OTP Golden Reconstruction/OTP_PUBLIC_SITE_TRUTH.md` | Public pages classified | Yes | Money and legal | No | Trust for logged-out copy |
| `OTP Golden Reconstruction/OTP_MASTER_ISSUE_REGISTER.md` | Issue status | Yes | Old reports say FIXED | No | Trust over R2-31 final column |
| `OTP Golden Reconstruction/OTP_AUDIT_HISTORY.md` | How to read old audits | Yes | Old certificates | No | Read before citing R2 |
| `OTP Golden Reconstruction/OTP_PRODUCTION_VERIFICATION_STATE.md` | Verified versus unknown | Yes | Commit subject overclaims | No | Trust the UNKNOWN rows |
| `OTP Golden Reconstruction/OTP_PILOT_READINESS.md` | Gates | Yes | Older gate-open claims | No | No gate is PASS |
| `OTP Golden Reconstruction/OTP_DEFERRED_FEATURES.md` | Out of pilot scope | Yes | Stubs look like features | No | Do not file these as bugs |
| `OTP Golden Reconstruction/OTP_CONTRADICTION_REGISTER_CURRENT.md` | Open conflicts | Yes | n/a | No | Leave decision rows open |
| `OTP Golden Reconstruction/OTP_DOCUMENTATION_CERTIFICATION_2026-09-28.md` | What this phase did | Yes | No | No | Scope boundary |
| `OTP Golden Reconstruction/DOCUMENTATION_INVENTORY_2026-09-28.md` | This list | Yes | No | No | Use to avoid deleted history |
| `README.md` | Engineer entry point | Yes, as a pointer | Old certification text removed | Replaces prior README claims | Read, then open the golden index |

## docs/ suite

| Document | Purpose | Current? | Conflicts? | Superseded? | Action |
| -------- | ------- | -------- | ---------- | ----------- | ------ |
| `docs/00-DOCUMENTATION-INDEX.md` | Old index. Banner added 28 Sep 2026. Body unchanged. | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/01-PLATFORM-OVERVIEW.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/02-ARCHITECTURE.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/03-DOMAIN-MODEL-AND-STATE-MACHINES.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/04-WORKFLOWS-AND-CALLFLOWS.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/05-UI-UX-DESIGN-SYSTEM.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/06-DATABASE-AND-RLS-POLICIES.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/07-SECURITY-PRIVACY-BACKUP.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/08-DEMO-PILOT-VS-PRODUCTION.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/09-MODULE-FEATURE-SPECIFICATIONS.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/10-DEPLOYMENT-AND-TUNNEL-OPERATIONS.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/11-TESTING-AND-REGRESSION-SUITE.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/12-MAINTENANCE-AND-ALERTS-PIPELINE.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/13-GO-LIVE-AND-PILOT-READINESS-CHECKLIST.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/14-SECURITY-CLEARANCES-AND-PRE-PROD-AUDIT-CHECKLIST.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |
| `docs/STANDALONE-OPERATIONS-RUNBOOK.md` | Historical platform document | No | Yes — 185-migration certification and live-ops claims | Yes, as current truth | Preserve. Do not remediate from it |

## OTP Golden Reconstruction — pre-existing files

Every file below predates this baseline or is evidence (black-box, containment). None is the current product truth.

| Document | Purpose | Current? | Conflicts? | Superseded? | Action |
| -------- | ------- | -------- | ---------- | ----------- | ------ |
| `OTP Golden Reconstruction\32FIX_IMPLEMENTATION_ORDER.md` | 32-issue scoping notes | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\32FIX_MIGRATION_RECONCILIATION_REPORT.md` | 32-issue scoping notes | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\32FIX_OTP_ARCHITECTURE_SCOPING_REPORT.md` | 32-issue scoping notes | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\32FIX_ROOT_CAUSE_MATRIX.md` | 32-issue scoping notes | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\D0-A-Domain-Relationship-Map.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\D0-Canonical-Domain-Glossary.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F1-Repository-Forensic-Inventory.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F2-Route-Screen-Canonicalization-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F3-Enterprise-Dependency-Classification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F4-Test-Demo-Pilot-Staging-Classification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F5-Current-Architecture-vs-Target-Architecture.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F6-Known-Problem-Symptom-to-Root-Cause-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F7-Protected-Backend-Assets.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F8-Reconstruction-Gaps-and-Ambiguities.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\F9-Reconstruction-Readiness-Assessment.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` | Logged-out browser audit, 27-28 Sep 2026 | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\PROD_CONTAINMENT\README.md` | Emergency privilege notes for a database that might be at or before migration 00195. Not a migration. Not proof it was run. | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R1-F8-Contradiction-Decision-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R1-Product-Gap-Closure-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R1-Product-Rule-Traceability-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R1-Reconstruction-Contract.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R1-Target-Architecture.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-02-Global-AppShell-Route-Canonicalization-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-03-Identity-Context-Authorization-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-04-Individual-Buyer-Experience-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-05-RWA-Governance-Experience-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-06-MSME-Spend-Governance-Experience-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-07-Supplier-Network-Engine-Closure-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-07-Supplier-Network-Engine-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-08-Supplier-2-Stage-Lifecycle-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-09-Tell-Multimodal-Requirement-Intake-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-10-Review-4-Pillar-Masked-Comparison-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-11-Decide-Atomic-Award-Decision-Receipt-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-12-Track-Milestone-Inspection-Invoice-Settlement-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-13-Canonical-Taxonomy-Classification-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-14-Address-Book-Operational-Locations-Transaction-Snapshots-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-15-Notification-Engine-Truthful-Delivery-States-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-16-Market-Intelligence-Fallback-Ladder-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-17-Double-Entry-Financial-Settlement-Controls-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-18-Superadmin-Founder-Operational-Oversight-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-19-Enterprise-Demo-Pilot-Isolation-Gap-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-19-Enterprise-Demo-Pilot-Isolation-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Black-Box-Defect-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Black-Box-Product-Audit-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Compatibility-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Cross-Module-Golden-Journey-Certification-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Golden-Path-Evidence.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Identity-Protection-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-20-Release-Gap-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-Compatibility-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-Defect-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-Independent-Release-Hardening-Audit-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-Performance-and-Bundle-Findings.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-Release-Gap-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-Security-and-Dependency-Findings.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-21-UX-Complexity-and-Mobile-Findings.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-22-Surgical-Release-Hardening-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-23-Mobile-First-UX-Golden-UI-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-23-UX-Defect-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-24-Independent-Human-Style-UX-Audit-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-24-UX-Defect-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-25-Compatibility-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-25-Controlled-Modernization-Plan.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-25-Dependency-Modernization-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-25-Runtime-Dependency-Compatibility-Security-Audit-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-25-Security-Vulnerability-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Black-Box-Defect-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Financial-Control-Recertification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Golden-Journey-Recertification-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Independent-Full-Regression-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Mobile-and-UX-Regression-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Release-Readiness-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-26-Security-and-Authorization-Recertification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-BNI-Truthfulness-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Database-Fresh-Start-Reset-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Data-Inventory-PreReset-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Dead-Code-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Final-Certification-Report.md` | Older certification. Read R2-28 before citing. | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Market-Capability-Gap-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-ONDC-Truthfulness-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Product-Owner-Gap-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Referral-Incentive-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Security-RedTeam-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Stub-Simulation-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Subscription-Lifecycle-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Supplier-Network-Completeness-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-27-Visitor-Conversion-Analytics-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-28-Independent-R2-27-Evidence-Audit.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-29-Commercial-Correction-Extra-RFQ-Pricing.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-29-Controlled-Pilot-Mode-and-Referral-Clarification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-29-Final-Pilot-Freeze-and-Activation-Readiness.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-29-Frozen-Pricing-and-Pilot-Activation-Readiness.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30A-Live-Integration-Activation-Evidence.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30B-Pilot-Deployment-and-External-Verification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30C.1-Google-Places-Pilot-Activation-and-Certification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30C-External-Integration-Activation-and-Verification.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30-Consolidated-15-Issue-Remediation-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30D-Promotion-Gate-and-Controlled-Pilot-Deployment.md` | Promotion and certification notes. Not live-database proof. | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30D-Provenance-Cleanup-and-Full-Certification.md` | Promotion and certification notes. Not live-database proof. | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-30-First-Real-World-Pilot-Evidence.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-31-32-Issue-Root-Cause-Remediation-Report.md` | 32-issue remediation evidence at migration 00198. Local only. | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-32-Privileged-RPC-Identity-Masking-Server-Enforcement-Report.md` | Static evidence for migration 00199. Report says the migration was not executed. | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-C2-Founder-Operational-Visibility.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-Checkpoint-Gates.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-Code-Asset-Mapping.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-Database-Control-Mapping.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-Implementation-Sequence.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-Risk-and-Dependency-Register.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-Test-Certification-Plan.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R2-UX-Reconstruction-Matrix.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |
| `OTP Golden Reconstruction\R3-01-Baseline-Verification-Report.md` | Historical reconstruction or audit evidence | No | Possible — session certificates overclaim | Yes, as current truth | Preserve |

## Other markdown

`archive/qa` and `qa/release` hold older QA checklists. They were not rewritten. Treat them as Level 5. A full filename listing of those trees was not required to establish the baseline; they are not authoritative for remediation.

Package and app README files, if any appear later, do not override this index.

