
$ErrorActionPreference = "Stop"

# OTP pilot Supabase project
$ProjectRef = "qsuvtcezffomtwzwyrso"
$NgrokApi = "http://127.0.0.1:4040/api/tunnels"
$LocalWaha = "http://127.0.0.1:3008/"
$StateFile = "G:\My Drive\otp\.waha-last-synced-url"
$LogFile = "G:\My Drive\otp\waha-url-sync.log"

function Log($Message) {
    Add-Content -LiteralPath $LogFile -Encoding UTF8 `
        -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
}

try {
    # WAHA must be available before we change the remote URL.
    $null = Invoke-WebRequest $LocalWaha -UseBasicParsing -TimeoutSec 10

    # Discover the currently active ngrok tunnel.
    $api = Invoke-RestMethod $NgrokApi -TimeoutSec 10
    $matches = @($api.tunnels | Where-Object {
        $_.public_url -match '^https://' -and
        [string]$_.config.addr -match '3008'
    })

    if ($matches.Count -ne 1) {
        throw "Expected exactly one HTTPS tunnel to WAHA port 3008; found $($matches.Count)."
    }

    $url = ([string]$matches[0].public_url).TrimEnd('/')
    if ($url -notmatch '^https://[A-Za-z0-9.-]+(?::\d+)?$') {
        throw "Tunnel URL failed validation."
    }

    # Check that the public URL responds before updating Supabase.
    $null = Invoke-WebRequest "$url/" -UseBasicParsing `
        -TimeoutSec 15 -Headers @{ "ngrok-skip-browser-warning" = "true" }

    $previous = ""
    if (Test-Path $StateFile) {
        $previous = (Get-Content $StateFile -Raw).Trim()
    }

    if ($url -eq $previous) {
        Log "URL unchanged; no Supabase update required."
        exit 0
    }

    # Supabase CLI must be installed and authenticated for this Windows account.
    & supabase secrets set "WAHA_BASE_URL=$url" `
        --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase CLI failed with exit code $LASTEXITCODE."
    }

    # Record the URL only after the CLI reports success.
    Set-Content -LiteralPath $StateFile -Value $url -Encoding ASCII
    Log "SUCCESS: WAHA_BASE_URL synchronized to $url"
    exit 0
}
catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
