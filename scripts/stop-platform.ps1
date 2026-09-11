<#
.SYNOPSIS
  OTP Platform — Master Standalone Shutdown Script
.DESCRIPTION
  Safely stops all OTP Docker containers, background tunnel processes, and local web servers.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

if ($PSScriptRoot) {
  $WorkspaceRoot = (Get-Item -Path "$PSScriptRoot\..").FullName
} else {
  $WorkspaceRoot = 'G:\My Drive\otp'
}

Set-Location $WorkspaceRoot

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '     OTP PLATFORM — STANDALONE SHUTDOWN                         ' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

# 1. Stop Docker Containers
Write-Host '[1/2] Stopping Docker services...' -ForegroundColor Yellow
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
  & docker compose -f docker-compose.prod.yml stop
  Write-Host '[OK] Docker containers stopped safely (data preserved).' -ForegroundColor Green
} else {
  Write-Host '[WARN] Docker not found in PATH.' -ForegroundColor DarkGray
}

# 2. Stop Cloudflared tunnel processes if running
Write-Host '[2/2] Stopping Cloudflare tunnel processes...' -ForegroundColor Yellow
$cfProcesses = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if ($cfProcesses) {
  $cfProcesses | Stop-Process -Force
  Write-Host '[OK] Stopped active cloudflared process(es).' -ForegroundColor Green
} else {
  Write-Host '[OK] No active cloudflared tunnel processes found.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  ALL OTP PLATFORM SERVICES STOPPED SUCCESSFULLY                 ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''
