# R2-31 Phase 1 — Decision Log

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Git HEAD (this pass):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Working tree:** Dirty — modified `AwardPage.tsx`, `DecisionReceiptCard.tsx`, `SiteHeader.tsx`, `SiteLayout.tsx` (not reverted). Untracked Golden Reconstruction / scripts files. **No source edits in Phase 1.**

**Migrations opened (read-only):** `00168_phase5b_statutory_gst_and_tax_splitting.sql`, `00173_phase5c4_tds_change_orders_and_reconciliation.sql`, `00176_phase5d_double_entry_financial_ledger.sql`, `00181_phase6_group4_wallet_and_rewards.sql`, `00216_verified_remediation_p0_p1_security_integrity.sql`, `00220_supplier_wallet_ledger_events.sql`, `00221_otp_referral_bonus_profile_matrix.sql`. **No `00222` SQL file created.**

---

## Contradiction resolutions

### C-01 — Dual Decision Receipt (ORANGE)

| Decision | Detail |
|----------|--------|
| **Canonical type** | `CanonicalDecisionReceipt` in `packages/domain/src/types/decision-receipt.ts` |
| **Deprecate as integrity root** | Web `buildDecisionReceipt` / `DecisionReceipt.tsx` — narrative appendix only |
| **A4 kind** | `DECISION_RECEIPT` in `procurement-document.ts` — single print face |
| **DecisionReceiptCard** | Wire on Award/Reveal/Evaluation in implementation; today unused on pages |
| **Historical readability** | Live DB award/quote rows remain readable; pre-snapshot receipts are **not** integrity-verifiable |
| **Migration** | Not required for type unification; **00222** stores issued payload (see schema doc) |

**Doc conflict:** `R2-31-03` Phase 1 said “no migration for basic wiring.” Phase 1 design **requires 00222** for C-09 immutability — reconciled: wiring can start without 00222 but **certification** of historical test requires 00222.

---

### C-02 — Digest mechanisms (ORANGE/YELLOW)

| Decision | Detail |
|----------|--------|
| **User-visible integrity** | `computeDecisionReceiptHash` / `verifyDecisionReceiptIntegrity` only |
| **Retire from UX** | `computeReceiptAuditHash` (`pdf-generator.ts`) — keep for tests, block user messaging |
| **Truthful label** | “Integrity digest (OTP internal algorithm)” — not HMAC-SHA256, not legal signature |
| **Primitive** | `computeDeterministicHmac` from `procurement-communications.ts` |

---

### C-03 — Referral 10% vs 00221 matrix (BLUE)

| Decision | Detail |
|----------|--------|
| **Authoritative** | `00221` / `persona-wallet.ts` matrix — **unchanged** |
| **10% module** | `referral-incentive.ts` — pilot/commercial simulation; **does not** drive wallet RPC |
| **Cleanup** | Mark legacy in header; fix dashboard JSX comments; align `getReferralCreditDisplay` notice; keep tests as **simulation** suite — see taxonomy doc |
| **00221** | **Do not modify** |

---

### C-05 — Signature wording (ORANGE)

| Decision | Detail |
|----------|--------|
| **Standard phrase** | Integrity digest — tamper-evident check using OTP’s internal algorithm. **Not** a statutory digital signature under IT Act eSign/DSC. |
| **Targets** | `DecisionReceipt.tsx`, `DecisionReceiptCard.tsx`, `AwardPage.tsx` approval copy, A4 `verification` block |
| **Contracts** | `generateContractSignatureHash` — “acknowledgment digest on contract text” |

---

### C-06 — Fabricated savings/compliance (ORANGE)

| Decision | Detail |
|----------|--------|
| **Remove** | `estimatedSavings` (12.5%) and `complianceScorePercent` (100) from canonical `PurchaseOrdersPage` / `AnalyticsCards` report model |
| **No replacement formula** | Unless `procurement_performance_records` wired with explicit definition later |
| **Print path** | Already clean — no change required for `PrintableProcurementReport` |

---

### C-08 — Tax invoice A4 (YELLOW)

| Decision | Detail |
|----------|--------|
| **Data source** | Approved invoice + `tax_snapshot` + line items (`invoices.ts`) |
| **Renderer** | `TAX_INVOICE` via existing engine |
| **Label** | Bilateral tax summary — not e-invoice |
| **No statutory claims** | No IRN/GSP |

---

### C-09 — Issued snapshots (ORANGE)

| Decision | Detail |
|----------|--------|
| **Required** | Yes — code has no persistence; dynamic reprint violates protected-identity proof |
| **Vehicle** | Proposed migration **00222** only in markdown |
| **Hooks** | Award lock, PO issue, invoice approve, settlement cert generation (implementation phase) |

---

### C-10 — Platform-fee wallet spend (YELLOW)

| Decision | **DEFER WITH COPY/CONTRACT CLARIFICATION** |
|----------|------------------------------------------|
| **Evidence** | Only `apply_wallet_credits_to_subscription_atomic` in SQL (`00181`, `00216`); invoked from `apps/web/src/features/subscription/api/subscription.ts` |
| **Not chosen** | IMPLEMENT IN R2-31 — would change locked wallet spend semantics |
| **Not chosen** | ALREADY IMPLEMENTED — fee debit RPC absent |
| **R2-31 action** | Align `OtpWalletCreditsWidget`, charter, pricing copy to **subscription (+ RFQ top-up where already allowed)** until a dedicated wallet economics release adds fee RPC |

---

## Self-audit (all must be NO)

| Question | Answer |
|----------|--------|
| Wallet redesigned? | **NO** |
| Supplier Cashback introduced? | **NO** |
| Referral matrix changed? | **NO** |
| 10% treated as authoritative for credits? | **NO** |
| Legal signature claimed on PDFs? | **NO** (design forbids) |
| Invented GST/e-invoice? | **NO** |
| Historical docs mutable by design? | **NO** (00222 immutability proposed) |
| Second document engine? | **NO** |
| Wallet mixed with GMV? | **NO** |
| OTP revenue mixed with settlement? | **NO** |
| Supplier-private data leak in design? | **NO** |
| Governance leak to suppliers? | **NO** |
| `00222` SQL file created? | **NO** |
| Source modified in Phase 1? | **NO** (docs only) |
| Commit / deploy / ONDC started? | **NO** |

---

## Additional locked decisions

- **ONDC:** Out of scope.  
- **Persona boundaries:** Unchanged from wallet certification.  
- **Supplier Success Reward:** ₹100 on settled platform fee — unchanged.  
- **Engine:** `PrintableProcurementDocument` + `procurement-document.ts` + `po-document.ts` only.

---

**End decision log.**
