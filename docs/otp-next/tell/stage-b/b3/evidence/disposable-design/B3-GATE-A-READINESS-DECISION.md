# B3 Gate A Readiness Decision — Disposable Database Reconstruction

## Document Metadata

- **Report Title:** B3 Gate A Readiness Assessment and Decision for Disposable Database Reconstruction
- **File Path:** `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-GATE-A-READINESS-DECISION.md`
- **Assessment Date:** 2026-11-01
- **Repository HEAD:** `77888fba12c6cee441017986a663393d92d4b649`
- **Source Migration Inventory:** 331 numeric migration files (`00001` through `00331`)
- **Ordered Chain SHA-256 Fingerprint:** `7e71d70976f91a8b0eb21eabe7972f54a5336326535a9f9e0e9683e1030c0961`
- **Scope & Mode:** Strict read-only evidence consolidation across Phase 0A–0E and TRANSFORM Batches 1–5. Batch 6 not started. No SQL execution, database connections, container runs, network access, or credentials inspected.

---

## 1. Executive Summary and Final Decisions

### 1.1 Gate A1 Decision — Stream Construction Readiness

**DECISION: NOT READY — SPECIFIC BLOCKERS PREVENT CONSTRUCTION.**

A fully deterministic, automated disposable migration stream generator cannot be authorized or executed at this time due to four finite, material construction blockers:

1. **Unresolved Primary Manifest Blockers (B0E-07):** 242 out of 331 migrations (73.1%) remain formally classified as `BLOCKED`. While the majority are blocked due to unverified platform dependencies rather than direct DML, a deterministic generator cannot emit safe copies without approved per-statement transformation rules or verified catalog dependencies.
2. **Uninspected TRANSFORM Migrations:** 17 of the 67 `TRANSFORM` migrations (ordinals 51 through 67, including `00272` through `00330`) have not yet had statement-level inspection reports completed (Batches 1–5 covered ordinals 1–50).
3. **Absence of Machine-Readable Transformation Specification (B0E-08):** There is no approved one-to-one statement mapping, grammar-aware parser specification, or declarative rewrite rule set to transform the 79 DO-block DML statements, 15 dynamic SQL blocks, and scheduler invocations.
4. **Unpinned PostgreSQL 15 Supabase Bootstrap Schema Contract (B0E-01 / B0E-03):** The exact schema definitions, columns, and constraints for external platform namespaces (`auth`, `storage`, `extensions`) are not pinned, preventing validation of generated views and policies that reference them.

### 1.2 Gate A2 Decision — Replay Readiness

**DECISION: NOT AUTHORIZED.**

Execution of any migration stream (original or generated) against any local or hosted database remains strictly **NOT AUTHORIZED**.

Replay requires the prior satisfaction of Gate A1 plus full closure of runtime environment isolation, loopback port binding, verified network egress denial, Supabase role attribute verification, and an executable catalog postcondition validation suite.

### 1.3 Gate B Decision — Workflow Validation

**DECISION: NOT AUTHORIZED (OUT OF SCOPE).**

Gate B encompasses end-to-end buyer/supplier transactional workflows, RFQ publication, supplier bidding, and evaluation testing. It is strictly segregated from database reconstruction. Gate B testing cannot be authorized until Gate A1 is complete, Gate A2 replay is verified, and the schema reconstruction validation plan passes all postcondition checks.

---

## 2. Current Baseline & Evidence Reconciliation

### 2.1 Migration Inventory and Continuity

- **Migration Count:** 331 numeric migration files spanning `00001_enums.sql` to `00331_authoritative_17_category_taxonomy.sql`.
- **Continuity:** The numeric sequence is strictly contiguous from `00001` through `00331`. There are zero missing sequence numbers, zero duplicate numeric prefixes, and zero non-numeric migration filenames in `supabase/migrations/`.
- **Integrity Fingerprint:** The aggregate SHA-256 fingerprint of the ordered 331 source files is `7e71d70976f91a8b0eb21eabe7972f54a5336326535a9f9e0e9683e1030c0961`.

### 2.2 Manifest Disposition Totals

As established in `B3-MIGRATION-DISPOSITION-MANIFEST.md` (reconciled in Phase 0E), the primary migration-level dispositions are:

