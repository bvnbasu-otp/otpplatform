# B3 TRANSFORM Batch 4 — Source-Specific Inspection

## 1. Status and boundaries

**Evidence-only source inspection. Every treatment is PROPOSED / UNAPPROVED.**

This report does not approve any migration treatment, generated SQL, migration replay, database reconstruction, or workflow testing. It does not change dispositions. Function and trigger bodies are described as runtime behavior unless explicitly identified as top-level migration-time execution.

No database, Docker/container, test, build, lint, typecheck, network, hosted-environment, credential, email, WhatsApp, payment, or other operational activity was performed. No function, trigger, scheduler, or notification was invoked.

The existing manifest baseline is **1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED**.

## 2. Exact Batch 4 selection

The first ten manifest rows currently marked `TRANSFORM`, excluding the exact Batch 1–3 ID lists, are:

| Manifest row | TRANSFORM ordinal | Version | Filename |
|---:|---:|---|---|
| 152 | 31 | `00152` | `00152_immutable_platform_admin_role.sql` |
| 165 | 32 | `00165` | `00165_fix_super_admin_presence_visibility_and_all_tabs.sql` |
| 166 | 33 | `00166` | `00166_buyer_auto_approval_and_free_rfq_credits.sql` |
| 167 | 34 | `00167` | `00167_phase5a_progressive_invoicing_and_line_items.sql` |
| 168 | 35 | `00168` | `00168_phase5b_statutory_gst_and_tax_splitting.sql` |
| 169 | 36 | `00169` | `00169_phase5c1_payment_allocations_and_partial_settlement.sql` |
| 174 | 37 | `00174` | `00174_phase5c5_settlement_execution_fees_and_reconciliation.sql` |
| 179 | 38 | `00179` | `00179_phase6_group3_cross_cutting_remediation.sql` |
| 181 | 39 | `00181` | `00181_phase6_group4_wallet_and_rewards.sql` |
| 184 | 40 | `00184` | `00184_production_clean_state_reset_and_demo_isolation.sql` |

This is the actual manifest order, not a selection by consecutive migration numbers. Ten qualifying entries remain for this batch.

## 3. Summary matrix

Source line counts and SHA-256 hashes were read from the current migration files.

| Version | Filename | Lines | SHA-256 | Proposed treatment (UNAPPROVED) | Unresolved dependencies |
|---|---|---:|---|---|---|
| `00152` | `00152_immutable_platform_admin_role.sql` | 91 | `57120DCB7853797097715F44EA325462CE72CCC08F6EE88AD9D9FBB6D37458FC` | Conditionally retain schema/trigger/security definitions; withhold hard-coded whitelist seed until identity and authorization are approved. | Predecessor `00151` is BLOCKED; whitelist semantics and approved root identities unresolved. |
| `00165` | `00165_fix_super_admin_presence_visibility_and_all_tabs.sql` | 441 | `534FBD53E0D5A93BB8E28BBF824333CBC553E6B809A96BC5C43532A58F62262F` | BLOCK admin RPCs, broad profile RLS, and admin profile backfill pending authorization correction/evidence; review heartbeat/schema independently. | `00164` BLOCKED; later `00179` redefines platform-admin helper; `00267` is TRANSFORM but unapproved. |
| `00166` | `00166_buyer_auto_approval_and_free_rfq_credits.sql` | 333 | `6D1C8411C012ACC3ACD065C6DF960FD884563B5955F7D20B00691F7FCDF6EBF7` | Conditional schema; withhold organization credit backfills; BLOCK subscription RPC and publication replacement pending quota/ownership contract. | `00165` TRANSFORM; immediate later replacements in `00180` are BLOCKED; subscription/entitlement rules unresolved. |
| `00167` | `00167_phase5a_progressive_invoicing_and_line_items.sql` | 434 | `5C2F65CAA96B05053A5203A46349A05E586243E76CFD0F5A94F8041D8B9722D4` | Conditional retain of invoice/PO schema and financial triggers/RLS; BLOCK or transform synthetic historical line-item/milestone backfill only after clean-target proof. | Prior `00166` is TRANSFORM; backfill invents allocations/line descriptions; line-item row ownership semantics require verification. |
| `00168` | `00168_phase5b_statutory_gst_and_tax_splitting.sql` | 397 | `DFA5BF86625623E49C6089E14743AA7A6CD2528E89EA9B249D521EE286F811DB` | Conditional schema and freeze triggers; BLOCK the tax backfill pending source-data, statutory, state-code, HSN, and clean-target decisions. | `00167` TRANSFORM; later `00169` is TRANSFORM but unapproved; source description claims RLS enforcement not present in this file. |
| `00169` | `00169_phase5c1_payment_allocations_and_partial_settlement.sql` | 803 | `89C9F24CD14D1199178C96CCC0D9D724EE6C0C2ED29538EAF0A773CFB6EC4893` | Conditional retain only if payment workflows are in scope; BLOCK historical payment backfill and payment RPC until financial, ACL, and runner semantics are approved. | `00170`, `00171`–`00173`, and `00175` are BLOCKED; `00173` supplies related TDS/reconciliation dependencies. |
| `00174` | `00174_phase5c5_settlement_execution_fees_and_reconciliation.sql` | 1313 | `9A43C25CB4FF8795C21D8A6B487DA2C69451B5B7FA59EE4B9831A3E4C746883C` | Conditional schema/immutability behavior only after commercial and authorization approvals; withhold the 0.50% policy seed; BLOCK RPC exposure pending effective ACL proof. | Predecessor `00173` and next lifecycle migration `00175` are BLOCKED; required fee/TDS/payment semantics unresolved. |
| `00179` | `00179_phase6_group3_cross_cutting_remediation.sql` | 646 | `392033274F22AF820FF863B75E07C191E21A9A6A567DBD98C209FC277A09D9D4` | Separate optional announcement/metrics functions from platform-admin identity changes; BLOCK identity backfill and announcement seed pending identity and optional-scope decisions. | `00178` BLOCKED; later admin-claim migration `00267` is TRANSFORM but unapproved. |
| `00181` | `00181_phase6_group4_wallet_and_rewards.sql` | 737 | `7E4EAB4E51D4FACCA3818AF30127CE6BA93B411408932F2BAD3D54C2FA746E40` | Conditional wallet schema/RLS; transform zero-balance wallet population only with exact org preconditions; BLOCK runtime rewards/redemption pending commercial and authorization contract. | `00180` and `00182` are BLOCKED; `00174` fee tables and `00144` subscription payment log are dependencies; `00216` replacement is BLOCKED. |
| `00184` | `00184_production_clean_state_reset_and_demo_isolation.sql` | 369 | `CE3D9F23F69C3C5DF3928ECAA152F606175E1432EE5AECBD423BFB8401DAE929` | Conditional snapshot schema only; BLOCK destructive purge function and ledger write pending security, environment, runner, and dependency review. The purge is defined, not called, during replay. | Custom ledger/bootstrap unresolved; function references many tables from BLOCKED later migrations; production/demo defaults and authorization unsafe/unresolved. |

