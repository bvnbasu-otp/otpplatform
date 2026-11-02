# B3 TRANSFORM Batch 3 — Source-Specific Inspection

## 1. Status and boundaries

**Status: proposed, read-only analysis. All treatments below are UNAPPROVED.**

This report documents source inspection only. It does not approve generated SQL or migration replay, change any manifest disposition, establish that a proposed omission is safe, or report any validation as executed. No database, Docker, test, build, hosted environment, or network operation was performed for this report.

The disposition manifest and the Batch 1 and Batch 2 reports remain the existing evidence baseline. The established disposition counts remain **1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED**.

## 2. Exact Batch 3 selection

The following are the first ten `TRANSFORM` rows in manifest order not covered by Batch 1 or Batch 2. “Manifest row” is the 1-based position among migration records; “TRANSFORM ordinal” is the 1-based position among rows currently marked `TRANSFORM`.

| Manifest row | TRANSFORM ordinal | Version | Filename |
|---:|---:|---|---|
| 130 | 21 | `00130` | `00130_clear_audit_logs_notifications_and_fix_toggle.sql` |
| 135 | 22 | `00135` | `00135_clean_ascii_notifications_and_rpc_templates.sql` |
| 136 | 23 | `00136` | `00136_fix_quotes_identity_protected_and_award_po_flow.sql` |
| 137 | 24 | `00137` | `00137_fix_discover_and_invite_anti_leak_policy.sql` |
| 138 | 25 | `00138` | `00138_seed_contact_supplier_logins.sql` |
| 141 | 26 | `00141` | `00141_user_profile_customization.sql` |
| 144 | 27 | `00144` | `00144_prepaid_subscription_model.sql` |
| 145 | 28 | `00145` | `00145_enable_1month_subscription_from_registration.sql` |
| 146 | 29 | `00146` | `00146_update_nokia_to_basu_and_org_name_edit.sql` |
| 148 | 30 | `00148` | `00148_strict_linear_15_step_procurement_pipeline.sql` |

This selection was derived from the manifest, excluding the exact Batch 1 and Batch 2 ID lists supplied in the task. The first ten qualifying rows are unambiguous.

## 3. Summary matrix

The hashes are SHA-256 values of the source files inspected. Treatment descriptions are proposals only.