| Disposition | Count | Percentage | Definition & Policy |
|---|---:|---:|---|
| **RETAIN** | 1 | 0.3% | Replay original source unmodified. Only `00328_admin_test_runner_canonical_status_enum.sql` qualifies. |
| **TRANSFORM** | 67 | 20.2% | Generate a sanitized copy preserving required DDL/functions while withholding or altering unsafe DML/schedulers. |
| **EXCLUDE** | 21 | 6.3% | Withhold entire file from schema reconstruction (data-only migrations containing no DDL/functions). |
| **BLOCKED** | 242 | 73.1% | Available evidence insufficient to select a safe replay action; unverified dependencies or procedural SQL. |
| **TOTAL** | **331** | **100.0%** | Full ordered repository migration chain. |

### 2.3 TRANSFORM Batch 1–5 Coverage Audit

Batches 1 through 5 inspected exactly 50 `TRANSFORM` migrations at the source statement level:

- **Batch 1 (10 migrations):** `00018`, `00021`, `00022`, `00025`, `00027`, `00032`, `00039`, `00056`, `00065`, `00111`.
  *Note:* Batch 1 omitted `00020` and `00041`, which were manifest `TRANSFORM` entries preceding `00056`.
- **Batch 2 (10 migrations):** `00020`, `00041`, `00114`, `00115`, `00117`, `00122`, `00123`, `00125`, `00126`, `00128`.
  *Reconciliation:* Correctly picked up the skipped entries `00020` and `00041`, followed by the next 8 manifest-ordered TRANSFORM entries.
- **Batch 3 (10 migrations):** `00130`, `00135`, `00136`, `00137`, `00138`, `00141`, `00144`, `00145`, `00146`, `00148` (manifest rows 130, 135–138, 141, 144–146, 148; transform ordinals 21–30).
- **Batch 4 (10 migrations):** `00152`, `00165`, `00166`, `00167`, `00168`, `00169`, `00174`, `00179`, `00181`, `00184` (manifest rows 152, 165–169, 174, 179, 181, 184; transform ordinals 31–40).
- **Batch 5 (10 migrations):** `00186`, `00187`, `00194`, `00212`, `00215`, `00254`, `00257`, `00265`, `00267`, `00271` (manifest rows 186, 187, 194, 212, 215, 254, 257, 265, 267, 271; transform ordinals 41–50).

**Audit Finding:**
Batches 1–5 successfully and correctly covered the first 50 `TRANSFORM` entries without overlap. Exactly **17 TRANSFORM entries remain uninspected** (transform ordinals 51–67: `00272`, `00274`, `00277`, `00278`, `00280`, `00285`, `00286`, `00288`, `00290`, `00293`, `00294`, `00297`, `00301`, `00308`, `00309`, `00319`, `00330`). Batch 6 has **not** been started, in strict compliance with instructions.

### 2.4 Evidence Reconciliation & Cross-Report Discrepancies

1. **DML Statement Accounting Reconciliation:**
   - *Phase 0A/0C Initial Report:* 295 raw register locations; 293 direct migration-time DML statements (148 INSERT, 123 UPDATE, 22 DELETE) after excluding two deferred INSERTs in uninvoked function `private.notify_suppliers_of_outcome(uuid)` in `00138:228,247`.
   - *Phase 0E Source Correction:* Discovered explicit migration-time call in `00020_taxonomy_backfill.sql:342`: `SELECT public.backfill_taxonomy();`. The function body contains 13 DML statement sites (6 UPDATE on requirements, 4 INSERT on capabilities/service areas, 1 UPDATE on capabilities, 2 UPDATE on suppliers) executed at migration time.
   - *Consolidated Reconciled Count:* **308 DML-like locations**, comprising:
     - 293 direct migration-time DML statements (79 inside executable DO blocks).
     - 13 invoked function-body DML statements (via `00020:342`).
     - 2 deferred, uninvoked function-body DML statements (`00138:228,247`).
     - **Effective migration-time DML statement sites: 306** (152 INSERT, 132 UPDATE, 22 DELETE).
2. **Migration 00328 Header vs. Source Reality:**
   - *Conflict:* Migration `00328` contains comments claiming that `00261` was already corrected for fresh replays.
   - *Resolution:* Inspection of checked-in `00261` shows it still references legacy `rfq_phase`. Therefore, `00328`'s dynamic `DO` block (replacing `rfq_phase` with `rfq_status` in `public.admin_run_test_case`) is functionally necessary. It is confirmed as **RETAIN** (`B3-REVIEW-00328.md`).
