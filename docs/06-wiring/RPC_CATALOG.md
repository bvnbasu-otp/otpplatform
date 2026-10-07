# RPC catalog

Authoritative means: the function was found, and the migration named is the latest `CREATE OR REPLACE` located for it. This is not every function in 245 files. Earlier helpers exist. If a name is absent here, its status is `UNKNOWN` until read.

Hosted presence of every row is `UNKNOWN`.

## Award, reveal, purchase order

| Function | Latest file read | Role |
| --- | --- | --- |
| `public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean)` | `00222_otp_document_issuance_snapshots.sql` | Lock award. Auto-reveal only when the supplier is verified and the flag is true. Not replaced by `00244`. |
| `public.reveal_award(uuid)` | `00244_f07_reveal_award_verified_atomic_and_f08_founder_truth.sql` | Verified supplier, then reveal and PO in one transaction. |
| `public.create_purchase_order_from_award(uuid)` | `00245_f13_po_gst_tax_accuracy.sql` | PO, tax, payment schedule, work order. |
| `public.resolve_declared_payment_structure(text)` | `00240_p1_payment_plan_persisted_on_po.sql` | Map terms text to a structure. Still called from `00245`. |
| `public.declared_payment_splits(text)` | `00240` | Canonical splits. Empty for custom. |
| `public.award_runner_up_quote` | `00242` replaces it | Named in `00242`. Body not re-documented here. |
| `private.issue_po_document_snapshots(uuid)` | `00245` | PO document line reads stored tax. |
| `private.issue_decision_receipt_snapshots_for_award` | Called from `00244` and `00222` | Receipt writer. Defining migration not re-opened beyond the call. |

## Governance

| Function | Latest file read | Role |
| --- | --- | --- |
| `public.evaluate_and_stamp_approval_route_atomic(uuid, numeric)` | `00237_p1_msme_approval_stage_materialization.sql` | Persist route and stages. |
| `public.submit_rfq_tier_approval_atomic` | `00237` replaces it | Stage approval. Authority rules described as unchanged from `00219`. |
| `private.enforce_committee_vote_authority()` | `00238_p1_rwa_vote_authority_write_boundary.sql` | Vote insert trigger. |
| `private.guard_award_client_write()` | `00242` | Block client award writes. |
| `private.guard_rfq_approval_stage_direct_write()` | `00237` | Block client stage writes. |
| `private.approval_route_for_amount(uuid, numeric)` | `00237` | Tier computation. |

## Places budget and coverage

| Function | File | Role |
| --- | --- | --- |
| `public.location_pin_coverage_reserve_google_calls` | `00224_location_pin_coverage_authority.sql` | Increments `google_places_daily_budget` or returns `QUOTA_EXHAUSTED`. |
| `public.location_pin_coverage_assess` | `00224` | Coverage assessment. |
| `public.location_pin_coverage_build_scope_key` | `00224` | Scope key. |
| `public.location_pin_coverage_ensure_scope_row` | `00224` | Scope row. |
| `public.location_pin_coverage_try_acquire_generation` | `00224` | Generation lock. |
| `public.location_pin_coverage_assert_generation_lock` | `00224` | Lock check. |
| `public.location_pin_coverage_complete_generation` | `00224` | Finish generation. |
| `public.location_pin_coverage_upsert_suppliers` | `00224` | Persist discoveries. |
| `public.location_pin_coverage_list_suppliers` | `00224` | List discoveries. |
| `public.get_founder_google_places_budget_today()` | `00244` | Founder read of today’s counter. |
| `public.get_founder_executive_metrics()` | `00244` | Founder KPIs. Verified suppliers use the verified predicate. |

## Not catalogued on purpose

Signup RPCs (`submit_signup_request`, `admin_review_signup_request`) are named by the `onboarding-notify` header. Their SQL bodies were not re-read. Status of those bodies: `UNKNOWN` in this catalog, not “absent from the product”.
