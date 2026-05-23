#requires -Version 5.1
# Bootstrap Supabase Edge Functions for LabFrame AI
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\bootstrap-supabase.ps1

$ErrorActionPreference = 'Stop'

function Test-Cmd { param([string]$Name) [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Make sure scoop-installed CLI is in PATH for this session
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"

if (-not (Test-Cmd 'supabase')) {
    Write-Host 'ERROR: supabase CLI is not installed.' -ForegroundColor Red
    Write-Host 'Install via:' -ForegroundColor Yellow
    Write-Host '  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git'
    Write-Host '  scoop install supabase'
    exit 1
}

# Move to repo root
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path 'supabase/config.toml')) {
    Write-Host 'ERROR: run this from repo root (folder must contain supabase/ subdir).' -ForegroundColor Red
    exit 1
}

# Step 1: login
Write-Host ''
Write-Host '[1/4] Checking supabase login...' -ForegroundColor Cyan
& supabase projects list 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Not logged in. Opening browser for sign-in...' -ForegroundColor Yellow
    & supabase login
    if ($LASTEXITCODE -ne 0) { throw 'supabase login failed' }
}

# Step 2: link project
Write-Host ''
Write-Host '[2/4] Linking project mmegdmfmozgaycuyeacl...' -ForegroundColor Cyan
& supabase link --project-ref mmegdmfmozgaycuyeacl
if ($LASTEXITCODE -ne 0) { throw 'supabase link failed' }

# Step 3: secrets
Write-Host ''
Write-Host '[3/4] Enter secrets. Input is hidden by design.' -ForegroundColor Cyan
Write-Host 'Leave empty + Enter to skip a value.' -ForegroundColor DarkGray

function Read-Secret {
    param([string]$Label, [string]$Hint)
    Write-Host ''
    Write-Host $Label -ForegroundColor White -NoNewline
    Write-Host "   $Hint" -ForegroundColor DarkGray
    $sec = Read-Host -AsSecureString -Prompt '  value'
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) | Out-Null
    }
}

$BOT_TOKEN           = Read-Secret 'BOT_TOKEN'                 '(from BotFather)'
$REPLICATE_API_TOKEN = Read-Secret 'REPLICATE_API_TOKEN'       '(r8_... from replicate.com/account/api-tokens)'
$POLZA_API_KEY       = Read-Secret 'POLZA_API_KEY'             '(pza_... from polza.ai)'
$SERVICE_ROLE        = Read-Secret 'SUPABASE_SERVICE_ROLE_KEY' '(sb_secret_... or JWT eyJ... from Supabase API Keys)'

$alphabet = (48..57) + (65..90) + (97..122)
$INTERNAL_SECRET = -join (1..48 | ForEach-Object { [char](Get-Random -InputObject $alphabet) })
Write-Host ''
Write-Host 'INTERNAL_SECRET generated automatically (48 chars).' -ForegroundColor DarkGray

# Step 4: write secrets and deploy
Write-Host ''
Write-Host '[4/4] Writing secrets and deploying functions...' -ForegroundColor Cyan

function Set-SbSecret {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host ("  {0}: SKIPPED" -f $Name) -ForegroundColor DarkYellow
        return
    }
    & supabase secrets set "$Name=$Value" 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host ("  {0}: OK" -f $Name) -ForegroundColor Green
    } else {
        Write-Host ("  {0}: FAIL" -f $Name) -ForegroundColor Red
    }
}

Set-SbSecret 'BOT_TOKEN'                 $BOT_TOKEN
Set-SbSecret 'REPLICATE_API_TOKEN'       $REPLICATE_API_TOKEN
Set-SbSecret 'POLZA_API_KEY'             $POLZA_API_KEY
Set-SbSecret 'SUPABASE_SERVICE_ROLE_KEY' $SERVICE_ROLE
Set-SbSecret 'INTERNAL_SECRET'           $INTERNAL_SECRET
Set-SbSecret 'SUPABASE_URL'              'https://mmegdmfmozgaycuyeacl.supabase.co'
Set-SbSecret 'REPLICATE_MODEL'           'black-forest-labs/flux-kontext-pro'
Set-SbSecret 'POLZA_BASE_URL'            'https://api.polza.ai/api/v1'
Set-SbSecret 'POLZA_MODEL'               'gpt-4o-mini'

$functions = @('me', 'create-job', 'get-job', 'process-job', 'notify-bot')
$failed = @()
foreach ($fn in $functions) {
    Write-Host ''
    Write-Host ('Deploy: ' + $fn) -ForegroundColor Cyan
    & supabase functions deploy $fn --no-verify-jwt
    if ($LASTEXITCODE -ne 0) { $failed += $fn }
}

Write-Host ''
if ($failed.Count -eq 0) {
    Write-Host 'All 5 functions deployed.' -ForegroundColor Green
} else {
    Write-Host ('Failed: ' + ($failed -join ', ')) -ForegroundColor Red
}

Write-Host ''
Write-Host '------------------------------------------------' -ForegroundColor DarkGray
Write-Host 'Add to Vercel -> Settings -> Environment Variables:' -ForegroundColor White
Write-Host '  VITE_API_BASE_URL       = https://mmegdmfmozgaycuyeacl.supabase.co/functions/v1'
Write-Host '  VITE_SUPABASE_ANON_KEY  = [paste your anon/publishable key from Supabase API Keys page]'
Write-Host 'Then trigger Redeploy in Vercel.' -ForegroundColor White
Write-Host '------------------------------------------------' -ForegroundColor DarkGray
