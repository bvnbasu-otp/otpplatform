# B3-01 — Executive Scope and Authorisation

## Purpose and decision

This package is a read-only architecture investigation and implementation-planning record for OTP TELL. It does not authorize implementation, migration execution, database access, tests, builds, external supplier discovery, or deployment.

**Status: B3 PLANNING COMPLETE WITH OPEN DEPENDENCIES — IMPLEMENTATION BLOCKED.**

The frozen B1 rule is unchanged: one parent coordinates independently reviewable children; every child has exactly one category and is independently confirmed and published as its own RFQ. Supplier quotation remains one whole-RFQ quote per supplier per child RFQ.

## Baseline and preservation

- Repository: `G:\My Drive\otp`
- Branch: `main`, tracking `origin/main`, zero ahead/behind at baseline
- HEAD: `77888fba12c6cee441017986a663393d92d4b649`
- `git status --porcelain=v2 --branch`: no staged or unstaged tracked changes; `docs/otp-next/tell/` was untracked.
- The untracked baseline consisted of the 15 B2 documents in `docs/otp-next/tell/stage-b/b2/`. They are preserved and were not rewritten.
- The TELL documentation inventory contained those B2 documents; no separate B1 document directory was present in that inventory. Frozen B1 terms were taken from the governing prompt and reconciled B2 package.
- No source, migration, test, generated type, configuration, or database object was changed. No tests/builds/database/hosted operations were run.

## Scope accomplished

1. Re-inspected the existing B2 architecture package and relevant tracked repository code.
2. Recorded DEP-01 as unresolved reference (D); its external/current schema and owner cannot be established from tracked source.
3. Specified static designs for atomic child publication/idempotency, supplier visibility/RLS, and local-draft isolation while explicitly retaining their runtime-validation gates.
4. Prepared conditional data architecture, parser/clarification contract, customer journey, dependency roadmap, acceptance plan, and a bounded disposable-runtime-validation proposal.
5. Prepared a separate implementation and validation approval request; neither is granted by this document.

## Critical path

1. Obtain authoritative `requirement_specifications` ownership/schema/API evidence (DEP-01).
2. Review and approve the buyer-item storage decision; resolve audit retention and post-publication amendment lifecycle.
3. Separately authorize the disposable full migration/RLS/publication validation proposal in B3-12.
4. Close atomic publication, supplier visibility, and local recovery gates with evidence.
5. Authorize one bounded implementation package at a time; migrations, tests, builds, external integrations, and production remain distinct approvals.

## Approval boundary requested

The next requested decision is limited to **evidence acquisition for DEP-01**: provide authoritative schema/history/API evidence or authorize metadata-only inspection against a named disposable environment that faithfully represents the schema in question. Separately, the product owner may authorize the B3-12 disposable validation proposal after reviewing its exact side effects and safeguards.

No application-code implementation is requested as ready to start. No migration name or DDL is proposed as final while the buyer-item store remains unresolved. Categories E (external supplier discovery) and F (hosted/production changes) are explicitly excluded.

See [B3-12](./B3-12-IMPLEMENTATION-AUTHORISATION-REQUEST.md) for the itemized approval request and [B3-FINAL](./B3-FINAL-ARCHITECTURE-AND-READINESS-DECISION.md) for the complete decision.
