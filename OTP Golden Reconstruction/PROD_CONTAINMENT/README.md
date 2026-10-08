# PROD_CONTAINMENT — emergency privilege containment for production at ≤00195

These files are documentation, not migrations. **Do not** put them in `supabase/migrations/`.
You run them yourself in the Supabase SQL editor for project `qsuvtcezffomtwzwyrso`.
They change who may **call** some database functions. They do not change what any function does, and they do not touch data (the one exception is the optional 01b S4 below).

## Run order

| Step | File | Writes? | What to look for |
|---|---|---|---|
| 1 | `00_preflight_readonly.sql` | no | Download the CSV and keep it. It records the pre-containment state. |
| 2 | `01_containment.sql` | privileges only | Should end with `COMMIT`. If there is any error, the whole script rolls back. |
| 3 | `02_verify.sql` | no | First row should read `01 CONTAINED: 63/63`. |
| 4 | `04_fabricated_quotes_inventory_readonly.sql` | no | Run Q1 through Q8 **one at a time** (highlight one query, then Run) and download each result. |
| opt | `01b_optional_strict.sql` | privileges (S1–S3), one row (S4) | Run only the sections you accept, one section at a time, then run 02 again. |
| undo | `03_rollback.sql` | privileges only | Afterwards, 02 should read `01 NOT IN EFFECT: 63 exposed`. |

The Supabase SQL editor only shows the result of the **last** statement. That is why 00 and 02 are each a single query, and why 04 must be run one query at a time.

## What to check in 00 before running 01

- **Section 1 (MIGRATION):** confirms how far production actually got. `scripts/deploy-migrations.ts` records each migration in two tracking tables:
  - `public.otp_schema_migrations`, where `version` is the filename, e.g. `00195_….sql`;
  - `supabase_migrations.schema_migrations`, where `version` has no `.sql`.

  The script reads both tables together. The row "00196..00211 recorded" should say `NONE`.
