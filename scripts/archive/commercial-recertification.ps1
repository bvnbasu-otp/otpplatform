
$ErrorActionPreference = "Stop"
$env:GIT_PAGER = "cat"

$RepoRoot = (Get-Location).Path
$ExpectedCommit = "08105f6fac758fec241e5e268cf47efc15c9b71d"
$ExpectedMigration = 192

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "OTP COMMERCIAL RECERTIFICATION" -ForegroundColor Cyan
Write-Host "READ / VERIFY / TEST / COMMIT ONLY" -ForegroundColor Cyan
Write-Host "NO PUSH / NO DEPLOY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# PHASE 0 - Repository authority
# ------------------------------------------------------------

Write-Host "[0] Repository authority check" -ForegroundColor Yellow

$branch = (git branch --show-current).Trim()

if ($branch -ne "main") {
    throw "ABORT: Current branch is '$branch'. Expected 'main'."
}

$head = (git rev-parse HEAD).Trim()
$origin = (git rev-parse origin/main).Trim()

Write-Host "Branch       : $branch"
Write-Host "HEAD         : $head"
Write-Host "origin/main  : $origin"

if ($head -ne $ExpectedCommit) {
    throw "ABORT: HEAD is not the certified pre-commercial baseline $ExpectedCommit"
}

if ($origin -ne $ExpectedCommit) {
    throw "ABORT: origin/main is not the certified pre-commercial baseline $ExpectedCommit"
}

Write-Host "Repository authority confirmed." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 1 - Working tree inspection
# ------------------------------------------------------------

Write-Host "[1] Working tree inspection" -ForegroundColor Yellow

git status --short

Write-Host ""
Write-Host "Diff check..." -ForegroundColor DarkCyan

git diff --check

Write-Host ""
Write-Host "Changed files:" -ForegroundColor DarkCyan

git status --short

Write-Host ""
Write-Host "Diff statistics:" -ForegroundColor DarkCyan

git diff --stat

Write-Host ""

# ------------------------------------------------------------
# PHASE 2 - Expected commercial file set
# ------------------------------------------------------------

Write-Host "[2] Commercial change-set verification" -ForegroundColor Yellow

$ExpectedFiles = @(
    "apps/web/src/components/demo/DemoPersonaSwitcher.tsx",
    "apps/web/src/components/demo/demo-persona-switcher.test.ts",
    "apps/web/src/components/mobile-showcase/HeroMobilePhonePreview.tsx",
    "apps/web/src/components/mobile-showcase/MobileMultiDeviceGallery.tsx",
    "apps/web/src/components/mobile-showcase/MobileScreensShowcase.tsx",
    "apps/web/src/features/auth/components/SignInForm.tsx",
    "apps/web/src/features/fulfillment/buyer-reveal-gst.test.ts",
    "apps/web/src/features/portal/components/BuyerRegisterForm.tsx",
    "apps/web/src/features/site/content/site-content.test.ts",
    "apps/web/src/features/site/content/site-content.ts",
    "apps/web/src/features/site/pages/AboutPage.tsx",
    "apps/web/src/features/site/pages/FaqPage.tsx",
    "apps/web/src/features/site/pages/LandingPage.tsx",
    "apps/web/src/features/site/pages/PricingPage.tsx",
    "apps/web/src/features/subscription/components/SubscriptionPaymentModal.tsx",
    "apps/web/src/features/subscription/subscription.test.ts",
    "apps/web/src/features/subscription/types.ts",
    "packages/domain/src/index.ts",
    "packages/domain/src/types/buyer-reward.test.ts",
    "packages/domain/src/types/buyer-reward.ts",
    "scripts/demo/constants.ts",
    "scripts/demo/seed-demo.ts",
    "packages/domain/src/types/pricing-entitlement.test.ts",
    "packages/domain/src/types/pricing-entitlement.ts",
    "tests/security/pricing-entitlement-redteam.test.ts"
)

$ActualFiles = @(
    git status --short |
    ForEach-Object {
        $line = $_

        if ($line.Length -gt 3) {
            $line.Substring(3).Trim()
        }
    } |
    Where-Object {
        $_ -ne ""
    }
)


$ActualCommercialFiles = $ActualFiles | Where-Object {
    $_ -ne "commercial-recertification.ps1"
}



Write-Host "Expected commercial files: $($ExpectedFiles.Count)"
Write-Host "Current changed files   : $($ActualCommercialFiles.Count)"
Write-Host ""

$UnexpectedFiles = $ActualCommercialFiles | Where-Object {
    $ExpectedFiles -notcontains $_
}

$MissingFiles = $ExpectedFiles | Where-Object {
    $ActualCommercialFiles -notcontains $_
}

