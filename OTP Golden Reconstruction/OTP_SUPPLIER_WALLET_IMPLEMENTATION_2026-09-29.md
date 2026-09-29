# OTP Supplier Wallet Implementation — 2026-09-29

**Status: AMBER** (ledger RPC local; settlement hook not wired end-to-end in app layer)

## Delivered

| Item | Location |
|------|----------|
| Domain rules | `packages/domain/src/types/supplier-wallet.ts` |
| Tests | `packages/domain/src/types/supplier-wallet.test.ts` |
| App service planner | `packages/services/src/services/supplier-wallet-service.ts` |
| SQL RPC | `supabase/migrations/00220_supplier_wallet_ledger_events.sql` |

## Product rules

| Rule | Implementation |
|------|----------------|
| Remove supplier cashback | `isRemovedSupplierCashbackPath`, SQL raises on cashback event types |
| ₹100 referral | `SUPPLIER_REFERRAL_BONUS_INR`, idempotent key seed per referrer/referred pair |
| ₹100 success (once) | `SUPPLIER_SUCCESS_REWARD_INR`, idempotent per supplier |
| Client amount ignored | SQL + `assertClientCannotSetSupplierWalletAmount` |
| Audit | `audit_events` payload on credit |

## Not in scope (unchanged)

- Buyer wallet categories (`CASHBACK`, referral 10% subscription rule).
- Supplier platform fee 0.5% at settlement.

## Remaining wiring

- Invoke `credit_supplier_wallet_event_atomic` from verification completion (referral) and settlement fee `SETTLED` handler (success reward) via **service_role** only.