3. **Primary Manifest vs. Batch Proposal Nuance:**
   - *Distinction:* In Batches 1–5, certain individual statements inside `TRANSFORM` migrations are proposed to be `BLOCKED` (e.g., `00021` demo settings singleton insert; `00027` capability mapping; `00111` discovery function; `00125` staging singleton; `00184` purge RPC; `00186` bulk delete; `00194` blanket grants; `00265` taxonomy rewrite; `00267` admin claims).
   - *Reconciliation:* This does not contradict the manifest. The manifest records the *intended primary classification* for the file, while batch reports provide granular statement-level treatments. The manifest totals remain strictly **1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED**.
4. **PostgreSQL Version Configuration vs. Local Cache:**
   - *Configuration:* `supabase/config.toml` specifies `db.major_version = 15`.
   - *Docker Cache:* Local cache contains `supabase/postgres:15.1.1.78` (digest `sha256:881ac26a0287...`) and `public.ecr.aws/supabase/postgres:17.6.1.166`.
   - *Reconciliation:* The previous aborted attempt used the PG17 image, which failed due to a missing `supabase_admin` role. The target must strictly be PostgreSQL 15, matching `config.toml`.

---

## 3. Gate A Readiness Matrix

Each of the 12 required areas is evaluated with available evidence, exact unresolved issues, blockage scope (Stream Construction, Replay, or Both), measurable closure conditions, and minimum required evidence.

