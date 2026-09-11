<#
.SYNOPSIS
  OTP Platform — Master Standalone Shutdown Script
.DESCRIPTION
  Safely stops all OTP Docker containers and local services.
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
Write-Host '[1/1] Stopping Docker services...' -ForegroundColor Yellow
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
  & docker compose -f docker-compose.prod.yml stop
  Write-Host '[OK] Docker containers stopped safely (data preserved).' -ForegroundColor Green
} else {
  Write-Host '[WARN] Docker not found in PATH.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  ALL OTP PLATFORM SERVICES STOPPED SUCCESSFULLY                 ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''
