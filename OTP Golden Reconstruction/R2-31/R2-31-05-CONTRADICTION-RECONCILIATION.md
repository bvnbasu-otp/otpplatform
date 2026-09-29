# R2-31 Phase 0.5 — Contradiction Reconciliation (Read-Only)

**Baseline commit:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Production reference:** https://otpplatform-theta.vercel.app  
**Migration ceiling (certified):** `00221`  
**Method:** Prior discovery docs read; every claim below re-verified in source (`grep` + file read). Docs lose to code.

**Change control:** NO CODE / NO MIGRATION / NO DATA CHANGE / NO COMMIT / NO DEPLOY.

---

## Executive reconciliation (15 required answers)

| # | Question | Reconciled answer |
|---|----------|-------------------|
| 1 | Canonical Decision Receipt model | **`CanonicalDecisionReceipt`** in `packages/domain/src/types/decision-receipt.ts`, built by `buildCanonicalDecisionReceipt` / verified by `verifyDecisionReceiptIntegrity`, assembled for services in `AwardService.buildReceiptForAward` (`packages/services/src/services/award-service.ts`). Production UI uses a **different** reputation narrative model (`apps/web/src/features/reveal/types/decision-receipt.ts` → `buildDecisionReceipt` → `DecisionReceipt.tsx`). |
| 2 | Canonical integrity mechanism | **`computeDecisionReceiptHash`** → `computeDeterministicHmac(canonicalJson, DECISION_RECEIPT_SALT)` in `decision-receipt.ts`. This is a **deterministic application digest** (see C-02); not Web Crypto SHA-256 and not a keyed HMAC in the cryptographic sense. |
| 3 | Can referral mismatch change wallet accounting? | **No** for production wallet credits. Amounts are computed only in `credit_otp_referral_bonus_atomic` (`00221_otp_referral_bonus_profile_matrix.sql`) via `private.otp_referral_bonus_inr`; client amount/profile overrides are rejected. The 10% module does not call this RPC from app code. |
| 4 | Are 12.5% and 100% production-visible? | **Yes on screen** for buyers/suppliers on `/purchase-orders` (reports view): `PurchaseOrdersPage.tsx` → `AnalyticsCards.tsx`. **Not** in `PrintableProcurementReport.tsx` (print path has no savings/compliance fields). |
| 5 | Authoritative savings source | **None** for the PO ledger report metrics. `estimatedSavings` is `Math.round(totalAmount * 0.125)` in `PurchaseOrdersPage.tsx`. Separate **non-authoritative** heuristic in `MarketIntelligencePanel.tsx` (`historicalPriceMax - currentQuoteRangeMin` when below budget). `procurement_performance_records` exists in DB but is **not** wired to this report. |
| 6 | Authoritative compliance source | **None.** `complianceScorePercent: 100` is hard-coded in `PurchaseOrdersPage.tsx`. No compliance metric table or RPC feeds the report. |
| 7 | Tax invoice usable / partial / missing | **Partial:** DB + API (`invoices`, `invoice_line_items`, `tax_snapshot`, GST totals in `apps/web/src/features/fulfillment/api/invoices.ts`). **Template:** `TAX_INVOICE` in `procurement-document.ts` (test-only wiring in `procurement-document.test.tsx`). **No** invoice detail print route; fulfillment uses `InvoicePaymentPanel` / balance rows only. |
| 8 | Can an already-generated document change after identity reveal? | **Yes** for all **dynamic** surfaces (no issued snapshot). PO reprint uses live `PurchaseOrderDetailPage` + `buildPurchaseOrderDocumentInput` (always `POST_AWARD` full names). Reputation receipt uses `quotes_revealed` at read time. Canonical receipt from `AwardService` sets `businessName` from `isRevealed` and **`receiptGeneratedAt: now`** on every build — hash changes on regeneration. |
| 9 | Minimum issued-snapshot model | Authoritative row(s) → **DocumentPolicy** (persona × `rfq.reveal_status` × kind) → **IssuedDocumentSnapshot** `{ kind, issuedAt, identityPhase, payloadJson, verificationDigest, templateVersion }` → renderer (`PrintableProcurementDocument` / exports). Reprint reads snapshot only. |
| 10 | Is 00222 required? (proposal only) | **Yes, if** R2-31 cert requires immutable reprints and stable verification digests at award/PO/invoice issue. **Not required** to fix wallet or referral accounting. Proposed name only: persistence for snapshots + optional `awards.decision_receipt_snapshot` or generic `issued_document_snapshots` — **do not create in Phase 0.5**. |
| 11 | Is platform-fee wallet spend incomplete? | **Yes.** Only `apply_wallet_credits_to_subscription_atomic` (`00181`, `00216`) is invoked from `applyWalletCreditsToSubscription` (`subscription.ts`). UI/copy (`OtpWalletCreditsWidget.tsx`, `PricingPage.tsx`) mentions platform fees; `assertReferralWalletUsagePolicy` allows subscription/RFQ top-up only — **no `PLATFORM_FEE` action**. |
| 12 | Does any finding invalidate Wallet W1–W10? | **No.** No production-reachable path found where referral 10% domain or report cosmetics alter `wallet_transactions` amounts. Referral credits remain server-matrix in 00221. |
| 13 | Issues inside R2-31? | C-01, C-02, C-05, C-06, C-08, C-09 (document engine, integrity labeling, report honesty, invoice print, snapshots). |
| 14 | Separate remediation | C-03 domain/doc cleanup (10% narrative); C-10 product copy vs RPC for platform-fee wallet spend; docs claiming “bilateral digital signatures” (`docs/03`, `docs/07`, etc.). |
| 15 | Leave untouched | Wallet amounts (00221 matrix), `credit_otp_referral_bonus_atomic` logic, procurement GMV ledger, supplier success reward rules, no 00222 implementation in this pass. |

