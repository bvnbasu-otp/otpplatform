# Payments

Three different “payments” exist. Do not merge them.

## 1. Buyer pays the supplier for the order

Status of the public rule: `IMPLEMENTED` as copy. `PLATFORM_DISCLAIMER_LINES` in `apps/web/src/lib/brand.ts`: OTP is a facilitation platform; buyers and sellers negotiate, contract, and settle directly; OTP does not collect, hold, settle, or guarantee those payments.

The PO stores a payment structure (single, 30/50/20, 4×25, or custom). That is a schedule of record, not a capture. See [PURCHASE_ORDERS.md](./PURCHASE_ORDERS.md).

## 2. Supplier platform fee

Status of the calculator: `IMPLEMENTED`. Status of live collection: `UNKNOWN`.

Commercial rate 0.5 percent of PO gross, plus 18 percent GST on the fee, in `calculateSupplierPlatformFeeWithGst`. PO gross is not rewritten.

Pilot: `calculateSupplierPlatformFeeWithPilotMode` returns a zero fee when billing mode is `PILOT_FREE` (the default of `resolveBillingMode`). `PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged` is false.

`00244` reads `platform_fee_transactions` inside founder metrics. That proves the table is referenced. It does not prove a hosted fee was charged.

## 3. Buyer subscription checkout

Status: `CONFIG-GATED`. Pilot policy `realPaymentCharged` is false.

`supabase/functions/payment-webhook/index.ts` verifies Razorpay, Stripe, or a generic HMAC header. If the secret environment variables are unset, verification fails (SECURITY-01, remediated in source, not redeployed). Do not treat that as a live gateway.

The subscription modal copy states that activating a plan grants allowances with ₹0 charged (`SubscriptionPaymentModal.tsx`). That file is dirty in the working tree. This reconstruction did not extend it.

## Wallets

Buyer reward types include `CASHBACK` in `packages/domain/src/types/buyer-reward.ts`. The module describes them as non-cash and not withdrawable.

Supplier cashback is not a supplier wallet event. Supplier amounts that do exist are the referral bonus and the success reward in [SUPPLIER_NETWORK.md](./SUPPLIER_NETWORK.md).
