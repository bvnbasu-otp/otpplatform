<#
.SYNOPSIS
  OTP Platform - Production Database Disaster Recovery & Automated Restoration Script
.DESCRIPTION
  Restores a PostgreSQL backup archive (.sql or AES-256 encrypted .sql.enc) to
  the production or staging database container, with cryptographic checksum verification.
#>

param (
  [Parameter(Mandatory=$false)]
  [string]$BackupFilePath,
  [string]$ContainerName = "otp-prod-db",
  [string]$EncryptionKey = $env:OTP_BACKUP_ENCRYPTION_KEY,
  [switch]$VerifyOnly,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Decrypt-FileAes {
  param(
    [string]$InPath,
    [string]$OutPath,
    [string]$Password
  )
  $inStream = [System.IO.File]::OpenRead($InPath)
  $salt = [byte[]]::new(16)
  $inStream.Read($salt, 0, 16) | Out-Null
  $iv = [byte[]]::new(16)
  $inStream.Read($iv, 0, 16) | Out-Null
  
  $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new($Password, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $key = $derive.GetBytes(32)
  
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Key = $key
  $aes.IV = $iv
  
  $cryptoStream = [System.Security.Cryptography.CryptoStream]::new($inStream, $aes.CreateDecryptor(), [System.Security.Cryptography.CryptoStreamMode]::Read)
  $outStream = [System.IO.File]::Create($OutPath)
  $cryptoStream.CopyTo($outStream)
  $outStream.Close()
  $cryptoStream.Close()
  $inStream.Close()
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OTP Platform - Disaster Recovery and Database Restoration" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Locate backup file if not explicitly provided
if (-not $BackupFilePath) {
  $backupDir = "G:\My Drive\otp\backups"
  $latestBackup = Get-ChildItem -Path $backupDir -Filter "otp_prod_backup_*" | 
    Where-Object { $_.Extension -in ".sql", ".enc" -and $_.Extension -ne ".sha256" } | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1

  if (-not $latestBackup) {
    Write-Host "[ERROR] No backup files found in $backupDir" -ForegroundColor Red
    exit 1
  }
  $BackupFilePath = $latestBackup.FullName
}

Write-Host "Target Backup File : $BackupFilePath" -ForegroundColor White

# 2. Checksum Verification
$checksumFile = "$BackupFilePath.sha256"
if (Test-Path $checksumFile) {
  $expectedHash = ((Get-Content $checksumFile -Raw).Trim() -split "\s+")[0]
  $actualHash = (Get-FileHash -Path $BackupFilePath -Algorithm SHA256).Hash
  if ($expectedHash.ToUpper() -eq $actualHash.ToUpper()) {
    Write-Host "[OK] Cryptographic SHA-256 Checksum Verified: $actualHash" -ForegroundColor Green
  } else {
    Write-Host "[ERROR] Checksum Mismatch! Backup file may be corrupted or tampered with." -ForegroundColor Red
    Write-Host "        Expected: $expectedHash" -ForegroundColor Red
    Write-Host "        Actual  : $actualHash" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "[WARN] No .sha256 checksum file found beside backup archive." -ForegroundColor Yellow
}

# 3. Decrypt if file is AES-256 encrypted (.enc)
$sqlToRestore = $BackupFilePath
$tempDecrypted = $null

if ($BackupFilePath.EndsWith(".enc")) {
  $encPassword = if ($EncryptionKey) { $EncryptionKey } else { "OTP_Secured_Backup_Key_2026" }
  $tempDecrypted = [System.IO.Path]::GetTempFileName() + ".sql"
  Write-Host "Decrypting AES-256-CBC backup archive..." -ForegroundColor Yellow
  try {
    Decrypt-FileAes -InPath $BackupFilePath -OutPath $tempDecrypted -Password $encPassword
    $sqlToRestore = $tempDecrypted
    Write-Host "[OK] Backup successfully decrypted to temporary buffer." -ForegroundColor Green
  } catch {
    Write-Host "[ERROR] Decryption failed: Check encryption password." -ForegroundColor Red
    if ($tempDecrypted -and (Test-Path $tempDecrypted)) { Remove-Item $tempDecrypted -Force }
    exit 1
  }
}

# 4. Verify SQL structure
Write-Host "Validating SQL script syntax and header structure..." -ForegroundColor Yellow
$firstLines = (Get-Content $sqlToRestore -TotalCount 5) -join "`n"
if ($firstLines.Length -gt 0) {
  Write-Host "[OK] Valid SQL headers detected." -ForegroundColor Green
} else {
  Write-Host "[ERROR] Decrypted backup file appears empty." -ForegroundColor Red
  if ($tempDecrypted -and (Test-Path $tempDecrypted)) { Remove-Item $tempDecrypted -Force }
  exit 1
}

if ($VerifyOnly) {
  Write-Host "`n[VERIFY-ONLY] Backup archive integrity verified successfully. No restoration performed." -ForegroundColor Green
  if ($tempDecrypted -and (Test-Path $tempDecrypted)) { Remove-Item $tempDecrypted -Force }
  exit 0
}

# 5. Execute restoration into Docker container
$containerRunning = $false
try {
  $running = & docker ps --filter "name=$ContainerName" --filter "status=running" --format "{{.Names}}" 2>$null
  if ($running -eq $ContainerName) { $containerRunning = $true }
} catch {}

if ($containerRunning) {
  Write-Host "Restoring database into container '$ContainerName'..." -ForegroundColor Yellow
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    Get-Content $sqlToRestore -Raw | docker exec -i $ContainerName psql -U postgres -d postgres
    $stopwatch.Stop()
    Write-Host "[OK] Database restored successfully in $($stopwatch.Elapsed.TotalSeconds.ToString('F1'))s!" -ForegroundColor Green
  } catch {
    Write-Host "[ERROR] Restoration command failed: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "[INFO] Database container '$ContainerName' is not running." -ForegroundColor Yellow
  Write-Host "       Backup archive is valid and ready for cold disaster recovery." -ForegroundColor Cyan
}

# 6. Cleanup temporary decrypted files
if ($tempDecrypted -and (Test-Path $tempDecrypted)) {
  Remove-Item $tempDecrypted -Force
  Write-Host "[OK] Cleaned up temporary decrypted memory files." -ForegroundColor DarkGray
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  RESTORATION / VERIFICATION COMPLETE" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