## 4. Detailed statement-level evidence

### 4.1 `00152_immutable_platform_admin_role.sql` — 91 lines

The source has an explicit transaction (`BEGIN` line 8; `COMMIT` line 91).

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 11–20 | Schema/object definitions: creates `private_security` and `admin_whitelist` with UUID primary key, unique non-null email, reason, and timestamp. | **CONDITIONAL RETAIN** if a private administrator allowlist is approved and the schema/owner contract is verified. |
| 22–27 | Top-level reference/identity data: inserts three hard-coded root administrator email records with conflict-do-nothing behavior. | **WITHHOLD** pending explicit approval of identities and reasons. A blank whitelist changes the trigger’s effective protection behavior; do not silently omit and call semantics preserved. |
| 30–77 | Runtime trigger function, `SECURITY DEFINER`, fixed `search_path = public, private_security, auth`; looks up `OLD.email` in whitelist and blocks delete, demotion, blocking, soft deletion, and email changes. | **CONDITIONAL RETAIN** only with approved identity data, function owner/ACL review, and verified profile-column semantics. |
| 79–84 | Replaces and creates `BEFORE UPDATE OR DELETE` trigger on `public.profiles`. | **CONDITIONAL RETAIN** with the function and whitelist; validate trigger event/timing and that all protected profile mutations are covered. |
| 87–89 | Revokes schema access from `public`, `anon`, `authenticated`; grants schema usage and table privileges to `service_role`, `postgres`. | **CONDITIONAL RETAIN** after verifying schema/table owners, default privileges, and that no application path requires direct access. |

No migration-time function call, outbound integration, or external effect appears in the source.

### 4.2 `00165_fix_super_admin_presence_visibility_and_all_tabs.sql` — 441 lines

The source is explicitly transactional (lines 6–441).

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 11–107 | Runtime `private.is_platform_admin()` replacement; `SECURITY DEFINER`, fixed search path. It trusts a service-role claim, database superuser sessions, hard-coded email claims, `profiles.is_platform_admin`, and email matches in Auth/profile. | **BLOCK** pending canonical privileged-identity and claim-validation policy. |
| 109 | Grants helper execution to `authenticated`, `service_role`, and `anon`. | **BLOCK** pending least-privilege review; a helper’s public executability is not itself a safe authorization boundary. |
| 114–133 | Top-level DML sets matching existing administrator profiles ACTIVE, platform-admin, clears active role and blocking/deletion fields. | **WITHHOLD** absent exact approved target identities and profile preconditions; this is privilege/status mutation, not disposable cleanup. |
| 135–145 | Top-level conditional `DO` adds `profiles.last_seen_at` if absent; creates index. | **CONDITIONAL RETAIN** after checking existing type/default/index definitions and dependencies. |
| 147–176 | Runtime heartbeat RPC updates caller’s profile timestamp, with `auth.uid()` null guard. | **CONDITIONAL RETAIN** only after RLS, identity mapping (`id`/`auth_user_id`), and rate/role expectations are checked. |
| 179 | Heartbeat grant includes `anon`, `authenticated`, `service_role`; the body returns unauthenticated when no UID. | **BLOCK** grant pending review; test the body and ACL separately. |
| 185–334 | Runtime SECURITY DEFINER user/organization listing RPC with broad profile, membership, supplier, purchase-order, and signup-derived output. Its predicate accepts any `authenticated` or `service_role` caller (`auth.role()`), not only platform admins. | **BLOCK**: source-level authorization predicate does not enforce the stated administrator-only intent. Do not retain as an admin listing endpoint without an approved effective authorization contract. |
| 337 | Grants that listing RPC to authenticated, anon, service_role. | **BLOCK** pending least privilege; anon grant plus the function’s predicate requires explicit review. |
| 342–409 | Runtime signup request listing RPC; same predicate allows any authenticated/service-role caller; returns contact and registration data. | **BLOCK** pending access-control correction and privacy review. |
| 412 | Grants signup listing RPC to authenticated, anon, service_role. | **BLOCK** pending ACL and data exposure review. |
| 417–439 | Drops/replaces `profiles_select` policy for authenticated and anon. Allows self, platform admin, same-organization members, or same-supplier users. | **BLOCK** pending cross-tenant field exposure review and reconciliation with canonical profile RLS; policy is not merely an admin visibility change. |