| Version / filename | Lines | SHA-256 | Proposed treatment (UNAPPROVED) | Dependencies / unresolved blockers |
|---|---:|---|---|---|
| `00130_clear_audit_logs_notifications_and_fix_toggle.sql` | 326 | `9F1E3ABF9EE6203E7C9D64D6EB25211738BFA98A8913740A35264771FF6BF5CB` | BLOCK migration-time deletion and broad DELETE-policy/grant behavior pending authorization and demo-mode decisions. Runtime functions require function-by-function retention or replacement review. | Demo/system-mode configuration from `00021` and `00125`; storage/environment bootstrap remains unverified. |
| `00135_clean_ascii_notifications_and_rpc_templates.sql` | 694 | `C83F081C827558E3AC7520F082966DF770AB4D97503BE1D8EF2E342AF6B7B838` | TRANSFORM source-specific historical text updates only with a verified clean-target precondition; retain the sanitizer and required runtime behavior only after ACL and replacement-chain review. | Signup and notification RPC callers/replacements; Auth/profile bootstrap and canonical signup behavior unresolved. |
| `00136_fix_quotes_identity_protected_and_award_po_flow.sql` | 749 | `663099D6674D8DBE094601B9930F906F9744FB059BA6CBE827EADD6D69E6D519` | BLOCK view drops using `CASCADE` and migration-time award-to-PO backfill pending dependency and clean-target evidence. Preserve masked-view, quote, award, PO, trigger, and FK semantics if selected behavior requires them. | Later award/atomic publishing chain not proven effective; possible CASCADE dependents and populated awards/POs must be inventoried. |
| `00137_fix_discover_and_invite_anti_leak_policy.sql` | 165 | `31D9445B0FF6E37E856DDADC3CCEF31C374C444C5C6FBBB611789C12175111C1` | BLOCK discovery RPC and top-level cleanup pending authorization and fallback behavior review; do not treat the blocked `00120` as an effective replacement. | `00120_restore_canonical_discovery_engine.sql` is BLOCKED; demo/stub mode and invitation policy unresolved. |
| `00138_seed_contact_supplier_logins.sql` | 278 | `BA8A5A7180DFC041669CEED4B38C6FDF251B3F0DEB29A4490BCABCCFC46B19D9` | WITHHOLD demo supplier, Auth identity, shared-password, role, and demo-account inserts. Review the replacement notification function separately. | Supabase Auth schema/bootstrap, role catalog, synthetic identity contract, and custom migration ledger unresolved. |
| `00141_user_profile_customization.sql` | 379 | `8C9B44F36D0C7A76EA348E6F2E708951AE06842F34F09F74C2EAEA8887BDB272` | Retain compatible profile schema/RPC behavior only after role-context and ACL reconciliation; transform or withhold all data backfills subject to clean-target checks. | Auth/membership schema, hard-coded privileged identity fallbacks, later `my_role_context()` definitions, and migration-ledger semantics. |
| `00144_prepaid_subscription_model.sql` | 260 | `C44E303119EB06737633CFD812BBC1797D74907BB40071820C500841FCA0F214` | Schema and payment-log objects are conditional on selected workflow; block subscription defaults, backfill, and payment RPC until entitlement and commercial/security semantics are approved. | `00145`, later `00280` (BLOCKED), and `00330` (TRANSFORM); no payment verification in the dummy payment path. |
| `00145_enable_1month_subscription_from_registration.sql` | 414 | `899AE57491F6D86884DD070EAD1D32CF201BBE0E949D33C2F03F7B856CAD1AED` | Withhold existing-organization entitlement and synthetic payment-log backfills absent approved test data and commercial terms. Block signup RPC replacement pending canonical approval flow and authorization review. | `00144`; later `00257` (TRANSFORM); synthetic entitlement values and signup chain not approved. |
| `00146_update_nokia_to_basu_and_org_name_edit.sql` | 132 | `1280D74A174FA79B80956D96E6DDF6B1406B596B4B1F91FF7F0AC94D142FD5CA` | Withhold all five historical name rewrites absent approved mapping. Block or conditionally retain the organization-name RPC only after correcting/confirming its authorization contract. | Existing membership roles and grants, including `anon`, must be reconciled with owner/manager-only intent. |
| `00148_strict_linear_15_step_procurement_pipeline.sql` | 167 | `8154A0D9CF3B12BFD4D66BAD97A21A2CC902D45563F361A1B7FF93DE986763C6` | Table/index schema is separable in principle; BLOCK permissive RLS and the stage RPCs pending ownership, authorization, valid-transition, and concurrency semantics. | Custom migration-ledger behavior; pipeline contract and role/ownership policies not established. |

## 4. Detailed statement-level evidence

Ranges below refer to the current source files. A “runtime” label means the statement defines behavior that executes when called or triggered; it does not mean the migration invokes it.

### 4.1 `00130_clear_audit_logs_notifications_and_fix_toggle.sql`

