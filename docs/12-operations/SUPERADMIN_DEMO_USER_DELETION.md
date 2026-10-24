# SuperAdmin demo/QA user deletion

Source reviewed 23 October 2026 from the working tree on `main`, including uncommitted client files and the uncommitted revision of the 00320 proposal. This is the authoritative page for this workflow. The status word lives in [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). Open findings live in [DOCUMENTATION_DISCOVERED_DEFECTS.md](../13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md) (DEMO-DEL-01 to DEMO-DEL-08).

## Status summary

| Part | Readiness | CAPABILITY_STATUS label | Basis |
| --- | --- | --- | --- |
| Client UI and API wrapper | Implemented and locally verified (against a mocked Supabase client only) | `IMPLEMENTED` | `apps/web/src/features/admin/api/demo-user-deletion.test.ts` and `apps/web/src/features/admin/demo-user-deletion-ui.test.tsx`: 2 files, 35 tests passed on 23 October 2026 against the uncommitted tree. The mock stands in for every server response. |
| Server functions `preview_demo_user_deletion` / `execute_demo_user_deletion` | Proposal only (unapplied) | `NOT-IMPLEMENTED` in any database | `supabase/00320_superadmin_demo_user_deletion.UNAPPLIED.sql`. Not in `supabase/migrations/`. |
| Prerequisites 00315, 00316, 00321 | Proposal only (unapplied) | `NOT-IMPLEMENTED` in any database | Files sit in `supabase/`, outside the migration runner. |
| End-to-end workflow | Blocked pending owner authorization | `PARTIAL` | The UI calls RPCs that do not exist in any database until the owner authorizes applying 00315, 00316, 00321, then 00320. |
| Hosted or runtime proof | Planned or not available | — | No database-backed run, PostgREST call, or hosted check was made for this page. |

**Implementation complete is not the same as deployment ready.** The client and the SQL proposals are written. Deployment readiness still needs the prerequisite integrity checks, database-backed tests, hosted-runtime proof, and release gates listed below. None of those exist yet.

**DEMO-USER DELETION — NOT READY FOR ENFORCEMENT.** Source review found that `effective_superadmin_requester()` unnecessarily required the legacy singular `request.jwt.claim.role` GUC in addition to `auth.uid()` and `auth.role()`. The proposal now uses the established Supabase auth helpers, whose JWT context is server supplied, and still requires the full database-backed effective SUPER_ADMIN holding. This is static source evidence only; modern PostgREST claims-only behavior still needs database/PostgREST runtime proof before enforcement.

## 1. Purpose and scope

- The workflow permanently removes a disposable demo/QA account: its `public.profiles` row and its linked `auth.users` row.
- It is separate from the existing account lifecycle actions in the same panel (block, deactivate, reactivate, audit statement). Those actions keep the account and its history. This one deletes the account. The modal says so: *"Irreversible: this removes both the profile and Auth identity. Existing lifecycle actions remain separate."*
- Eligibility depends only on `public.profiles.is_demo = true`. The 00320 header says that email, name, title, and other strings the caller controls are never used to classify a target. A name or email pattern (for example `@otp.test` or "QA") is not evidence that an account is disposable. Users can set those strings, and a real account can look like a test account.
- 00321 makes `is_demo` a trusted marker. Only a database-operator `INSERT` without JWT context can create `is_demo = true`. A false-to-true `UPDATE` is always denied, including for service role and the database owner. A founder profile can never carry the marker.

## 2. Where it lives and what the operator sees

| Piece | Path |
| --- | --- |
| Route | `/admin?tab=users` (also `user`, `roster`, `users_orgs`; the value is upper-cased), rendered by `apps/web/src/features/admin/pages/AdminDashboardPage.tsx`. The Organizations and Approvals tabs render the same panel. |
| Panel | `apps/web/src/features/admin/components/AdminUsersActivityPanel.tsx` |
| Modal | `apps/web/src/features/admin/components/DemoUserDeletionModal.tsx` (new, untracked) |
| API wrapper | `apps/web/src/features/admin/api/demo-user-deletion.ts` (`fetchDemoQaAccountIds`, `previewDemoUserDeletion`, `executeDemoUserDeletion`) |
| Row mapping | `normalizeAdminUserItem` in `apps/web/src/features/admin/api/admin-ops.ts` adds `isDemo`. The `AdminUserItem.isDemo` type is in `apps/web/src/features/admin/types/admin.ts`. |