No function body runs at migration time. The only top-level data mutation is the profile privilege/status backfill.

### 4.3 `00166_buyer_auto_approval_and_free_rfq_credits.sql` — 333 lines

Explicit transaction: lines 11–333.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 14–16 | Schema: adds `free_rfq_credits` default 1 and `rfq_credits_used` default 0 to organizations. | **CONDITIONAL RETAIN** only after defining quota semantics and compatibility with existing subscription fields. |
| 19–26 | Top-level backfills null balances to 1 free credit and 0 used credits. | **WITHHOLD/BLOCK** until entitlement policy and exact organization set are approved; do not grant credits to every existing organization by default. |
| 28–129 | Runtime SECURITY DEFINER `submit_signup_request(jsonb)`, with `search_path = public, private, auth, extensions`; resolves active category and role codes, defaults an Individual buyer role to `PROPERTY_OWNER`, detects duplicate non-rejected applications, and inserts a signup request plus audit event. It returns `PENDING`, despite the migration title/comment describing instant buyer approval. | **BLOCK** pending signup/verification contract, canonical role catalog, RLS/ACL review, and disposition of the title-versus-source behavior mismatch. |
| 131 | Grants signup RPC to anon, authenticated, service_role. | **BLOCK** pending unauthenticated input/abuse controls and verification contract. |
| 134–187 | Runtime subscription lookup by caller-provided organization UUID; SECURITY DEFINER. Source does not check membership or platform-admin authorization before returning organization/subscription/credit fields. | **BLOCK** pending tenant ownership check and response-field minimization. |
| 189 | Grants lookup to authenticated, anon, service_role. | **BLOCK**; cross-tenant data exposure risk must be resolved first. |
| 192–329 | Runtime replacement of `publish_requirement`; checks requirement membership, OWNER/MANAGER/BUYER or platform-admin role, draft status, subcategory, duplicate RFQ, and parameter minima. It decrements credits with `GREATEST(0, credits - 1)` but does not require a positive credit or otherwise gate publication on quota/subscription; then creates RFQ and writes audit data. | **BLOCK** pending reconciliation with protected publication, allowance, quota, duplicate, and atomic publication contracts. Do not infer this function preserves the established publication lifecycle. |
| 331 | Grants publish RPC to authenticated. | **CONDITIONAL** only after function authorization and publication semantics are proven. |

Migration-time DML is limited to the organization credit backfills. Signup, subscription reads, and publication are runtime behavior.

### 4.4 `00167_phase5a_progressive_invoicing_and_line_items.sql` — 434 lines

Explicit transaction: lines 16–434.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 21–45 | Schema/triggers: creates PO line items with quantities, prices, GST, uniqueness per PO/item index; FK to PO uses `ON DELETE CASCADE`; creates index and `set_updated_at` trigger. | **CONDITIONAL RETAIN** if PO itemization is in scope. Validate exact FK action and the existing trigger function/owner. This is PO-side data, not buyer RFQ draft items. |
| 49–56 | Adds milestone allocation, invoiced amount, index, invoiced flag and index. | **CONDITIONAL RETAIN** only after lifecycle/financial meaning and existing milestone schema are reconciled. |
| 60–75 | Adds invoice PO/milestone FKs and invoice type/check/default; top-level update populates `purchase_order_id` from work orders for legacy invoices. FKs include PO `ON DELETE CASCADE`, milestone `ON DELETE SET NULL`. | Schema **CONDITIONAL**; update **TRANSFORM** only with verified clean target or exact approved data migration. |
| 79–104 | Creates invoice line-item table, uniqueness by invoice/line index, FKs to invoice/PO item/milestone, indexes and updated-at trigger. | **CONDITIONAL RETAIN** if invoicing remains in scope; verify compatibility and intended delete semantics. |
| 107–175 | Top-level `DO` backfill traverses all POs/work orders. For POs lacking items it fabricates three generic line descriptions and splits `total_amount / 1.18` into 50%/30%/remainder at 18% GST. For work orders lacking milestones it fabricates four milestones with 20/40/30/10 allocations; existing zero allocations are overwritten from target percentages. | **BLOCK** on populated targets; do not invent customer/business line data. Omission requires verified zero POs/work orders or an approved exact migration plan, plus counts proving no existing milestone allocation was overwritten. |
| 181–224 | Runtime SECURITY DEFINER `get_purchase_order_invoicing_summary` and grant to authenticated, anon, service_role. Function queries PO/invoice totals by caller-provided PO ID and contains no explicit member check. | **BLOCK** pending tenant authorization and privacy review. |
| 226–307 | Runtime SECURITY DEFINER invoice integrity trigger function: locks PO/milestone rows and rejects invoice totals over the PO or milestone cap. Trigger is installed on invoice insert/update. | **CONDITIONAL RETAIN** only after verifying constraints, lock ordering, status behavior, trigger ownership, and concurrency invariants. |
| 308–346 | Runtime SECURITY DEFINER milestone synchronization trigger/function recomputes invoiced amount and invoiced flag after invoice changes. | **CONDITIONAL RETAIN** after confirming all relevant invoice state transitions and delete behavior. |
| 348–433 | Enables RLS; installs select/modify policies on PO and invoice line items, then replaces invoice select policy. Policy intent is buyer membership/supplier assignment/admin, but all predicates and `WITH CHECK` behavior require catalog verification. | **CONDITIONAL/BLOCKED** pending owner/supplier authorization matrix and policy-level tests. |

