<#
.SYNOPSIS
  OTP Platform - Automated Onboarding Welcome Notification Dispatcher
.DESCRIPTION
  Dispatches official account activation and welcome notifications via Gmail SMTP (Email)
  and WAHA Gateway (WhatsApp) with login credentials and portal links.
#>

param (
  [Parameter(Mandatory=$true)]
  [string]$Email,

  [Parameter(Mandatory=$true)]
  [string]$FullName,

  [string]$BusinessName = "",
  [string]$Reference = "",
  [string]$Side = "BUYER",
  [string]$TemporaryPassword = "Welcome@OTP2026!",
  [string]$Phone = "",
  [string]$PortalUrl = "https://incoming-reductions-incoming-stevens.trycloudflare.com"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$adminEmail = "bvnbasu@gmail.com"
$smtpPass = "tthnhzwbkexabpda"
$loginUrl = "$PortalUrl/login"
$entityLabel = if ($BusinessName) { $BusinessName } else { $FullName }

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OTP Platform - Onboarding Welcome Notification Dispatcher" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Recipient Email : $Email" -ForegroundColor White
Write-Host "Recipient Name  : $FullName ($entityLabel)" -ForegroundColor White
Write-Host "Registration Ref: $Reference" -ForegroundColor DarkGray
Write-Host "Access Portal   : $loginUrl" -ForegroundColor DarkGray
Write-Host ""

# 1. Dispatch Email via Gmail SMTP
Write-Host "[1/2] Sending official onboarding email via Gmail SMTP..." -ForegroundColor Yellow
$emailSubject = "Welcome to OTP Platform - Your $Side Account is Activated"

$emailBody = @"
Hello $FullName,

Welcome to the OTP (Open Trade & Procurement) Platform!

Your $Side account registration under reference $Reference has been approved and successfully activated by our operations team.

Your Account Credentials:
--------------------------------------------------
* Registered Entity : $entityLabel
* Email / Username  : $Email
* Temporary Password: $TemporaryPassword
* Portal Access URL : $loginUrl

Getting Started:
1. Navigate to $loginUrl and log in with your credentials above.
2. For security, update your password from your account profile after your first login.
3. You can now post your procurement requirements, receive identity-protected competitive quotes from verified suppliers, and evaluate proposals.

If you have any questions or require assistance, simply reply directly to this email or contact our support team.

Best regards,
Baskar Loganathan
Platform Administrator & Owner
OTP - Open Trade & Procurement Platform
$PortalUrl
"@

# Enforce strict 7-bit ASCII
$emailSubject = ($emailSubject -replace '\u2014|\u2013', '-' -replace '[^\x20-\x7E]', '').Trim()
$emailBody    = ($emailBody -replace '\u2014|\u2013', '-' -replace '[^\x20-\x7E\r\n\t]', '').Trim()

try {
  $smtp = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
  $smtp.EnableSsl = $true
  $smtp.Credentials = New-Object System.Net.NetworkCredential($adminEmail, $smtpPass)

  $mail = New-Object System.Net.Mail.MailMessage
  $mail.From = New-Object System.Net.Mail.MailAddress($adminEmail, "OTP Platform Operations")
  $mail.To.Add($Email)
  $mail.Bcc.Add($adminEmail)
  $mail.Subject = $emailSubject
  $mail.SubjectEncoding = [System.Text.Encoding]::UTF8
  $mail.BodyEncoding = [System.Text.Encoding]::UTF8
  $mail.Body = $emailBody

  $smtp.Send($mail)
  Write-Host "[OK] Welcome email successfully delivered to $Email (Bcc: $adminEmail)" -ForegroundColor Green
  $mail.Dispose()
  $smtp.Dispose()
} catch {
  Write-Host "[ERROR] Failed to send email: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Dispatch WhatsApp Notification if Phone provided
if ($Phone) {
  Write-Host ""
  Write-Host "[2/2] Sending WhatsApp activation notice via WAHA Gateway..." -ForegroundColor Yellow
  $cleanPhone = $Phone -replace '\D', ''
  if ($cleanPhone.Length -eq 10) { $cleanPhone = "91$cleanPhone" }
  $chatId = "$cleanPhone@c.us"

  $waText = @"
Welcome to OTP Platform!

Hello $FullName,
Your $Side account for $entityLabel has been approved and activated.

Reference: $Reference
Login Email: $Email
Temporary Password: $TemporaryPassword
Login Portal: $loginUrl

You can now log in, update your password, and start sourcing or submitting quotes.

OTP Platform Operations
"@

  $waText = ($waText -replace '\u2014|\u2013', '-' -replace '[^\x20-\x7E\r\n\t]', '').Trim()

  $payload = @{
    session = "default"
    chatId  = $chatId
    text    = $waText
  } | ConvertTo-Json
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

  try {
    $res = Invoke-RestMethod -Uri "http://localhost:3008/api/sendText" -Method Post -ContentType "application/json; charset=utf-8" -Body $bodyBytes
    Write-Host "[OK] WhatsApp activation notice delivered to $Phone (ChatId: $chatId)" -ForegroundColor Green
  } catch {
    Write-Host "[WARN] WhatsApp delivery failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "[OK] Onboarding notifications process completed." -ForegroundColor Green