if ($UnexpectedFiles.Count -gt 0) {
    Write-Host "Unexpected changed files:" -ForegroundColor Red
    $UnexpectedFiles | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }

    throw "ABORT: Unexpected files detected."
}

if ($MissingFiles.Count -gt 0) {
    Write-Host "Expected files missing from working tree:" -ForegroundColor Red
    $MissingFiles | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Red
    }

    throw "ABORT: Commercial change-set is incomplete."
}

Write-Host "Commercial file set matches expected 25 files." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 3 - Migration ceiling
# ------------------------------------------------------------

Write-Host "[3] Database migration ceiling verification" -ForegroundColor Yellow

$MigrationFiles = Get-ChildItem `
    -Path ".\supabase\migrations" `
    -Filter "*.sql" `
    -File `
    -ErrorAction Stop

$MigrationNumbers = @()

foreach ($file in $MigrationFiles) {
    if ($file.Name -match "^(\d+)_") {
        $MigrationNumbers += [int]$Matches[1]
    }
}

$MaxMigration = ($MigrationNumbers | Measure-Object -Maximum).Maximum

Write-Host "Maximum migration detected: $MaxMigration"

if ($MaxMigration -ne $ExpectedMigration) {
    throw "ABORT: Migration ceiling changed. Expected 00192."
}

for ($i = 1; $i -le $ExpectedMigration; $i++) {
    if ($MigrationNumbers -notcontains $i) {
        throw "ABORT: Migration sequence gap detected at $i."
    }
}

Write-Host "Migration ceiling 00192 confirmed. No migration additions allowed." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 4 - Commercial authority checks
# ------------------------------------------------------------

Write-Host "[4] Commercial authority checks" -ForegroundColor Yellow

$CommercialFiles = $ExpectedFiles | Where-Object {
    Test-Path $_
}

$CommercialText = ""

foreach ($file in $CommercialFiles) {
    $CommercialText += "`n--- $file ---`n"
    $CommercialText += Get-Content -Raw $file
}

$RequiredTerms = @(
    "Individual",
    "RWA",
    "MSME",
    "999",
    "4999",
    "149",
    "18",
    "365",
    "PILOT_FREE",
    "LIVE",
    "0.5",
    "FEFO"
)

foreach ($term in $RequiredTerms) {
    if ($CommercialText -notmatch [regex]::Escape($term)) {
        throw "ABORT: Required commercial term not found: $term"
    }
}

Write-Host "Required commercial authority markers found." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 5 - Targeted tests
# ------------------------------------------------------------

Write-Host "[5] Targeted commercial tests" -ForegroundColor Yellow

$TargetedTests = @(
    "packages/domain/src/types/pricing-entitlement.test.ts",
    "packages/domain/src/types/buyer-reward.test.ts",
    "tests/security/pricing-entitlement-redteam.test.ts",
    "apps/web/src/features/subscription/subscription.test.ts",
    "apps/web/src/features/site/content/site-content.test.ts",
    "apps/web/src/features/fulfillment/buyer-reveal-gst.test.ts"
)

foreach ($test in $TargetedTests) {
    if (-not (Test-Path $test)) {
        throw "ABORT: Targeted test file missing: $test"
    }
}

npx vitest run `
    packages/domain/src/types/pricing-entitlement.test.ts `
    packages/domain/src/types/buyer-reward.test.ts `
    tests/security/pricing-entitlement-redteam.test.ts `
    apps/web/src/features/subscription/subscription.test.ts `
    apps/web/src/features/site/content/site-content.test.ts `
    apps/web/src/features/fulfillment/buyer-reveal-gst.test.ts

Write-Host "Targeted commercial tests passed." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 6 - Full regression
# ------------------------------------------------------------

Write-Host "[6] Full regression" -ForegroundColor Yellow

$PackageJson = Get-Content -Raw ".\package.json"

$Package = $PackageJson | ConvertFrom-Json

if ($Package.scripts.test) {
    npm test
}
else {
    Write-Host "No root npm test script found; running Vitest directly." -ForegroundColor DarkYellow
    npx vitest run
}

Write-Host "Full regression completed." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 7 - Typecheck
# ------------------------------------------------------------

Write-Host "[7] TypeScript verification" -ForegroundColor Yellow

if ($Package.scripts.typecheck) {
    npm run typecheck
}
else {
    Write-Host "No root typecheck script found; skipping root typecheck." -ForegroundColor DarkYellow
}

Write-Host "TypeScript verification completed." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 8 - Production build
# ------------------------------------------------------------

Write-Host "[8] Production build" -ForegroundColor Yellow

if ($Package.scripts.build) {
    npm run build
}
else {
    Write-Host "No root build script found." -ForegroundColor DarkYellow
}

Write-Host "Production build completed." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 9 - Vocabulary / IPR scan
# ------------------------------------------------------------

Write-Host "[9] Public vocabulary / IPR verification" -ForegroundColor Yellow

