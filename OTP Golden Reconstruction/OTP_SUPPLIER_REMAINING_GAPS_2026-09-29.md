# Supplier Wallet + Network Remaining Gaps — 2026-09-29

**Status: AMBER**

| Gap | Severity | Notes |
|-----|----------|-------|
| Settlement worker → `credit_supplier_wallet_event_atomic` | Medium | RPC exists; app payment service not hooked in this session |
| Referral → wallet on supplier OTP verify | Medium | Domain + RPC ready; signup/verify pipeline call TBD |
| `DiscoverSuppliersPage` buyerCounts from provider engine | Low | Banner supports prop; RFQ lifecycle still invitation-view driven |
| ONDC HTTP receiver route in web app | High for go-live | Receiver logic exists; route wiring + registry keys external |
| BNI / Association / Direct stub adapters | Low | Still return simulation rows when enabled in SNE tests; not buyer-facing production path |
| Apply 00220 to hosted DB | Ops | Local migration only; do not apply without release window |

## Why not GREEN

ONDC production is not connected; success reward requires live `SETTLED` fee events in the deployment environment.
