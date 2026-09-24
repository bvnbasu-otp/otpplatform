# OTP Risk & Dependency Register with Red-Team Audit (R2)
**Document Identifier:** `OTP-RECON-R2-RISK-AND-DEPENDENCY-REGISTER`  
**Version:** 1.0 (Authoritative R2 Risk Blueprint)  
**Status:** SUPREME RISK MANAGEMENT & RED-TEAM SECURITY REGISTER  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migration:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Operating Invariant:** *EVERY RISK IDENTIFIED MUST HAVE A FORMAL PREVENTIVE CONTROL, AUTOMATED DETECTION MECHANISM, AND CHECKPOINT GATE.*

---

## 1. Executive Summary & Risk Management Framework

The **OTP Risk and Dependency Register** identifies, quantifies, and establishes concrete mitigations for all technical, architectural, security, financial, governance, and user experience risks associated with executing the **OTP Golden Reconstruction v1**.

Every risk is bound to:
1. **Severity & Likelihood:** Evaluated on standard risk matrices ($\text{Risk Score} = \text{Severity} \times \text{Likelihood}$).
2. **Preventive Cryptographic / Architectural Controls:** Automated structural safeguards preventing risk materialization.
3. **Automated Detection Signals:** Explicit test suites and static analysis tools alerting to regressions.
4. **Checkpoint Gate Binding:** The human review barrier (Gate A through F) responsible for formal verification.
5. **Rollback & Contingency Runbooks:** Step-by-step recovery plans if an anomaly is detected.

---

## 2. Master Technical, Security, Financial & Governance Risk Register

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MASTER RISK EVALUATION MATRIX                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Risk ID | Risk Category | Threat Scenario & Description | Severity | Likelihood | Preventive Mitigation Strategy | Detection Signal | Checkpoint Gate |
| :---: | :--- | :--- | :---: | :---: | :--- | :--- | :---: |
| **RSK-01** | **Security / Identity** | Supplier contact, GSTIN, or legal name leaks to buyer prior to post-award reveal via client joins or console logs. | **CRITICAL** | Low | Enforce PostgreSQL masked view `rfq_quotes_identity_protected` and domain memory guard `assertIdentityProtectedPayloadSafe()`. | `blind-rfq-engine.test.ts` | **Gate B & D** |
| **RSK-02** | **Governance / RWA** | Quorum bypass by a corrupt committee member executing direct RPC call without $\ge 2$ unconflicted votes. | **CRITICAL** | Low | Database RPC `lock_and_reveal_award_atomic` mathematically asserts count of unconflicted votes $\ge 2$; throws `P0001` if unsatisfied. | `failure-paths-regression.test.ts` | **Gate B & C** |
| **RSK-03** | **Governance / RWA** | Facility/Estate Manager attempting to cast committee votes or sign procurement awards. | **HIGH** | Low | RPC `submit_committee_vote_atomic` rejects votes where `role = 'MANAGER'` with database exception. | `governance-immutability.test.ts` | **Gate C** |
| **RSK-04** | **Governance / MSME** | Delegated employee approving an RFQ exceeding their configured monetary `spend_cap_amount`. | **HIGH** | Low | `submit_rfq_tier_approval_atomic` checks transaction amount against `organization_delegations.spend_cap_amount`. | `c84-spend-approval-*.test.ts` | **Gate C** |
| **RSK-05** | **Governance / MSME** | Anti-self-approval violation where the creator of an RFQ attempts to approve their own request. | **CRITICAL** | Low | Database trigger compares `auth.uid()` against `rfqs.created_by` and throws exception on match. | `c84-spend-approval-*.test.ts` | **Gate C** |
| **RSK-06** | **Audit / Immutability** | Officer succession retroactively mutating historical signing human IDs on past Decision Receipts. | **CRITICAL** | Low | Migration 00197 stores effective dates (`effective_from`, `effective_to`); trigger `prevent_mutation_org_governance_audits` blocks updates/deletes. | `org-role-lifecycle-service.test.ts` | **Gate B** |
| **RSK-07** | **Financial / Payout** | Premature PO issuance or milestone payout to an unverified supplier lacking KYC/GSTIN. | **CRITICAL** | Low | Fail-closed 2-stage verification gate in `lock_and_reveal_award_atomic`; halts reveal and routes to onboarding gate. | `supplier-award-onboarding.test.ts` | **Gate B & E** |
| **RSK-08** | **Financial / Tax** | Modification of buyer profile address cascading to rewrite delivery address on past statutory tax invoices. | **HIGH** | Low | RFQs and POs capture frozen JSONB snapshots (`delivery_address_snapshot`, `tax_breakdown_snapshot`) at creation time. | `address-book-and-persona.test.ts` | **Gate D & E** |
| **RSK-09** | **Financial / Balance** | GAAP double-entry journal imbalance ($\sum \text{Debits} \ne \sum \text{Credits}$) or platform fee calculation drift. | **CRITICAL** | Low | `AccountingService` enforces balanced ledger entries in `financial_ledger_entries`; automated trial balance verification. | `double-entry-ledger.test.ts` | **Gate E** |
| **RSK-10** | **UX / Mobile** | Floating CTA buttons obscuring form inputs or confirmation triggers on small smartphone screens ($360\text{px}-414\text{px}$). | **HIGH** | Medium | Layout container enforces `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`; unified `MobileActionFooter` with safe-area insets. | `quote-comparison-mobile.test.ts` | **Gate D** |
| **RSK-11** | **Product / Scope** | Enterprise pricing cards, signup selectors, or SAML configurations leaking into customer-facing UI. | **MEDIUM** | Low | Permanent purge of Card 3 from `PricingPage.tsx`, removal of `ENTERPRISE` option from `BuyerRegisterForm.tsx`, theme string cleanup. | `pricing-entitlement-redteam.test.ts` | **Gate D** |
| **RSK-12** | **Technical / Demo** | Hardcoded pilot data (`getPilotByRfqId`) or demo provider state polluting live customer RFQ dashboards. | **MEDIUM** | Low | Purge `lib/pilots.ts` fallback; isolate `<DemoModeProvider>` strictly under `/demo`; relocate quote simulation to Superadmin. | `demo-scenario.test.ts` | **Gate D** |
| **RSK-13** | **Messaging / Trust** | Outbound invitations prematurely claimed as "Delivered" without verified messaging gateway receipt. | **MEDIUM** | Low | Enforce 8-state notification lifecycle: status remains `DISPATCH_REQUESTED` until `messaging-inbound` HMAC webhook receipt. | `notification-queue-worker.test.ts` | **Gate D** |
| **RSK-14** | **Taxonomy / Sourcing** | Free-text category inputs in intake diverging from database taxonomy tables, resulting in empty supplier matches. | **MEDIUM** | Low | Bind intake category dropdowns directly to `taxonomy_categories` Supabase API; NLP parser maps text prompts to valid keys. | `taxonomy-cache.test.ts` | **Gate D** |
| **RSK-15** | **Security / Admin** | Unauthorized user attempting privilege escalation to platform Superadmin or mutating admin whitelist. | **CRITICAL** | Low | Database trigger `trg_protect_platform_admin` in `private_security` schema enforces whitelist immutability. | `admin.test.ts` | **Gate B** |
| **RSK-16** | **Telemetry / Privacy** | Personally Identifiable Information (PII) or customer phone numbers leaking into UX analytics event streams. | **HIGH** | Low | Partition telemetry into 3 distinct domain topics; scrub all payload strings before dispatching to UX sinks. | `ux-telemetry-abstraction.test.ts` | **Gate D** |
| **RSK-17** | **Database / Ceiling** | Accidental introduction of Migration `00198+` or tampering with historical migrations `00001` through `00197`. | **CRITICAL** | Low | Strict architectural invariant: migration ceiling locked at `00197`; automated migration manifest verification in CI. | `migration-manifest.ts` | **Gate B & F** |
| **RSK-18** | **Build / Regressions** | Accidental regression on existing test suite (>1,514 assertions) during code consolidation and refactoring. | **CRITICAL** | Medium | Continuous execution of package-level test runners and master regression script before sealing each git commit boundary. | `run-master-regression.ts` | **All Gates** |