| # | Assessment Area | Evidence Available | Exact Unresolved Issue | Blockage Scope | Measurable Condition for Closure | Minimum Required Evidence |
|---|---|---|---|---|---|---|
| **1** | **Migration Stream Completeness & Dependency Ordering** | Contiguous inventory 00001–00331 verified; SHA-256 fingerprint verified; manifest categorizes all 331 files. | Full object-level dependency DAG (table/view/function cross-references) not computed; 242 migrations remain marked BLOCKED without explicit statement-level output actions. | **Both** (Blocks construction of unblocked stream; blocks replay) | Every source migration maps 1:1 to an output action in an ordered ledger; zero unresolved `BLOCKED` classifications. | Machine-readable statement-level mapping manifest covering all 331 migrations with verified syntactic AST parse. |
| **2** | **PostgreSQL / Supabase Bootstrap Compatibility** | `config.toml` sets PG15; local Docker cache contains `supabase/postgres:15.1.1.78` (`sha256:881ac...`). | Exact container init script, startup environment variables, extensions preload list (`shared_preload_libraries`), and internal Supabase startup hooks unverified. | **Replay** | Headless container starts cleanly, initializes `postgres` and system roles without error, and accepts connections on loopback. | Pinned Dockerfile / docker-compose definition specifying image digest, environment flags, and successful zero-migration init log. |
| **3** | **Required Schemas, Extensions, Roles & Platform Objects** | Explicit references cataloged: schemas `public`, `private`, `private_security`, `auth`, `storage`, `extensions`; roles `anon`, `authenticated`, `service_role`, `postgres`; extensions `pgcrypto`, `pg_net`. | Attributes, inheritance, and bypassrls flags for platform roles are unverified; exact schema structures of `auth` and `storage` tables are unpinned. | **Both** (Construction needs schema types for view/policy compilation; Replay needs runtime catalog) | Bootstrap script establishes exact schemas, extensions (`pgcrypto`, `pg_net`), and roles matching source migration grants. | Versioned bootstrap SQL script providing DDL for empty platform schemas (`auth`, `storage`) and role creation matching Supabase PG15. |
| **4** | **Migration Runner Transaction & Ledger Contract** | 8 migrations write to custom ledgers; `00126`, `00111` have explicit BEGIN/COMMIT; 97 DO blocks execute in migration transaction. | The migration runner tool, transaction wrapping strategy (per-file vs. per-statement), and ledger tracking table are not defined. | **Replay** | Runner executes migrations in strict numeric order, wraps each file in a transaction (unless explicitly multi-transaction), and records execution hash/timing in a standard ledger. | Runner specification or script adhering to fail-closed semantics on first error with rollback proof. |
| **5** | **Environment Isolation & Prevention of Live Integrations** | Function bodies with `net.http_post` identified in `00109`, `00110`, `00112`, `00266`, `00271`, `00272`; schedulers in `00041`, `00177`, `00274`. | Risk of accidental live network dispatch if runtime functions are invoked or container has outbound WAN access. | **Replay** | Disposable container runs with Docker network mode `internal` or `--internal` bridge; outbound DNS/IP egress completely rejected at firewall/network level. | Container inspection verifying `Internal: true` and test demonstrating outbound curl/http failure. |
| **6** | **Auth Bootstrap & Synthetic Identity Boundaries** | Value-redacted inventory identified real-person emails and credentials in `00071`, `00086`, `00111`, `00113`, `00115`, `00123`, `00143`, `00158`. | Reconstructed database must not contain production/real credentials or PII; synthetic test identities require clean separation from migration stream. | **Both** (Construction must withhold real seeds; Replay must have clean auth tables) | Stream generator withholds all real-person seed blocks; `auth.users` contains zero rows after migration replay; synthetic test fixtures kept in separate post-replay loader. | Transformation rules for account seed migrations (e.g. `00111`, `00113`, `00158`) confirming 100% withholding of identity DML. |
| **7** | **Essential Role & Permission Reference Data** | Role catalog migrations `00039`, `00056`, `00114`, `00254`, `00257` analyzed; canonical 12 roles identified. | `00056` introduces an `OWNER` organization role bypass over active role permissions; canonical role catalog in `00257` is currently marked TRANSFORM and unapproved. | **Construction** (Must decide whether to retain canonical role seeds) | Canonical 12-role catalog (`role_permission`) approved as essential authorization reference data; `00257` upsert preserved in stream. | Approved specification confirming the canonical 12 buyer/supplier roles and permission arrays. |
| **8** | **Taxonomy & Capability Reference-Data Completeness** | Taxonomy DDL in `00013`, `00014`, `00015`; seed data in `00019`, `00058`, `00059`, `00061`, `00062`, `00265`, `00331`; capability mapping in `00027`. | Manifest excludes `00019` and `00331` as data-only, but `00027` requires 23 capability codes to execute its mapping; taxonomy subcategories needed for requirement intake. | **Construction** (Requires sequencing of reference data) | Reference data strategy defines whether canonical taxonomy (17 categories) is loaded via a dedicated reference fixture or retained migration block. | Reconciled taxonomy fixture containing the 17 authoritative categories, subcategories, and 23 capability codes without historical noise. |
| **9** | **RLS, Grants, Ownership & Security-Definer Safety** | Catalog-driven security DDL in `00177`, `00178`, `00199`, `00212`, `00281`–`00283`; blanket grants in `00194`; CASCADE drops in `00065`, `00117`, `00136`. | Dynamic PL/pgSQL loops query `pg_tables` / `pg_proc` at migration time; if bootstrap catalog is incomplete, security definer search paths and RLS policies fail or apply incorrectly. | **Both** (Construction must preserve fail-closed logic; Replay must assert exact post-RLS catalog) | Catalog loops retain source predicates but abort transaction on warning/error; postcondition suite asserts RLS enabled and correct search_path on all public routines. | Automated postcondition verification script asserting `relrowsecurity = true` on all public tables and non-public `search_path` on functions. |
| **10** | **Destructive Migration-Time DML & Clean-Target Preconditions** | 306 effective DML statement sites mapped; 79 inside DO blocks; backfills in `00020`, `00022`, `00032`, `00065`, `00114`, `00122`, `00167`, `00168`, `00169`. | Backfills designed for populated legacy databases are invalid/unnecessary on empty disposable database and can corrupt synthetic test invariants. | **Both** (Construction must withhold empty-target backfills; Replay must prove target was empty) | Generator withholds backfills that assume pre-existing historical rows; clean target asserts 0 rows before stream replay. | Transformation rule set mapping each backfill statement to `WITHHOLD` conditional on `COUNT(*) = 0` precondition. |
| **11** | **Scheduler, Notification & External Side-Effect Prevention** | Cron jobs in `00041:607`, `00177:125`, `00274:236`; `pg_notify` in `00194:73`; HTTP calls in `00109`, `00112`, `00274`. | Active background cron jobs would trigger unpredictable automated state changes during validation; notifications fail if listener absent. | **Construction** (Must excise schedulers from generated stream) | Generated migration stream contains exactly zero occurrences of `cron.schedule`, `cron.unschedule`, or `pg_notify('pgrst'...)`. | Stream generator unit test searching output SQL for regex `cron\.(un)?schedule\|pg_notify` and returning 0 matches. |
| **12** | **Failure Handling, Rollback & Measurable Postconditions** | Phase 0A Validation Plan (`B3-RECONSTRUCTION-VALIDATION-PLAN.md`) lists 5 validation stages. | Acceptance tests exist only as high-level markdown text; no executable SQL verification scripts exist to validate post-replay schema. | **Replay** | Executable validation SQL script asserts table counts, column definitions, foreign keys, RLS policies, and function signatures against golden catalog. | Executable SQL test script (`validate_reconstruction.sql`) returning boolean pass/fail without requiring application code. |