---

## Cross-domain contamination check

| Plane | Authoritative stores | Document/report contamination found |
|-------|---------------------|-------------------------------------|
| **PROCUREMENT (GMV)** | `purchase_orders`, `invoices`, `payments`, `journal_entries`, bilateral settlement RPCs | PO print/report use procurement tables only. **Clean.** |
| **OTP REVENUE** | `platform_fee_transactions`, `platform_fee_policies` | Not mixed into PO totals. Wallet widget **mentions** fee spend without RPC — **marketing/UI only**, not GMV ledger. |
| **WALLET** | `organization_wallets`, `wallet_transactions`, 00221 referral RPC | Referral domain 10% **does not** write wallet. Report savings **do not** touch wallet. **Clean accounting.** |

---

## C-01 — Decision Receipt (dual model)

### Implementation table

| Implementation | Location | Persistence | Used by | Authoritative? | Status |
|----------------|----------|-------------|---------|----------------|--------|
| Reputation narrative receipt | `apps/web/src/features/reveal/types/decision-receipt.ts` (`buildDecisionReceipt`); `fetch-decision-receipt.ts` (`quotes_revealed`) | None | `DecisionReceipt.tsx` → `AwardPage.tsx`, `SupplierRevealPage.tsx`, `EvaluationDecisionCockpit.tsx` | **Business narrative only** (merit vs reputation) | **Active (production UI)** |
| Canonical institutional receipt | `packages/domain/src/types/decision-receipt.ts` (`buildCanonicalDecisionReceipt`, `verifyDecisionReceiptIntegrity`) | None on `awards` table (`00002_core_tables.sql` has no receipt JSON/hash) | `AwardService.getDecisionReceipt` / `buildReceiptForAward` (`award-service.ts`); `DecisionReceiptCard.tsx` | **Intended governance/commercial proof** | **Built in services; not mounted on pages** (tests: `decision-receipt-card.test.tsx`) |
| A4 `DECISION_RECEIPT` kind | `apps/web/src/features/reporting/lib/procurement-document.ts` | N/A | `procurement-document.test.tsx` only | Presentation shell | **Inactive in UI** |
| Legacy print hash helper | `apps/web/src/features/reporting/lib/pdf-generator.ts` (`computeReceiptAuditHash`) | N/A | `pdf-receipt.test.ts` only | None | **Dead in production UI** |