### Selecting a target

- The **Delete demo/QA** button (tooltip *"Preview permanent demo/QA account deletion"*) appears in the desktop table and on mobile cards only when all three of these are true:
  - the session is an effective SUPER_ADMIN in the client role context (`isPlatformAdmin === true` and active role `SUPER_ADMIN`);
  - the row is known to be demo. A row counts as demo when `profiles.is_demo` came back on the roster row, or when `fetchDemoQaAccountIds` (`profiles` where `is_demo = true` and `deleted_at is null`) listed it. If that lookup fails, the panel keeps the last successful list;
  - the row is not a platform admin. Platform-admin rows show "Protected Admin" or "Protected" instead.
- Non-SuperAdmin personas skip the demo lookup and see no button.
- **Hiding the button is not a security boundary.** Every rule above is repeated or replaced by the server functions in 00320.

### Preview

- Opening the modal requests a preview at once (*"Requesting server-authorized preview…"*). The modal shows Target, Email, Profile ID, and a UI marker (*"Demo/QA"* or *"Not marked demo — action unavailable"*).
- The preview shows the server's eligibility (*Eligible* or *Ineligible*), the blocker count, and the preview expiry (or *"No token issued"*).
- Policy blockers are listed as `category: code`. The codes are `identity: TARGET_NOT_TRUSTED_DEMO_QA`, `identity: FOUNDER_IDENTITY_PROTECTED`, and `authorization: LAST_EFFECTIVE_SUPERADMIN_PROTECTED`.
- Dependency details show *"(N catalog entries)"*. Each blocking entry is listed as `schema.table.column — category, N row(s), disposition`. When nothing blocks, the modal says *"No retained dependency blocks were found."*
- **Request fresh preview** discards the current token and the typed confirmation.

### Execute

**Permanently delete account** is enabled only when all of the following hold:

- the server returned `eligible`;
- the blocker count is 0;
- the server issued a token;
- the client-side expiry has not passed;
- the typed email matches the target email exactly (no trimming);
- Reason and Expected outcome are both non-blank;
- no request is already in flight.

On click, the modal checks expiry again. A double-submit guard allows only one request. Escape and backdrop clicks are ignored while a request is in flight.

### Messages the UI shows

| Server or client condition | Text shown | Preview cleared? |
| --- | --- | --- |
| `DEMO_USER_DELETE_STALE_PREVIEW` | "The account changed after this preview. Request a fresh preview and review every dependency again." | Yes |
| `DEMO_USER_DELETE_CONFIRMATION_EXPIRED` or client expiry | "This preview expired. Request a fresh preview before trying again." | Yes |
| `DEMO_USER_DELETE_CONFIRMATION_MISMATCH` | "The one-time confirmation is no longer valid. Request a fresh preview." | Yes |
| `DEMO_USER_DELETE_BLOCKED` | "Deletion is blocked by the current server-side account state. Request a fresh preview." | Yes |
| `DEMO_USER_DELETE_DENIED` or `permission denied` | "The server denied this action. An effective active SUPER_ADMIN session is required." | No |
| Any other server error (for example `STALE_IDENTITY`, `TARGET_NOT_FOUND`, `AUTH_NOT_FOUND`, `POSTCHECK_FAILED`, or a trigger exception) | Raw server message | No (DEMO-DEL-03) |
| Malformed preview | "The server did not return a deletion preview." | — |
| Success response missing a count or audit id | "The server did not confirm the deletion." | — |
| Client pre-checks | "A target account is required." / "Run a fresh preview before deleting." / "A reason is required." / "An outcome is required." | — |
| Success | "✓ Permanently deleted demo/QA account {email}. Audit event: {id}" | Modal closes. The row is removed locally. |
| Success, but the roster refresh failed | "The deletion succeeded, but the user roster could not be refreshed. Reload this page to see the current roster; do not retry the deletion." | — |