No external integrations are defined in this migration. Historical backfill content is fabricated from totals; it is not neutral schema setup.

### 4.5 `00168_phase5b_statutory_gst_and_tax_splitting.sql` — 397 lines

Explicit transaction: lines 14–397.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 19–66 | Schema changes add HSN/SAC, CGST/SGST/UTGST/IGST rates and amounts to line items; adds place-of-supply, tax snapshot, and tax aggregates to PO/invoice headers. | **CONDITIONAL RETAIN** only if these statutory fields are required by the selected workflow and the accounting/tax contract is approved. Verify existing constraints/defaults. |
| 70–331 | Top-level procedural backfill loops through all POs, PO line items, invoices, and invoice line items. Infers supplier/buyer state from GSTIN and defaults missing state to `29`; infers HSN from RFQ title or defaults to `995411`; computes intra/interstate and UT tax splits and writes header totals and invoice snapshots. | **BLOCK** absent tax/legal approval and verified source data. On a clean target, require zero affected POs/invoices/line items; otherwise preserve historical data through an approved calculation/mapping and reconcile every line/header total. |
| 335–367 | Runtime SECURITY DEFINER invoice trigger function freezes statutory header values/tax snapshot for invoices whose old status is APPROVED or PAID; trigger is replaced on invoice UPDATE. | **CONDITIONAL RETAIN** after validating status enum and treatment of partially-paid/finalized invoices. |
| 369–396 | Runtime SECURITY DEFINER function/trigger blocks line-item mutations for APPROVED/PAID invoices. | **CONDITIONAL RETAIN** after authorization/transition review; later `00169` replaces this function to add `PARTIALLY_PAID`, but that migration is only TRANSFORM and not approved. |

The migration header describes RLS enforcement, but this file contains no RLS enablement or policy statements. Do not infer that tenant RLS is installed by this migration.

### 4.6 `00169_phase5c1_payment_allocations_and_partial_settlement.sql` — 803 lines

Explicit transaction: lines 27–803. The `PARTIALLY_PAID` enum value is added and used by a same-transaction historical `DO` block (lines 32, 322–330); PostgreSQL-version/runner compatibility must be established before approval.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 32 | Schema enum change adds `PARTIALLY_PAID` before `PAID`. | **CONDITIONAL** on PostgreSQL version and transaction semantics; validate enum ordering and whether the value can be used in the migration transaction. |
| 37–46 | Alters payments to make `invoice_id` nullable; adds PO FK with `ON DELETE CASCADE`, `unallocated_amount`, indexes. | **CONDITIONAL RETAIN** only if advance/multi-invoice payment semantics and destructive FK effect are approved. |
| 50–55 | Adds invoice paid/balance fields and indexes. | **CONDITIONAL RETAIN** with financial invariant and default/backfill agreement. |
| 60–85 | Creates payment allocations with payment/invoice `ON DELETE CASCADE`, allocation status check, indexes, updated-at trigger. | **CONDITIONAL RETAIN** only after audit-retention and cascading-deletion review. |
| 87–157 | Runtime SECURITY DEFINER allocation guard locks payment/invoice and prevents cumulative allocation above source payment/invoice amount; installs before-write trigger. | **CONDITIONAL RETAIN** only after concurrency, status, deletion, and authorization review. |
| 159–231 | Runtime SECURITY DEFINER synchronization trigger updates invoice paid/balance/status and payment unallocated amount after allocation changes. | **CONDITIONAL RETAIN** after verification of INSERT/UPDATE/DELETE paths and invoice status transition contract. |
| 242–263 | Replaces invoice-line-item immutability function to include `PARTIALLY_PAID`; trigger remains attached by name. | **CONDITIONAL RETAIN** if approved and compatible with the earlier trigger. |
| 266–361 | Top-level `DO` updates invoice balances, populates payment PO IDs, inserts an ALLOCATED payment row for each historical payment with invoice ID, recomputes every invoice/payment state, and asserts payment amount equals allocated plus unallocated amount. | **BLOCK** absent verified clean target and financial reconciliation. Require zero legacy payments/invoices or an explicitly approved migration with before/after record-level reconciliation and no fabricated allocations. |
| 363–433 | Enables RLS and replaces payment-allocation select/modify policies using org membership, supplier assignment and platform-admin checks. | **CONDITIONAL/BLOCKED** pending tenant and buyer/supplier role matrix. |
| 434–477 | Runtime SECURITY DEFINER payment-field immutability trigger; allows service role/platform admin bypass and protects amount, invoice/PO, unallocated amount, currency, recorder and gateway event. | **CONDITIONAL RETAIN** after trigger ownership/role bypass and column coverage review. |
| 479–583 | Replaces payments select/insert/update policies with buyer owner/manager, supplier, or platform-admin paths. | **BLOCKED** pending confirmation that INSERT/UPDATE paths cannot bypass the atomic RPC or mutate authoritative payment data. |
| 587–800 | Runtime SECURITY DEFINER `record_invoice_payment_atomic`: locks invoice, checks eligible status and buyer owner/manager/admin, validates amount, optionally checks an idempotency key, inserts payment/allocation/audit, and returns synchronized state. | **BLOCK** pending idempotency uniqueness/concurrency proof and consistency with later replacements. This body is not invoked during replay. |
| 801 | Grants payment RPC to authenticated and service_role. | **CONDITIONAL** only with the approved payment authorization contract. |

