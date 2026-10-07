# Source of truth policy

When two descriptions disagree, use this order. Stop at the first source that actually contains the fact.

| Question | Winning source | What does not win |
| --- | --- | --- |
| What the hosted database is running | A read of that database, which this reconstruction did not do | A migration file, a CI ceiling string, a certification note |
| What SQL is in the repository | The highest-numbered migration that `CREATE OR REPLACE`s the function, after checking later files do not replace it again | An earlier migration, a domain TypeScript comment |
| Buyer persona | `BuyerPersona` in `packages/domain/src/types/buyer-persona.ts` (`INDIVIDUAL`, `RWA`, `MSME`) and `resolveBuyerPersona` (fail closed) | `SUBSCRIPTION_TIERS.ENTERPRISE`, old docs that list enterprises as customers |
| Public wording | `apps/web/src/features/site/content/site-content.ts` and the page that renders it | Internal domain marketing constants that no page renders |
| Entitlement arithmetic | `evaluateRfqEntitlement` in `packages/domain/src/types/pricing-entitlement.ts` | Removed constant `WHY_5_RFQS_EXPLANATION` |
| Award reveal versus purchase order | Latest `public.reveal_award` (`00244`) and latest `public.lock_and_reveal_award_atomic` (`00222`, not replaced by `00244`) | A comment that says they are always the same event |
| Purchase-order tax | `public.create_purchase_order_from_award` as replaced by `00245` | `00240`'s zero GST columns, for rows created after `00245` is applied |
| Buyer coverage location | Edge `location-pin-coverage` → `runAuthoritativeLocationPinCoverage`, durable rows in `00224` | The library ladder’s in-memory `Map` labeled `DATABASE_CACHE`, and the static Bengaluru fixtures |
| Provider liveness | The provider resolver or adapter status actually returned, plus proof of a live call | The existence of a file under `packages/services` or `supabase/functions` |
| Deployed web SHA | A Vercel deployment record | `vercel.json`, the README URL, a GitHub Actions log line that only echoes |
| Capability status | [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) | Any other markdown file, including this one if they diverge |

## Baseline inspected

| Item | Value | How it was checked |
| --- | --- | --- |
| Git branch | `main` | `git rev-parse --abbrev-ref HEAD` |
| Git SHA | `b7fbcea22273f6045ac0fdd562a278107dcf34b1` | `git rev-parse HEAD` and `git rev-parse origin/main` (equal) |
| Commit subject | `test: add feature-local copy coverage` | `git log -1` |
| Local migrations | `00001`–`00247`, 247 files, no gaps | Directory listing compared with 1..247. `00246` and `00247` not applied to hosted. |
| Hosted Supabase | HOSTED DATABASE CEILING NOT RE-VERIFIED | Not queried. Supabase CLI was not run. Prior manual verification was `00245`. |
| Production URL in repo | `https://otpplatform-theta.vercel.app` | `README` and `scripts/deploy-prod.ps1` default. DEPLOYED REVISION NOT RE-VERIFIED |
| Working tree | Dirty | `git status` at this phase. This pass did not commit |

Citations below are to files as they were on disk during this reconstruction. Several application files were already modified and uncommitted. Those hunks were not expanded.