The client reports success only when the server returns `ok: true`, the same target id, `deletedProfileCount = 1`, `deletedAuthUserCount = 1`, and an `auditEventId`. After success the double-submit guard stays engaged, so the same token is never sent again. The roster refresh after a deletion never calls the delete RPC again.

## 3. Two phases: preview, then execute (00320)

- **Preview** (`public.preview_demo_user_deletion(uuid)`):
  - Resolves the requester with `private_security.effective_superadmin_requester()`.
  - Builds a snapshot with `private_security.demo_user_deletion_snapshot`.
  - Computes a SHA-256 fingerprint over the target's identity, requester, founder and SuperAdmin facts, status, `deleted_at`, the full dependency list, and the policy blockers.
  - Only when the snapshot is eligible: issues a 32-byte random token, valid for **10 minutes**. Only its SHA-256 hash is stored, in `private_security.demo_user_deletion_previews`, bound to requester, target, Auth user, and fingerprint.
  - An ineligible preview returns no token.
- **Execute** (`public.execute_demo_user_deletion(uuid, text, text, text)`):
  - Requires an effective SuperAdmin, `session_replication_role = origin` (so triggers are active), a non-blank reason and outcome, and a token.
  - Locks rows in a fixed order: the preview row (unconsumed, same requester and target, `FOR UPDATE`), then the profile, then the Auth user.
  - Rejects an expired token (`CONFIRMATION_EXPIRED`) and a changed Auth link (`STALE_IDENTITY`).
  - Recomputes the snapshot and rejects a changed fingerprint (`STALE_PREVIEW`) or a now-ineligible state (`BLOCKED`).
  - Any change between preview and execute forces a new preview, including a change in the SuperAdmin count, a new dependency row, or a status change.
- **Repeated requests:**
  - On success the token is marked consumed, so a resubmission matches no row (`CONFIRMATION_MISMATCH`).
  - A failed execute rolls back the whole transaction. The token stays unconsumed until it expires, and the next attempt re-runs every check.

## 4. Eligibility and protected identities

| Rule | Where enforced |
| --- | --- |
| Caller must be an authenticated user with a SUPER_ADMIN `profile_roles` row on an active `user_roles` code, a matching `internal_user_assignments` row on the `SUPER_ADMIN` internal role, `is_platform_admin`, `active_role_code = SUPER_ADMIN`, status not BLOCKED/SUSPENDED/DELETED, and `deleted_at` null | `effective_superadmin_requester()` (00320) |
| Target must have `is_demo = true` | Snapshot policy blocker. The final `DELETE` also filters on `is_demo IS TRUE` |
| Founder (`is_founder`) cannot be deleted | Snapshot policy blocker. The 00316 `aa_guard_founder_profile_delete` trigger. 00321 forbids founder + demo |
| The last effective SuperAdmin cannot be deleted | Snapshot policy blocker `LAST_EFFECTIVE_SUPERADMIN_PROTECTED` |
| Founder SUPER_ADMIN holdings cannot be changed through role, assignment, or catalog tables | 00316 triggers (listed in the 00320 preconditions) |
| Target must have an Auth identity | Snapshot raises `DEMO_USER_DELETE_BLOCKED: target Auth identity is missing` |
| Root SuperAdmin emails on `private_security.admin_whitelist` cannot be deleted | Existing `private_security.enforce_superadmin_immutability()` (00296). **The preview does not model this check** (DEMO-DEL-01) |

Grants: `preview_*` and `execute_*` are `EXECUTE` for `authenticated` only. `PUBLIC`, `anon`, and `service_role` are revoked. The helpers, the manifest, and the preview table are revoked from every API role. 00320 also revokes every grant on the historical `public.admin_bulk_delete_users(uuid[], boolean)`. No application code outside tests references that function.

## 5. Dependencies, evidence, and post-checks

- **Inventory:** every single-column and composite FK in `pg_constraint` that targets `public.profiles` or `auth.users` is classified only through the reviewed manifest `private_security.demo_user_deletion_fk_manifest()` (120 rows). The manifest was reviewed against the local schema at 00313 plus 00315. Table names are never pattern-matched.
- **Blocking rules:**
  - An FK missing from the manifest blocks (`block_unknown_fk`), even at zero rows.
  - A composite FK blocks.
  - An FK whose catalog delete action differs from the manifest blocks (`block_fk_action_drift`).
  - Any populated row in a retained category blocks: `audit_history`, `legal_evidence`, `procurement_finance_tax`, `organization_supplier`, `messaging_delivery`, `security_identity`.
  - Two owner-exclusion rows (`profile_roles.assigned_by` and `internal_user_assignments.assigned_by`) ignore rows owned by the target. Rows that point at other accounts still block.