The file has no explicit transaction boundary. Its top-level `DO` block and the final `NOTIFY` execute during replay. Function bodies below are definitions and do not execute their operational work at migration time.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 9–23 | Top-level procedural/migration-time DML: deletes audit-log and notification rows selected by the configured mode. This is data-destructive, not merely a function definition. | **BLOCK** until the exact mode setting, clean-target condition, and affected-row precondition are specified and independently verifiable. Do not blanket-suppress the DML. |
| 27–164 | Runtime RPC definition for mode-scoped audit/notification cleanup, including permission checks and mode-specific behavior. | **BLOCK** grants and authorization semantics pending review. If retained, validate role allowlists, mode isolation, and that only intended rows can be affected. |
| 166–206 | Runtime demo-mode toggle function definition and grants. | **BLOCK** pending explicit demo-mode/environment policy and effective role authorization. |
| 207–246 | Runtime system-mode read function definition and grants. | **CONDITIONAL RETAIN** only if required by selected behavior, after validating exposure and grants. |
| 247–281 | Runtime maintenance-mode toggle function definition. | **BLOCK** pending role and environment authorization review. |
| 282–313 | Runtime supplier-network-stub toggle function definition. | **BLOCK** pending explicit simulator policy and role review. Do not enable or invoke the stub as part of replay. |
| 316–324 | Security change: adds DELETE policies on `audit_events` and `notifications` with permissive `USING (true)` behavior for `anon`/`authenticated`. | **BLOCK**. Do not preserve these policies without an authorization decision and proof that row-level deletion is intended for those roles. |
| 326 | Top-level PostgREST schema-reload notification. | **CONDITIONAL RETAIN** only in a compatible replay context; confirm the target supports `pg_notify` and that emitting it is permitted. |

The source also grants selected functions to broad client roles, including `anon`, `authenticated`, and `service_role`; exact function ACLs and role checks are part of the authorization behavior and must be captured before any stream transformation. A successful replay must not be used to infer safety.

### 4.2 `00135_clean_ascii_notifications_and_rpc_templates.sql`

No explicit transaction boundary was identified in the source. Top-level updates are distinct from function-body writes.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 10–38 | Runtime helper definition `sanitize_ascii_text`; pure text sanitation behavior used by subsequent RPC/trigger definitions. | **CONDITIONAL RETAIN** if dependent runtime behavior is selected; validate null/ASCII handling and all dependent function references. |
| 41–49 | Top-level historical DML against existing notification and supplier-notification records. | **TRANSFORM** only to omit or constrain after proving a clean target with zero applicable historical rows; verify target tables are empty before replay or provide an exact, approved synthetic-data mapping. A zero-row update alone does not establish required reference data. |
| 52–114 | Runtime `create_system_notification` definition, including notification persistence and message sanitation. | **CONDITIONAL RETAIN** after ACL and notification schema review; do not invoke during migration validation. |
| 115–386 | Runtime signup-review RPC replacement. Its function body provisions Auth/profile/organization/supplier records when called and has a temporary-password argument. | **BLOCK** pending Auth bootstrap, signup ownership/authorization, password handling, and replacement-chain evidence. Function definition is not migration-time account creation. |
| 387–517 | Runtime proactive-maintenance scan definition. | **CONDITIONAL RETAIN** only if selected workflow requires it; verify its grants and ensure validation never invokes the scan or its side effects. |
| 518–597 | Runtime invoice/payment notification trigger/function definitions. | **CONDITIONAL RETAIN** only if corresponding invoice/payment behavior is in scope; verify trigger attachment, grants, and exact event conditions. |
| 598–693 | Runtime unawarded-supplier notification trigger/function definition. | **CONDITIONAL RETAIN** only if supplier notification behavior is in scope; verify replacement ordering and that no message is sent during validation. |

Related migration inspection is required before deciding whether any of these function definitions are superseded. Preserve exact ACLs and trigger attachments, not only function bodies.

### 4.3 `00136_fix_quotes_identity_protected_and_award_po_flow.sql`

