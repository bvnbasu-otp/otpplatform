# OTP Integrated Risk Register — 2026-09-29

| ID | Risk | Severity | Status | Mitigation / evidence |
| --- | --- | --- | --- | --- |
| R-INT-01 | Production receives 00220 without release review | High | **Contained** | Production ceiling **00219**; local-only apply documented |
| R-INT-02 | Double supplier wallet credit under concurrency | High | **Mitigated** | `uq_wallet_supplier_event_source` + post-lock duplicate check in 00220 |
| R-INT-03 | Referral abuse (self/duplicate/circular) only in app layer | Medium | **Accepted** | Domain `evaluateSupplierReferralBonus`; SQL credits only via service_role orchestration — wire hook before prod |
| R-INT-04 | Email delivery not observable in CI | Medium | **Open** | CLASSIFICATION: BLOCKED — ENVIRONMENT; UI does not fake DELIVERED |
| R-INT-05 | WhatsApp/Meta/Twilio credentials absent locally | Medium | **Open** | Mocked HTTP paths tested; live delivery BLOCKED — EXTERNAL CREDENTIALS |
| R-INT-06 | Dirty working tree / uncommitted integration | Medium | **Open** | Documented; no commit this pass |
| R-INT-07 | `npm run build` not executed in agent environment | Low | **Open** | BLOCKED — ENVIRONMENT; vitest bundle green |
| R-INT-08 | ONDC enabled flag without keys | Low | **Mitigated** | `NOT_CONFIGURED`, zero candidates (tests) |
| R-INT-09 | Google/ONDC provenance upgraded to OTP_VERIFIED | High | **Mitigated** | `supplier-network-provider.test.ts`; OTP adapter lifecycle labels separate from Google bucket |
| R-INT-10 | Supplier cashback reintroduction | Medium | **Mitigated** | SQL + domain explicitly reject SUPPLIER_CASHBACK |

## Proposed migration (not filed)

If referral pairing must be enforced in-database (not only domain), a **future** migration could add a `supplier_referral_credits` uniqueness table — **STOP**: documented here only; **00221 not created** per mission.
