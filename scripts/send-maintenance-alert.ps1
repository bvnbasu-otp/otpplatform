param (
  [Parameter(Mandatory=$true)]
  [ValidateSet("STARTING", "COMPLETED", "ROLLBACK")]
  [string]$Stage,

  [string]$Details = "All services verified",
  [string]$TunnelUrl = "https://incoming-reductions-incoming-stevens.trycloudflare.com"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$adminEmail = "bvnbasu@gmail.com"
$adminLid = "33251787841621@lid"
$adminPhone = "919972967530@c.us"
$siteUrl = $TunnelUrl
$timestamp = Get-Date -Format "dd-MMM-yyyy hh:mm tt"

# 1. Prepare Content
if ($Stage -eq "STARTING") {
  $emailSubject = "[OTP Platform] Scheduled Maintenance Starting"
  $emailBody = @"
Hello Baskar,

Scheduled maintenance for OTP Platform is now STARTING.

- Timestamp: $timestamp
- Target URL: $siteUrl
- Scope: Refreshing containers, updating configuration, verifying database migrations.

You will receive a completion confirmation email and WhatsApp message as soon as all services are back online and healthy.

- OTP Platform Operations
"@

  $waText = @"
[OTP Platform] Maintenance Starting

Hello Baskar,
Scheduled maintenance activity is now starting.

* Timestamp: $timestamp
* Platform URL: $siteUrl
* Scope: Refreshing system services & running updates.

A completion confirmation will be sent as soon as systems are live.
"@
} elseif ($Stage -eq "ROLLBACK") {
  $emailSubject = "[OTP Platform] Maintenance Warning: Auto-Rollback Triggered"
  $emailBody = @"
Hello Baskar,

During scheduled maintenance or deployment verification, an automated health check failed.
The platform has executed an AUTOMATIC ROLLBACK to the previous stable release to guarantee continuous uptime.

- Timestamp: $timestamp
- Live Endpoint: $siteUrl
- Status: Auto-Rollback Triggered
- Details: $Details

The website is running on the previous stable code flow. Production database and user data are 100% retained.

- OTP Platform Operations
"@

  $waText = @"
[OTP Platform] Auto-Rollback Triggered

Hello Baskar,
A live smoke check failed during deployment. Systems have safely rolled back to the previous stable release.

* Timestamp: $timestamp
* Live URL: $siteUrl
* Details: $Details
* Protection: Previous stable release active; user data 100% intact.

Platform remains online and accessible on the verified release.
"@
} else {
  $emailSubject = "[OTP Platform] Maintenance Completed & Systems Live"
  $emailBody = @"
Hello Baskar,

Maintenance for OTP Platform is now COMPLETED successfully.

- Timestamp: $timestamp
- Live Endpoint: $siteUrl
- System Health: All containers running and healthy
- Details: $Details

All buyer, supplier, and admin portals are live and operational.

- OTP Platform Operations
"@

  $waText = @"
[OTP Platform] Maintenance Completed

Hello Baskar,
All maintenance activities have completed successfully.

* Completed At: $timestamp
* Live URL: $siteUrl
* Status: $Details
* Auth & SMTP: Active
* WhatsApp Gateway: Active

OTP Platform is live and ready for use.
"@
}

# Enforce strict 7-bit ASCII on all outgoing notifications
$emailSubject = ($emailSubject -replace '\u2014|\u2013', '-' -replace '[^\x20-\x7E]', '').Trim()
$emailBody    = ($emailBody -replace '\u2014|\u2013', '-' -replace '[^\x20-\x7E\r\n\t]', '').Trim()
$waText       = ($waText -replace '\u2014|\u2013', '-' -replace '[^\x20-\x7E\r\n\t]', '').Trim()

# 2. Dispatch Email via Gmail SMTP
try {
  $smtp = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
  $smtp.EnableSsl = $true
  $smtp.Credentials = New-Object System.Net.NetworkCredential("bvnbasu@gmail.com", "tthnhzwbkexabpda")

  $mail = New-Object System.Net.Mail.MailMessage
  $mail.From = New-Object System.Net.Mail.MailAddress("bvnbasu@gmail.com", "OTP Platform Operations")
  $mail.To.Add($adminEmail)
  $mail.Subject = $emailSubject
  $mail.SubjectEncoding = [System.Text.Encoding]::UTF8
  $mail.BodyEncoding = [System.Text.Encoding]::UTF8
  $mail.Body = $emailBody

  $smtp.Send($mail)
  Write-Host "[OK] Email notification delivered to $adminEmail ($Stage)" -ForegroundColor Green
  $mail.Dispose()
  $smtp.Dispose()
} catch {
  Write-Host "[WARN] Email notification failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3. Dispatch WhatsApp via WAHA Gateway
$wahaReady = $false
for ($attempt = 1; $attempt -le 6; $attempt++) {
  try {
    $sess = Invoke-RestMethod -Uri "http://localhost:3008/api/sessions/default" -TimeoutSec 5 -ErrorAction Stop
    if ($sess.status -eq "WORKING") {
      $wahaReady = $true
      break
    }
  } catch {
    # Gateway may be starting
  }
  Start-Sleep -Seconds 2
}

if ($wahaReady) {
  foreach ($target in @($adminLid, $adminPhone)) {
    try {
      $payload = @{
        session = "default"
        chatId = $target
        text = $waText
      } | ConvertTo-Json
      $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
      Invoke-RestMethod -Uri "http://localhost:3008/api/sendText" -Method POST -Body $bodyBytes -ContentType "application/json; charset=utf-8" -TimeoutSec 10 -ErrorAction Stop | Out-Null
      Write-Host "[OK] WhatsApp alert delivered to $target ($Stage)" -ForegroundColor Green
    } catch {
      Write-Host "[WARN] WhatsApp alert failed for ${target}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "[WARN] WhatsApp gateway session not in WORKING state. Skipped WhatsApp alerts ($Stage)." -ForegroundColor Yellow
}

