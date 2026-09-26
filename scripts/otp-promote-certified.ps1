<#
.SYNOPSIS
  OTP Platform - Certified Commit Promotion Script
.DESCRIPTION
  Safely promotes a verified and certified commit to origin/main following
  the completion of a bug-fix, test-pass, or release-hardening cycle.

  Strict Safety Guarantees:
  - Verifies current git HEAD (optionally matches expected -CertifiedSha)
  - Verifies current branch is 'main'
  - Verifies clean working tree (no uncommitted or untracked changes)
  - Verifies database migration ceiling (strictly locks ceiling <= 197)
  - Fetches origin/main without mutating local state
  - Shows side-by-side local and remote SHA, commit message, and commit count
  - Requires explicit interactive 'PROMOTE' confirmation before push
  - Pushes the certified commit cleanly
  - Verifies remote SHA matches expected SHA immediately after push
  - NEVER creates a git commit
  - NEVER deploys to Vercel or cloud hosting
  - NEVER mutates or connects to the production database
  - Stops immediately on any failure or unexpected condition

.EXAMPLE
  .\scripts\otp-promote-certified.ps1

.EXAMPLE
  .\scripts\otp-promote-certified.ps1 -CertifiedSha 7c6f9ad

.EXAMPLE
  .\scripts\otp-promote-certified.ps1 -DryRun
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false, Position = 0, HelpMessage = "Optional certified commit SHA (full or 7+ char short SHA). If omitted, defaults to current HEAD.")]
  [string]$CertifiedSha = "",

  [Parameter(Mandatory = $false, HelpMessage = "Maximum allowed migration number. Strictly enforced against supabase/migrations/.")]
  [int]$MigrationCeiling = 197,

  [Parameter(Mandatory = $false, HelpMessage = "Git remote name. Defaults to 'origin'.")]
  [string]$Remote = "origin",

  [Parameter(Mandatory = $false, HelpMessage = "Target production branch. Defaults to 'main'.")]
  [string]$Branch = "main",

  [Parameter(Mandatory = $false, HelpMessage = "Run all pre-flight checks and fetch without executing git push.")]
  [switch]$DryRun,

  [Parameter(Mandatory = $false, HelpMessage = "Allow dirty working tree (use with extreme caution).")]
  [switch]$AllowDirty,

  [Parameter(Mandatory = $false, HelpMessage = "Bypass interactive 'PROMOTE' prompt (for automated verification pipelines).")]
  [switch]$Force
)

$ErrorActionPreference = "Stop"

# Ensure working directory is the authoritative repository root
$WorkspaceRoot = (Get-Item -Path "$PSScriptRoot\..").FullName
Set-Location $WorkspaceRoot

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OTP PLATFORM -- CERTIFIED COMMIT PROMOTION GATE" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Authoritative Root : $WorkspaceRoot" -ForegroundColor DarkGray
Write-Host "Target Remote/Branch: $Remote/$Branch" -ForegroundColor DarkGray
Write-Host "Migration Ceiling  : $MigrationCeiling" -ForegroundColor DarkGray
if ($DryRun) {
  Write-Host "Mode               : DRY-RUN (No push will be executed)" -ForegroundColor Yellow
}
Write-Host "-----------------------------------------------------------------" -ForegroundColor DarkGray

# -------------------------------------------------------------------------
# Step 1: Verify Git Availability
# -------------------------------------------------------------------------
try {
  $gitVersion = (git --version).Trim()
  Write-Host "[1/9] Git Client Check         : OK ($gitVersion)" -ForegroundColor Green
} catch {
  Write-Error "FATAL: git executable is not available in PATH."
  exit 1
}

# -------------------------------------------------------------------------
# Step 2: Verify Active Branch is 'main'
# -------------------------------------------------------------------------
$currentBranch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
  Write-Error "FATAL: Repository is in a detached HEAD state. Must be on branch '$Branch'."
  exit 1
}

if ($currentBranch -ne $Branch) {
  Write-Error "FATAL: Current branch is '$currentBranch', but promotion requires branch '$Branch'."
  exit 1
}
Write-Host "[2/9] Active Branch Check       : OK (branch: $currentBranch)" -ForegroundColor Green

