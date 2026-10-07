# Database overview

Engine: Postgres via Supabase. Schema files: `supabase/migrations`. Local ceiling: `00001`–`00247`, 247 files, contiguous. HOSTED DATABASE CEILING NOT RE-VERIFIED. Prior manual verification was `00245`. `00246` and `00247` are on disk and were not applied to hosted.

`supabase/config.toml` exists. It was not treated as proof of a running local or hosted database.

## Where rules live

| Concern | Home |
| --- | --- |
| Enums | `00001_enums.sql` and later alterations |
| RLS | `00004_rls_policies.sql` and many later replacements |
| Votes | Trigger in `00238` |
| Awards and PO writes | Security-definer RPCs plus `00242` client-write guards |
| PO tax and payment plan | `00240` columns; `00245` function |
| Signup buyer allow-list and reveal PO guard | `00246` replaces `submit_signup_request` and `lock_and_reveal_award_atomic`. Hosted NOT applied. |
| Places coverage | Tables in `00224` |

Business rules that must survive a modified client are in these functions, not only in `apps/web`.

## Tables cited by the functions that were read

| Table | Why it is in the canonical docs |
| --- | --- |
| `rfqs`, `awards`, `quotes`, `quote_versions`, `suppliers` | Reveal and PO |
| `purchase_orders`, `work_orders`, `work_order_milestones` | PO, schedule |
| `requirements` | `commercial.paymentTerms` |
| `rfq_approval_stages` | Persisted route |
| `committee_votes`, `committee_assignments`, `org_role_assignments`, `organization_members`, `organizations`, `profiles` | Vote authority |
| `conflict_of_interest_declarations` | `DECLARED_CONFLICT` |
| `google_places_daily_budget`, `location_pin_coverage_scope`, `location_pin_coverage_supplier`, `location_pin_coverage_generation` | Places coverage (`00224`) |
| `platform_fee_transactions` | Read by founder metrics (`00244`) |
| `audit_events` | Reveal audit insert |

This is not a schema dump. Columns not mentioned were not re-verified.

## Apply rule

A file on disk changes nothing until a person or the GitHub Actions production job applies it. See [SUPABASE.md](../10-platform/SUPABASE.md). `00245` replaces functions and does not backfill purchase orders.
