$ErrorActionPreference = "Stop"
$Log = "G:\My Drive\otp\ngrok-startup.log"

try {
    $existing = Get-CimInstance Win32_Process `
        -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue

    if ($existing) {
        Add-Content $Log "$(Get-Date -Format s) ngrok already running; no duplicate started."
        exit 0
    }

    $exe = "C:\Users\Dhiya\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

    Start-Process -FilePath $exe `
        -ArgumentList "http 3008" `
        -WorkingDirectory (Split-Path $exe) `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5

    if (Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue) {
        Add-Content $Log "$(Get-Date -Format s) ngrok process started."
    } else {
        throw "ngrok process did not start."
    }
}
catch {
    Add-Content $Log "$(Get-Date -Format s) ERROR: $($_.Exception.Message)"
    exit 1
}