---

## 4. Separation of Authorization Gates

To prevent conflating stream generation with database execution or workflow testing, the process is partitioned into three strictly independent gates:

```
[Phase 0A-0E & Batches 1-5 Evidence]
               │
               ▼
┌──────────────────────────────────────────────┐
│  GATE A1: STREAM CONSTRUCTION READINESS     │
│  Can deterministic sanitized SQL be created? │
│  STATUS: NOT READY (Finite Blockers)         │
└──────────────────────────────────────────────┘
               │ (Requires: Generator + Rules + Reference Fixtures)
               ▼
┌──────────────────────────────────────────────┐
│  GATE A2: REPLAY READINESS                   │
│  Can migrations execute in disposable DB?    │
│  STATUS: NOT AUTHORIZED                      │
└──────────────────────────────────────────────┘
               │ (Requires: PG15 Bootstrap + Egress Denial + Postconditions)
               ▼
┌──────────────────────────────────────────────┐
│  GATE B: WORKFLOW VALIDATION                 │
│  Can buyer/supplier workflows be validated?  │
│  STATUS: NOT AUTHORIZED (Separate Scope)     │
└──────────────────────────────────────────────┘
```

### 4.1 Gate A1 — Stream Construction Readiness

**Question:** Can a deterministic, disposable migration stream be constructed in a staging directory without executing it?

**Scope & Authority:**
- Governs the creation of an offline, sanitized set of SQL files in a dedicated generated directory (e.g., `build/disposable-migrations/`).
- Does **not** authorize starting Docker, connecting to Postgres, creating tables, or executing SQL.
- **Current Status: NOT READY.**
- **Prerequisites to open Gate A1:**
  1. Complete macro-transformation rules for the remaining 17 TRANSFORM migrations.
  2. Implement a rule-based generator that handles the 242 BLOCKED migrations by applying standardized policy rules (e.g. retain pure DDL, withhold data backfills, remove cron blocks).
  3. Formulate an isolated reference data specification for the canonical role catalog and core taxonomy.

### 4.2 Gate A2 — Replay Readiness

**Question:** What additional bootstrap, environment, source-treatment, isolation, and rollback evidence is required before any migration can execute in a disposable container?

**Scope & Authority:**
- Governs launching a local PostgreSQL 15 Supabase container, establishing platform bootstrap objects (`auth`, `storage`, roles), applying the generated migration stream sequentially, and recording the execution ledger.
- Does **not** authorize connecting frontend clients, seeding mock transactions, or testing application APIs.
- **Current Status: NOT AUTHORIZED.**
- **Prerequisites to open Gate A2:**
  1. Full satisfaction and sign-off of Gate A1.
  2. Verified PostgreSQL 15 Supabase container configuration running on an isolated, internal-only Docker network with loopback port binding (`127.0.0.1:<random_port>`).
  3. Pre-migration bootstrap SQL script providing standard Supabase platform schemas (`auth.users`, `storage.buckets`, `storage.objects`) and role definitions (`anon`, `authenticated`, `service_role`, `postgres`).
  4. Migration runner configured with fail-closed transaction handling and ledger recording.
  5. Pre-execution assertion that database contains zero user tables and zero rows.
  6. Replay validation script ready to assert catalog postconditions immediately upon completion.

### 4.3 Gate B — Workflow Validation

**Question:** Can buyer and supplier procurement journeys (intake, RFQ publishing, quoting, evaluation, awarding) be executed and tested?

**Scope & Authority:**
- Governs loading application test fixtures, invoking application RPCs, and testing buyer/supplier end-to-end capabilities.
- **Current Status: STRICTLY NOT AUTHORIZED.**
- Gate B is explicitly decoupled from this report. No workflow testing may be authorized until a disposable database has successfully replayed and passed all Gate A2 postcondition verifications.

---

## 5. Essential Reference Data Boundaries