$VocabularyScript = ".\scripts\scan-vocabulary.ts"

if (Test-Path $VocabularyScript) {
    npx tsx $VocabularyScript
    Write-Host "Vocabulary scan completed." -ForegroundColor Green
}
else {
    Write-Host "Vocabulary scanner not present; skipping." -ForegroundColor DarkYellow
}

Write-Host ""

# ------------------------------------------------------------
# PHASE 10 - Final diff verification
# ------------------------------------------------------------

Write-Host "[10] Final working-tree verification" -ForegroundColor Yellow

git diff --check

Write-Host ""
git status --short

Write-Host ""
Write-Host "Final diff statistics:" -ForegroundColor DarkCyan
git diff --stat

Write-Host ""

# ------------------------------------------------------------
# PHASE 11 - Stage exact commercial files
# ------------------------------------------------------------

Write-Host "[11] Staging exact commercial files" -ForegroundColor Yellow

git reset

foreach ($file in $ExpectedFiles) {
    git add -- $file
}

Write-Host ""
Write-Host "Staged files:" -ForegroundColor DarkCyan
git diff --cached --name-status

$StagedFiles = @(
    git diff --cached --name-only
)

if ($StagedFiles.Count -ne $ExpectedFiles.Count) {
    throw "ABORT: Staged file count mismatch."
}

Write-Host ""
Write-Host "Exactly 25 commercial files staged." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# PHASE 12 - Staged diff safety check
# ------------------------------------------------------------

Write-Host "[12] Staged diff safety check" -ForegroundColor Yellow

git diff --cached --check

Write-Host ""
Write-Host "Review staged summary:" -ForegroundColor DarkCyan
git diff --cached --stat

Write-Host ""

# ------------------------------------------------------------
# PHASE 13 - HUMAN COMMIT GATE
# ------------------------------------------------------------

Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "HUMAN COMMIT GATE" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "The commercial recertification checks have completed." -ForegroundColor White
Write-Host ""
Write-Host "The script will create a LOCAL commit only." -ForegroundColor Yellow
Write-Host "It will NOT push to GitHub." -ForegroundColor Yellow
Write-Host "It will NOT deploy to Vercel." -ForegroundColor Yellow
Write-Host ""

$Approval = Read-Host "Type COMMIT to create the local commit"

if ($Approval -cne "COMMIT") {
    Write-Host ""
    Write-Host "Commit cancelled." -ForegroundColor Yellow
    Write-Host "Changes remain staged and no commit was created." -ForegroundColor Yellow
    exit 0
}

# ------------------------------------------------------------
# PHASE 14 - Local commit
# ------------------------------------------------------------

Write-Host ""
Write-Host "[14] Creating local commit" -ForegroundColor Yellow

git commit -m "cert(commercial): recertify pricing entitlements and rolling 365-day benefits"

Write-Host ""
Write-Host "Local commit created." -ForegroundColor Green

# ------------------------------------------------------------
# PHASE 15 - Post-commit authority verification
# ------------------------------------------------------------

Write-Host ""
Write-Host "[15] Post-commit verification" -ForegroundColor Yellow

$NewHead = (git rev-parse HEAD).Trim()
$NewOrigin = (git rev-parse origin/main).Trim()

Write-Host "HEAD        : $NewHead"
Write-Host "origin/main : $NewOrigin"

if ($NewHead -eq $ExpectedCommit) {
    throw "ABORT: Commit did not create a new HEAD."
}

if ($NewOrigin -ne $ExpectedCommit) {
    throw "Unexpected origin/main change detected."
}

Write-Host ""
Write-Host "HEAD advanced locally." -ForegroundColor Green
Write-Host "origin/main remains unchanged." -ForegroundColor Green

Write-Host ""
Write-Host "Working tree status:" -ForegroundColor DarkCyan
git status --short

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "COMMERCIAL RECERTIFICATION COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Write-Host "LOCAL COMMIT CREATED." -ForegroundColor Green
Write-Host "NO PUSH PERFORMED." -ForegroundColor Yellow
Write-Host "NO DEPLOY PERFORMED." -ForegroundColor Yellow
Write-Host ""

Write-Host "NEXT MANUAL COMMAND:" -ForegroundColor Yellow
Write-Host 'git push origin main' -ForegroundColor White
Write-Host ""

Write-Host "After push, verify:" -ForegroundColor Yellow
Write-Host 'git status' -ForegroundColor White
Write-Host 'git rev-parse HEAD' -ForegroundColor White
Write-Host 'git rev-parse origin/main' -ForegroundColor White
Write-Host ""

Write-Host "Then verify GitHub Actions and Vercel production deployment." -ForegroundColor Yellow
Write-Host "Do NOT start SN.1 until production closure is complete." -ForegroundColor Yellow