**Business decision vs presentation:** Award facts live in **`awards`**, **`quotes`**, votes/approval stages, and audit events — not in either receipt type. The **reputation receipt** is post-reveal **presentation/explanation**. The **canonical receipt** is the **intended** tamper-evident institutional artifact (governance fields + digest) but is **not** what users see today.

**Both active?** Only the reputation component is user-facing. Canonical path is code-active in `AwardService` only (no web API import of `getDecisionReceipt` found under `apps/`).

**Can data diverge?** **Yes.** Different inputs (live view vs service builder), no shared persistence, canonical builder uses placeholders when revealed (`maskedSupplierLabel: 'Supplier #01'`, fixed GST math in `buildReceiptForAward`).

**Canonical R2-31 source:** `CanonicalDecisionReceipt` + future **issued snapshot** at award lock; reputation block optional section inside snapshot payload.

### Thirteen-way verdict (C-01)

| Q | Answer |
|---|--------|
| Implementation | Three parallel artifacts (reputation UI, domain canonical, A4 kind); see table. |
| Source of truth | DB award/quote/governance tables; not either receipt JSON. |
| Conflict | Two receipt models + unused A4 kind. |
| Active | Reputation UI yes; canonical card no; A4 kind tests only. |
| Production reachable | `DecisionReceipt` on award/reveal/evaluation routes. |
| Accounting | None (procurement unaffected). |
| Security | No persisted digest on award; integrity proof not enforced server-side. |
| Historical integrity | Regenerated views; no frozen receipt. |
| Wallet impact | None. |
| Severity | **ORANGE** (document integrity / wrong proof surface), not wallet RED. |
| Remediation | Wire one builder + snapshot; demote reputation to subsection. |
| Inside R2-31? | **Yes.** |
| Separate change? | No. |

### Persona impact (C-01)

| Persona | Impact |
|---------|--------|
| Individual | **DOCUMENT INTEGRITY** |
| RWA | **DOCUMENT INTEGRITY** |
| MSME | **DOCUMENT INTEGRITY** |
| Supplier | **UI ONLY** (reveal page receipt) |
| Admin | **NONE** |
| Founder | **DOCUMENT INTEGRITY** |

---

## C-02 — Hash / HMAC / signature mechanisms

### Mechanism table

| Mechanism | Algorithm (actual) | Input | Output | Purpose | Production user-visible? |
|-----------|-------------------|-------|--------|---------|--------------------------|
| `computeReceiptAuditHash` | **Web Crypto SHA-256** (`pdf-generator.ts`) | `rfqPublicRef\|winnerBusinessName\|amount\|awardedAt` | 64-char hex | Legacy receipt seal | **No** (tests only) |
| `computeDecisionReceiptHash` | **`computeDeterministicHmac`** (custom 128-char hex digest; comment says “SHA-256 equivalent”) | Canonical JSON subset of `CanonicalDecisionReceipt` + salt `OTP-DECISION-RECEIPT-INTEGRITY-SALT-2026` | 128-char hex | Decision receipt integrity | Only if `DecisionReceiptCard` used (not on pages) |
| `computeDeterministicHmac` | Custom string hash (`procurement-communications.ts`) | `secret:message` concatenation | 128-char hex | Shared “digest” primitive | Used by multiple domain modules |
| `computeContractDocumentHash` / `generateContractSignatureHash` | Same primitive + salts `OTP-CONTRACT-SALT-2026`, `OTP-SIGNOFF-SALT-2026` | Contract markdown + terms; signoff tuple | 128-char hex | Contract tamper evidence | Domain/tests; not statutory eSign |
| `buildAuthoritativeSettlementCertificate` → `digitalSealSha256` | Same primitive | Settlement JSON + default secret | 128-char hex | Settlement certificate seal | API/domain path (`financial-settlement-controls.ts`) |
| `validateProviderWebhookSignature` | Same primitive + timestamp drift | Webhook payload | Compare to header | Provider webhook auth | Server/worker paths |
| Milestone inspection signoff | `computeDeterministicHmac` + `INSPECTION_SIGN_SALT` (`track-milestone.ts`) | Inspection payload | Digest | QA sign-off record | Milestone flows (domain) |

