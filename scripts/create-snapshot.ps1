<#
.SYNOPSIS
  OTP Platform — Stable Codebase Snapshot & Checkpoint Creator
.DESCRIPTION
  Creates an atomic, compressed backup of the working codebase state into backups/snapshots.
  Use this to snapshot working baselines before any refactor or new feature development.
#>

[CmdletBinding()]
param (
  [string]$Label = "stable_baseline"
)

$WorkspaceRoot = "G:\My Drive\otp"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$SnapshotDir = "$WorkspaceRoot\backups\snapshots"

if (-not (Test-Path $SnapshotDir)) {
  New-Item -ItemType Directory -Path $SnapshotDir -Force | Out-Null
}

$ZipFile = "$SnapshotDir\otp_${Label}_${Timestamp}.zip"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  CREATING CODEBASE SNAPSHOT CHECKPOINT" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Target Archive: $ZipFile" -ForegroundColor DarkGray

# Verify smoke test before creating snapshot
Write-Host "Verifying live platform health with smoke test..." -ForegroundColor Yellow
& pnpm.cmd --prefix "$WorkspaceRoot" test:smoke

if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Smoke tests failed! Refusing to create stable snapshot of a broken state." -ForegroundColor Red
  exit 1
}

Write-Host "Smoke tests PASSED. Archiving source code and configurations..." -ForegroundColor Green

# Exclude node_modules, dist, .git, and existing zip backups
$excludes = @("node_modules", "dist", ".git", "backups")

$filesToZip = Get-ChildItem -Path $WorkspaceRoot -Exclude $excludes | Where-Object {
  $_.Name -ne "node_modules" -and $_.Name -ne "dist" -and $_.Name -ne "backups"
}

Compress-Archive -Path $filesToZip.FullName -DestinationPath $ZipFile -CompressionLevel Optimal

Write-Host "[OK] Verified codebase snapshot saved to: $ZipFile" -ForegroundColor Green
Write-Host ""