The migration has an explicit transaction, beginning at line 10 and committing at line 749. The top-level cleanup and backfill execute within that transaction; function and view definitions install runtime behavior.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 16–25 | Schema change: changes purchase-order foreign keys to cascade on deletion. | **BLOCK** pending dependency and data-retention review. Validate exact FK columns, referential actions, and impact on work orders/audits before retaining. |
| 30–187 | Destructive/dependency-sensitive DDL and view definitions: drops canonical/identity-protected views with `CASCADE`, then recreates masked quote/award views and aliases with grants. | **BLOCK** until every dependent view/function/policy is inventoried and the effective view/ACL contract is approved. A later successful create does not prove no dependent object was removed. |
| 188–285 | Runtime discovery-function replacement and associated behavior; removes source-identifying match-reason content. | **CONDITIONAL RETAIN** only if compatible with the selected canonical discovery implementation and verified anti-leak policy. |
| 286–294 | Top-level cleanup of existing invitation `match_reasons`, following the discovery replacement section. | **TRANSFORM** only with a verified clean-target precondition or a separately approved exact data remediation. Record row counts and prove no source attribution is required. |
| 296–453 | Runtime `create_purchase_order_from_award` definition; creates PO/work-order/audit/notification records when invoked. | **BLOCK** pending consistency with the protected award/publication transaction and later replacement chain. Do not invoke during replay checks. |
| 454–593 | Runtime `reveal_award` definition, including automatic PO creation. | **BLOCK** pending role, ownership, idempotency, and atomicity proof. Validate function ACL and all side effects if ultimately retained. |
| 594–635 | Runtime quote-submitted notification trigger/function replacement. | **CONDITIONAL RETAIN** if quote notification is required; verify trigger attachment and avoid message-producing calls. |
| 636–727 | Runtime unawarded-supplier notification trigger/function replacement. | **CONDITIONAL RETAIN** after discovery/award-chain review; verify no trigger executes as part of replay itself. |
| 731–747 | Top-level `DO` block invokes PO creation for every revealed award lacking a PO. | **BLOCK**. Omission requires a verified clean target with no qualifying revealed award rows and a check of related PO rows; otherwise data and workflow effects are unknown. Do not execute this backfill on a non-empty target. |

The view `DROP ... CASCADE` and FK changes require a dependency inventory, including objects outside the migration itself. Do not assume a later blocked migration provides a safe replacement.

### 4.4 `00137_fix_discover_and_invite_anti_leak_policy.sql`

The source is transaction-wrapped (lines 7–165). The RPC definition is runtime behavior; the final cleanup is top-level DML.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 9–155 | Runtime replacement of `discover_and_invite_for_rfq`. Removes source-identifying match reasons but includes fallback matching that can select arbitrary active suppliers to fill four invitations; staging/reset GUC bypasses and the pilot-quote stub path are also present. | **BLOCK** pending canonical discovery replacement, supplier-selection policy, authorization, environment gating, and simulator decision. Validate that results are eligible matches and contain no source leakage; do not invoke during replay validation. |
| 159–163 | Top-level cleanup of existing `rfq_invitations.match_reasons`. | **TRANSFORM** only after verifying a clean target or defining an approved, bounded cleanup. Confirm rows affected and preserve non-source match reasons. |

`00120_restore_canonical_discovery_engine.sql` is marked **BLOCKED** in the disposition baseline and cannot be treated as an effective replacement. The discovery chain therefore remains unresolved.

### 4.5 `00138_seed_contact_supplier_logins.sql`

The migration is transaction-wrapped (lines 5–278). The supplier/Auth/demo seed operations execute at migration time; the notification function is only defined.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 9–99 | Creates/upserts 45 demo supplier records using a temporary table and demo-oriented values. | **WITHHOLD** from the disposable stream. Do not copy these supplier identities or data; synthetic test supplier data requires a separately approved fixture boundary. |
| 101–132 | Top-level Auth user insert/update and password setup for the `contact01`–`contact45` demo accounts, using a shared hard-coded password. | **WITHHOLD**. Never replay these credentials or create these identities. Verify the selected synthetic-identity strategy independently. |
| 133–148 | Top-level `auth.identities` insert/update for those demo users. | **WITHHOLD** with the corresponding Auth users; verify compatibility with the actual disposable Auth schema before any approved synthetic provisioning. |
| 149–165 | Top-level profile seed. | **WITHHOLD** with the demo identities; preserve only the schema/trigger requirements established independently. |
| 166–174 | Top-level `profile_roles` grants of `SUPPLIER_FOUNDER`. | **WITHHOLD** demo assignments. The canonical role catalog and assignment/ownership contract remain unresolved. |
| 175–179 | Top-level active-role update. | **WITHHOLD** with the demo identities; do not bypass the active-role trigger/guard. |
| 180–190 | Top-level supplier-user owner links. | **WITHHOLD** demo ownership links; a synthetic owner must be separately authorized and isolated. |
| 191–207 | Top-level `demo_accounts` seed. | **WITHHOLD**; demo persona selection is outside the minimum reconstruction boundary absent approval. |
| 209–271 | Runtime replacement of `notify_suppliers_of_outcome`, with audit behavior. | **CONDITIONAL RETAIN** only if selected supplier-outcome behavior requires it and its ACL, trigger attachment, and no-outbound-message test conditions are established. Do not call it during validation. |
| 274–276 | Top-level custom migration-ledger insert. | **BLOCK** until the ledger schema, ownership, idempotency, and runner contract are verified. |