**Distinction:** None of the domain “HMAC” functions are **HMAC-SHA256** or **public-key digital signatures**. `computeReceiptAuditHash` is a **hash** (SHA-256). Docs (`docs/07-SECURITY-PRIVACY-BACKUP.md`) claiming “HMAC-SHA256 digital signature” are ** inaccurate vs code**.

**Canonical provenance for R2-31:** `computeDecisionReceiptHash` payload rules in `decision-receipt.ts`, stored on **issued snapshot** at lock time. Changing `computeDeterministicHmac` or canonical JSON fields **would invalidate** previously issued digests **if** snapshots were stored; today **nothing persisted**, so historical user prints have **no verifiable anchor**.

### Thirteen-way verdict (C-02)

| Q | Answer |
|---|--------|
| Implementation | Multiple digests; one real SHA-256 helper unused in UI. |
| Source of truth | Intended: canonical receipt hash spec in `decision-receipt.ts`. |
| Conflict | Labels say SHA-256/HMAC; implementation is custom digest; legacy SHA-256 separate. |
| Active | Custom digest in domain; SHA-256 helper test-only. |
| Production reachable | Misleading labels on `DecisionReceiptCard`; `AwardPage` “Cryptographically…” copy without digest. |
| Accounting | None. |
| Security | Webhooks use same primitive; not a substitute for legal signature. |
| Historical integrity | No registry of digests at issue time. |
| Wallet impact | None. |
| Severity | **YELLOW** (architecture + labeling); **ORANGE** if users trust “verified” badges. |
| Remediation | Rename to “integrity digest”; persist at issuance; retire duplicate SHA-256 from user messaging. |
| Inside R2-31? | **Yes.** |
| Separate change? | Doc set (`docs/`) cleanup optional separate pass. |

### Persona impact (C-02)

| Persona | Impact |
|---------|--------|
| Individual–Founder | **DOCUMENT INTEGRITY** (trust in “verification”) |
| Supplier | **UI ONLY** |
| Admin | **SECURITY** (webhook primitive separate from user docs) |

---

## C-03 — Referral rate mismatch (10% vs INR matrix)

### Trace

| Layer | Finding |
|-------|---------|
| **DB (authoritative)** | `private.otp_referral_bonus_inr`, `credit_otp_referral_bonus_atomic` in `00221_otp_referral_bonus_profile_matrix.sql` — server resolves profile, ignores wrong client amount. |
| **Domain wallet display** | `persona-wallet.ts` — `REFERRAL_BONUS_INR_BY_REFERRED_PROFILE` matches matrix (comment wrongly cites 00220). |
| **Domain legacy module** | `referral-incentive.ts` — `REFERRAL_REWARD_PERCENTAGE = 10`, `calculateReferralReward` (subscription %). |
| **Services** | No `credit_otp_referral` caller in `packages/services`. |
| **Web app** | `PricingPage.tsx`, charter — flat INR copy; `ReferAndEarnCard` uses `getReferralCreditDisplay()` → pilot **₹0**; `calculateReferralReward` re-exported in `subscription/types.ts` but **not** used in wallet credit UI grep. |
| **RPC invocation in repo** | `tests/security/otp-referral-00221-database.test.ts` only (production caller may be external service_role job — not in `apps/`). |
| **Tests/fixtures** | Extensive `referral-incentive.test.ts`, red-team tests use 10% model. |

**Classification:** **TYPE E** (docs/tests/domain header for 10% rule) + **TYPE B** (`getReferralCreditDisplay` commercial-mode notice still describes 10%) + **TYPE A** for wallet credit path from `calculateReferralReward` (no production wallet write found). **Not TYPE D.**

### Thirteen-way verdict (C-03)