---

## 3. Red-Team Security & Integrity Findings (20 Potential Failure Modes)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RED-TEAM AUDIT: 20 FAILURE & LEAKAGE MODES                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Failure Mode 1 (Direct Table Join Identity Leak):** Sealed quotes queried directly via Supabase client $\rightarrow$ *Mitigation: Protected Asset PA-04 (Masked view + RLS).*
2. **Failure Mode 2 (Error Stack Trace Leakage):** Backend exceptions exposing vendor contact strings in JSON $\rightarrow$ *Mitigation: Protected Asset PA-05 (`assertIdentityProtectedPayloadSafe`).*
3. **Failure Mode 3 (Quorum Bypass via Direct RPC Call):** Direct call to award lock without committee vote count $\rightarrow$ *Mitigation: Protected Asset PA-01 (Database-level quorum check $\ge 2$).*
4. **Failure Mode 4 (Conflict of Interest Evasion):** Voting without COI declaration $\rightarrow$ *Mitigation: Mandatory COI parameter in `submit_committee_vote_atomic`; recuses voter if affirmative.*
5. **Failure Mode 5 (MSME Spend Cap Split-Order Bypass):** Cumulative spend evading single-order limit $\rightarrow$ *Mitigation: Spend validation against cumulative authorized limits in `SpendApprovalGovernanceService`.*
6. **Failure Mode 6 (Self-Approval by Delegated Member):** Creator approving own RFQ $\rightarrow$ *Mitigation: Protected Asset PA-09 (Database anti-self-approval trigger).*
7. **Failure Mode 7 (Historical Actor Mutability upon Succession):** Officer update mutating historical audits $\rightarrow$ *Mitigation: Protected Asset PA-03 (Migration 00197 immutable audit trigger).*
8. **Failure Mode 8 (PO Issuance to Unverified Supplier):** Instant PO release without KYC $\rightarrow$ *Mitigation: Protected Asset PA-02 (Migration 00196 fail-closed onboarding gate).*
9. **Failure Mode 9 (Address Update Rewriting Past Tax Invoices):** Profile address cascade $\rightarrow$ *Mitigation: Immutable JSONB snapshots frozen on RFQ/PO insert.*
10. **Failure Mode 10 (False Notification Delivery Display):** Optimistic delivery claims $\rightarrow$ *Mitigation: 8-state notification engine updating strictly upon webhook receipt.*
11. **Failure Mode 11 (Static Rates Labeled as Live Market Price):** Misleading market price claims $\rightarrow$ *Mitigation: 4-tier provenance ladder with explicit freshness badges.*
12. **Failure Mode 12 (Mobile Floating Button Obscuration):** Overlapped primary CTAs $\rightarrow$ *Mitigation: Universal `MobileActionFooter` with `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`.*
13. **Failure Mode 13 (Demo / Pilot Data Corrupting Live Reports):** Synthetic GMV pollution $\rightarrow$ *Mitigation: `<DemoModeProvider>` isolated under `/demo`; `d1000000-*` prefix isolation.*
14. **Failure Mode 14 (Cross-Tenant RLS Privilege Escalation):** Tenant data bleeding across orgs $\rightarrow$ *Mitigation: Multi-tenant RLS policies using `auth.uid() IN organization_members`.*
15. **Failure Mode 15 (Double-Entry Financial Rounding Drift):** Fractional paise unbalancing ledger $\rightarrow$ *Mitigation: Protected Asset PA-07 (Double-entry journal balance conservation check).*
16. **Failure Mode 16 (Bilateral GST Miscalculation on Intra/Inter State):** Incorrect CGST/SGST vs IGST $\rightarrow$ *Mitigation: Protected Asset PA-06 (Bilateral GST engine comparing GSTIN vs Pincode).*
17. **Failure Mode 17 (Unauthorized Superadmin Elevation):** Tampering with user admin flags $\rightarrow$ *Mitigation: Protected Asset PA-08 (`private_security.admin_whitelist` + immutability trigger).*
18. **Failure Mode 18 (Client-Side Permission Tampering):** Modifying client state to bypass auth $\rightarrow$ *Mitigation: 13-stage server-side authorization evaluation on all RPCs and API endpoints.*
19. **Failure Mode 19 (Unscrubbed PII in Telemetry Streams):** Customer data leaking to analytics $\rightarrow$ *Mitigation: Telemetry payload regex scrubbing and domain topic partitioning.*
20. **Failure Mode 20 (Database Migration Ceiling Divergence):** Applying uncoordinated migrations $\rightarrow$ *Mitigation: Migration ceiling locked at `00197` with automated manifest checks.*