Immediate/later replacements: `00170` and `00175` both replace this RPC and are **BLOCKED** in the manifest. They are not effective fixes for a selected stream unless separately resolved and approved.

### 4.7 `00174_phase5c5_settlement_execution_fees_and_reconciliation.sql` — 1313 lines

Explicit transaction: lines 24–1313.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 29–54 | SECURITY DEFINER membership-set helpers for organization/supplier IDs, fixed search path, grants to authenticated/service_role. | **CONDITIONAL RETAIN** only after proving the helper result sets reflect the approved membership/ownership model. |
| 59–100 | Creates versioned fee-policy schema, index and update trigger; top-level insert seeds active version 1 at **0.50%** with `ON CONFLICT(policy_version) DO NOTHING`. | Schema **CONDITIONAL**; **WITHHOLD** the policy seed pending explicit commercial approval. Conflict behavior means pre-existing version 1 data wins, so final policy state is not determinable without inspecting existing rows. |
| 102–117 | RLS on policy table; SELECT policy `USING (true)`; mutation policy checks platform-admin helper. | **BLOCK** until effective table grants, anon/public behavior and admin helper are verified. |
| 120–179 | Creates PO fee snapshots with restrictive FKs, acknowledgement state, indexes, trigger and membership-based select/mutate policies. | **CONDITIONAL RETAIN** only if supplier fee acknowledgement is an approved product/commercial requirement; inspect effective grants and RLS. |
| 183–245 | Creates platform fee transactions with PO/payment/invoice/allocation FKs, uniqueness on `(purchase_order_id, payment_allocation_id)`, indexes, trigger and buyer/supplier/admin policies. | **CONDITIONAL RETAIN** after fee treatment and financial-record retention rules are approved. |
| 247–310 | Creates settlement reconciliation schema/indexes/update trigger and buyer/supplier/admin RLS policies. | **CONDITIONAL RETAIN** only if reconciliation is in scope and related TDS/payment structures exist. |
| 312–365 | Creates settlement exception schema, indexes, updated-at trigger, RLS and buyer/admin policies. | **CONDITIONAL RETAIN** after exception ownership and immutability contract is agreed. |
| 369–416 | Runtime SECURITY DEFINER guards prevent deletion of committed fee transactions and all exception deletion; trigger definitions replace named guards. | **CONDITIONAL RETAIN** after confirming intended status-transition exceptions and owner/ACL. |
| 420–569 | Runtime SECURITY DEFINER `acknowledge_po_platform_fee_atomic`: locks PO, checks assigned supplier/admin and PO status, reads active policy, records acknowledgement/snapshot and audit. | **BLOCK** pending commercial policy validity, supplier identity, lifecycle compatibility, and effective EXECUTE ACL proof. |
| 572–768 | Runtime SECURITY DEFINER fee deduction: checks buyer OWNER/MANAGER/admin, cross-checks PO organization, requires supplier-acknowledged snapshot, locks optional invoice/payment, performs idempotency check and records settled fee/audit. | **BLOCK** pending fee approval, fee/payment conservation invariants, uniqueness/concurrency proof, and transaction-lifecycle alignment. |
| 771–1042 | Runtime SECURITY DEFINER settlement reconciliation: buyer owner/manager/admin check, locks invoice/PO, aggregates TDS/fees/allocations, classifies UTR/partial/mismatch cases, writes reconciliation/exception/audit. | **BLOCK**; depends on TDS and payment-allocation schema, accounting policy, and later lifecycle semantics. |
| 1045–1135 | Runtime SECURITY DEFINER exception resolution locks and updates exception/reconciliation plus audit; validates notes and buyer owner/manager/admin. | **BLOCK** pending role and immutable financial audit semantics. |
| 1139–1310 | Runtime SECURITY DEFINER financial-observability summary with organization membership/admin guard, aggregating PO, invoice, allocation, TDS, notes, fees, reconciliations, exceptions and bank records. | **BLOCK** until all referenced schema exists, tenant results are verified, and outputs are approved. |

The five public RPCs at lines 420, 572, 771, 1045, and 1139 are `SECURITY DEFINER` with fixed search paths (including `pg_temp` after trusted schemas). This source contains no explicit `GRANT EXECUTE` or `REVOKE` for those five functions; effective execution ACL depends on target default privileges and must be inspected rather than inferred. No RPC is invoked by migration replay.

The direct migration-time data effect is the fee-policy seed. RPC-body writes to fee, reconciliation, exception, and audit tables are runtime-only.

### 4.8 `00179_phase6_group3_cross_cutting_remediation.sql` — 646 lines

