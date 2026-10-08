# Migration history

Milestone index only. Files `00001` through `00252` are on disk and contiguous. This page does not restate their SQL. On 2026-10-08 the hosted `schema_migrations` ceiling was read as `00252`, with `00250`, `00251`, and `00252` present. Local Docker `127.0.0.1:54322` is also at `00252`. Older notes had recorded a manual hosted ceiling of `00245`. A GitHub Actions migration job is not a database reading.

| File | Why it is a milestone |
| --- | --- |
| `00001_enums.sql` | Enumerations. |
| `00003_auth_helpers.sql` | Auth helpers. |
| `00004_rls_policies.sql` | Early RLS. Later migrations replace many policies. |
| `00007_governance_quote_policies.sql` | Quote policies. |
| `00030_publish_requirement.sql` | Publish path. |
| `00045_award_closeout_mutual_reveal.sql` | Early reveal. |
| `00049_committee_access.sql` | Committee read access. `00238` says this stayed broad. |
| `00151_atomic_award_and_po_transaction.sql` | Earlier atomic award attempt. `lock_award` is replaced again by `00252`. |
| `00176_phase5d_double_entry_financial_ledger.sql` | Ledger migration exists. Live use of that ledger for buyer–supplier settlement is not claimed. |
| `00184_production_clean_state_reset_and_demo_isolation.sql` | Demo isolation / clean state. |
| `00191_dynamic_approval_routing_and_market_intelligence.sql` | Approval route origin. `00237` says the earlier function did not insert stages. |
| `00192_approval_execution_orchestration_and_award_gate.sql` | Award gate. |
| `00216_verified_remediation_p0_p1_security_integrity.sql` | Closed P0/P1 remediation file. Not reopened. |
| `00222_otp_document_issuance_snapshots.sql` | Earlier `lock_and_reveal_award_atomic`. Older `reveal_award` here swallowed PO errors; `00244` replaces `reveal_award`. Current award lock body is `00252`. |
| `00224_location_pin_coverage_authority.sql` | Coverage tables and Google daily budget counter. |
| `00237_p1_msme_approval_stage_materialization.sql` | Stages are inserted by `evaluate_and_stamp_approval_route_atomic`. |
| `00238_p1_rwa_vote_authority_write_boundary.sql` | Appointment and seat and conflict recusal. |
| `00240_p1_payment_plan_persisted_on_po.sql` | Payment structure columns and resolvers. |
| `00241_p1_decision_receipt_truthfulness.sql` | Decision receipt. `00245` says it reuses that tax split. |
| `00242_p1_authoritative_write_boundaries_and_msme_route_derivation.sql` | Client write boundaries. Award fails closed when a required route has no stages. |
| `00243_p1_freeze_organization_classification_fields.sql` | Classification freeze. Body not re-summarised. |
| `00244_f07_reveal_award_verified_atomic_and_f08_founder_truth.sql` | Atomic verified `reveal_award`. Founder metrics. Places budget read. |
| `00245_f13_po_gst_tax_accuracy.sql` | PO GST from the quote snapshot. No historical backfill. |
| `00246_buyer_signup_allowlist_and_reveal_po_guard.sql` | Buyer signup allow-list (`INDIVIDUAL`, `COMMUNITY`, `MSME`) and auto-reveal purchase-order guard. Hosted apply not independently re-queried. Enum values not dropped. |
| `00247_revoke_record_verified_payment_client_execute.sql` | Revokes client EXECUTE on `record_verified_payment`. Hosted apply not independently re-queried. |
| `00248_yearly_plan_quarterly_rfq_bonus.sql` | Yearly plan may publish one extra RFQ in the current UTC quarter after the month already has 3. SHA-256 `a5faa3b32719eccc5de18acf7dac9cbed721a4bb07bc31015b568a02bf69df9f`. Hosted apply not independently re-queried. |
| `00249_freeze_organization_subscription_entitlement_fields.sql` | Rejects ordinary client writes of `subscription_plan`, `subscription_status`, and `subscription_expires_at`. Does not verify payments. Hosted apply not independently re-queried. |
| `00250_financial_authority_client_grant_boundary.sql` | Client payment reference does not write subscription entitlement. Fee client writes are rejected. Buyer reward execute is service_role only. Pilot supplier fee charged in SQL is 0. Catalog yearly prices match `SUBSCRIPTION_TIERS`. Present in the hosted history read on 2026-10-08. |
| `00251_fresh_pin_coverage_otp_registered_fallback.sql` | Fresh pin coverage with no addressable supplier may invite OTP-registered suppliers. Non-fresh coverage does not. Present in the hosted history read on 2026-10-08. |
| `00252_rwa_award_quorum_met.sql` | RWA/COMMUNITY award lock rejects when fewer than two unconflicted recommendations exist. Individual and MSME are not given that gate. Hosted proof is the function body, not a live award. |

CI `EXPECTED_CEILING` in `.github/workflows/ci-cd.yml` is the string `00252`. Hosted `schema_migrations` ceiling read on 2026-10-08 is `00252`.