# -------------------------------------------------------------------------
# Step 3: Verify Clean Working Tree
# -------------------------------------------------------------------------
$statusOutput = @(git status --porcelain)
if ($statusOutput -and $statusOutput.Count -gt 0) {
  if (-not $AllowDirty) {
    Write-Host ""
    Write-Host "[FAIL] Working tree has uncommitted or untracked changes:" -ForegroundColor Red
    foreach ($line in $statusOutput) {
      Write-Host "       $line" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "To ensure reproducibility and zero accidental contamination," -ForegroundColor Red
    Write-Host "commit, stash, or clean working changes before promoting." -ForegroundColor Red
    Write-Host "(Use -AllowDirty only if explicitly authorized for local diagnostics.)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Error "FATAL: Working tree is dirty. Promotion aborted."
    exit 1
  } else {
    Write-Host "[3/9] Working Tree Check        : WARNING (-AllowDirty flag present)" -ForegroundColor Yellow
  }
} else {
  Write-Host "[3/9] Working Tree Check        : OK (pristine clean)" -ForegroundColor Green
}

# -------------------------------------------------------------------------
# Step 4: Verify Migration Ceiling & File Integrity
# -------------------------------------------------------------------------
$migrationsDir = Join-Path $WorkspaceRoot "supabase\migrations"
if (-not (Test-Path $migrationsDir)) {
  Write-Error "FATAL: supabase/migrations directory not found at $migrationsDir."
  exit 1
}

$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Select-Object -ExpandProperty Name
$highestMigration = 0
$highestFile = ""

foreach ($file in $migrationFiles) {
  if ($file -match '^(\d{5})_') {
    $num = [int]$matches[1]
    if ($num -gt $highestMigration) {
      $highestMigration = $num
      $highestFile = $file
    }
  }
}

if ($highestMigration -gt $MigrationCeiling) {
  Write-Error "FATAL: Migration ceiling violation! Highest migration found is $highestMigration ($highestFile), which exceeds the strictly locked ceiling of $MigrationCeiling."
  exit 1
}

$formattedMigration = "{0:D5}" -f $highestMigration
Write-Host "[4/9] Migration Ceiling Check   : OK (highest: $formattedMigration, ceiling: $MigrationCeiling)" -ForegroundColor Green

# -------------------------------------------------------------------------
# Step 5: Verify Local HEAD & Match Against Expected SHA
# -------------------------------------------------------------------------
$localHeadFull = (git rev-parse HEAD).Trim()
$localHeadShort = (git rev-parse --short HEAD).Trim()
$localCommitMsg = (git log -1 --pretty=format:"%s").Trim()
$localCommitAuthor = (git log -1 --pretty=format:"%an (%ae)").Trim()
$localCommitDate = (git log -1 --pretty=format:"%cd" --date=iso).Trim()

if (-not [string]::IsNullOrWhiteSpace($CertifiedSha)) {
  $shaMatches = $localHeadFull.StartsWith($CertifiedSha, [System.StringComparison]::OrdinalIgnoreCase) -or
                $CertifiedSha.StartsWith($localHeadShort, [System.StringComparison]::OrdinalIgnoreCase)

  if (-not $shaMatches) {
    Write-Error "FATAL: Local HEAD ($localHeadShort - $localHeadFull) does not match requested -CertifiedSha ($CertifiedSha)."
    exit 1
  }
  Write-Host "[5/9] Certified SHA Match Check : OK (matches requested: $CertifiedSha)" -ForegroundColor Green
} else {
  Write-Host "[5/9] Certified SHA Match Check : OK (using current certified HEAD: $localHeadShort)" -ForegroundColor Green
}

# -------------------------------------------------------------------------
# Step 6: Fetch Remote State & Inspect Divergence
# -------------------------------------------------------------------------
Write-Host "[6/9] Fetching $Remote/$Branch..." -ForegroundColor DarkCyan
try {
  git fetch $Remote $Branch --quiet
} catch {
  Write-Error "FATAL: Failed to fetch from $Remote/$Branch. Verify network connection and git remote permissions."
  exit 1
}

$remoteHeadFull = (git rev-parse "$Remote/$Branch").Trim()
$remoteHeadShort = (git rev-parse --short "$Remote/$Branch").Trim()
$remoteCommitMsg = (git log -1 --pretty=format:"%s" "$Remote/$Branch").Trim()
$remoteCommitDate = (git log -1 --pretty=format:"%cd" --date=iso "$Remote/$Branch").Trim()

# Divergence check: [ahead, behind]
$revCount = (git rev-list --left-right --count "HEAD...$Remote/$Branch").Trim()
$counts = $revCount -split '\s+'
$localAhead = [int]$counts[0]
$remoteAhead = [int]$counts[1]

Write-Host "-----------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "PROMOTION SUMMARY" -ForegroundColor Cyan
Write-Host "  Local HEAD SHA   : $localHeadShort ($localHeadFull)" -ForegroundColor White
Write-Host "  Local Message    : $localCommitMsg" -ForegroundColor DarkGray
Write-Host "  Local Date       : $localCommitDate" -ForegroundColor DarkGray
Write-Host "  Local Author     : $localCommitAuthor" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Remote HEAD SHA  : $remoteHeadShort ($remoteHeadFull)" -ForegroundColor White
Write-Host "  Remote Message   : $remoteCommitMsg" -ForegroundColor DarkGray
Write-Host "  Remote Date      : $remoteCommitDate" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Local Ahead By   : $localAhead commit(s)" -ForegroundColor $(if ($localAhead -gt 0) { "Green" } else { "DarkGray" })
Write-Host "  Remote Ahead By  : $remoteAhead commit(s)" -ForegroundColor $(if ($remoteAhead -gt 0) { "Red" } else { "DarkGray" })
Write-Host "-----------------------------------------------------------------" -ForegroundColor DarkGray

if ($remoteAhead -gt 0) {
  Write-Host ""
  Write-Host "[FATAL] Remote $Remote/$Branch is ahead of local HEAD by $remoteAhead commit(s)!" -ForegroundColor Red
  Write-Host "A non-fast-forward push would be rejected or overwrite remote changes." -ForegroundColor Red
  Write-Host "Please pull or rebase the remote changes and re-certify locally." -ForegroundColor Red
  exit 1
}

if ($localAhead -eq 0 -and $localHeadFull -eq $remoteHeadFull) {
  Write-Host ""
  Write-Host "[INFO] Local HEAD and remote $Remote/$Branch are already at identical SHA ($localHeadShort)." -ForegroundColor Green
  Write-Host "Nothing to promote. Origin is completely up to date." -ForegroundColor Green
  exit 0
}

Write-Host "[7/9] Divergence Evaluation     : OK (Ready to fast-forward $localAhead commit(s))" -ForegroundColor Green

# -------------------------------------------------------------------------
# Step 7: Explicit Interactive PROMOTE Confirmation
# -------------------------------------------------------------------------
if ($DryRun) {
  Write-Host ""
  Write-Host "[DRY-RUN] Pre-flight checks passed successfully." -ForegroundColor Yellow
  Write-Host "[DRY-RUN] Command that would execute: git push $Remote $Branch" -ForegroundColor Yellow
  Write-Host "[DRY-RUN] No push was executed." -ForegroundColor Yellow
  exit 0
}

if (-not $Force) {
  Write-Host ""
  Write-Host "PROCEED WITH PUSH TO PRODUCTION REPOSITORY?" -ForegroundColor Yellow
  Write-Host "This will push commit $localHeadShort ($localHeadFull) to $Remote/$Branch." -ForegroundColor Yellow
  Write-Host "Type 'PROMOTE' (all uppercase) to confirm: " -ForegroundColor Yellow -NoNewline

  $confirmation = (Read-Host).Trim()
  if ($confirmation -cne "PROMOTE") {
    Write-Host ""
    Write-Host "[ABORTED] Promotion cancelled by operator. Input did not match 'PROMOTE'." -ForegroundColor Red
    Write-Host "No changes were pushed to $Remote/$Branch." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
  }
}

# -------------------------------------------------------------------------
# Step 8: Push Certified Commit
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "[8/9] Pushing certified commit $localHeadShort to $Remote/$Branch..." -ForegroundColor Cyan

try {
  git push $Remote $Branch
  if ($LASTEXITCODE -ne 0) {
    throw "git push returned exit code $LASTEXITCODE"
  }
  Write-Host "[8/9] Push Command              : SUCCESS" -ForegroundColor Green
} catch {
  Write-Error "FATAL: Push failed with error: $_"
  exit 1
}

# -------------------------------------------------------------------------
# Step 9: Post-Push Remote SHA Verification
# -------------------------------------------------------------------------
Write-Host "[9/9] Verifying remote SHA post-push..." -ForegroundColor DarkCyan

$postPushRemoteOutput = (git ls-remote $Remote "refs/heads/$Branch").Trim()
$postPushSha = ($postPushRemoteOutput -split '\s+')[0].Trim()

if ($postPushSha -ne $localHeadFull) {
  Write-Error "FATAL: Remote SHA verification failed! Remote is at '$postPushSha', expected '$localHeadFull'."
  exit 1
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  PROMOTION COMPLETED AND VERIFIED SUCCESSFULLY" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "Promoted SHA       : $localHeadShort ($localHeadFull)" -ForegroundColor White
Write-Host "Remote Destination : $Remote/$Branch" -ForegroundColor White
Write-Host "Verification Hash  : $postPushSha" -ForegroundColor Green
Write-Host "Timestamp          : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')" -ForegroundColor DarkGray
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