- **Section 2:** `organization_invitations.role` should be `true` (added by 00190, and the reason main's 00196 fails). The `…_impl` and `assert_synthetic…` rows should be `false` (00198 was never applied).
- **Section 3:** every target should be `present` with `anon=true`. Anything `NOT PRESENT` is skipped by 01.
- **Section 4 (BODY):** `true` confirms the vulnerable 00161/00188 code is live.
- **Section 5 (NEW_FN):** at ≤00195, all five functions should be `NOT PRESENT`: `upsert_buyer_address_atomic`, `get_buyer_addresses`, `issue_activation_credential_otp`, `issue_profile_credential_otp`, `log_client_audit_event`. If any exists, production is not at ≤00195 — stop and tell me.
- **Section 7 (RUNTIME):** the `supplier_network_stub_enabled` value. See "Not closed by 01" below.
- **Section 8 (ADMIN_EMAIL):** which hard-coded admin-allowlist emails already have accounts. Any allowlisted email that has **no** `auth.users` row can currently be claimed by anyone (explained below).
- **Section 9 (ROLLBACK_GEN):** the exact GRANT statements that recreate today's privileges. If every line ends in `TO PUBLIC, anon, authenticated, service_role;`, then `03_rollback.sql` restores the pre-containment state exactly.

## What 01 does

It targets 63 exact function signatures, listed in the file. Everything it revokes, main's 00198–00211 also revoke.

- **Group A: quote simulators.** Revoked from PUBLIC, anon and authenticated; service_role keeps access.
  - `public.seed_simulated_quotes_for_rfq(uuid, integer)` (00188). Writes `snapshot.simulated = true` quotes on any RFQ and invites the top-rated ACTIVE suppliers, which are the seeded ones.
  - `public.auto_submit_pilot_quotes(uuid)` (00084/00188). This is the second simulator. It runs only on **real** RFQs, and writes `snapshot.simulated = false`.
- **Group B.** Revoked from PUBLIC and anon; authenticated and service_role keep access. None of these has a signed-out caller in the current or previous frontend.
  - `public.admin_review_signup_request(uuid, text, text, text)` and its alias `public.review_signup_request(uuid, text, text, text)`. The alias is SECURITY DEFINER and calls the main function, so revoking only one would leave the hole open.
  - 44 admin RPCs whose guard at ≤00195 always evaluates true for any caller (the list main's 00199 sweeps). These include `admin_run_diagnostic_query(text)`, which runs any SELECT as the database owner (anon could read `auth.users` password hashes), plus purge, restore backup, bulk delete and similar.
  - `admin_toggle_supplier_network_stub`, `admin_mark_notification_read`, `admin_bulk_delete_users`, `lock_and_reveal_award_atomic`, `get_organization_subscription`, `get_purchase_order_invoicing_summary`, `supplier_rfq_message_payload`, `apply_tds_withholding_atomic`, `accept_delivery_inspection`, `get_current_procurement_step`, `advance_procurement_step`, `create_system_notification`, `request_profile_credential_otp`, `verify_and_update_profile_credential`, `assert_production_data_integrity`.
- Finally, `NOTIFY pgrst, 'reload schema';`.

## Decision: `admin_review_signup_request` keeps the `authenticated` grant

The 00161 body has **no effective admin check**. If none of its admin tests match, it falls through to `IF auth.role() IN ('authenticated','anon') THEN v_caller_is_admin := true`.

The admin console's Approve button calls this function with the admin's own signed-in session. Revoking `authenticated` would therefore break every approval from the UI. 01 revokes anon only.

**Residual risk while only 01 is in force:** any signed-in user can approve or reject any pending signup and choose the new account's password. Combined with `private.is_platform_admin()` trusting a hard-coded email allowlist (`admin@otp.test`, `bvnbasu@gmail.com`, `ops@otp.test`, `superadmin@otp.test`, `admin@otp.ai`, `ops@otp.ai`, `admin@procureos.test`), this means a signed-in user can do the following for any allowlisted email that has no account yet:

1. Submit a signup for that email.
2. Approve it themselves.
3. Sign in as a platform admin.

This was proven locally, before containment, even as anon. Check section 8 of 00. If you want to close it, run **01b S1**. Admins then approve from the SQL editor with the snippet in 01b; this was tested locally and works because `session_user = postgres` passes the admin check.

## Not closed by 01 (decide; see 01b)

- **01b S3: anonymous account takeover via password reset.** `request_whatsapp_password_reset(text)` returns the OTP code in the response. Verified locally: anon requested a reset using only a phone number, read the code, called `verify_whatsapp_password_reset`, and signed in with the new password. Revoking it **breaks "forgot password"**, and at ≤00195 there is no working replacement, because the `otp-dispatch` edge function needs `issue_*` SQL functions that don't exist yet.
  - The same code leak exists in `request_profile_verification_otp(text)`, which the signup form uses, and in `request_profile_credential_otp`, used when a signed-in user changes their phone or email.
- **01b S4: fabricated quotes on every real RFQ.** At ≤00195, `discover_and_invite_for_rfq` (the buyer's "find suppliers" step) calls `auto_submit_pilot_quotes` internally whenever the stub flag is on. The flag also counts as on when no settings row exists. Because this call happens inside the function itself, 01 cannot block it.
  - Locally, after 01, a normal buyer's discovery still produced 10 fabricated quotes. With S4 applied it produced 0.
  - S4 is a one-row settings change. Note the section 7 value first so you can undo it.
- **01b S2:** signed-in users can still call destructive admin RPCs (for example purge, restore, the diagnostic SQL runner and bulk delete). Revoking `authenticated` on them disables those admin-console buttons.

## What breaks after 01 (01b not applied)

- The "Generate simulated quotes" button on the evaluation screens returns "permission denied" for every user. This is intended.
- Nothing else that a real user calls while signed out. Signed-in flows keep working; this was checked locally for admin approval, subscription lookup and supplier discovery.
- Signed-out calls to the Group B functions now get HTTP 401 with code 42501, where they used to return data or errors. No page in the current or previous frontend makes those calls signed out.

## Rollback

Run `03_rollback.sql`. It grants EXECUTE back to PUBLIC, anon, authenticated and service_role on everything 01 and 01b touched. That is exactly the pre-containment set; locally, 0 functions differed afterwards, and only the order of ACL entries changed. If section 9 of 00 showed anything different, run those saved lines instead. S4 is undone by hand, using the statement at the bottom of 03.

## Decisions already made (recorded here, not implemented in this pack)

- Supplier status mapping: `DOCUMENT_VERIFIED` / `PLATFORM_VERIFIED` → `VERIFIED`; `SELF_DECLARED` → `NOT_PROVIDED`; `UNVERIFIED` → `NOT_PROVIDED`.
- Existing real suppliers default to `VERIFIED`; seeded or demo suppliers are **not** verified. 04 Q6 lists them. The stable markers are ids in the `0d500000-0000-4000-8000-*` block, `*.test` contact emails, or `is_demo`. At ≤00195, 28 of the seeded suppliers are `is_demo = false`, ACTIVE and top-rated, which is exactly who the simulators invite.
- Fabricated quotes: inventory only for now (04). Cleanup will be decided later.
- The full fix (fix-00196 + 00212) is **on hold** until you confirm the production migration state from 00 section 1.

## Notes on 04

- Q1–Q3 identify fabricated quotes as follows:
  - `seed_simulated_quotes_for_rfq`: `snapshot->>'simulated' = 'true'` plus `tierName`.
  - `auto_submit_pilot_quotes`: its five fixed note texts. Its snapshot says `simulated = false`.
  - `demo_generate_quotes`: `simulated = true` on demo RFQs.
- Q4 only catches invitations made by the simulator itself or by discovery's fallback step. Invitations from discovery's ranked step look identical to real ones.
- Q8 counts accounts still using `Welcome@OTP2026!` (the default approval password in 00161) or `password` (the seed password). It returns counts only. It hashes once per account, so it can take a minute on large user tables.
