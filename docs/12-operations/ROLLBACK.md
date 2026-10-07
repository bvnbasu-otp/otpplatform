# Rollback

Status of an automated application rollback: `NOT-IMPLEMENTED` in the GitHub Actions production step (it only logs). Status of database rollback: manual, and dangerous. Not executed here.

## Web

`vercel.json` does not define a rollback. If Vercel hosts the project, a person uses that host’s deployment history. This repo does not record the previous deployment id.

`scripts/deploy-prod.ps1` synopsis says it can revert to a previous release if a smoke test fails. The script was not executed and its rollback branch was not certified. Do not follow the synopsis as a proven control.

## Database

Migrations in this repo are forward SQL. `00242` comments a manual rollback: restore specific policies from `00004` and `00007`, re-grant privileges, drop the triggers it added, and restore two functions from earlier migrations. That comment is an operator note inside the migration, not a tested script.

`00245` cannot be “reversed” by expecting old purchase orders to change, because it did not update them. Replacing the function again would change future PO creation only.

Do not run `supabase db push` or a down migration from this document.

## Git

Reverting a commit is a human git operation. This reconstruction does not reset or revert.