The seed block must not be characterized as “just fixtures”: it mutates Supabase Auth, roles, profile ownership, supplier links, and demo-account selection state.

### 4.6 `00141_user_profile_customization.sql`

The main body is transaction-wrapped from line 5 through line 377. The PostgREST `NOTIFY` at line 379 occurs after the commit.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 7–30 | Conditional schema additions to `profiles` (`title`, `avatar_url`, `phone`). | **CONDITIONAL RETAIN** if these columns are required by the selected application version; verify types, nullability, and compatibility with existing profile definitions. |
| 33–53 | Top-level backfill from Auth users and supplier/organization membership data. | **TRANSFORM** only after proving the target is clean or specifying exact approved synthetic ownership rows. Capture pre/post row counts and do not use zero-row updates to claim required profile data exists. |
| 54–73 | Top-level title defaults/backfill. | **TRANSFORM** only under the same clean-target and data-provenance checks; preserve customer-entered values and avoid overwriting non-null values. |
| 75–123 | Runtime `get_my_profile()` RPC definition and grants. | **CONDITIONAL RETAIN** after verifying `auth.uid()` ownership filtering, returned fields, and effective ACLs. |
| 124–215 | Runtime `update_my_profile()` definition and grants; updates profile fields, synchronizes Auth metadata, and writes audit data when called. | **CONDITIONAL RETAIN** only after ownership, field allowlist, Auth sync, and audit authorization checks. Do not call during migration validation. |
| 216–365 | Runtime replacement of `my_role_context()`, including profile fields and hard-coded superadmin email/phone fallback behavior. | **BLOCK** pending reconciliation with canonical role/permission data and later definitions. Verify every privileged path and ensure a test identity cannot inherit an unintended privileged role. |
| 367–375 | Conditional custom migration-ledger insert if the ledger table exists. | **BLOCK** pending ledger schema and idempotency contract; the existence check does not prove the table has the expected schema or ownership. |
| 379 | Post-commit PostgREST schema-reload notification. | **CONDITIONAL RETAIN** only in a compatible environment with an approved notification side effect. |

Related migrations defining later `my_role_context()` implementations must be evaluated using actual manifest dispositions. A blocked later rewrite cannot be assumed effective.

### 4.7 `00144_prepaid_subscription_model.sql`

The migration is transaction-wrapped (lines 4–260). The DDL/backfill execute during replay; both RPCs are definitions only.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 7–14 | Schema changes to organization subscription fields and defaults. | **CONDITIONAL RETAIN** only if quota-controlled publication is included and the field/default contract is approved. Verify existing columns and exact default/null semantics. |
| 16–26 | Top-level backfill assigning subscription tiers/dates to existing organizations based on organization type and existing values. | **BLOCK** absent approved entitlement policy and exact target-data preconditions. Existing organization state must not be granted synthetic entitlements by default. |
| 29–66 | Creates subscription payment-log table, index, and RLS policy. | **CONDITIONAL RETAIN** if payment/entitlement behavior is explicitly in scope; validate FK, index, RLS policy, and least-privilege access. |
| 69–122 | Runtime subscription-status RPC. | **CONDITIONAL RETAIN** only with ownership/role authorization verified and selected subscription fields approved. |
| 125–258 | Runtime `process_subscription_payment` dummy UPI/QR behavior; accepts caller tier/amount and extends validity by 30 or 365 days without payment verification. | **BLOCK**. It is not safe to treat as a production payment flow or to expose as a test shortcut. Requires commercial, security, and authorization decisions before any runtime use. |