A disposable database cannot evaluate business logic, constraints, or foreign keys if essential static reference data is completely stripped. However, operational seed data, demo accounts, and historical production data must be strictly excluded.

The boundary between **Essential Reference Data** and **Excluded Operational / Seed Data** is defined below:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      ESSENTIAL REFERENCE DATA                          │
│               (Retained or Loaded via Clean Fixture)                   │
├────────────────────────────────────────────────────────────────────────┤
│ • Canonical 12-Role RBAC Catalog (00039 / 00257)                       │
│   - Buyer: BUYER_ADMIN, PROCUREMENT_LEAD, FACILITY_MANAGER,            │
│            SITE_ENGINEER, FINANCE_OFFICER, AUDITOR, PROPERTY_OWNER     │
│   - Supplier: SUPPLIER_ADMIN, ESTIMATOR, SALES_MANAGER,                │
│               FIELD_TECHNICIAN, ACCOUNTS_OFFICER                       │
│ • Persona Semantics: Individual, RWA, MSME role configurations         │
│ • Authoritative 17-Category Procurement Taxonomy (00331 / 00019)       │
│ • Subcategories, Units of Measure, and Matching Keywords               │
│ • 23 Capability Codes & Attribute Normalization Mappings (00027)       │
│ • Standard Evaluation Criteria & Scoring Weight Definitions (00017)    │
│ • Platform Settings Schemas (empty or default-disabled)                │
└────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ STRICT SEPARATION
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      EXCLUDED OPERATIONAL DATA                         │
│                     (Withheld from Reconstruction)                     │
├────────────────────────────────────────────────────────────────────────┤
│ ✕ Real-Person PII & Admin Accounts (bvnbasu, yahoo/gmail addresses)   │
│ ✕ Hard-coded Passwords, JWT Tokens, and Bcrypt Hashes                  │
│ ✕ Demo Foundation Accounts, Scenarios & Singleton Settings (`00021`)   │
│ ✕ Demo Price Anchors & Synthetic Quotation Simulators (`00025`)        │
│ ✕ Seeded Suppliers, GSTINs, Legal Identities, and Contact Phone Numbers │
│ ✕ Historical RFQ, Quote, Work Order, Award, and Invoice Backfills      │
│ ✕ Prepaid Subscription Dummy Payments and Wallet Credit Seeds          │
│ ✕ Historical Audit Trail Events, Notifications, and Activity Pings     │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Minimum Viable Reference Data Specifications

1. **RBAC & Role Catalog:**
   - Must include the 12 canonical roles defined in `00039` and finalized in `00257`.
   - Permissions must explicitly respect the read-only constraint on `PROPERTY_OWNER` while resolving the organizational `OWNER` override identified in `00056`.
2. **Procurement Taxonomy:**
   - The authoritative set of 17 top-level categories and standard subcategories.
   - Associated capability definitions required to satisfy foreign key constraints on `supplier_capabilities` and `requirement_subcategories`.
3. **Capability & Attribute Mappings:**
   - The exact 23 capability mapping codes specified in `00027_capability_capacity_source.sql:28-64` (e.g. motor/pump to `motor_hp`, borewell to `depth_ft`, generator to `capacity_kva`, solar to `system_kw`, water plant to `capacity_lph`).
   - Attribute validation definitions required for requirement intake.
4. **Entitlement Reference Data:**
   - Subscription tier definitions (e.g. `FREE`, `STANDARD`, `ENTERPRISE`) may be retained as static reference types, but organization credit allocations, dummy payment logs, and free RFQ credits must remain empty.

---

## 6. Minimum Viable Gate A Closure Plan

To immediately terminate the broad migration inspection cycle and reach an executable disposable database, the project must execute a finite sequence of five targeted technical actions. 

