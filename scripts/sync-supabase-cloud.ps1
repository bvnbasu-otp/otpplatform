<#
.SYNOPSIS
  RETIRED. OTP Supabase Cloud sync helper. Performs no action and always exits 1.
.DESCRIPTION
  This helper used to run `supabase link`, `supabase db push`, and
  `supabase secrets set` against a hosted project. It could not verify the
  hosted migration ledger before linking or pushing, and a push across
  historical migration 00077 executes a destructive purge
  (HISTORICAL_PURGE_BLOCK).

  The script is now informational and fail-closed. It does not link a project,
  push migrations, set function secrets, or contact any hosted service, with or
  without -SkipDbPush. Any parameters are accepted only so that old invocations
  fail with this message instead of a parser error.

  Hosted migration application goes through the production CI job, which reads
  the remote ledger and refuses a push that would cross 00077. Function secrets
  and auth URL configuration need a separately scoped and authorized
  replacement procedure.
#>

[CmdletBinding()]
param (
  [Parameter(Position=0)]
  [string]$ProjectRef = "",

  [string]$AnonKey = "",
  [string]$SiteUrl = "",
  [switch]$SkipDbPush
)

Write-Host ""
Write-Host "[ERROR] RETIRED: this cloud sync helper performs no hosted action." -ForegroundColor Red
Write-Host "        HISTORICAL_PURGE_BLOCK: this helper cannot verify that destructive migration 00077 is already applied." -ForegroundColor Red
Write-Host "        No project was linked, no migration was pushed, and no function secret was set." -ForegroundColor Red
Write-Host "        -SkipDbPush does not change this. Use the production CI migration job for database changes," -ForegroundColor Yellow
Write-Host "        and a separately authorized procedure for function secrets." -ForegroundColor Yellow
exit 1
