# Coverage policy

Source: `scripts/verify-test-coverage-policy.ts`, invoked as `pnpm test:policy`. CI passes `--strict` and `STRICT_APPEND_RULE=true`.

The file’s header states:

- A code change must include tests in unit, module, functional, and regression categories.
- The script can block a release build or PR when coverage is missing.
- It audits file counts against minimums.

This reconstruction did not execute the policy script in Phase 2. The header is the policy text. It is not a pass result.

Phase 1 ran five targeted test files (78 tests). That run is not a `pnpm test:policy` result.

Unit collection paths named in the script include `packages/domain/src`, `tests/unit`, `supabase/functions/_shared`, and `apps/web/src/lib`. The rest of the category map was not copied out.

`apps/web/src/features/site/content/site-content.test.ts` locks public claims: WhatsApp/SMS are not “available now”, FAQs do not promise quoting by WhatsApp or SMS, and Enterprise is not a public customer type. That file is the regression for the copy rules in [DOCUMENTATION_PRINCIPLES.md](../00-governance/DOCUMENTATION_PRINCIPLES.md).
