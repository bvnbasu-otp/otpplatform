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
| `00253_cancelled_rfq_allowance_and_utgst.sql` | Cancelled RFQs do not consume the monthly allowance or the quarterly bonus. Intra-state Union Territory GST is CGST + UTGST. Inter-state stays IGST. |
| `00254_individual_signup_property_owner_catalog_and_rpc.sql` | Individual signup property owner role catalog and provisioning RPC. |
| `00255_restore_requirement_categories_canonical.sql` | Restores canonical requirement categories integrity. |
| `00256_standardize_auth_otp_eight_digits.sql` | Standardizes email and SMS auth OTP codes to 8 digits with strict expiration. |
| `00257_canonical_role_catalog_and_signup_provisioning.sql` | Canonical role catalog and signup provisioning RPC hardening. |
| `00258_rwa_committee_vote_authority_trigger_order.sql` | RWA committee vote authority trigger ordering. |
| `00259_document_reveal_integrity_digest_hmac_parity.sql` | Document reveal integrity digest HMAC parity. |
| `00260_otp_deterministic_hmac_utf16_code_units.sql` | OTP deterministic HMAC UTF-16 code units parity with TypeScript. |
| `00261_admin_run_test_case_truthful_execution_and_auth.sql` | Authoritative test case runner execution RPC with strict admin checks. |
| `00262_admin_run_diagnostic_query_allowlist_hardening.sql` | Read-only diagnostic query allowlist hardening. |
| `00263_guard_profile_privileges_empty_role_bypass.sql` | Blocks profile privilege escalations across empty role codes. |
| `00264_remediate_privileged_lifecycle_and_audit_contracts.sql` | Hardens privileged account lifecycle and audit trail contracts. |
| `00265_remediate_buyer_taxonomy_and_rls_integrity.sql` | Enforces buyer taxonomy integrity and RLS policy boundaries. |
| `00266_remediate_supplier_coverage_and_dispatch.sql` | Remediates nationwide supplier coverage discovery and RFQ dispatch queries. |
| `00267_authoritative_founder_and_admin_claims.sql` | Authoritative founder claim isolation (`private.is_founder()` requires `profiles.is_founder = true`) and admin security. |
| `00268_complete_nationwide_pincode_resolution.sql` | Nationwide postal pincode directory resolution and geographical coverage mapping. |
| `00269_harden_sourcing_mode_identity_reveal.sql` | Hardens sourcing modes (`OPEN_RFQ_TENDER`, `IDENTITY_PROTECTED`) and unmasking view (`quotes_revealed`) security barrier so only awarded winners disclose sensitive contacts, while non-winners remain identity-masked. |
| `00270_unsuccessful_rfq_retention_purge.sql` | Unsuccessful RFQ retention lifecycle & 30-day purge RPC (`purge_expired_unsuccessful_rfqs`), strictly preserving drafts, active workflows, awarded contracts, and legal-hold records with permanent audit tombstones. |
| `00271_fix_supplier_messaging_channels_unique_constraint.sql` | Establishes authoritative UNIQUE INDEX on `supplier_messaging_channels(supplier_id, channel)` to resolve Postgres 42P10 errors on `ON CONFLICT` during RFQ supplier invitations; wraps invitation notification dispatch in exception-resilient block to ensure zero rollback of discovery invitations. |
| `00272_add_waha_to_messaging_provider_and_isolate_operator_phone.sql` | Adds 'WAHA' to `messaging_provider` enum; reassigns legacy QA suppliers away from operator handset (`+919972967530`); hardens `dispatch_supplier_invitation_notification` to abort if target phone matches gateway operator handset or buyer phone. |

## Proposals outside the migration runner (checked 23 October 2026)

The last file in `supabase/migrations/` is `00314_internal_invitation_acceptance.sql`. This table has not been extended past `00272`. Files `00273`–`00314` are on disk but not summarised here.

These files sit in `supabase/`, are named `*.UNAPPLIED.sql`, and are not applied to any database. Promoting or applying any of them needs owner authorization ([RELEASE_RUNBOOK.md](../12-operations/RELEASE_RUNBOOK.md)).

| File | Purpose (00317–00319 and 00314 inferred from file name only) | Note |
| --- | --- | --- |
| `00314_internal_procurement_and_supplier_business_address.UNAPPLIED.sql` | Supplier business address | Number collides with the applied `00314` (DEMO-DEL-07) |
| `00315_audit_actor_identity_registry.UNAPPLIED.sql` | Audit actor registry | Prerequisite of 00320. Header lacks the `STATUS: UNAPPLIED` banner (DEMO-DEL-06) |
| `00316_founder_superadmin_role_guard.UNAPPLIED.sql` | Founder SUPER_ADMIN guards | Prerequisite of 00320 |
| `00317_revoke_anon_update_my_organization_name.UNAPPLIED.sql` | Revoke anon org-name update | — |
| `00318_organization_rename_requires_one_row.UNAPPLIED.sql` | Org rename row check | — |
| `00319_rfq_category_service_coverage_guard.UNAPPLIED.sql` | RFQ category coverage guard | — |
| `00320_superadmin_demo_user_deletion.UNAPPLIED.sql` | Demo/QA deletion preview and execute | Apply after 00315, 00316, 00321. See [SUPERADMIN_DEMO_USER_DELETION.md](../12-operations/SUPERADMIN_DEMO_USER_DELETION.md) |
| `00321_restrict_is_demo_marker.UNAPPLIED.sql` | Immutable `is_demo` marker | Must be applied before 00320 |
| `00322_public_contact_enquiries.UNAPPLIED.sql` | Public Contact Us enquiries plus private rate events and a service-role-only atomic limiter: signed server-issued client identity 5/hour, distinct fixed endpoint emergency ceiling 200/hour. Admin reads remain platform-admin only. | Needed by edge function `contact-enquiry`. No retention defined. **CONTACT US — NOT DEPLOYMENT READY.** Static test `tests/security/contact-enquiry-00322.test.ts`; no database concurrency proof. |
| `00323_support_ticket_rpc_hardening.UNAPPLIED.sql` | SEC-SUPPORT-01: require authenticated identity plus `private.is_platform_admin()` for support admin RPCs; revoke anonymous/service-role execution; align support routing address | Depends on applied 00140 and 00201. **IMPLEMENTATION REVIEW ONLY — NOT APPLIED.** Static test `tests/security/support-ticket-rpc-00323.test.ts`; no runtime database verification. |

CI `EXPECTED_CEILING` in `.github/workflows/ci-cd.yml` is being advanced to `00272`. Hosted `schema_migrations` ceiling on Supabase `qsuvtcezffomtwzwyrso` is at 00272.

