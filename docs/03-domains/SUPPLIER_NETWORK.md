# Supplier network

Status by channel is [LIVE_VS_PLANNED.md](../13-truth/LIVE_VS_PLANNED.md). This page is how the repository finds suppliers. It does not add a network.

## Channels that are part of the product

| Channel | Status | Mechanism |
| --- | --- | --- |
| OTP registry | IMPLEMENTED | Supplier signup and supplier routes in `App.tsx`. |
| Direct invitation | IMPLEMENTED | Buyer invite and `/q/:token` (`QuickQuotePage`). The page comment says the token is the credential. |

Public copy marks both “Available now”. That means the product feature, not a measured delivery rate.

## Channels that are not live

| Channel | Status |
| --- | --- |
| WhatsApp and SMS outreach | CONFIG-GATED, default `MOCK`. Public status planned. |
| ONDC | CONFIG-GATED (`CREDENTIAL_GATED`). Public status planned. |
| BNI, trade associations | PLANNED in `SUPPLIER_CHANNELS`. No adapter was read. |
| Google Places | CONFIG-GATED discovery aid. Not a supplier network the customer is told is live. Detail: [GOOGLE_PLACES.md](../09-integrations/GOOGLE_PLACES.md). |

Places candidates are discovery records. The adapter comment states they are not automatically OTP-verified or GST-verified.

## Alias

`generateCrockfordAlias` is imported by the Places adapter from the domain package. The invitation row carries `anonymous_label` (read in `reveal_award`). Comparison before reveal uses that alias. The legal name is selected in the reveal functions from `suppliers.business_name`.

## Supplier wallet

Active ledger event types: `SUPPLIER_REFERRAL_BONUS` and `SUPPLIER_SUCCESS_REWARD` (`packages/domain/src/types/supplier-wallet.ts`). Amount constants are 100 INR each. A supplier referrer must have a completed OTP transaction before referral credit, in that module’s input flags.

`SUPPLIER_CASHBACK` is a removed type. Do not document a supplier cashback balance.