No additional open-ended "inspection batches" (such as Batch 6, 7, etc.) should be scheduled. The remaining 17 TRANSFORM migrations and 242 BLOCKED migrations can be resolved deterministically through standardized macro-rules.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MINIMUM VIABLE GATE A CLOSURE ROADMAP                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ACTION 1: Pinned PG15 Supabase Bootstrap Specification                     │
│  [Technical Deliverable: bootstrap-schema.sql + docker-compose.test.yml]   │
│  --> Closes: B0E-01, B0E-02, B0E-03, B0E-04                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ACTION 2: Stream Generator with Declarative Macro-Rules                    │
│  [Technical Deliverable: generate-disposable-stream.py + rule manifest]     │
│  --> Closes: B0E-05, B0E-07, B0E-08 (Transforms remaining 17 + 242)        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ACTION 3: Canonical Reference-Data Fixture Package                         │
│  [Technical Deliverable: 00_canonical_reference_fixtures.sql]               │
│  --> Closes: Taxonomy, Role Catalog, 23 Capability Mapping Dependencies    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ACTION 4: Isolated Disposable Replay Harness                               │
│  [Technical Deliverable: replay-runner.sh (internal network, loopback only)]│
│  --> Closes: B0E-09, Egress Denial, Runner Ledger Contract                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ACTION 5: Automated Catalog Postcondition Validation Suite                 │
│  [Technical Deliverable: verify-reconstruction-postconditions.sql]          │
│  --> Closes: B0E-06, RLS Verification, Search-Path & Integrity Proof        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Action 1: Pinned PostgreSQL 15 Supabase Bootstrap Specification
- **Exact Blocker Addressed:** B0E-01 (PG15 Bootstrap), B0E-02 (Role attributes), B0E-03 (Auth/Storage catalog contract), B0E-04 (Extension versions).
- **Required Deliverable:**
  - File: `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/bootstrap/00-supabase-platform-bootstrap.sql`.
  - Defines exact roles (`anon`, `authenticated`, `service_role`, `postgres`) with accurate Supabase attributes.
  - Defines minimal empty `auth` (`users`, `identities`, `sessions`, `refresh_tokens`, `uid()`, `role()`, `jwt()`) and `storage` (`buckets`, `objects`) tables and functions matching Supabase PG15 ABI.
  - Installs extensions `pgcrypto` and `pg_net` in schema `extensions`.
- **Acceptance / Pass Condition:** Executes with zero errors on a vanilla PostgreSQL 15 Docker container; subsequent sample migration referencing `auth.users` and `storage.buckets` compiles without error.
- **Separate Authorization Required:** No (read-only design / local script preparation).

### Action 2: Stream Generator with Declarative Macro-Rules
- **Exact Blocker Addressed:** B0E-05 (Side-effect call graph), B0E-07 (242 BLOCKED entries), B0E-08 (No generated stream).
- **Required Deliverable:**
  - A Python or Node-based stream generator script that reads the 331 migrations and applies declarative macro-rules:
    1. *Rule R-SCHEDULER:* Remove all DO blocks matching `cron.schedule|cron.unschedule`.
    2. *Rule R-NOTIFY:* Remove `pg_notify('pgrst', ...)` DO blocks.
    3. *Rule R-CLEAN-BACKFILL:* For migrations with `UPDATE ... WHERE` backfills on operational tables, comment out the backfill with a machine tag `-- [SANITIZED-WITHHELD-BACKFILL]`.
    4. *Rule R-ACCOUNT-SEED:* For migrations classified as `account/password` or `supplier/business-data` seeds without DDL, emit an explicit no-op migration recording provenance.
    5. *Rule R-DYNAMIC-SECURITY:* In dynamic security blocks (`00177`, `00178`), replace notice-swallowing exception handlers with `RAISE EXCEPTION`.
- **Acceptance / Pass Condition:** Generator processes all 331 source files in under 10 seconds; produces exactly 331 numbered output files in `build/disposable-migrations/`; zero occurrences of `cron.schedule` or unhandled DML in the output stream; 1:1 cryptographic mapping hash table generated.
- **Separate Authorization Required:** Requires Project Owner sign-off on the Generator Rule Manifest prior to generating the stream.

### Action 3: Canonical Reference-Data Fixture Package
- **Exact Blocker Addressed:** Role catalog completeness, taxonomy intake prerequisites, 23 capability mapping codes (`00027`).
- **Required Deliverable:**
  - File: `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/fixtures/01-canonical-reference-data.sql`.
  - Consolidates the clean 12-role catalog from `00257`, the 17 taxonomy categories from `00331`/`00019`, and the 23 capability mapping attributes from `00027`.
  - Stripped of all demo accounts, supplier records, and contact details.
- **Acceptance / Pass Condition:** Inserts exactly 12 roles into `role_permission`, exactly 17 categories into `requirement_categories`, and exactly 23 capability mappings into `capabilities`; passes foreign key checks against reconstructed schema.
- **Separate Authorization Required:** No.

