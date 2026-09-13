<#
.SYNOPSIS
  OTP Platform - Developer Pre-Commit / Check-In Quality Verification
.DESCRIPTION
  Runs fast, non-blocking pre-commit validation locally before git commit:
  1. Vocabulary scanner (zero prohibited words: bid, bidder, bidding, blind)
  2. Test coverage policy & coverage append rule audit
  3. Fast unit test battery across domain logic, GST validation, and parsing
#>

$ErrorActionPreference = "Stop"
$WorkspaceRoot = (Get-Item -Path "$PSScriptRoot\..").FullName
Set-Location $WorkspaceRoot

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "  OTP PLATFORM - LOCAL PRE-COMMIT VERIFICATION GATE" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Vocabulary Scan
Write-Host "`n[1/3] Scanning for canonical procurement vocabulary compliance..." -ForegroundColor Yellow
& pnpm.cmd test:vocab
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] Vocabulary policy violated. Commit rejected." -ForegroundColor Red
  exit 1
}

# 2. Coverage Policy
Write-Host "`n[2/3] Auditing test coverage expansion policy & coverage append rule..." -ForegroundColor Yellow
& pnpm.cmd test:policy --strict
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] Coverage policy violated. Commit rejected." -ForegroundColor Red
  exit 1
}

# 3. Fast Unit Tests
Write-Host "`n[3/3] Running fast unit test battery..." -ForegroundColor Yellow
& pnpm.cmd test:unit
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] Unit tests failed. Commit rejected." -ForegroundColor Red
  exit 1
}

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "  PRE-COMMIT GATE PASSED: Code is clean and ready for commit." -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
exit 0
