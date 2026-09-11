# Supabase Configuration Script - Automated Setup
# Run this in PowerShell from project root: g:\My Drive\otp

# CONFIGURATION - UPDATE THESE VALUES
# =====================================

# 1. Generate Demo Reset Secret (run this once)
$DEMO_RESET_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Write-Host "Generated DEMO_RESET_SECRET: $DEMO_RESET_SECRET" -ForegroundColor Green
Write-Host "Save this value - you'll need it!" -ForegroundColor Yellow
Write-Host ""

# 2. Cloudflare Tunnel URLs
$APP_URL = "https://incoming-reductions-incoming-stevens.trycloudflare.com"
$WEB_ORIGIN = "https://incoming-reductions-incoming-stevens.trycloudflare.com"

# 3. Messaging Provider Configuration
Write-Host "Choose Messaging Provider:" -ForegroundColor Cyan
Write-Host "1. Meta WhatsApp (Recommended - ₹0.35/msg, official API)"
Write-Host "2. Twilio (Faster setup - ₹0.50/msg)"
Write-Host "3. Skip for now (configure later)"
$choice = Read-Host "Enter choice (1/2/3)"

if ($choice -eq "1") {
    $MESSAGING_PROVIDER = "meta"
    Write-Host ""
    Write-Host "Meta WhatsApp Setup Required:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://developers.facebook.com/"
    Write-Host "2. Create WhatsApp Business App"
    Write-Host "3. Get credentials from API Setup section"
    Write-Host "4. Enter below (or skip and add manually to Supabase Dashboard later)"
    Write-Host ""
    
    $META_PHONE_NUMBER_ID = Read-Host "META_PHONE_NUMBER_ID (from WhatsApp API Setup)"
    $META_ACCESS_TOKEN = Read-Host "META_ACCESS_TOKEN (permanent token from System User)"
    $META_APP_SECRET = Read-Host "META_APP_SECRET (from App Settings → Basic)"
    $META_VERIFY_TOKEN = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
    Write-Host "Generated META_VERIFY_TOKEN: $META_VERIFY_TOKEN" -ForegroundColor Green
    
} elseif ($choice -eq "2") {
    $MESSAGING_PROVIDER = "twilio"
    Write-Host ""
    Write-Host "Twilio Setup Required:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://www.twilio.com/console"
    Write-Host "2. Get Account SID and Auth Token"
    Write-Host "3. Purchase phone number with SMS + WhatsApp"
    Write-Host "4. Enter below (or skip and add manually later)"
    Write-Host ""
    
    $TWILIO_ACCOUNT_SID = Read-Host "TWILIO_ACCOUNT_SID (from Twilio Console)"
    $TWILIO_AUTH_TOKEN = Read-Host "TWILIO_AUTH_TOKEN (from Twilio Console)"
    $TWILIO_SMS_FROM = Read-Host "TWILIO_SMS_FROM (e.g., +15551234567)"
    $TWILIO_WHATSAPP_FROM = Read-Host "TWILIO_WHATSAPP_FROM (e.g., whatsapp:+15551234567)"
    
} else {
    $MESSAGING_PROVIDER = "mock"
    Write-Host "Messaging provider skipped - using mock provider for testing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Configuring Supabase Secrets..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Set Edge Function Secrets via Supabase CLI
Write-Host "Setting core secrets..." -ForegroundColor Green
supabase secrets set APP_URL="$APP_URL"
supabase secrets set WEB_ORIGIN="$WEB_ORIGIN"
supabase secrets set DEMO_RESET_SECRET="$DEMO_RESET_SECRET"

Write-Host "Setting messaging provider: $MESSAGING_PROVIDER" -ForegroundColor Green
supabase secrets set MESSAGING_PROVIDER="$MESSAGING_PROVIDER"

if ($MESSAGING_PROVIDER -eq "meta" -and $META_PHONE_NUMBER_ID) {
    Write-Host "Setting Meta WhatsApp credentials..." -ForegroundColor Green
    supabase secrets set META_PHONE_NUMBER_ID="$META_PHONE_NUMBER_ID"
    supabase secrets set META_ACCESS_TOKEN="$META_ACCESS_TOKEN"
    supabase secrets set META_APP_SECRET="$META_APP_SECRET"
    supabase secrets set META_VERIFY_TOKEN="$META_VERIFY_TOKEN"
}

if ($MESSAGING_PROVIDER -eq "twilio" -and $TWILIO_ACCOUNT_SID) {
    Write-Host "Setting Twilio credentials..." -ForegroundColor Green
    supabase secrets set TWILIO_ACCOUNT_SID="$TWILIO_ACCOUNT_SID"
    supabase secrets set TWILIO_AUTH_TOKEN="$TWILIO_AUTH_TOKEN"
    supabase secrets set TWILIO_SMS_FROM="$TWILIO_SMS_FROM"
    supabase secrets set TWILIO_WHATSAPP_FROM="$TWILIO_WHATSAPP_FROM"
}

Write-Host ""
Write-Host "✅ Secrets configured successfully!" -ForegroundColor Green
Write-Host ""

# List all secrets (masked values)
Write-Host "Verifying secrets..." -ForegroundColor Cyan
supabase secrets list

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Manual Configuration Required" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  Complete these steps in Supabase Dashboard:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Configure Auth Settings:" -ForegroundColor White
Write-Host "   Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/auth/url-configuration"
Write-Host "   - Site URL: $APP_URL"
Write-Host "   - Redirect URLs (add all):"
Write-Host "     • $APP_URL/**"
Write-Host "     • $APP_URL/auth/callback"
Write-Host "     • $APP_URL/q/**"
Write-Host ""

Write-Host "2. Configure SMTP Email:" -ForegroundColor White
Write-Host "   Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/auth/email-templates"
Write-Host "   - Enable Custom SMTP"
Write-Host "   - Use Gmail SMTP for testing:"
Write-Host "     • Host: smtp.gmail.com"
Write-Host "     • Port: 587"
Write-Host "     • Username: bvnbasu@gmail.com"
Write-Host "     • Password: [Generate App Password at: https://myaccount.google.com/apppasswords]"
Write-Host "     • From Email: bvnbasu@gmail.com"
Write-Host "     • From Name: OTP Platform"
Write-Host ""

Write-Host "3. Enable Email Confirmations:" -ForegroundColor White
Write-Host "   Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/auth/providers"
Write-Host "   - ✅ Enable 'Confirm email'"
Write-Host "   - ✅ Enable 'Secure email change'"
Write-Host ""

if ($MESSAGING_PROVIDER -eq "meta") {
    Write-Host "4. Configure Meta WhatsApp Webhook:" -ForegroundColor White
    Write-Host "   Go to: https://developers.facebook.com/apps/YOUR_APP_ID/whatsapp-business/wa-settings/"
    Write-Host "   - Callback URL: $APP_URL/functions/v1/messaging-inbound"
    Write-Host "   - Verify Token: $META_VERIFY_TOKEN"
    Write-Host "   - Subscribe to: messages, message_status"
    Write-Host ""
}

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Deploy Edge Function:" -ForegroundColor White
Write-Host "   supabase functions deploy process-attachment"
Write-Host ""
Write-Host "2. Apply Database Migration:" -ForegroundColor White
Write-Host "   supabase db push"
Write-Host ""
Write-Host "3. Test Configuration:" -ForegroundColor White
Write-Host "   pnpm --filter web dev"
Write-Host "   # Open: $APP_URL"
Write-Host ""
Write-Host "4. Complete Manual Steps Above (Supabase Dashboard)"
Write-Host ""

Write-Host "✅ Configuration script complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📖 Documentation:" -ForegroundColor Cyan
Write-Host "   - Full setup guide: docs/CLOUDFLARE-TUNNEL-TESTING-CONFIG.md"
Write-Host "   - Meta WhatsApp setup: docs/MESSAGING-META-WHATSAPP-SETUP.md"
Write-Host "   - ONDC integration: docs/ONDC-INTEGRATION-NOTES.md"
Write-Host ""