### Action 4: Isolated Disposable Replay Harness
- **Exact Blocker Addressed:** B0E-09 (Replay environment isolation), Migration runner transaction and ledger contract.
- **Required Deliverable:**
  - Shell/PowerShell replay script with `docker run` command specifying:
    - Image: `supabase/postgres:15.1.1.78`.
    - Networking: `--network none` or isolated Docker bridge with zero outbound routes.
    - Port Binding: `-p 127.0.0.1:54322:5432` (loopback only).
    - Dedicated named volume (e.g. `otp_disposable_db_data`) with auto-cleanup on termination.
  - Sequential runner applying `00-supabase-platform-bootstrap.sql`, followed by the 331 generated migrations, recording execution timing and status in `_disposable_migration_ledger`.
- **Acceptance / Pass Condition:** Successful replay of migration stream from 00001 through 00331 without transaction aborts; zero network packets transmitted outside localhost.
- **Separate Authorization Required:** **YES (Explicit Gate A2 Authorization required from project owner).**

### Action 5: Automated Catalog Postcondition Validation Suite
- **Exact Blocker Addressed:** B0E-06 (Security/catalog postconditions), Schema reconstruction verification.
- **Required Deliverable:**
  - SQL verification script: `verify-reconstruction-postconditions.sql`.
  - Queries `pg_class`, `pg_policy`, `pg_proc`, `information_schema` and asserts:
    - Total table count matches expected retained schema count.
    - All public tables have `relrowsecurity = true`.
    - All `SECURITY DEFINER` functions in `public` have explicit non-empty `proconfig` setting `search_path`.
    - FK constraints between `rfqs` and `requirements` exist and are valid.
    - Zero active cron jobs in `cron.job`.
    - Zero rows in `auth.users`, `rfqs`, `quotes`, `work_orders`.
- **Acceptance / Pass Condition:** Script executes against the replayed database and outputs `VERIFICATION SUCCESS: 0 DEFECTS FOUND`.
- **Separate Authorization Required:** Runs automatically as part of authorized Gate A2 replay.

---

## 7. Evidence Integrity & Audit Trail

### 7.1 Referenced Evidence Files Reviewed

The following files were inspected directly on disk from `g:\My Drive\otp`:

1. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-REVIEW-00328.md`
2. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-DML-RECONCILIATION.md`
3. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-PROCEDURAL-SQL-REVIEW.md`
4. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-SUPABASE-BOOTSTRAP-REVIEW.md`
5. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-DESIGN-REVIEW.md`
6. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-MIGRATION-DISPOSITION-MANIFEST.md`
7. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-UNSAFE-MIGRATION-STATEMENT-REGISTER.md`
8. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-SANITIZED-MIGRATION-CLASSIFICATION.md`
9. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-DISPOSABLE-MIGRATION-STREAM-SPECIFICATION.md`
10. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-SUPABASE-BOOTSTRAP-REQUIREMENTS.md`
11. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-PHASE-0E-REMAINING-BLOCKER-REGISTER.md`
12. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-SCHEMA-RECONSTRUCTION-DESIGN.md`
13. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-RECONSTRUCTION-VALIDATION-PLAN.md`
14. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-TRANSFORM-BATCH-1-SOURCE-SPECIFIC.md`
15. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-TRANSFORM-BATCH-2-SOURCE-SPECIFIC.md`
16. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-TRANSFORM-BATCH-3-SOURCE-SPECIFIC.md`
17. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-TRANSFORM-BATCH-4-SOURCE-SPECIFIC.md`
18. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-TRANSFORM-BATCH-5-SOURCE-SPECIFIC.md`
19. `docs/otp-next/tell/stage-b/b3/evidence/disposable-design/B3-PHASE-1-EXECUTION-CHECKLIST.md`

### 7.2 Prohibited Operations Confirmation

In strict conformance with task boundaries:
- **No migrations edited:** All 331 source files in `supabase/migrations/` remain completely untouched.
- **No manifest edited:** `B3-MIGRATION-DISPOSITION-MANIFEST.md` was not modified.
- **No prior reports edited:** None of the 19 existing evidence reports were altered or overwritten.
- **No SQL generated:** No generated migration SQL or stream files were created.
- **No database activity:** Zero SQL queries, container invocations, docker commands, or network connections were initiated.
- **No Batch 6 started:** Inspection strictly terminated at Batch 5.
- **Worktree integrity:** Pre-existing git status preserved without staging, committing, or discarding.