- **Delete order (explicit allowlist, no `CASCADE` in any `DELETE`, no constraint or trigger disabled):**
  1. `internal_user_assignments`
  2. `profile_roles`
  3. `notification_preferences`
  4. `profile_verification_otps`
  5. `demo_accounts`
  6. `private.password_history`
  7. `public.profiles` (requires the same Auth id and `is_demo`)
  8. `auth.users`. Only the manifest-listed Auth tables cascade: sessions, identities, MFA, OAuth, one-time tokens, WebAuthn.
- **Evidence kept:**
  - The 00315 `audit_actor_identities` row survives with `profile_id` set to null and `profile_deleted_at` set. Existing `audit_events` rows are not updated or deleted.
  - The preview row is kept, consumed, and linked to the audit event. Its target UUIDs deliberately have no FK.
  - A new `audit_events` row `admin.demo_user_deleted` records the requester as actor and the target id. Its payload holds the target and Auth ids, preview id, fingerprint, reason, outcome, the dependency preview, and `trustedDemoQa`.
- **Post-checks (raise `DEMO_USER_DELETE_POSTCHECK_FAILED` and roll back):**
  - exactly 1 profile and 1 Auth row deleted;
  - no allowlisted account rows remain;
  - the audit actor evidence was kept;
  - the audit event exists;
  - the token was consumed.
- **Missing:**
  - The preview does not model `BEFORE DELETE` triggers on `profiles` or `auth.users`, such as the 00296 whitelist (DEMO-DEL-01).
  - Preview rows have no retention or purge (DEMO-DEL-04).
  - Nothing outside the transaction verifies the result after commit, for example an operator query or report.

## 6. Proposal status and dependency chain

Filesystem check on 23 October 2026: the last file in `supabase/migrations/` is `00314_internal_invitation_acceptance.sql`. No file numbered `00315`–`00321` is in `supabase/migrations/`.

| Proposal | Location | Status | Role |
| --- | --- | --- | --- |
| `00315_audit_actor_identity_registry.UNAPPLIED.sql` | `supabase/` | Proposal only (unapplied) | Durable audit-actor registry. Repoints `audit_events.actor_id`. Keeps attribution after a profile is deleted. Its header reads like an applied migration and lacks the `STATUS: UNAPPLIED` banner (DEMO-DEL-06). |
| `00316_founder_superadmin_role_guard.UNAPPLIED.sql` | `supabase/` | Proposal only (unapplied) | Founder SUPER_ADMIN guards on `profiles`, `profile_roles`, `internal_user_assignments`, `internal_roles`, `user_roles` (including `TRUNCATE`). Needs the schema through 00301. |
| `00321_restrict_is_demo_marker.UNAPPLIED.sql` | `supabase/` | Proposal only (unapplied) | Immutable `is_demo` marker trigger `trg_guard_profile_is_demo_marker`. |
| `00320_superadmin_demo_user_deletion.UNAPPLIED.sql` | `supabase/` | Proposal only (unapplied). Modified, uncommitted. | Preview/execute functions, manifest, preview table, revoke of `admin_bulk_delete_users`. |

Required apply order, stated in the 00320 header: **00315 → 00316 → 00321 → 00320**. 00321 must go before 00320 even though its number is higher. 00320 refuses to install if any prerequisite function or trigger is missing. `00317`, `00318`, `00319`, and the separate `00314_internal_procurement_and_supplier_business_address.UNAPPLIED.sql` are also unapplied proposals in `supabase/`. They are not prerequisites of 00320. The `00314` number collides with the applied `migrations/00314_internal_invitation_acceptance.sql` (DEMO-DEL-07).

Open prerequisites: owner review and authorization of all four files, a decision on the 00314 number collision before anything is promoted, and the runtime checks in section 7.

## 7. Security and release limitations

