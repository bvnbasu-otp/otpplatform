# Migration 00328 Manual Review

## Result

`00328_admin_test_runner_canonical_status_enum.sql` is an executable
PL/pgSQL `DO` block which conditionally rewrites an existing function
definition using dynamic SQL. It is not a no-op or data seed. Source tracing
resolves its behavior in the ordered chain: it repairs the `00261` function,
and no later migration through `00331` redefines that function. The inaccurate
comment is a documentation defect, not a behavior ambiguity. For the
repository's ordered replay, disposition is **RETAIN** unchanged.

## Complete construct and effects

Source: `supabase/migrations/00328_admin_test_runner_canonical_status_enum.sql`.

| Lines | Construct | Effect / dependency |
|---|---|---|
| 1-3 | Comments identify the migration as a forward correction and claim migration 00261 is already corrected for fresh replays. | The claim conflicts with the current checked-in 00261 source; see below. |
| 5-9 | `DO $migration$`, declarations, and executable block. | Runs during migration application in the current transaction. Requires PL/pgSQL support. |
| 10-12 | `pg_get_functiondef('public.admin_run_test_case(text,text)'::regprocedure)`. | Requires the exact function signature to exist; `regprocedure` resolution fails if it does not. |
| 14-16 | Searches the retrieved definition for `rfq_phase`, replaces every occurrence with `rfq_status`, then `EXECUTE`s the resulting function definition. | Dynamically executes `CREATE OR REPLACE FUNCTION` text, changing the stored function definition. It does not insert/update/delete table rows. |
| 17-19 | If the old token was absent, checks for the expected canonical enum predicate; otherwise raises an exception. | Fails closed for an unrecognized definition. |
| 21-25 | Reads the installed definition again and raises if `rfq_phase` remains. | Postcondition check; any exception aborts the migration transaction. |
| 26-27 | Closes the block. | No separate external-service call is present. |

## Dependency and replay implications

Migration `00261_admin_run_test_case_truthful_execution_and_auth.sql`
creates/replaces `public.admin_run_test_case(text,text)` at line 9 onward.
Its UNIT-001 branch queries `rfq_phase` at lines 376-381 and describes that
legacy identifier in its error/details text. Thus, for the current checked-in
source, the `00328` branch at lines 14-16 is taken: it replaces every
`rfq_phase` substring with `rfq_status` in the function definition and
executes the resulting `CREATE OR REPLACE FUNCTION`. The resulting body
contains the canonical `rfq_status` / `requirement_status` enum check, so the
line 17 expected-fragment guard and lines 21-25 postcondition are satisfied.

The function was first defined in `00096_admin_test_suite_runner_rpc.sql`,
replaced in `00115_seed_benchmark_org_and_fix_test_runner.sql`, and most
recently redefined before 00328 in migration 00261. Repository-wide search
finds no subsequent definition/replacement in migrations `00329` through
`00331`; 00328 is therefore the final correction in the checked-in chain.
The comments at 00328 lines 1-3 saying 00261 is already corrected for fresh
replays are inaccurate, but the code matches the actual 00261 source.

The migration requires the target to have:

- the 00261 function installed under the expected signature;
- PL/pgSQL and PostgreSQL's `pg_get_functiondef` support;
- sufficient migration-role authority to replace that function; and
- a function body matching either the recognized legacy form or the
  canonical predicate expected at line 17.

It is conditionally repeatable for the two recognized body forms: the legacy
form is rewritten, while the canonical form passes the expected-predicate
check without executing replacement SQL. This is not a general idempotency
guarantee for arbitrary definitions. The global text replacement also
changes the legacy token in diagnostic text; that is consistent with the
canonical terminology and does not change the function's access control or
data writes. This conclusion is based on source text only; no SQL was
executed.

## Why the lexical inventory missed it

The migration contains no conventional top-level `CREATE`, `ALTER`, `INSERT`,
`UPDATE`, or `DELETE`. Its operation is encoded in a PL/pgSQL `DO` body and
the consequential DDL is assembled from catalog-returned text and executed
with `EXECUTE`. A statement classifier that labels the outer `DO` statement
as unknown/other cannot infer this function replacement from top-level
tokens. It must inspect procedural bodies and dynamic SQL explicitly.

## Disposition

**RETAIN unchanged for the ordered source replay.** It depends on the
function installed by migration 00261 and performs a deterministic,
local function-definition correction; it does not execute the function or
issue network/scheduled work. Do not retain it if replay ordering skips
00261 or introduces an alternate function definition; such a stream would
need an explicit re-review. The bootstrap must still provide PL/pgSQL and
the migration role must be allowed to replace the function. No database or
migration was run.