Explicit transaction: lines 19–646.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 25–30 | Adds `profiles.is_founder` and top-level backfills it for matching hard-coded founder emails. | Schema **CONDITIONAL**; backfill **WITHHOLD** absent approved founder identity evidence and exact target preconditions. |
| 33–49 | Runtime SECURITY DEFINER founder predicate reads profile flag/Auth email; grants execution to authenticated, service_role, anon. | **BLOCK** pending founder-role and identity contract; anon execution needs explicit ACL assessment. |
| 54–99 | Top-level `DO` conditionally creates announcement enum types by checking `pg_type.typname`; type existence check is not schema-qualified. | **CONDITIONAL**; precondition must verify each name is absent in the intended schema or that existing type has exactly the required labels/order. |
| 101–123 | Creates announcements table/indexes and enables RLS, then sets `NO FORCE ROW LEVEL SECURITY`. | **CONDITIONAL RETAIN** only if optional announcement functionality is selected; validate owner bypass implications. |
| 125–153 | Replaces announcement policies and grants SELECT to authenticated/anon/service_role and ALL to authenticated/service_role. Select policy allows published `ALL` announcements and audience-specific member views. | **BLOCK** pending public-data, RLS/grant and admin-write authorization review. |
| 159–218 | Runtime SECURITY DEFINER active-announcements RPC; SELECT behavior and audience filtering; grant includes anon. | **CONDITIONAL** only if announcements are included and data exposure/ACL approved. |
| 220–329 | Runtime admin announcement create/update/archive/list RPC; function body checks platform-admin helper. | **CONDITIONAL** only after helper and write authorization are resolved; not migration-time insertion/update. |
| 335–526 | Runtime founder executive metrics RPC; uses `private.is_founder()` then aggregates buyer/supplier/RFQ/PO/fee/GMV metrics. | **WITHHOLD** from minimum buyer/supplier workflow unless separately approved; validate privacy, definitions and later replacement before any use. |
| 532–630 | Replaces `private.is_platform_admin()` with SECURITY DEFINER logic using service-role claim, superuser session, hard-coded email allowlist, profile flag, Auth/profile email; grants to authenticated/service_role/anon. | **BLOCK** pending authoritative identity/claim contract. It replaces the version installed in `00165`. |
| 633–645 | Top-level reference/configuration data inserts a fixed published ALL-audience “Welcome” announcement with conflict-do-nothing. | **WITHHOLD** unless announcement is explicitly required; final state depends on a pre-existing row with that ID. |

No external messaging is invoked by the announcement definitions or the migration. `00178` predecessor is **BLOCKED**. Later `00267` is marked **TRANSFORM**, not approved, so it is not treated as an effective replacement.

### 4.9 `00181_phase6_group4_wallet_and_rewards.sql` — 737 lines

Explicit transaction: lines 17–737.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 22–39 | Creates organization wallets with unique organization FK `ON DELETE CASCADE`, balance/status checks, indexes and updated-at trigger. | **CONDITIONAL RETAIN** only if wallet behavior is explicitly in scope; confirm deletion and owner semantics. |
| 42–78 | Creates wallet transaction ledger, unique optional idempotency key, indexes, SECURITY DEFINER immutability function, and update/delete-blocking trigger. | **CONDITIONAL RETAIN** only with approved ledger owner, privileged bypass, and retention contract. |
| 82–108 | Creates buyer reward allocation table with fee transaction uniqueness and references/indexes/update trigger. | **CONDITIONAL RETAIN** only if commercial reward workflow is approved. |
| 111–164 | Enables and FORCEs RLS on all three wallet/reward tables; creates member/admin select policies and admin-only direct mutation policies. | **CONDITIONAL/BLOCKED** pending FORCE RLS behavior for owners/service roles and proof that RPC paths preserve tenant isolation. |
| 167–171 | Top-level insert creates zero-balance ACTIVE wallets for every existing organization; conflict-do-nothing preserves prior values. | **TRANSFORM** only if target organization identities are explicitly approved; clean-target precondition is zero organizations, or postcondition is exactly one zero-balance wallet per approved organization without changing any existing wallet. |
| 175–403 | Runtime SECURITY DEFINER reward RPC with default 0.50% fee and 20% reward share; idempotency lookup, optional fee transaction lookup, caller-supplied org/base/rates, wallet lock/update, reward allocation, immutable ledger and audit writes. Source body has no explicit caller membership or platform-admin authorization check. | **BLOCK** pending tenant authorization, trusted fee/settlement source, idempotency race-proofing, and commercial rate approval. |
| 404 | Grants reward RPC to authenticated and service_role. | **BLOCK** with function until authorization is proven. |
| 409–625 | Runtime SECURITY DEFINER wallet-to-subscription redemption: checks organization membership or platform admin, locks wallet/org, subtracts caller-supplied credits, accepts caller tier and cycle (non-YEARLY values become 30 days), updates subscription state, logs payment-like SUCCESS and audits. It does not validate tier/price/credits against a canonical price schedule in this source. | **BLOCK** pending membership-role, pricing, tier/cycle, idempotency, and entitlement rules. |
| 626 | Grants redemption to authenticated/service_role. | **BLOCK** pending runtime contract. |
| 631–673 | Runtime SECURITY DEFINER wallet query; member/admin guard, but inserts a zero-balance wallet if missing (a write on read). | **BLOCK/CONDITIONAL**; decide whether this lazy creation is approved and ensure cross-tenant access is rejected. |
| 674 | Grants wallet query to authenticated/service_role. | **CONDITIONAL** with the above guard and write-on-read behavior reviewed. |
| 679–734 | Runtime SECURITY DEFINER wallet transaction listing with member/admin guard and limit clamp to 1–200. | **CONDITIONAL** only after transaction exposure and ACL checks. |
| 735 | Grants listing to authenticated/service_role. | **CONDITIONAL** with verified tenant isolation. |

All reward, wallet, and subscription-payment writes inside RPC bodies occur only when called. No reward or wallet data is created by those bodies during migration replay.

### 4.10 `00184_production_clean_state_reset_and_demo_isolation.sql` — 369 lines

Explicit transaction: lines 31–369. The purge procedure is defined but is **not called** by the migration.