`00145` depends on this schema and adds additional entitlement/payment-log behavior. Later `00280` is **BLOCKED**, and `00330` is **TRANSFORM**; neither closes commercial semantics by disposition alone.

### 4.8 `00145_enable_1month_subscription_from_registration.sql`

The migration is transaction-wrapped (lines 6–414). Its first two data blocks execute at replay; the signup RPC body is runtime behavior.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 9–23 | Top-level update assigns all existing organizations a one-month subscription measured from registration. | **WITHHOLD** until the entitlement policy and exact synthetic-organization population are approved. Do not grant entitlements to arbitrary existing organizations in the disposable stream. |
| 25–59 | Top-level synthetic “SUCCESS” subscription-payment logs with fixed amounts and payment destination. | **WITHHOLD**. These are fabricated business/payment records and must not be copied as real payment evidence. |
| 62–412 | Runtime replacement of admin signup-review RPC. When called, provisions Auth/profile/org/supplier data, grants one-month subscriptions, writes payment logs, and returns a temporary password. | **BLOCK** pending signup authorization, temporary-password handling, entitlement approval, Auth bootstrap, and canonical signup replacement-chain review. Do not invoke in validation. |

The migration’s data blocks are not made safe by their fixed values or by a successful update. Any future omission needs a verified clean-target precondition and postcondition.

### 4.9 `00146_update_nokia_to_basu_and_org_name_edit.sql`

The migration is transaction-wrapped (lines 4–132). The name rewrites execute at replay; the organization-name RPC is defined for runtime.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 7–29 | Five top-level data rewrites from “Nokia” to “Basu” across organizations, signup requests, suppliers, profiles, and Auth metadata. | **WITHHOLD** absent an approved data mapping. These are historical/identity changes, not neutral schema cleanup. Confirm no selected reference-data behavior depends on them before exclusion. |
| 33–128 | Runtime `update_my_organization_name` RPC definition; authenticates with `auth.uid()` and checks organization membership roles. The accepted roles include `BUYER` and `ADMIN` despite the owner/manager-oriented intent described in the migration. | **BLOCK** pending exact role/ownership policy and resolution of the implementation/comment discrepancy. Validate cross-organization isolation and role eligibility. |
| 130 | Function grant includes `anon` in addition to authenticated/service roles. | **BLOCK** pending ACL review; do not assume internal `auth.uid()` checks make an anonymous grant harmless. |

No historical name rewrite is approved by this inspection.

### 4.10 `00148_strict_linear_15_step_procurement_pipeline.sql`

The migration is transaction-wrapped (lines 4–167). Table/policy/function definitions execute as DDL; procurement events are written only when the runtime RPC is called.

| Source lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 7–24 | Creates `procurement_stage_events` table and index. | **CONDITIONAL RETAIN** only if the selected workflow requires this pipeline/event history and its relationship to the canonical RFQ lifecycle is established. Validate columns, FK, and index shape. |
| 26–40 | RLS enablement and permissive authenticated SELECT/INSERT policies (`USING (true)` / `WITH CHECK (true)`). | **BLOCK**. The policies do not demonstrate buyer ownership or role scoping. Replace only with an approved, tested authorization design; do not silently suppress RLS. |
| 43–85 | Runtime current-step helper for a requirement. | **CONDITIONAL RETAIN** only after verifying ownership visibility, stage derivation, and behavior for missing/duplicate events. |
| 86–155 | Runtime `advance_procurement_step` RPC; grants include `anon`, `authenticated`, and `service_role`. It does not verify ownership or compare the current stage with a caller-expected stage before recording progress. | **BLOCK**. Require owner/role checks, valid transition enforcement, concurrency/idempotency behavior, and least-privilege ACLs before any use. Do not invoke during validation. |
| 158–166 | Conditional custom migration-ledger write. The existence guard checks a table name in `information_schema` before inserting into `public.otp_schema_migrations`. | **BLOCK** pending exact ledger schema, schema-qualified existence check, ownership, and idempotency verification. |