| Q | Answer |
|---|--------|
| Implementation | 00221 RPC vs `referral-incentive.ts`. |
| Source of truth | **00221 SQL** for wallet credits. |
| Conflict | Domain module contradicts certified matrix. |
| Active | RPC authoritative; 10% module active in tests/domain exports only. |
| Production reachable | Wallet: RPC only; UI shows flat INR or ₹0 pilot. |
| Accounting | **No mismatch** on credit path (server enforces INR). |
| Security | Server rejects client amount override. |
| Historical integrity | N/A. |
| Wallet impact | **None** on W1–W10. |
| Severity | **BLUE** (legacy domain/docs); **YELLOW** if commercial mode notice shown. |
| Remediation | Mark 10% module pilot-only; align `referral-incentive.ts` header with matrix. |
| Inside R2-31? | **No** for engine; **yes** for report/copy consistency. |
| Separate change? | **Yes** (domain doc module). |

### Persona impact (C-03)

| Persona | Impact |
|---------|--------|
| All buyers/supplier | **UI ONLY** / **NONE** for accounting |
| Admin/Founder | **BLUE** docs |

---

## C-05 — Signature wording

### Wording table (selected production-facing)

| Existing wording | Actual mechanism | Truthful R2-31 wording (proposal) | Risk |
|------------------|------------------|-----------------------------------|------|
| `DecisionReceipt.tsx`: “Cryptographic Decision Receipt” | No digest; narrative from `quotes_revealed` | “Award merit summary (post-reveal)” | **ORANGE** overclaim |
| `DecisionReceiptCard.tsx`: “Tamper-Evident SHA-256 Verified” | `verifyDecisionReceiptIntegrity` → custom digest | “Integrity digest verified (OTP internal algorithm)” | **ORANGE** |
| `DecisionReceiptCard.tsx`: “Cryptographic Audit Hash (HMAC-SHA256)” | `computeDeterministicHmac` | “Document integrity digest (not a legal digital signature)” | **ORANGE** |
| `AwardPage.tsx`: “Audit Signature: Cryptographically Sealed” | No seal in reputation receipt | “Award recorded in platform audit log” | **ORANGE** |
| `AwardPage.tsx`: “digitally signed” (approval stage toast) | `digital_signature_hash` on approval row (`approval.ts`) — domain hash, not DSC | “Approval recorded with integrity digest” | **YELLOW** |
| `SpendApprovalModal.tsx`: “Formal digital approval” | Governance UI | “Recorded spend approval” | **YELLOW** |
| Docs: “bilateral digital signatures” | `generateContractSignatureHash` | “Bilateral acknowledgment digests on contract text” | **BLUE** docs |

**Proposed standard phrase (R2-31):** “**Integrity digest** — tamper-evident check using OTP’s internal algorithm. This is **not** a statutory digital signature under IT Act eSign/DSC.”

### Thirteen-way verdict (C-05)

| Q | Answer |
|---|--------|
| Implementation | UI strings + domain comments + docs. |
| Source of truth | Product copy should follow mechanism table (C-02). |
| Conflict | Legal-sounding terms vs digest functions. |
| Active | Yes on award/reveal UI. |
| Production reachable | Yes. |
| Accounting | None. |
| Security | Misleading trust, not crypto bypass. |
| Historical integrity | N/A. |
| Wallet impact | None. |
| Severity | **ORANGE** |
| Remediation | Copy pass in R2-31 renderer/shell. |
| Inside R2-31? | **Yes.** |
| Separate change? | Docs optional. |

### Persona impact (C-05)

All personas: **DOCUMENT INTEGRITY** / **UI ONLY**.

---

## C-06 — 12.5% savings and 100% compliance

| Item | Location | Production reachable? | Customer output? |
|------|----------|-------------------------|----------------|
| `estimatedSavings = totalAmount * 0.125` | `PurchaseOrdersPage.tsx` (~255) | `/purchase-orders`, `?view=reports` | **Screen:** `AnalyticsCards.tsx` (“12.5% market baseline savings”). **Print:** not in `PrintableProcurementReport.tsx`. |
| `complianceScorePercent: 100` | Same | Same route | **Screen only** |
| `onTimeDeliveryRate: 98.4` | Same | Same | **Screen only** (also manufactured) |

**Classification:** **Business integrity defect** for on-screen procurement report (fabricated KPIs). **Cosmetic** on print path (omitted). Not an accounting defect.

**Authoritative savings:** none for this widget. **Authoritative compliance:** **does not exist** in code for this metric.

