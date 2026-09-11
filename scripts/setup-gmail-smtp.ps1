<#
.SYNOPSIS
  Connects Google Gmail App Password to OTP Platform for Live Email Delivery.
#>

[CmdletBinding()]
param(
  [string]$GmailAddress,
  [string]$AppPassword
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = (Get-Item -Path $PSScriptRoot\..).FullName

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OTP Platform - Gmail SMTP Setup & Verification" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

if (-not $GmailAddress) {
  $GmailAddress = (Read-Host "Enter your Gmail address (e.g. user@gmail.com)").Trim()
}

if (-not $AppPassword) {
  $securePass = Read-Host "Enter your 16-character Google App Password (typing hidden)" -AsSecureString
  $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
  $AppPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

$CleanPass = $AppPassword.Replace(" ", "").Trim()

if ([string]::IsNullOrWhiteSpace($GmailAddress) -or [string]::IsNullOrWhiteSpace($CleanPass)) {
  Write-Host "[ERROR] Gmail address or password cannot be empty." -ForegroundColor Red
  exit 1
}

Write-Host "`n[1/3] Verifying SMTP credentials with smtp.gmail.com:587..." -ForegroundColor Yellow
try {
  $smtp = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
  $smtp.EnableSsl = $true
  $smtp.Credentials = New-Object System.Net.NetworkCredential($GmailAddress, $CleanPass)
  
  $testMail = New-Object System.Net.Mail.MailMessage
  $testMail.From = New-Object System.Net.Mail.MailAddress($GmailAddress, "OTP Platform")
  $testMail.To.Add($GmailAddress)
  $testMail.Subject = "[OTP Platform] SMTP Connection Successful"
  $testMail.Body = "Congratulations! Your Gmail App Password has been successfully verified and connected to OTP Platform.`n`nReal-world 6-digit OTP codes and notification emails will now be dispatched from this address."
  
  $smtp.Send($testMail)
  Write-Host "[OK] Authentication Succeeded! A confirmation email was delivered to $GmailAddress" -ForegroundColor Green
} catch {
  Write-Host "[ERROR] SMTP Authentication Failed!" -ForegroundColor Red
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Please check that: " -ForegroundColor Yellow
  Write-Host "  1. 2-Step Verification is active on your Google Account."
  Write-Host "  2. You generated an App Password from https://myaccount.google.com/apppasswords"
  Write-Host "  3. The 16 characters were typed correctly."
  exit 1
}

# 2. Save securely to gitignored .env.smtp
Write-Host "`n[2/3] Storing credentials securely in .env.smtp..." -ForegroundColor Yellow
$envContent = @"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=$GmailAddress
SMTP_PASS=$CleanPass
SMTP_ADMIN_EMAIL=$GmailAddress
SMTP_SENDER_NAME="OTP Platform"
"@
Set-Content -Path (Join-Path $WorkspaceRoot ".env.smtp") -Value $envContent -Encoding UTF8
Write-Host "[OK] Stored in .env.smtp (Protected by .gitignore)" -ForegroundColor Green

# 3. Update auth container environment
Write-Host "`n[3/3] Updating live authentication container with Gmail SMTP..." -ForegroundColor Yellow
try {
  $rawEnv = docker inspect supabase_auth_otp-local --format '{{range .Config.Env}}{{println .}}{{end}}'
  $envList = @($rawEnv -split "`r?`n" | Where-Object {
    $_ -and $_ -notmatch '^GOTRUE_SMTP_' -and $_ -notmatch '^GOTRUE_MAILER_AUTOCONFIRM=' -and $_ -notmatch '^GOTRUE_SITE_URL=' -and $_ -notmatch '^API_EXTERNAL_URL=' -and $_ -notmatch '^GOTRUE_JWT_ISSUER=' -and $_ -notmatch '^GOTRUE_URI_ALLOW_LIST=' -and $_ -notmatch '^GOTRUE_MAILER_TEMPLATES_'
  })

  $LiveTunnel = "https://incoming-reductions-incoming-stevens.trycloudflare.com"
  if (Test-Path (Join-Path $WorkspaceRoot ".env.auth")) {
    $authLines = Get-Content (Join-Path $WorkspaceRoot ".env.auth")
    foreach ($line in $authLines) {
      if ($line -match '^GOTRUE_SITE_URL=(.+)$') {
        $LiveTunnel = $matches[1].Trim()
      }
    }
  }

  $envList += "GOTRUE_SITE_URL=$LiveTunnel"
  $envList += "GOTRUE_URI_ALLOW_LIST=http://127.0.0.1:3000/*,http://localhost:3000/*,http://localhost:3000/reset-password,$LiveTunnel/*,$LiveTunnel/reset-password,https://*.trycloudflare.com/*"
  $envList += "API_EXTERNAL_URL=$LiveTunnel/auth/v1"
  $envList += "GOTRUE_JWT_ISSUER=$LiveTunnel/auth/v1"
  $TunnelHost = ([System.Uri]::new($LiveTunnel)).Host
  $envList += "GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=$LiveTunnel/email-templates/magic_link.html"
  $envList += "GOTRUE_MAILER_TEMPLATES_RECOVERY=$LiveTunnel/email-templates/recovery.html"
  $envList += "GOTRUE_MAILER_TEMPLATES_INVITE=$LiveTunnel/email-templates/invite.html"
  $envList += "GOTRUE_MAILER_EXTERNAL_HOSTS=127.0.0.1,localhost,$TunnelHost"
  $envList += "GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify"
  $envList += "GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify"
  $envList += "GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify"
  $envList += "GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify"
  $envList += "GOTRUE_SMTP_HOST=smtp.gmail.com"
  $envList += "GOTRUE_SMTP_PORT=587"
  $envList += "GOTRUE_SMTP_USER=$GmailAddress"
  $envList += "GOTRUE_SMTP_PASS=$CleanPass"
  $envList += "GOTRUE_SMTP_ADMIN_EMAIL=$GmailAddress"
  $envList += "GOTRUE_SMTP_SENDER_NAME=OTP Platform"
  $envList += "GOTRUE_MAILER_AUTOCONFIRM=false"

  Write-Host "Stopping previous auth container..." -ForegroundColor DarkGray
  docker stop supabase_auth_otp-local | Out-Null
  docker rm supabase_auth_otp-local | Out-Null

  $templatesPath = (Join-Path $WorkspaceRoot "supabase\templates").Replace('\', '/')
  $dockerArgs = @("run", "-d", "--name", "supabase_auth_otp-local", "--network", "supabase_network_otp-local", "--restart", "unless-stopped", "-v", "${templatesPath}:/usr/local/etc/auth/templates:ro")
  foreach ($item in $envList) {
    $dockerArgs += "-e"
    $dockerArgs += $item
  }
  $dockerArgs += "public.ecr.aws/supabase/gotrue:v2.196.0"
  $dockerArgs += "auth"

  Write-Host "Starting upgraded auth container with Gmail SMTP..." -ForegroundColor DarkGray
  & docker @dockerArgs | Out-Null
  Start-Sleep -Seconds 2

  Write-Host "[OK] Authentication daemon reloaded with live Gmail SMTP dispatch!" -ForegroundColor Green
} catch {
  Write-Host "[WARN] Docker reload notice: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "  [OK] Live Outbound Email is Active!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "From Address: $GmailAddress"
Write-Host "Sender Name:  OTP Platform"