The table definition may be technically separable from its current runtime API and permissive policies, but it is not approved for retention until the procurement-stage contract is reconciled with the canonical RFQ lifecycle.

## 5. Dependencies and replacement-chain findings

- **Demo/environment mode:** `00130` behavior depends on the system-mode configuration and demo defaults examined in earlier batches. The `00021` demo default and `00125` staging-environment singleton remain unresolved evidence; no value is selected here.
- **Storage/Auth bootstrap:** `00138` directly writes Supabase Auth tables. Bootstrap version/schema and disposable Auth provisioning remain unverified. Batch 1 Storage bucket/privacy/policy questions remain open.
- **Discovery:** `00137` installs a discovery path with arbitrary fallback suppliers and demo/stub behavior. The proposed canonical restoration in `00120` is **BLOCKED**, so it is not an effective replacement. Batch 1’s supplier-discovery dependency remains open.
- **Award/PO and notifications:** `00136` changes award/PO behavior, views, FK cascades, and notification triggers. The existence of later migration files is not evidence that they effectively replace these semantics; dispositions and actual dependency chains must be resolved first.
- **Role/profile authorization:** `00130`, `00141`, `00146`, and `00148` contain broad grants, hard-coded identity behavior, or permissive policies. Canonical role catalog and effective authorization remain unresolved. Do not treat later blocked authorization work as effective.
- **Custom ledger and migration runner:** `00138`, `00141`, and `00148` contain custom ledger behavior. Batch 2’s unresolved ledger semantics and later privilege hardening (`00203`, **BLOCKED**) remain relevant; neither table-name existence nor an insert is sufficient proof of compatibility.
- **Subscriptions/entitlements:** `00144` and `00145` introduce both schema and potentially synthetic entitlement/payment data. `00280` is **BLOCKED** and `00330` is **TRANSFORM**. Commercial terms and quota-controlled publication requirements remain separate approvals.
- **Other Batch 1/2 issues carried forward:** `00177` phase-scheduler replacement remains **BLOCKED**; `00128` drops audit immutability triggers and `00134` restoration is **BLOCKED**; demo/simulator defaults and taxonomy/reference-data ordering, including the 23 capability mappings, remain unresolved.

No later migration is treated as an effective fix solely because it exists. Before treatment is approved, use the manifest disposition and source evidence to establish whether each dependent migration is retained, transformed, blocked, or excluded.

## 6. Proposed measurable validation conditions

These are **proposed checks, not executed results**. A check must be run only after separate authorization and against a disposable environment whose identity and bootstrap contract are explicitly approved.

