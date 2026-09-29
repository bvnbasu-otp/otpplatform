# R2-31 Phase 1 — Document Taxonomy

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Engine classes:** Template (A4), Report view, Statement, Export, NOT IN PRODUCT / GAP.

---

## 1. Catalog (aligned to discovery §7)

| # | Document / output | Class | Wired at baseline | R2-31 target |
|---|-------------------|-------|-------------------|--------------|
| 1 | RFQ / requirement summary | Report view | UI only | P2 snapshot optional |
| 2 | Supplier invitation notice | GAP | Messaging | Out of scope |
| 3 | Quote submission ack | GAP | — | P2 |
| 4 | Quote comparison A4 | Template | Model only | Wire + snapshot |
| 5 | Evaluation scorecard export | Export | UI cockpit | Bridge to engine |
| 6 | Committee vote tally | Report view | `WeightedTallyTable` | Export optional |
| 7 | Award lock confirmation | Report view | `AwardPage` | Feeds receipt |
| 8 | Reputation decision receipt | Report view | `DecisionReceipt` | Appendix only |
| 9 | **Canonical decision receipt** | Template | Domain + card tests | **Primary proof** |
| 10 | Decision receipt A4 | Template | Tests only | Wire + snapshot |
| 11 | Procurement contract | Template | DB + domain hash | Print P2 |
| 12 | **Purchase order A4** | Template | **Wired** | + snapshot |
| 13 | Work order schedule | Report view | WO pages | P2 |
| 14 | Milestone inspection | Statement | RPC | P2 |
| 15 | Delivery acceptance cert | GAP | — | — |
| 16 | **Tax invoice A4** | Template | Model only | Wire from `tax_snapshot` |
| 17 | Payment receipt | Export | Tally/Zoho | P2 |
| 18 | PO settlement certificate | Statement | Domain generator | A4 shell |
| 19 | TDS statement | Statement | `tds_deductions` (`00173`) | P2 |
| 20–22 | Debit/credit note, change order | Statement | Tables | P2 |
| 23 | PO reconciliation summary | Report view | `payments.ts` | — |
| 24 | Platform fee assessment | Statement | `platform_fee_transactions` | Founder report |
| 25 | Buyer success cashback notice | Statement | `buyer_reward_allocations` / wallet tx | Wallet statement line |
| 26 | Referral bonus notice | Statement | `OTP_REFERRAL_BONUS` tx | Wallet statement line |
| 27 | Supplier success reward notice | Statement | `00220` events | Wallet statement line |
| 28–29 | Buyer/supplier wallet statement | Statement | RPC, no export | Phase C |
| 30 | Subscription receipt | Statement | Subscription module | — |
| 31–35 | ERP exports | Export | Domain exporters | Register loaders |
| 36 | Period procurement report | Template | `PrintableProcurementReport` | Remove fake KPIs |
| 37 | Ledger trial balance | Export | `00176` | Founder/admin |
| 38–39 | Audit / governance extracts | Export | Tables | Admin |
| 40 | Verification digest sheet | Template | Hash fields only | `verification_ref` on snapshot |

**Supplier Cashback:** Not in taxonomy — **excluded by policy**.

---

## 2. Domain tagging (three ledgers)

| Tag | Document examples |
|-----|-------------------|
| `PROCUREMENT` | PO, invoice summary, settlement, quote comparison, decision receipt |
| `OTP_REVENUE` | Platform fee statement, subscription billing |
| `WALLET` | Wallet statement, referral/success reward notices |

Reports must declare `domain` in future `ReportDefinition` registry (name from `R2-31-02`).

---

## 3. Referral “10%” reference inventory

Classification: **DEAD** | **STALE** | **DOCS** | **UI** | **CALC** | **ACTIVE** | **TEST**

| # | Location | Class | Notes |
|---|----------|-------|-------|
| 1 | `packages/domain/src/types/referral-incentive.ts` — `REFERRAL_REWARD_PERCENTAGE`, `calculateReferralReward` | CALC | Pilot/commercial simulation; **not** wallet RPC |
| 2 | `packages/domain/src/types/referral-incentive.test.ts` | TEST | Keep as simulation tests; relabel suite |
| 3 | `packages/domain/src/types/referral-share-hardening.test.ts` | TEST | Uses `calculateReferralReward` |
| 4 | `tests/security/pricing-entitlement-redteam.test.ts` | TEST | Commercial 10% scenarios |
| 5 | `apps/web/src/features/subscription/types.ts` — re-export | STALE | Document as non-authoritative |
| 6 | `apps/web/src/features/subscription/subscription.test.ts` | TEST | Export smoke |
| 7 | `apps/web/src/pages/DashboardPage.tsx` — JSX comment “10%” | STALE | Remove comment in impl |
| 8 | `apps/web/src/pages/SupplierDashboardPage.tsx` — JSX comment | STALE | Remove comment |
| 9 | `apps/web/src/features/referral/refer-and-earn.test.tsx` | TEST | Asserts **no** 10% in UI |
| 10 | `apps/web/src/features/portal/registration-outcome.test.tsx` | TEST | Asserts note lacks 10% |
| 11 | `getReferralCreditDisplay()` commercial notice string | UI | Still mentions 10% in domain — align to INR matrix text |
| 12 | `organization-charter.ts` | UI | **Correct** — INR matrix (authoritative copy) |
| 13 | `persona-wallet.ts` `REFERRAL_BONUS_INR_BY_REFERRED_PROFILE` | ACTIVE | Display matrix matches 00221 |
| 14 | `00221_otp_referral_bonus_profile_matrix.sql` | ACTIVE | **Authoritative credits** — do not edit |
| 15 | `credit_otp_referral_bonus_atomic` | ACTIVE | Server-only amounts |
| 16 | R2-27 / R2-29 Golden Reconstruction md | DOCS | Historical 10% law — archive notice |
| 17 | `OTP_SUPPLIER_WALLET_IMPLEMENTATION_2026-09-29.md` | DOCS | Stale “10% subscription” |
| 18 | TDS `194J` 10% rate in `tds-calculator.ts` / `TdsWithholdingPanel` | ACTIVE | **Unrelated** to referral — no change |

### Minimum cleanup plan (implementation — no 00221 change)

1. Add `@deprecated` / pilot header on `referral-incentive.ts` pointing to `00221` + `persona-wallet.ts`.  
2. Remove misleading JSX comments on dashboard pages.  
3. Update `getReferralCreditDisplay` commercial notice to flat INR tiers.  
4. Relabel domain tests: “subscription-percent simulation (not production wallet)”.  
5. Do **not** delete `calculateReferralReward` until commercial mode product decision — tests encode pilot boundary rules.  
6. No change to wallet RPCs or amounts.

---

## 4. Integrity-bearing documents

| Document | Digest function | Persist today |
|----------|-----------------|---------------|
| Decision receipt | `computeDecisionReceiptHash` | No |
| Contract | `computeContractDocumentHash` | `procurement_contracts` hashes |
| Settlement cert | `digitalSealSha256` / authoritative cert builder | In-memory |
| Legacy receipt | `computeReceiptAuditHash` (SHA-256) | DEAD for UX |

---

**End document taxonomy.**