### Thirteen-way verdict (C-06)

| Q | Answer |
|---|--------|
| Implementation | In-memory summary in `PurchaseOrdersPage`. |
| Source of truth | Should be `procurement_performance_records` or hidden null. |
| Conflict | Report invents metrics. |
| Active | Yes on reports view. |
| Production reachable | Yes (`App.tsx` routes). |
| Accounting | None. |
| Security | None. |
| Historical integrity | Misleading if screenshotted/printed from browser full page. |
| Wallet impact | None. |
| Severity | **ORANGE** |
| Remediation | Null metrics or computed from performance table. |
| Inside R2-31? | **Yes.** |
| Separate change? | No. |

### Persona impact (C-06)

Buyers (Individual/RWA/MSME): **UI ONLY**. Supplier: **UI ONLY** on supplier PO reports. Admin/Founder: **DOCUMENT INTEGRITY**.

---

## C-08 — Tax invoice trace

| Stage | Status |
|-------|--------|
| **Record** | `invoices` (+ line items, GST columns, `tax_snapshot`) — loaded in `invoices.ts` |
| **UI** | `InvoicePaymentPanel`, `InvoiceBalancesReview` embedded in PO detail — **no** dedicated invoice print page |
| **Template** | `buildProcurementDocumentModel` supports `TAX_INVOICE` (`procurement-document.ts`) |
| **PDF/print** | **NOT FOUND** wiring from invoice detail (unlike `PurchaseOrderDetailPage` + `PrintableProcurementDocument`) |
| **Authoritative fields** | Invoice number, dates, amounts, GST splits, `tax_snapshot` on approve (migrations `00167`/`00168` referenced in discovery) — API maps them |
| **GAP** | No `buildInvoiceDocumentInput` in fulfillment lib; buyer/supplier statutory PDF path absent |

**Classification:** **Partially wired** — data + bilateral UI; **template inactive** for customer output.

### Thirteen-way verdict (C-08)

| Q | Answer |
|---|--------|
| Implementation | DB + API complete enough; print shell missing. |
| Source of truth | `invoices` row + `tax_snapshot` at approval. |
| Conflict | Marketing/GST UX vs no tax invoice print. |
| Active | Invoice lifecycle active; A4 tax invoice inactive. |
| Production reachable | Data yes; printable tax invoice no. |
| Accounting | Server invoice amounts authoritative; print gap only. |
| Security | RLS on invoices (existing). |
| Historical integrity | `tax_snapshot` frozen on approve (trigger per discovery). |
| Wallet impact | None. |
| Severity | **YELLOW** (R2-31 cert gap) |
| Remediation | Wire `TAX_INVOICE` from frozen snapshot. |
| Inside R2-31? | **Yes.** |
| Separate change? | No. |

### Persona impact (C-08)

Buyers/suppliers: **DOCUMENT INTEGRITY**. Admin: **NONE**.

---

## C-09 — Issued snapshot / reveal timeline

### Dynamic vs persisted (summary)

| Artifact | Persisted snapshot? | Dynamic source | Reprint stable? |
|----------|--------------------|----------------|-----------------|
| PO A4 | No | `buildPurchaseOrderDocumentInput` + live PO/lines | Names stable post-PO; lines may edit |
| Decision reputation UI | No | `quotes_revealed` (requires `reveal_status = REVEALED`) | Content follows current view |
| Canonical receipt | No | `AwardService.buildReceiptForAward` | **No** (`receiptGeneratedAt` = now) |
| Period report | No | Aggregated PO list in page memory | Regenerated each visit |
| Invoice print | N/A | — | — |
| Award quote comparison (A4) | No | Model only | — |

**T0 PRE_REVEAL / T1 REVEAL / T2 REPRINT:** `quotes_revealed` hides non-selected supplier identities even after reveal (`00178` — only `SELECTED` quote gets `business_name`). Reputation receipt **can** show winner name at T2 while losers stay sealed in table — by design. **No issued snapshot** means there is **no proof** of what was shown at T0 award evaluation. Canonical receipt **would** change digest if built at T0 vs T1 because `businessName`/`receiptGeneratedAt` differ.

