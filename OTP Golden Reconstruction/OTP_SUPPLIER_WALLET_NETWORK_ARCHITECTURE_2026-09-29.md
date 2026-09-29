# OTP Supplier Wallet + Network Architecture — 2026-09-29

**Overall status: AMBER**

## Scope

- Supplier wallet: ₹100 `SUPPLIER_REFERRAL_BONUS` and one-time ₹100 `SUPPLIER_SUCCESS_REWARD` only.
- **Supplier cashback removed** — no ledger type, API, UI, or calculation path (`SUPPLIER_CASHBACK` rejected in SQL and domain guards).
- Buyer cashback / 0.10% buyer sourcing reward and **0.5% supplier marketplace fee** unchanged (`pricing-entitlement.ts`, `platform_fee_transactions`).

## Wallet storage

Existing `organization_wallets` + append-only `wallet_transactions` are sufficient:

| Field | Usage |
|-------|--------|
| `tx_type` | `REWARD_CREDIT` (same as buyer rewards) |
| `source_entity_type` | `SUPPLIER_REFERRAL_BONUS` or `SUPPLIER_SUCCESS_REWARD` |
| `source_entity_id` | Referred supplier id or `platform_fee_transactions.id` |
| `amount` | Server-derived ₹100 only (migration `00220`) |

No separate GMV/settlement/OTP revenue tables are touched.

## Success reward completion signal

- **Gate:** first `platform_fee_transactions` row for the supplier with `status = 'SETTLED'`.
- **Not credited on:** registration, profile, quote, or invite alone.
- Application hook: call `credit_supplier_wallet_event_atomic` from settlement completion worker (service_role) when fee moves to `SETTLED`.
- Domain documents missing signal when settlement hook has not fired (`evaluateSupplierSuccessReward`).

## Referral bonus

- Credit when referred supplier reaches OTP verification (`VERIFIED` / `OTP_VERIFIED`), not on invite create.
- Domain blocks self-referral, duplicate pair credit, circular referral.
- Amount never accepted from client (`assertClientCannotSetSupplierWalletAmount`).

## Supplier network provenance

| Source kind | Meaning | Lifecycle cap |
|-------------|---------|-----------------|
| `OTP_SUPPLIER` | OTP registry | Up to `OTP_VERIFIED` when verified |
| `ONDC_SELLER` | Beckn network callbacks | `ONDC_DISCOVERED` only |
| `GOOGLE_DISCOVERY` | Places / policy-safe cache | `DISCOVERED_IN_AREA` only |

States are **not** upgraded across sources. Similar names → `POSSIBLE_MATCH`, no merge without strong ID (GSTIN, phone, domain, place_id, ONDC provider id, OTP id).

## Security (00216–00219 preserved)

- `credit_supplier_wallet_event_atomic`: `REVOKE` from `PUBLIC`, `anon`, `authenticated`; `GRANT` **service_role** only.
- 00216 buyer wallet RPCs unchanged.
- 00219 approval-stage direct write guard unchanged.

## Migration 00220

Added **locally** for supplier wallet RPC only (not applied to production in this session). Documented here before creation per instruction.
