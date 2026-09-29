# OTP Financial Truth

**Authority:** Level 1 — current product truth, with unresolved conflicts marked  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

Three money streams exist in the domain module `packages/domain/src/types/pricing-entitlement.ts`. They must not be mixed. Where the screen contradicts the module, this document records the conflict and does not pick a winner.

## 1. Procurement money (buyer ↔ supplier)

| | |
| --- | --- |
| Who pays | The buyer. |
| Who receives | The supplier, into the supplier’s own bank account or UPI. |
| When | After invoice, outside OTP. |
| Does OTP hold this money? | The settlement UI says no. `settlement-state.ts` and `InvoicePaymentPanel.tsx`: the buyer pays directly and records a UTR. “OTP does not collect, hold or settle funds.” |
| What OTP stores | The invoice, GST split, TDS withholding recorded on the invoice, and the payment/UTR row. |

**IMPLEMENTED** as a record-only settlement in the UI and in the pilot policy flag `realPaymentCharged: false`.

**NOT VERIFIED IN PRODUCTION.**

## 2. OTP revenue

| Stream | Domain definition | When | Pilot flag |
| --- | --- | --- | --- |
| Buyer subscription | Prepaid plans. Displayed prices include Individual ₹199 / 30 days, RWA ₹1,499 / 30 days, MSME ₹1,999 / 30 days, with annual figures on the pricing page. | On activation, after the pilot, if the product later charges. | `PILOT_COMMERCIAL_MODE_POLICY.realPaymentCharged = false`. Pricing page also says no real payment during the pilot. |
| Supplier platform fee | `DEFAULT_SUPPLIER_PLATFORM_FEE_RATE = 0.5` (0.50% of PO gross) plus GST on that fee. `SUPPLIER_FEE_POLICY.deductedOnSettlement = true`. PO gross is not rewritten. | On settlement of a confirmed PO, in the commercial calculation. | `supplierPlatformFeeCharged = false`. Fee amount function returns 0 in pilot mode. |
| Other | Top-up RFQ prices exist in the pricing module (Individual ₹149, RWA ₹999, MSME ₹1,499, plus GST). | When a buyer exceeds the monthly allowance, after the pilot. | Not charged while pilot mode is on. |

Buyer sourcing reward in the same module is 0.10% of the procurement base, described as 20% of the 0.50% fee, non-cash, usable only toward OTP subscriptions and RFQ top-ups, 365-day rolling validity. It is not a cash withdrawal.

## 3. Wallet and incentives

Table `wallet_transactions.tx_type` allows: `REWARD_CREDIT`, `SUBSCRIPTION_REDEMPTION`, `REVERSAL`, `ADJUSTMENT`, `EXPIRY` (migration `00181`).

| Category | What the repository says |
| --- | --- |
| Reward credit | `credit_buyer_settlement_reward_atomic`. See the open security finding. |
| Referral bonus | Referral programme mode is pilot sandbox. Share copy and tests pin monetary credit at ₹0 during the pilot. |
| Share in success | The 0.10% buyer reward is the revenue-participation credit. It is not a separate cash wallet in the schema above. |
| Cashback | No separate cashback rail was found beyond the reward credit. Do not describe a cash cashback product. |
| Reversal / adjustment / expiry | Enum values exist. Operator procedures for each: NOT VERIFIED IN PRODUCTION. |

The ledger table has an update/delete trigger that raises. That is append-only for `wallet_transactions` rows. Balances live on `organization_wallets` and can change.

Redemption RPC `apply_wallet_credits_to_subscription_atomic` checks organisation membership. The credit RPC does not. See security baseline.

## GST and TDS

- Invoice GST split (CGST/SGST/IGST) is implemented in the tax domain and in invoice storage.
- TDS sections 194C / 194J exist in `packages/domain/src/tax/tds-calculator.ts`. Migration `00199` rewrites `apply_tds_withholding_atomic` so the server derives the base and ignores the client amount, and allows one live deduction per invoice.
- **NOT VERIFIED IN PRODUCTION.**

## Pilot waiver (code)

`PILOT_COMMERCIAL_MODE_POLICY` (`pricing-entitlement.ts`):

- controlled pilot, 3 months in the policy object
- no real payment
- no supplier platform fee
- no buyer reward recognised as commercial
- no referral money
- pricing may still be displayed
- user notice: no real payment during the pilot
- supplier notice: no commercial platform fee during the pilot

Monthly RFQ allowance enforced in migration `00199` by a before-insert trigger: 3 RFQs per organisation per UTC calendar month, organisation row locked. **NOT VERIFIED IN PRODUCTION.**

## CONFLICT — PRODUCT DECISION REQUIRED

| ID | Conflict |
| --- | --- |
| FIN-1 | Settlement UI and landing trust line: OTP does not collect, hold, or settle buyer-supplier payments. `SUPPLIER_FEE_POLICY.description`: a 0.50% fee “is deducted on settlement from final bilateral disbursements”. A fee deducted from a disbursement means OTP is in the money path. A fee invoiced separately does not. The repository contains both sentences. |
| FIN-2 | About page: “OTP does not take a commission or handle your money.” Pricing page: “0.50% Platform Fulfillment Fee” on confirmed PO awards. FAQ: during the pilot the fee is waived; the prices show what applies after the pilot. The FAQ limits the claim in time. The About sentence does not. |
| FIN-3 | Get Started / quick register copy includes “Zero commissions, zero lead fees” (`QuickRegisterModal.tsx`) beside the 0.50% policy. |
| FIN-4 | README and `docs/00`–`docs/15` describe the 0.50% fee and 0.10% reward as certified live production behaviour. The pilot policy turns both commercial amounts off. Live billing mode is UNKNOWN. |

No owner has chosen which sentence is the product. Do not “fix” copy or the fee function until that decision is recorded.

## CONFLICT — LEGAL DECISION REQUIRED

Public terms, privacy, and disclaimer pages state they are not final legal text and contain `[Insert Registered Business Address]`. Whether a pilot may collect acceptances against that text is a legal decision. See `OTP_PUBLIC_SITE_TRUTH.md`.

## Open security finding (money)

`OPEN SECURITY FINDING` — `credit_buyer_settlement_reward_atomic` (migration `00181`) is granted to `authenticated`, does not check the caller, and accepts a null platform-fee id. A null id is allowed by the unique column (PostgreSQL unique permits multiple nulls), so the one-credit-per-fee rule does not bind. This function was not rewritten by `00199`–`00215`. It has not been executed against production in the 28 Sep review. Details: `OTP_SECURITY_BASELINE.md`.