| Lines | Classification and source effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 34–42 | Top-level schema changes add snapshot metadata/count/data columns with defaults to `admin_database_snapshots`. | **CONDITIONAL RETAIN** only after verifying existing table schema, default semantics and migration ordering. |
| 45–46 | Top-level destructive DDL drops two existing purge-function overloads without `CASCADE`. Dependents can cause replay failure; prior behavior is replaced. | **BLOCK** pending dependency inventory and explicit approval of replaced signatures/ACLs. |
| 49–344 | Defines runtime SECURITY DEFINER purge RPC. Body accepts admin **or any `authenticated`, `anon`, or `service_role`** according to its initial predicate. It checks production/demo state, requires a confirmation token only when production/non-demo and selected data exists, attempts snapshot counts/insertion, truncates many transactional tables with `CASCADE`, resets wallet balances, deletes non-whitelisted demo organizations, writes audit, and returns success-shaped output. Several `EXCEPTION WHEN OTHERS THEN NULL` blocks suppress snapshot/truncate/delete failures. The snapshot contains counts/metadata; `snapshot_data` is not populated by this code. | **BLOCK**; do not expose or invoke. The authorization predicate, demo default/fallback, swallowed failures, partial purge possibility, CASCADE scope, protected-ID list, and snapshot completeness prevent relying on this as a safe reset mechanism. |
| 346 | Grants parameterized purge RPC to anon/authenticated/service_role. | **BLOCK**; broad grant compounds the function predicate and destructive effects. |
| 349–358 | Defines no-argument runtime overload forwarding an empty confirmation token to the destructive function. | **BLOCK**; an overload increases exposure and must not be used. |
| 360 | Grants no-argument purge RPC to anon/authenticated/service_role. | **BLOCK**. |
| 363–365 | Top-level custom migration-ledger upsert (`ON CONFLICT` updates `applied_at`). | **BLOCK** pending ledger schema/owner/idempotency and runner contract; this changes an existing ledger timestamp on replay. |
| 367 | Top-level PostgREST schema-reload `NOTIFY`. | **CONDITIONAL** only after runner/environment permits notifications; it is a migration-time operational effect. |

No purge/truncate/delete in lines 49–344 executes during replay unless a function is called. The ledger upsert and `NOTIFY` do execute at replay. The purge body has dependencies on many phase tables, including structures whose migrations are BLOCKED; some nested operations suppress missing-table/errors, while unwrapped truncations can still fail if required objects are absent.

## 5. Dependencies and replacement-chain findings

The following dispositions are from the current manifest; BLOCKED replacements are not treated as effective fixes, and TRANSFORM replacements remain unapproved.

| Selected migration | Relevant dependency/replacement evidence |
|---|---|
| `00152` | Manifest predecessor `00151_atomic_award_and_po_transaction.sql` is **BLOCKED**. Root identity whitelist values are not a canonical role catalog or approved test identity set. |
| `00165` | `00164` is **BLOCKED**. The source redefines `private.is_platform_admin`; `00179` later redefines it, while `00267` is **TRANSFORM** and unapproved. `00163` is **BLOCKED**, so no earlier hardening can be assumed effective. |
| `00166` | `00180_fix_signup_and_publish_audit.sql`, which later redefines signup/publication behavior, is **BLOCKED**. The source `publish_requirement` must not be assumed equivalent to the protected lifecycle; verify every quota, allowance, ownership, duplicate, audit, and discovery trigger. |
| `00167` / `00168` | Ordered dependency chain uses invoice/PO/milestone structures. `00167` fabricates legacy itemization/allocations; `00168` computes statutory snapshots from those rows. Any omission of the first backfill changes the second’s inputs. `00169` is later **TRANSFORM**, not approved. |
| `00169` | `00170_phase5c1_h2_idempotency_and_atomic_rpc.sql`, `00171`–`00173`, and `00175_phase5c6_settlement_lifecycle_and_erp_manifests.sql` are **BLOCKED**. The first and last replace payment RPC behavior; `00173` supplies related TDS/change-order/reconciliation structures. Do not treat any as an effective correction. |
| `00174` | Its runtime reconciliation reads payment allocations, TDS deductions, credit/debit notes, and bank reconciliation records. `00173` is **BLOCKED**, as is later `00175`; schema and lifecycle prerequisites are therefore unresolved. |
| `00179` | Predecessor `00178` is **BLOCKED**. `00267_authoritative_founder_and_admin_claims.sql` is **TRANSFORM**, but remains unapproved; the selected source’s identity rules cannot be declared superseded. |
| `00181` | Depends on fee transactions from `00174` and subscription payment log/schema from earlier subscription migrations. `00180` and `00182` are **BLOCKED**; the later replacement of reward/redemption functions in `00216` is also **BLOCKED**. |
| `00184` | Custom `otp_schema_migrations` contract remains unresolved from earlier evidence. The function references tables from Phase 5/6, including migrations marked **BLOCKED** such as `00173`, `00178`, `00182`, and `00183`; there is no evidence that every target table exists or that the purge’s caught/uncaught branches are compatible. |

### Cross-batch issues carried forward