---

## 4. Inter-Stage Dependency Graph & Critical Path Analysis

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CRITICAL PATH & DEPENDENCY GRAPH                                │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [R2-01: Baseline Lock]
          │
          ▼
  [R2-02: AppShell & Routes] ──────────────────────────┐
          │                                            │
          ▼                                            │
  [R2-03: 13-Stage Auth Engine]                        │
     ├──► [R2-04: Individual Buyer] ──┐                │
     ├──► [R2-05: RWA Governance] ────┼──┐             │
     └──► [R2-06: MSME Delegation] ───┘  │             │
                                         ▼             ▼
  [R2-07: Supplier Network] ────► [R2-09: TELL] ──► [R2-13: Taxonomy]
          │                              │             │
          ▼                              ▼             ▼
  [R2-08: Supplier Onboard] ────► [R2-10: REVIEW] ─► [R2-14: Address Snapshots]
                                         │             │
                                         ▼             ▼
                                  [R2-11: DECIDE] ─► [R2-15: Notifications]
                                         │             │
                                         ▼             ▼
                                  [R2-12: TRACK] ──► [R2-16: Market Intel]
                                         │             │
                                         ▼             ▼
                                  [R2-17: Financial Controls]
                                         │
                                         ▼
                                  [R2-18: Superadmin] ──► [R2-19: Founder Cockpit]
                                         │
                                         ▼
                                  [R2-20: 3-Domain Telemetry]
                                         │
                                         ▼
                                  [R2-21: Enterprise/Demo Cleanup]
                                         │
                                         ▼
                                  [R2-22: Full Regression & Certification]
```

### Critical Path Constraints:
1. **Foundation First:** `R2-01`, `R2-02`, and `R2-03` form the unalterable foundation for all persona and workflow implementations.
2. **Customer Journey Sequencing:** `R2-09` (TELL) $\rightarrow$ `R2-10` (REVIEW) $\rightarrow$ `R2-11` (DECIDE) $\rightarrow$ `R2-12` (TRACK) MUST be executed in exact chronological order.
3. **Core Engine Bindings:** Taxonomy (`R2-13`), Address Snapshots (`R2-14`), Notifications (`R2-15`), Market Intel (`R2-16`), and Financials (`R2-17`) bind into the customer journey before platform control planes are finalized.
4. **Cleanup & Certification:** Cleanup (`R2-21`) and Full Regression (`R2-22`) execute only after all functional capabilities are assembled and verified.

---
*End of OTP Risk & Dependency Register with Red-Team Audit (R2)*
