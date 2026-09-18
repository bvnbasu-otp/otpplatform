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

function Get-NodeExecutable {
  $candidates = @(
    (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe",
    "$env:LOCALAPPDATA\Programs\node\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe",
    "$env:APPDATA\npm\node.exe",
    "$env:APPDATA\nvm\current\node.exe",
    "$env:USERPROFILE\scoop\shims\node.exe",
    "$env:USERPROFILE\.volta\bin\node.exe",
    "$env:ProgramData\chocolatey\bin\node.exe"
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }
  return $null
}

function Invoke-Task {
  param([string]$TaskName, [string[]]$TaskArgs = @())
  $node = Get-NodeExecutable
  $TsxEntry = "node_modules/tsx/dist/cli.mjs"
  $VitestEntry = "node_modules/vitest/vitest.mjs"

  if ($node -and (Test-Path $TsxEntry) -and (Test-Path $VitestEntry)) {
    if ($TaskName -eq "test:vocab") {
      & $node $TsxEntry scripts/verify-vocabulary.ts @TaskArgs
    } elseif ($TaskName -eq "test:policy") {
      & $node $TsxEntry scripts/verify-test-coverage-policy.ts @TaskArgs
    } elseif ($TaskName -eq "test:unit") {
      & $node $VitestEntry run --config packages/domain/vitest.config.ts @TaskArgs
    } else {
      throw "Unknown task: $TaskName"
    }
  } elseif (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) {
    & pnpm.cmd $TaskName @TaskArgs
  } elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm $TaskName @TaskArgs
  } elseif (Get-Command npx.cmd -ErrorAction SilentlyContinue) {
    & npx.cmd pnpm $TaskName @TaskArgs
  } elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    & npx pnpm $TaskName @TaskArgs
  } else {
    throw "Node.js executable could not be resolved. Please ensure Node.js is installed."
  }
}

# 1. Vocabulary Scan
Write-Host "`n[1/3] Scanning for canonical procurement vocabulary compliance..." -ForegroundColor Yellow
Invoke-Task "test:vocab"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] Vocabulary policy violated. Commit rejected." -ForegroundColor Red
  exit 1
}

# 2. Coverage Policy
Write-Host "`n[2/3] Auditing test coverage expansion policy & coverage append rule..." -ForegroundColor Yellow
Invoke-Task "test:policy" @("--strict")
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] Coverage policy violated. Commit rejected." -ForegroundColor Red
  exit 1
}

# 3. Fast Unit Tests
Write-Host "`n[3/3] Running fast unit test battery..." -ForegroundColor Yellow
Invoke-Task "test:unit"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] Unit tests failed. Commit rejected." -ForegroundColor Red
  exit 1
}

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host "  PRE-COMMIT GATE PASSED: Code is clean and ready for commit." -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
exit 0