1. **Selection and integrity:** The ten IDs equal manifest TRANSFORM ordinals 21–30 after excluding Batch 1/2; all source hashes and line counts match this report; no prior report or manifest changes.
2. **Schema/dependency diff:** Compare catalog objects before/after an approved generated stream. For every intended table, view, index, constraint, sequence, and type, require the exact expected definition and dependency set. Require zero unexplained `CASCADE`-removed objects.
3. **Function/trigger behavior:** Compare function signatures, definitions, owners, `SECURITY DEFINER` settings, `search_path`, EXECUTE ACLs, trigger attachments, and enabled states against approved expectations. Do not invoke a mutating function or trigger to establish installation.
4. **RLS/policies:** Enumerate RLS-enabled tables and policies. Verify role, command, `USING`, and `WITH CHECK` expressions against the approved ownership matrix; fail on unapproved `true` policies or broad `anon` grants.
5. **Migration-time DML:** For every retained/transformed top-level DML/DO block, record target tables, preconditions, expected affected-row range, and postconditions. Require an independently verified empty/approved target for withheld historical backfills; never infer that required data exists from zero updated rows.
6. **Auth and identity:** Require no Batch 3 demo Auth users, identities, profiles, supplier links, demo accounts, shared passwords, or fabricated payment records unless a separate synthetic identity plan explicitly authorizes exact isolated fixtures.
7. **Business behavior:** Validate the selected buyer/supplier flow using approved identities, ownership, role, taxonomy, and entitlements. Test per-owner isolation, duplicate/idempotency behavior, notification suppression, supplier eligibility, and protected publication lifecycle without bypassing existing checks.
8. **External effects:** Verify no email, WhatsApp, payment, supplier notification, scheduler, or network side effect is invoked during reconstruction or validation. Inspect definitions and triggers statically; do not call them.
9. **Ordering and transaction behavior:** Verify migration order, transaction boundaries, runner behavior for top-level `NOTIFY`, custom ledger writes, and rollback behavior. Confirm each transformation preserves required transactional atomicity.
10. **Disposition audit:** Compare the original manifest hash and per-entry dispositions before/after report creation; require the unchanged counts **1 / 67 / 21 / 242**.

## 7. Cross-batch issues

1. **Demo and simulator execution:** `00130` adds operational toggles and broad policies while `00138` seeds demo identities. This reinforces, but does not close, Batch 1/2’s unresolved environment identity and demo/simulator defaults.
2. **Role and authorization catalog:** The broad grants and permissive policies in this batch expose direct authorization decisions; they do not supply evidence for an effective buyer/supplier role-permission contract or internal RBAC path.
3. **Discovery replacement:** `00137` cannot be accepted as the canonical discovery behavior while `00120` remains BLOCKED. The arbitrary fallback supplier behavior adds a specific dependency and supplier-selection risk.
4. **Data backfills:** `00135`, `00136`, and `00141` include top-level existing-row updates; `00136` also performs award-to-PO creation. Their omission requires explicit clean-target conditions and measurable checks, not generic DML suppression.
5. **Entitlement and payment evidence:** `00144`/`00145` show schema, runtime payment simulation, entitlement defaults, and synthetic success logs are coupled. The sources do not establish approved prices, commercial rules, or entitlement policy.
6. **Stage lifecycle:** `00148` adds a second stage-event model with permissive policy/API semantics. Its relationship to the canonical RFQ lifecycle must be decided before it is included in minimum workflow validation.

## 8. Closure assessment and recommendation

### Source inspection completed

- The ten migrations are the next ten qualifying `TRANSFORM` records in manifest order after excluding Batch 1 and Batch 2.
- Each source was inspected and a source hash, line count, statement-level treatment proposal, and measurable validation specification are recorded above.
- The treatments are not approvals and no replay validation was executed.

### Sufficiently specific evidence

The direct migration-time effects and major schema, runtime, security, historical-data, and identity blocks in all ten files are now described specifically enough to prevent blanket DML suppression or indiscriminate replay. The evidence supports keeping all original manifest dispositions unchanged.

### Still blocked

- Demo/system-mode values, environment identity, simulator policy, and broad mode-toggle/delete authorization.
- Discovery replacement chain and arbitrary fallback supplier behavior.
- Supabase Auth bootstrap and synthetic identity/ownership contract.
- Effective role catalog, profile-context privilege path, and the organization-name/stage API authorization contracts.
- View dependency and `CASCADE` impact, award/PO data preconditions, and protected publication transaction compatibility.
- Subscription tier, duration, payment, and quota/entitlement decisions.
- Custom migration-ledger schema, ownership, idempotency, and runner compatibility.
- Exact clean-target evidence for historical notification, invitation, profile, and award backfills.

### Recommendation

**NO-GO for generated-stream approval, replay, or workflow testing on the basis of this batch.** Continue only with the separately authorized next bounded source-inspection task or resolve the listed dependencies through the approved readiness process. This report does not authorize Batch 4, reconstruction execution, or any disposition change.
