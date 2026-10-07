# Migration history

Milestone index only. Files `00001` through `00247` are on disk and contiguous. This page does not restate their SQL. Hosted apply of `00246` and `00247` was not done. Prior manual hosted verification was `00245`.

Hosted apply of any row: `UNKNOWN`.

| File | Why it is a milestone |
| --- | --- |
| `00001_enums.sql` | Enumerations. |
| `00003_auth_helpers.sql` | Auth helpers. |
| `00004_rls_policies.sql` | Early RLS. Later migrations replace many policies. |
| `00007_governance_quote_policies.sql` | Quote policies. |
| `00030_publish_requirement.sql` | Publish path. |
| `00045_award_closeout_mutual_reveal.sql` | Early reveal. |
| `00049_committee_access.sql` | Committee read access. `00238` says this stayed broad. |
| `00151_atomic_award_and_po_transaction.sql` | Earlier atomic award attempt. Superseded for `lock_and_reveal_award_atomic` by later files, latest body `00222`. |
| `00176_phase5d_double_entry_financial_ledger.sql` | Ledger migration exists. Live use of that ledger for buyer–supplier settlement is not claimed. |
| `00184_production_clean_state_reset_and_demo_isolation.sql` | Demo isolation / clean state. |
| `00191_dynamic_approval_routing_and_market_intelligence.sql` | Approval route origin. `00237` says the earlier function did not insert stages. |
| `00192_approval_execution_orchestration_and_award_gate.sql` | Award gate. |
| `00216_verified_remediation_p0_p1_security_integrity.sql` | Closed P0/P1 remediation file. Not reopened. |
| `00222_otp_document_issuance_snapshots.sql` | Latest `lock_and_reveal_award_atomic` found. Older `reveal_award` here swallowed PO errors; `00244` replaces `reveal_award`. |
| `00224_location_pin_coverage_authority.sql` | Coverage tables and Google daily budget counter. |
| `00237_p1_msme_approval_stage_materialization.sql` | Stages are inserted by `evaluate_and_stamp_approval_route_atomic`. |
| `00238_p1_rwa_vote_authority_write_boundary.sql` | Appointment and seat and conflict recusal. |
| `00240_p1_payment_plan_persisted_on_po.sql` | Payment structure columns and resolvers. |
| `00241_p1_decision_receipt_truthfulness.sql` | Decision receipt. `00245` says it reuses that tax split. |
| `00242_p1_authoritative_write_boundaries_and_msme_route_derivation.sql` | Client write boundaries. Award fails closed when a required route has no stages. |
| `00243_p1_freeze_organization_classification_fields.sql` | Classification freeze. Body not re-summarised. |
| `00244_f07_reveal_award_verified_atomic_and_f08_founder_truth.sql` | Atomic verified `reveal_award`. Founder metrics. Places budget read. |
| `00245_f13_po_gst_tax_accuracy.sql` | PO GST from the quote snapshot. No historical backfill. |
| `00246_buyer_signup_allowlist_and_reveal_po_guard.sql` | Buyer signup allow-list (`INDIVIDUAL`, `COMMUNITY`, `MSME`) and auto-reveal purchase-order guard. Hosted NOT applied. Enum values not dropped. |
| `00247_revoke_record_verified_payment_client_execute.sql` | Revokes client EXECUTE on `record_verified_payment`. Hosted NOT applied. |

CI `EXPECTED_CEILING` in `.github/workflows/ci-cd.yml` is the string `00247`. That is the workflow’s expectation, not a hosted observation.
