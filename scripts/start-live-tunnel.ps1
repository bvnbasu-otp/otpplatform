<#
.SYNOPSIS
  OTP Platform — Cloudflare Live Tunnel Watchdog
.DESCRIPTION
  Monitors and maintains the public HTTPS Cloudflare tunnel for OTP Platform.
  Automatically reconnects if the connection drops.
#>

param (
  [int]$LocalPort = 3000
)

$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { $cloudflared = $cmd.Source }
}

if (-not (Test-Path $cloudflared)) {
  Write-Host "[ERROR] cloudflared.exe not found on system!" -ForegroundColor Red
  exit 1
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OTP Platform — Cloudflare Tunnel Watchdog" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Target Local Service : http://localhost:$LocalPort" -ForegroundColor White
Write-Host "Executable           : $cloudflared" -ForegroundColor DarkGray
Write-Host "Starting tunnel with auto-restart..." -ForegroundColor Yellow

while ($true) {
  try {
    & $cloudflared tunnel --url "http://localhost:$LocalPort"
  } catch {
    Write-Host "[WARN] Tunnel connection closed. Reconnecting in 5 seconds..." -ForegroundColor Yellow
  }
  Start-Sleep -Seconds 5
}