### What the 00320 preconditions check

For each of the 16 required prerequisite triggers, the checks are:

- the trigger exists under that name, is not internal, and sits on the expected table;
- it is bound to the expected function, with no arguments, returning `trigger`;
- it is enabled (`O` or `A`, so not disabled and not replica-only);
- the function's `SECURITY DEFINER` flag matches;
- the function's `search_path` setting matches exactly.

### What they do not check (prerequisite-function integrity limitations)

- **Trigger semantics can drift.** Timing (`BEFORE`/`AFTER`), events (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`), `UPDATE OF` columns, `FOR EACH ROW`/`STATEMENT`, and `WHEN` clauses are not compared. A trigger with the right name could fire at the wrong time or on the wrong event.
- **Function bodies are not verified.** No `prosrc` hash or behaviour check is made. A function with the expected name, flags, and `search_path` could have a weakened body.
- **Transitive helpers are unchecked.** Helpers the guard functions call (for example `private.permit_audit_actor_registry`, `public.resolve_audit_actor`, `private.guard_profile_privileges`, `private_security.enforce_superadmin_immutability`) are not checked for presence, flags, or body.
- **Owner and ACL policy are unchecked.** Function owner, `EXECUTE` grants, and table privileges on the prerequisite objects are not asserted. 00320 sets owner and grants only for its own objects.
- **The 00315 precheck mostly checks names.** It looks for `public.audit_actor_identities` and `private.maintain_audit_actor_identity()` but does not check that `audit_events.actor_id` now references the registry.

**These selected catalog metadata checks do not prove complete function-body integrity.** They catch a missing, misbound, or disabled prerequisite. They do not catch one that was replaced with weaker logic.

### Static versus database-backed verification

| Evidence | Kind | What it shows |
| --- | --- | --- |
| `tests/security/demo-user-deletion-00320.test.ts`, tests 1–8 | **Static.** Reads SQL text with regex and string checks. | The proposal text has the expected guards, ordering, manifest shape, grants, and revokes. It does not execute SQL. |
| Same file, `classifies every live profile/Auth foreign key…` | Database-backed, local Postgres only, rolled back | Compiles 00320 with the preconditions removed, then compares the manifest with the live FK catalog. **Skipped with a `[SKIP REASON]` warning when local Postgres is unavailable**, unless local SQL parity is required. Not run for this page. |
| Same file, `executes only against rollback-only disposable fixtures…` | Database-backed, local, rolled back | Runs preview and execute on disposable fixtures when the prerequisites exist locally. It sets both `request.jwt.claim.role` and `request.jwt.claims`, which can hide DEMO-DEL-02. Not run for this page. |
| `apps/web/.../demo-user-deletion.test.ts`, `.../demo-user-deletion-ui.test.tsx` | Unit and rendered tests with a mocked Supabase client | Client behaviour only. 35 passed on 23 October 2026. |

### Runtime and database tests still needed (not run)

1. Apply 00315 → 00316 → 00321 → 00320 to a disposable local database. Confirm each precondition passes, and that each one fails when its prerequisite is dropped, disabled, or replaced.
2. Call `preview_demo_user_deletion` and `execute_demo_user_deletion` through **real PostgREST** with a real SuperAdmin JWT. Confirm the requester check accepts the claims that PostgREST actually sets (DEMO-DEL-02).
3. Negative callers: `anon`, ordinary `authenticated`, platform admin without an active SUPER_ADMIN role, BLOCKED or SUSPENDED SuperAdmin, and `service_role`. Each must be denied.
4. Targets: non-demo, founder, last effective SuperAdmin, an email on the whitelist (DEMO-DEL-01), a profile with retained rows in each category, an unknown FK, and FK action drift. Each must block or fail closed with no change.
5. Stale paths: a token past 10 minutes, a token reused after success, a token issued to a different requester or target, a change in the SuperAdmin count, a new dependency row between preview and execute, and two executes at the same time.
6. After success: confirm the audit actor evidence, the `admin.demo_user_deleted` event, the consumed preview row, and that no Auth sessions remain.
7. After applying: confirm the `admin_bulk_delete_users` revoke does not break any caller.
8. Hosted-runtime proof on the target project after an authorized apply. Not available today.

## 8. Operational runbook (applies once the proposals are authorized and applied)

**Who:**
- Only a person signed in with an effective active SUPER_ADMIN role.
- Do not borrow another operator's session.
- Do not use a service-role key or the SQL terminal to bypass the workflow.

**Preconditions:**
- The owner has authorized applying 00315, 00316, 00321, and 00320.
- The runtime tests in section 7 have passed on that environment.
- The target is a disposable demo/QA account whose `is_demo` came from seed data.
- Never pick a target by name or email. Never pick a real customer, supplier, founder, or staff account.

**Review and confirmation:**
1. Open `/admin?tab=users` and find the row with the **Delete demo/QA** button.
2. Read the preview:
   - Eligibility must be *Eligible*.
   - Blockers must be 0.
   - Read every dependency line.
3. Type the target email exactly.
4. Write a specific reason and expected outcome. Both are stored in the audit event.
5. Execute within the 10-minute window.

**Reading the result:**

| Result | What it means | What to do |
| --- | --- | --- |
| *Ineligible* or blockers above 0 | The account is protected or still has retained history | Stop. Do not remove the dependencies to make the account deletable. Retained rows are evidence. |
| Stale, expired, or mismatch | Something changed, or time ran out | Request a fresh preview and review it again |
| Denied | The session is not an effective SuperAdmin | Do not retry with another identity |
| Raw error such as `POSTCHECK_FAILED`, `STALE_IDENTITY`, or a trigger message | The server rolled back the whole transaction. Nothing was deleted. | Record the message and report it |
| Success | The account is gone | Copy the audit event id. If the refresh warning appears, reload the page. **Do not retry.** |

**After execution:**
- Keep the audit event id with the reason.
- Someone with read access can review `admin.demo_user_deleted` in `audit_events` and the consumed row in `private_security.demo_user_deletion_previews`.

**Reporting problems:**
- Report the error text, the audit or preview id, and the time.
- Do not disable triggers, set `session_replication_role`, edit `is_demo`, delete dependent rows by hand, or re-grant `admin_bulk_delete_users`.

## 9. Readiness

- **Implementation:** complete in source. The client is tested with mocks. The SQL proposals are written and statically tested.
- **Deployment:** **not ready.** Blocked pending owner authorization. Before deployment it still needs:
  - prerequisite-integrity hardening or an accepted-risk record (section 7);
  - database-backed and PostgREST runtime tests;
  - DEMO-DEL-01 and DEMO-DEL-02 resolved or accepted;
  - a decision on the 00314 number collision;
  - hosted-runtime proof;
  - the release gates in [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md).
- **If the client ships before the SQL is applied**, a SuperAdmin who opens the modal gets a server error from the preview RPC. Nothing is deleted.

## 10. Traceability

| Subject | File |
| --- | --- |
| Panel and button gating | `apps/web/src/features/admin/components/AdminUsersActivityPanel.tsx` |
| Modal, expiry, error mapping, focus trap | `apps/web/src/features/admin/components/DemoUserDeletionModal.tsx` |
| RPC wrappers and response validation | `apps/web/src/features/admin/api/demo-user-deletion.ts` |
| `isDemo` mapping | `apps/web/src/features/admin/api/admin-ops.ts`, `apps/web/src/features/admin/types/admin.ts` |
| Admin route and tab | `apps/web/src/features/admin/pages/AdminDashboardPage.tsx` |
| Client tests | `apps/web/src/features/admin/api/demo-user-deletion.test.ts`, `apps/web/src/features/admin/demo-user-deletion-ui.test.tsx`, `apps/web/src/features/admin/account-lifecycle.test.ts` |
| SQL proposal | `supabase/00320_superadmin_demo_user_deletion.UNAPPLIED.sql` |
| Prerequisites | `supabase/00315_audit_actor_identity_registry.UNAPPLIED.sql`, `supabase/00316_founder_superadmin_role_guard.UNAPPLIED.sql`, `supabase/00321_restrict_is_demo_marker.UNAPPLIED.sql` |
| Existing whitelist delete guard | `supabase/migrations/00296_platform_admin_operator_context_alignment.sql` |
| SQL tests | `tests/security/demo-user-deletion-00320.test.ts` |