**Minimum snapshot architecture:** Authoritative records → **DocumentPolicy** (`rfq.reveal_status`, `ProcurementDocumentPhase`, viewer role) → **identity visibility rules** → **IssuedDocumentSnapshot** → versioned template → `PrintableProcurementDocument` / print CSS.

**00222 necessary?** **Proposed yes** for immutability + verification anchor; scope: snapshot table + write hooks at award lock / PO issue / invoice approve — **proposal only**.

### Thirteen-way verdict (C-09)

| Q | Answer |
|---|--------|
| Implementation | No `document_snapshots` / award receipt column. |
| Source of truth | Transaction tables, not print JSON. |
| Conflict | Reveal changes visible fields on regenerate. |
| Active | Dynamic regeneration everywhere. |
| Production reachable | Yes. |
| Accounting | None. |
| Security | Identity rules in SQL view; snapshot gap is integrity not authz. |
| Historical integrity | **Broken** for proof documents. |
| Wallet impact | None. |
| Severity | **ORANGE** (pre-R2-31 cert) |
| Remediation | Snapshot persistence (future 00222). |
| Inside R2-31? | **Yes** (core). |
| Separate change? | Migration is separate controlled release. |

### Persona impact (C-09)

All buyer personas + supplier: **DOCUMENT INTEGRITY**. Admin/Founder: **DOCUMENT INTEGRITY**.

---

## C-10 — Wallet platform-fee spend

| Path | RPC / function | Ledger | Client |
|------|----------------|--------|--------|
| Subscription | `apply_wallet_credits_to_subscription_atomic` | `wallet_transactions` debit | `applyWalletCreditsToSubscription` |
| Platform fee | **NOT FOUND** | — | Copy claims fee redemption |

**Same debit model?** N/A — fee path missing. **Duplicate/overspend prevention:** subscription RPC has atomic wallet row lock (00181/00216). **Revenue reconciliation:** platform fees via `platform_fee_transactions`, separate from wallet debits.

**Classification:** **Incomplete** implementation vs **UI/copy**; **not** production-reachable fee payment; **not** inconsistent ledger (no double path).

### Thirteen-way verdict (C-10)

| Q | Answer |
|---|--------|
| Implementation | Subscription only. |
| Source of truth | Wallet balance: `organization_wallets`; spend: subscription RPC only. |
| Conflict | Product copy vs code. |
| Active | Subscription yes; platform fee wallet no. |
| Production reachable | Subscription wallet spend yes. |
| Accounting | No erroneous fee credits found. |
| Security | N/A. |
| Historical integrity | N/A. |
| Wallet impact | **Product gap**, not invalid W1–W10 certification. |
| Severity | **YELLOW** |
| Remediation | RPC or correct copy to subscription-only. |
| Inside R2-31? | **Partial** (wallet statement docs). |
| Separate change? | **Yes** if new RPC (wallet economics). |

### Persona impact (C-10)

Buyers/suppliers with wallet: **UI ONLY**. Admin: **NONE**.

---

## Severity summary

| ID | Severity | Rationale |
|----|----------|-----------|
| C-01 | ORANGE | Wrong/unified proof surface in production |
| C-02 | YELLOW / ORANGE | Mislabeled digests; no persisted anchor |
| C-03 | BLUE | No accounting defect |
| C-05 | ORANGE | Overclaimed “cryptographic/signature” language |
| C-06 | ORANGE | Fabricated KPIs on live reports view |
| C-08 | YELLOW | Statutory-style output not wired |
| C-09 | ORANGE | No immutable issuance |
| C-10 | YELLOW | Copy vs subscription-only RPC |

**No RED** findings in this pass.

---

## Architecture conclusion

The layered model **Authoritative Records → Policy → Persona → Identity visibility → Issued snapshot → Versioned template → Renderer → PDF/print** is **valid** and matches gaps found: policy exists partially (`ProcurementDocumentPhase`, `quotes_revealed`, RLS); **snapshot layer is missing**; renderers (`PrintableProcurementDocument`) exist for PO only in production.

---

**End Phase 0.5 — read-only. STOP.**
