# R2-31 Phase 2A — Report Source-of-Truth Matrix (Design Only)

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Extends:** `R2-31-05-SOURCE-OF-TRUTH-MATRIX.md`, `R2-31-PHASE1-ARCHITECTURE.md` §9

**Rules:** No invented savings (no 12.5%), no 100% compliance KPI, **no Supplier Cashback**. Wallet referral amounts only from `00221` matrix (₹10 / ₹25 / ₹50 / ₹100) — not domain 10% simulation.

---

## 1. Three ledgers (frozen)

| Ledger | Domain tag | Authoritative tables / RPCs | Must never include |
|--------|------------|----------------------------|--------------------|
| **Procurement** | `PROCUREMENT` | `purchase_orders`, `po_line_items`, `work_orders`, `invoices`, `invoice_line_items`, `payments`, `payment_allocations`, `journal_entries` (`00176`), `awards`, `quotes` / views | Wallet credits, referral bonuses, platform fee revenue |
| **OTP revenue** | `OTP_REVENUE` | `platform_fee_transactions`, subscription billing tables, `apply_wallet_credits_to_subscription_atomic` (subscription settlement only) | GMV totals as OTP revenue, supplier disbursements |
| **Wallet** | `WALLET` | `organization_wallets`, `wallet_transactions`, `get_wallet_transactions`, `credit_otp_referral_bonus_atomic` (`00221`), supplier success events (`00220`) | PO GMV, invoice gross as “credits”, Supplier Cashback |

---

## 2. Report catalog

### 2.1 Customer-facing (buyer / supplier org members)

| Report / output | Audience | Authoritative source | Notes |
|-----------------|----------|----------------------|-------|
| Period procurement report (`PrintableProcurementReport`) | Buyer org | `purchase_orders` + org filter | Remove C-06 fake KPIs; no savings % |
| PO list / detail totals | Buyer, supplier (scoped PO) | `purchase_orders`, lines | Not wallet |
| PO A4 / invoice A4 (print) | Buyer, supplier bilateral | **After 00222:** `issued_document_snapshots`; before: live PO/invoice + disclaimer | Tax from `tax_snapshot` on approve |
| Decision receipt (screen/A4) | Buyer; supplier limited | **After 00222:** snapshot payload; facts: `awards` + votes | No committee leak to supplier |
| Wallet statement (Phase C) | Own org wallet | `get_wallet_transactions` | Referral lines: `OTP_REFERRAL_BONUS`; success: `00220` events |
| Subscription receipt | Subscriber org | Subscription tables | OTP revenue domain |
| Supplier wallet widget | Supplier | `organization_wallets` + tx RPC | Not GMV |

### 2.2 Internal ops / founder / admin

| Report / output | Audience | Authoritative source | Notes |
|-----------------|----------|----------------------|-------|
| Platform fee / OTP revenue extract | Founder, admin | `platform_fee_transactions` | Not on buyer/supplier routes |
| Ledger trial balance | Founder, admin | `journal_entries` (`00176`) | Accounting export |
| Audit / governance extract | Admin | `audit_events`, `procurement_stage_events`, `org_governance_action_audits` | May join snapshot ids post-00222 |
| ERP exports (Tally/Zoho) | Authorized ops | Domain exporters over payments/invoices | Sibling to print engine |
| Verification digest lookup | Support / admin | `verify_issued_document_digest`, `issued_document_snapshots` | Integrity reference only |

### 2.3 Explicitly NOT ALLOWED as authoritative

| Output | Why |
|--------|-----|
| `PurchaseOrdersPage` `estimatedSavings` (12.5%) | Fabricated — remove |
| `complianceScorePercent` (100) | Fabricated — remove |
| `referral-incentive.ts` 10% calculation | Simulation — not wallet RPC |
| `MarketIntelligencePanel` heuristics | Non-authoritative UI |
| Supplier Cashback | Not in product |

---

## 3. Fact → source quick reference

| Business fact | Table / function | Report may cite? |
|---------------|------------------|------------------|
| PO total / status | `purchase_orders` | Yes (procurement) |
| Invoice GST splits | `invoices.tax_snapshot`, line items | Yes (procurement) |
| Payment recorded | `record_invoice_payment_atomic`, `payments` | Yes (procurement) |
| Award winner | `awards`, `quotes` | Yes (procurement) |
| Referral credit posted | `wallet_transactions` (type `OTP_REFERRAL_BONUS`) | Wallet statement only |
| Referral amount | Server RPC only (`00221`) | Yes — not client % |
| Supplier success ₹100 | `00220` wallet events | Wallet statement only |
| Platform fee assessed | `platform_fee_transactions` | Founder revenue only |
| Wallet spend | `apply_wallet_credits_to_subscription_atomic` | Subscription / wallet — **not** platform fee debit (C-10 deferred) |
| Document integrity | `issued_document_snapshots.verification_digest` | Verification sheet / footer |
| Decision hash | `computeDecisionReceiptHash` | Snapshot + verify RPC |

---

## 4. Post-00222 reporting rule

Operational reports that display **issued** document figures for compliance reprint should read **snapshot payload** for document-facing totals; aggregate list reports continue to use relational SoR (`purchase_orders`, `invoices`) — snapshots are not a replacement ledger for GMV rollups.

---

## 5. UI contamination (document only)

| Location | Issue | R2-31 action |
|----------|-------|--------------|
| `OtpWalletCreditsWidget` | Implies platform-fee wallet redemption | C-10 DEFER — copy clarification later |
| `getReferralCreditDisplay` 10% string | Stale vs 00221 | Phase A copy — not 00222 |

---

**End report SoR matrix — design only.**
