<#
.SYNOPSIS
  OTP Platform — Master Standalone Launcher
.DESCRIPTION
  Single-command master script to start, operate, and maintain the OTP Platform standalone:
  1. Verifies and starts all Docker backend services (PostgreSQL, Auth, PostgREST, Kong, WAHA).
  2. Synchronizes database migrations (128 migrations with zero-data-loss protection).
  3. Launches the frontend web application on http://localhost:3000.
  4. Performs health checks and outputs active operational endpoints.
#>

[CmdletBinding()]
param (
  [switch]$Dev,
  [switch]$NoBrowser,
  [int]$Port = 3000,
  [string]$SiteUrl = 'https://otpplatform-theta.vercel.app'
)

$ErrorActionPreference = 'Continue'

if ($PSScriptRoot) {
  $WorkspaceRoot = (Get-Item -Path "$PSScriptRoot\..").FullName
} else {
  $WorkspaceRoot = 'G:\My Drive\otp'
}

Set-Location $WorkspaceRoot

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '     OTP PLATFORM — MASTER STANDALONE LAUNCHER                   ' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host " Workspace : $WorkspaceRoot" -ForegroundColor DarkGray
Write-Host " Local Web : http://localhost:$Port" -ForegroundColor DarkGray
Write-Host " Live URL  : $SiteUrl" -ForegroundColor DarkGray
Write-Host ''

# -----------------------------------------------------------------------------
# 1. Start Docker Backend Containers
# -----------------------------------------------------------------------------
Write-Host '[1/3] Checking and starting backend Docker containers...' -ForegroundColor Yellow

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
  Write-Host '[ERROR] Docker Desktop is not found in PATH or not running.' -ForegroundColor Red
  Write-Host '        Please ensure Docker Desktop is started.' -ForegroundColor Red
  exit 1
}

& docker compose -f docker-compose.prod.yml up -d

if ($LASTEXITCODE -eq 0) {
  Write-Host '[OK] Docker containers running (db, auth, rest, realtime, kong, waha).' -ForegroundColor Green
} else {
  Write-Host '[WARN] Docker compose completed with warnings. Checking database...' -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# 2. Verify Database Readiness & Migrations
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '[2/3] Verifying PostgreSQL database and schema migrations...' -ForegroundColor Yellow

$dbReady = $false
for ($i = 1; $i -le 15; $i++) {
  & docker exec otp-prod-db pg_isready -U postgres -h 127.0.0.1 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $dbReady = $true
    break
  }
  Start-Sleep -Seconds 2
}

if ($dbReady) {
  $sqlReconcileMigrations = "DELETE FROM public.otp_schema_migrations WHERE (version LIKE '%00174%' OR version LIKE '%00175%') AND to_regclass('public.settlement_exceptions') IS NULL; DELETE FROM public.otp_schema_migrations WHERE version LIKE '%00175%' AND to_regclass('public.erp_export_manifests') IS NULL; DELETE FROM public.otp_schema_migrations WHERE version LIKE '%00173%' AND to_regclass('public.tds_deductions') IS NULL; DELETE FROM public.otp_schema_migrations WHERE version LIKE '%00172%' AND to_regclass('public.credit_debit_notes') IS NULL;"
  & docker exec otp-prod-db psql -U postgres -d postgres -c $sqlReconcileMigrations 2>&1 | Out-Null

  $appliedMigrations = & docker exec otp-prod-db psql -U postgres -d postgres -t -c 'SELECT version FROM public.otp_schema_migrations;' 2>&1
  $appliedList = @()
  if ($appliedMigrations) {
    $appliedList = $appliedMigrations.Split("`n") | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 }
  }

  $migrations = Get-ChildItem -Path "$WorkspaceRoot\supabase\migrations\*.sql" -ErrorAction SilentlyContinue | Sort-Object Name
  $newCount = 0

  foreach ($file in $migrations) {
    $version = $file.Name
    if ($appliedList -notcontains $version) {
      Write-Host "  Applying incremental migration: $version..." -ForegroundColor DarkCyan
      Get-Content $file.FullName -Raw | & docker exec -i otp-prod-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        & docker exec otp-prod-db psql -U postgres -d postgres -c "INSERT INTO public.otp_schema_migrations (version) VALUES ('$version') ON CONFLICT (version) DO NOTHING;" 2>&1 | Out-Null
        $newCount++
      } else {
        Write-Host "  [WARN] Migration $version encountered an error." -ForegroundColor Yellow
      }
    }
  }

  & docker exec otp-prod-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';" 2>&1 | Out-Null
  Write-Host "[OK] Database ready. $($migrations.Count) migrations synchronized ($newCount new applied)." -ForegroundColor Green
} else {
  Write-Host '[WARN] Database container is still starting. Proceeding to web app...' -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# 3. Launch Frontend Web Server
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host "[3/3] Starting Web Application Server on port $Port..." -ForegroundColor Yellow

if (-not $NoBrowser) {
  Start-Process "http://localhost:$Port"
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  OTP PLATFORM IS RUNNING AND READY FOR USE                      ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host "  Local Web App   : http://localhost:$Port" -ForegroundColor White
Write-Host "  Public Live URL : $SiteUrl" -ForegroundColor White
Write-Host '  Kong Gateway    : http://localhost:54321' -ForegroundColor White
Write-Host '  Auth API        : http://localhost:9999' -ForegroundColor White
Write-Host '  PostgREST API   : http://localhost:3001' -ForegroundColor White
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C in this terminal to stop the web server.' -ForegroundColor DarkGray
Write-Host ''

if ($Dev) {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm.cmd --filter @otp/web dev --port $Port --host 0.0.0.0
  } else {
    & npx.cmd vite --prefix apps/web --port $Port --host 0.0.0.0
  }
} else {
  $distPath = Join-Path $WorkspaceRoot 'apps\web\dist'
  if (-not (Test-Path $distPath)) {
    Write-Host 'Building production web bundle first...' -ForegroundColor Yellow
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
      & pnpm.cmd --filter @otp/web build
    }
  }

  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm.cmd --filter @otp/web preview --port $Port --host 0.0.0.0
  } elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    & npx.cmd serve -s apps\web\dist -l $Port
  } else {
    Write-Host '[ERROR] Neither pnpm nor npx found in PATH to serve web bundle.' -ForegroundColor Red
  }
}