- **Identity/RBAC:** canonical buyer/supplier role catalog, root/admin identity approval, effective authorization, broad grants and RLS remain unresolved; this batch adds explicit authenticated-only intent mismatches and unauthenticated grants.
- **Quota/entitlement/payment:** earlier subscription and demo-value issues remain unresolved. `00166` decrements a non-enforced free-credit counter; `00174` seeds 0.50%; `00181` derives reward/redemption values and records SUCCESS without a source-local approved price contract.
- **Migration-time data:** all proposed historical omissions need exact clean-target preconditions. The synthetic PO line descriptions/milestones, tax assumptions, payment allocations, founder/admin profile flags, fee policy, and zero-balance wallet population cannot be treated as neutral DML.
- **Audit and destructive operations:** earlier audit immutability replacement remains blocked. `00184` defines an extensive destructive purge with CASCADE and swallowed exceptions; it must not be used to prepare a disposable target.
- **Bootstrap/runner:** Supabase Auth/PostgreSQL version/default privileges, custom migration-ledger schema and ownership, and PostgREST notification behavior remain unverified. `00169` has a same-transaction enum-add/use concern.
- **Optional functionality:** announcements, executive metrics, wallets, rewards, progressive invoicing, statutory tax calculations, and settlement reconciliation are not prerequisites for the minimum buyer intake/supplier discovery boundary unless separately proven.

## 6. Proposed measurable validation conditions

These are **proposed checks, not executed results**. Execution requires separate authorization and an approved disposable environment.

1. **Selection/source integrity:** verify exact IDs, manifest positions and TRANSFORM ordinals in Section 2; verify all ten source SHA-256 values and line counts against the report.
2. **Manifest and prior evidence immutability:** require unchanged hashes for the disposition manifest and Batch 1–3 reports and unchanged counts `1 / 67 / 21 / 242`.
3. **DDL/dependency diff:** inventory schemas, tables, columns, enum labels/order, indexes, constraints, FKs/actions, triggers, views, and dependent objects. Require no unexplained `DROP`, `CASCADE`, or dependency loss.
4. **RLS/grants/ownership:** enumerate table RLS enabled/forced state, all policies and expressions, table/function grants, function owners, `SECURITY DEFINER`, `search_path`, and default privileges. Fail on any unapproved `anon`/PUBLIC access, security-definer ACL, cross-tenant read/write, or bypass.
5. **Identity data:** verify no admin/founder identity flags or whitelist rows are introduced absent an explicitly approved test identity. Prove a non-admin authenticated identity cannot access administrative list, profile, founder, wallet, payment, or purge operations.
6. **Publication/entitlement:** compare installed publication function behavior against the approved allowance/quota/ownership/duplicate/transaction contract; expected unauthorized, exhausted-quota, duplicate, and cross-tenant attempts must be rejected without partial writes.
7. **Financial data and invariants:** for a clean target, verify zero historical PO, invoice, payment, allocation, fee, settlement, reward, and wallet backfills unless a record-level synthetic data plan is approved. If any data migration is authorized, reconcile every amount, tax split, allocation, balance, and ledger row before/after.
8. **Tax contract:** require approved GST/state/HSN mapping, source fields, rounding rules, status freeze conditions, and exact header/line reconciliation; no missing GSTIN may silently create a legally asserted state/code.
9. **Wallet/fee contract:** verify commercial authorization of fee, reward share, tier/cycle pricing, and idempotency. Confirm RPC calls cannot credit/debit an arbitrary organization or supplied amount and all ledger updates are atomic.
10. **Purge safety:** statically verify no migration path invokes the purge; independently prove the destructive RPC is unavailable to anon/authenticated users and cannot report success after caught errors before considering any reset tooling.
11. **Runner/transaction behavior:** verify selected PostgreSQL supports enum changes and same-transaction use; verify transaction rollback on error, custom-ledger semantics, `NOTIFY` handling and migration ordering.
12. **No external effects:** verify no mail, WhatsApp, payment gateway, scheduler, or network action is emitted by replay or validation; do not invoke operational definitions to test installation.

## 7. Cross-batch issues carried forward from Batches 1–3

The relevant unresolved cross-batch items remain open and are not changed by this report:

- Storage bucket privacy/policies and Supabase Auth/Storage bootstrap/version have not been verified.
- Demo/system-mode/environment/simulator defaults are not approved; earlier `00021`, `00125`, and `00128` findings remain open.
- Taxonomy final state, taxonomy/reference-data ordering, and capability mappings remain unresolved.
- Canonical role assignments and effective buyer/supplier/internal authorization remain unresolved.
- Discovery replacement (`00120`) and phase scheduler replacement (`00177`) remain BLOCKED.
- Audit immutability trigger restoration (`00134`) and later privilege hardening (`00203`) remain BLOCKED.
- Subscription tier/pricing/entitlement semantics remain unresolved; `00280` is BLOCKED and `00330` is TRANSFORM but unapproved.
- Synthetic identity ownership and user-scoped test-data boundary remain unresolved.
- Custom migration-ledger and bootstrap details remain unresolved.

Batch 4 adds specific source dependencies on those unresolved areas, including admin/founder identities, subscription credits, invoice/payment/tax data, platform fees, wallet rewards, and the destructive reset RPC.

## 8. Closure assessment and recommendation

- **Source inspection status: COMPLETE** for the ten selected migration files. Their transaction markers, migration-time effects, runtime definitions, security changes, data mutations, and principal dependency/replacement relationships are documented above.
- **All proposed treatments: UNAPPROVED.**
- **Manifest dispositions: unchanged** at **1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED**.
- **Generated-stream approval: NOT GRANTED.**
- **Migration replay: NOT AUTHORIZED.**
- **Workflow testing: NOT AUTHORIZED.**
- **Batch 5: NOT STARTED.**

**Recommendation: NO-GO** for generated-stream approval, replay, reconstruction, or workflow testing on this evidence alone. The most material blockers are unresolved privileged identity/RLS behavior, publication/quota semantics, fabricated historical financial/tax backfills, blocked financial lifecycle dependencies, commercial fee/wallet values, and the unsafe purge function.
