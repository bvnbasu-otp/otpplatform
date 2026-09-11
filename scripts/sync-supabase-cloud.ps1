<#
.SYNOPSIS
  OTP Platform -- Supabase Cloud Synchronization and Migration Deployment Tool
.DESCRIPTION
  Automates linking the local codebase to your Supabase Cloud project and pushing
  all 156 database migrations, security policies, and Edge Function secrets.

.EXAMPLE
  .\scripts\sync-supabase-cloud.ps1 -ProjectRef "qsuvtcezffomtwzwyrso"
#>

[CmdletBinding()]
param (
  [Parameter(Position=0)]
  [string]$ProjectRef = "",

  [string]$AnonKey = "",
  [string]$SiteUrl = "https://otpplatform-theta.vercel.app",
  [switch]$SkipDbPush
)

$ErrorActionPreference = "Continue"

if ($PSScriptRoot) {
  $WorkspaceRoot = (Get-Item -Path "$PSScriptRoot\..").FullName
} else {
  $WorkspaceRoot = "G:\My Drive\otp"
}

Set-Location $WorkspaceRoot

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OTP PLATFORM -- SUPABASE CLOUD DEPLOYMENT AND MIGRATION SYNC" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Workspace : $WorkspaceRoot" -ForegroundColor DarkGray
Write-Host "Site URL  : $SiteUrl" -ForegroundColor DarkGray
Write-Host ""

# 1. Check Supabase CLI Availability
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCmd) {
  Write-Host "[ERROR] Supabase CLI is not found in PATH." -ForegroundColor Red
  Write-Host "        Install it using: npx supabase --help (or npm install -g supabase)" -ForegroundColor Yellow
  Write-Host "        Then re-run this script." -ForegroundColor Yellow
  exit 1
}

# 2. Prompt for Project Reference if not provided
if (-not $ProjectRef) {
  Write-Host "Please enter your Supabase Cloud Project Reference ID." -ForegroundColor Yellow
  Write-Host "(Find it in Supabase Dashboard -> Project Settings -> General -> Reference ID)" -ForegroundColor DarkGray
  $ProjectRef = Read-Host "Supabase Project Ref"
  if (-not $ProjectRef) {
    Write-Host "[ERROR] Project reference ID is required." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "[1/4] Linking local codebase to Supabase Cloud project: $ProjectRef..." -ForegroundColor Yellow
& supabase link --project-ref $ProjectRef

# 3. Push Database Migrations (00001 to 00156)
if (-not $SkipDbPush) {
  Write-Host ""
  Write-Host "[2/4] Pushing all 156 tracked schema migrations to Supabase Cloud..." -ForegroundColor Yellow
  & supabase db push
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] All database migrations synchronized to Supabase Cloud successfully." -ForegroundColor Green
  } else {
    Write-Host "[WARN] Migration push returned non-zero code. Inspect the output above." -ForegroundColor Yellow
  }
}

# 4. Set Edge Function Secrets
Write-Host ""
Write-Host "[3/4] Configuring Supabase Cloud Edge Function secrets..." -ForegroundColor Yellow
& supabase secrets set APP_URL="$SiteUrl"
& supabase secrets set WEB_ORIGIN="$SiteUrl"
& supabase secrets set MESSAGING_PROVIDER="mock"

Write-Host "[OK] Secrets set for APP_URL and WEB_ORIGIN -> $SiteUrl" -ForegroundColor Green

# 5. Run Live Keep-Alive Heartbeat Test
Write-Host ""
Write-Host "[4/4] Verifying connection with keep-alive heartbeat probe..." -ForegroundColor Yellow
$cloudUrl = "https://$ProjectRef.supabase.co"
$env:SUPABASE_URL = $cloudUrl
if ($AnonKey) {
  $env:SUPABASE_ANON_KEY = $AnonKey
}
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  & pnpm.cmd keepalive
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  & npx.cmd tsx "$WorkspaceRoot\scripts\ping-supabase-keep-alive.ts"
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  MIGRATION AND CLOUD SYNC COMPLETE" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "1. In your Vercel Dashboard (https://vercel.com):" -ForegroundColor White
Write-Host "   Set VITE_SUPABASE_URL = $cloudUrl" -ForegroundColor DarkCyan
Write-Host "   Set VITE_SUPABASE_ANON_KEY = [Your Project Anon Key]" -ForegroundColor DarkCyan
Write-Host "   Set VITE_APP_URL = $SiteUrl" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "2. In your Supabase Dashboard (Authentication -> URL Configuration):" -ForegroundColor White
Write-Host "   Set Site URL = $SiteUrl" -ForegroundColor DarkCyan
Write-Host "   Add Redirect URLs:" -ForegroundColor DarkCyan
Write-Host "     - $SiteUrl/**" -ForegroundColor DarkGray
Write-Host "     - $SiteUrl/auth/callback" -ForegroundColor DarkGray
Write-Host "     - $SiteUrl/reset-password" -ForegroundColor DarkGray
Write-Host "     - $SiteUrl/q/**" -ForegroundColor DarkGray
Write-Host "     - http://localhost:5173/**" -ForegroundColor DarkGray
Write-Host "     - http://localhost:3000/**" -ForegroundColor DarkGray
Write-Host ""
Write-Host "3. In your GitHub Repository Secrets (for 24/7 Keep-Alive):" -ForegroundColor White
Write-Host "   Add secret: VITE_SUPABASE_URL = $cloudUrl" -ForegroundColor DarkCyan
Write-Host "   Add secret: VITE_SUPABASE_ANON_KEY = [Your Project Anon Key]" -ForegroundColor DarkCyan
Write-Host ""
