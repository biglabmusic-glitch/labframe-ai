#requires -Version 5.1
<#
.SYNOPSIS
  Разовая настройка Supabase Edge Functions для LabFrame AI.
  - Спрашивает у тебя секреты (никогда не пишет их в файл / репо)
  - Сохраняет их в Supabase секреты Edge Functions
  - Деплоит все 5 функций (me, create-job, get-job, process-job, notify-bot)
  - Выводит итог: что прошло, что упало

Запуск из корня репо:
  PowerShell -ExecutionPolicy Bypass -File scripts\bootstrap-supabase.ps1
#>

$ErrorActionPreference = 'Stop'

# ─── Проверки окружения ─────────────────────────────────────────────────
function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'supabase')) {
    Write-Host 'ОШИБКА: supabase CLI не установлен.' -ForegroundColor Red
    Write-Host 'Сначала выполни:' -ForegroundColor Yellow
    Write-Host '  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git'
    Write-Host '  scoop install supabase'
    exit 1
}

# Перейти в корень репо (родитель этой папки)
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
Write-Host "Working dir: $repoRoot" -ForegroundColor DarkGray

if (-not (Test-Path 'supabase/config.toml')) {
    Write-Host 'ОШИБКА: запусти скрипт из корня репо labframe-ai (там должна быть папка supabase/).' -ForegroundColor Red
    exit 1
}

# ─── Логин и линковка проекта ───────────────────────────────────────────
Write-Host "`nШаг 1/4: проверяю supabase login..." -ForegroundColor Cyan
$projects = supabase projects list 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Не залогинен — открою браузер для входа.' -ForegroundColor Yellow
    supabase login
    if ($LASTEXITCODE -ne 0) { throw 'supabase login failed' }
}

Write-Host "`nШаг 2/4: линкую проект mmegdmfmozgaycuyeacl..." -ForegroundColor Cyan
$linked = $false
try {
    $status = supabase status 2>&1 | Out-String
    if ($status -notmatch 'mmegdmfmozgaycuyeacl') {
        supabase link --project-ref mmegdmfmozgaycuyeacl
        if ($LASTEXITCODE -ne 0) { throw 'supabase link failed' }
    }
    $linked = $true
} catch {
    supabase link --project-ref mmegdmfmozgaycuyeacl
    if ($LASTEXITCODE -ne 0) { throw 'supabase link failed' }
    $linked = $true
}
if ($linked) { Write-Host 'Проект слинкован.' -ForegroundColor Green }

# ─── Сбор секретов ──────────────────────────────────────────────────────
Write-Host "`nШаг 3/4: введи секреты (ввод скрыт)." -ForegroundColor Cyan
Write-Host 'Где взять каждый — в подсказке справа. Если значение уже задано в Supabase и менять не хочешь — оставь пустым (Enter).' -ForegroundColor DarkGray

function Read-Secret {
    param(
        [string]$Label,
        [string]$Hint,
        [bool]  $Required = $true
    )
    Write-Host ""
    Write-Host $Label -ForegroundColor White -NoNewline
    Write-Host "  ($Hint)" -ForegroundColor DarkGray
    $sec = Read-Host -AsSecureString -Prompt '  значение'
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) | Out-Null
    if ($Required -and [string]::IsNullOrWhiteSpace($plain)) {
        Write-Host "  пропущено" -ForegroundColor DarkYellow
        return $null
    }
    return $plain
}

# 1. BOT_TOKEN
$BOT_TOKEN = Read-Secret 'BOT_TOKEN' 'от @BotFather'

# 2. REPLICATE_API_TOKEN
$REPLICATE_API_TOKEN = Read-Secret 'REPLICATE_API_TOKEN' 'replicate.com/account/api-tokens, r8_...'

# 3. POLZA_API_KEY
$POLZA_API_KEY = Read-Secret 'POLZA_API_KEY' 'polza.ai → API-ключи, pza_...'

# 4. SUPABASE_SERVICE_ROLE_KEY
$SERVICE_ROLE = Read-Secret 'SUPABASE_SERVICE_ROLE_KEY' 'Supabase → API Keys → secret (sb_secret_... или JWT eyJ...)'

# 5. INTERNAL_SECRET — генерируем сами
$INTERNAL_SECRET = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
Write-Host "`nINTERNAL_SECRET сгенерирован автоматически (48 символов). Сохраняю в Supabase." -ForegroundColor DarkGray

# ─── Установка секретов и деплой ────────────────────────────────────────
Write-Host "`nШаг 4/4: пишу секреты и деплою функции..." -ForegroundColor Cyan

function Set-Secret {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host "  $Name : пропущен" -ForegroundColor DarkYellow
        return
    }
    supabase secrets set "$Name=$Value" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  $Name : OK" -ForegroundColor Green
    } else {
        Write-Host "  $Name : FAIL" -ForegroundColor Red
    }
}

Set-Secret 'BOT_TOKEN'                 $BOT_TOKEN
Set-Secret 'REPLICATE_API_TOKEN'       $REPLICATE_API_TOKEN
Set-Secret 'POLZA_API_KEY'             $POLZA_API_KEY
Set-Secret 'SUPABASE_SERVICE_ROLE_KEY' $SERVICE_ROLE
Set-Secret 'INTERNAL_SECRET'           $INTERNAL_SECRET

# Эти три значения известны заранее
Set-Secret 'SUPABASE_URL'      'https://mmegdmfmozgaycuyeacl.supabase.co'
Set-Secret 'REPLICATE_MODEL'   'black-forest-labs/flux-kontext-pro'
Set-Secret 'POLZA_BASE_URL'    'https://api.polza.ai/api/v1'
Set-Secret 'POLZA_MODEL'       'gpt-4o-mini'

# ── Deploy functions ────────────────────────────────────────────────────
$functions = @('me', 'create-job', 'get-job', 'process-job', 'notify-bot')
$failed = @()

foreach ($fn in $functions) {
    Write-Host ""
    Write-Host "Deploy: $fn" -ForegroundColor Cyan
    supabase functions deploy $fn --no-verify-jwt
    if ($LASTEXITCODE -ne 0) { $failed += $fn }
}

Write-Host ""
if ($failed.Count -eq 0) {
    Write-Host 'Все 5 функций задеплоены. ' -NoNewline -ForegroundColor Green
    Write-Host '✔' -ForegroundColor Green
} else {
    Write-Host "Не задеплоились: $($failed -join ', ')" -ForegroundColor Red
}

# ─── Финальный вывод для Vercel ─────────────────────────────────────────
Write-Host "`n────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "Готово. Теперь добавь в Vercel → Settings → Environment Variables:" -ForegroundColor White
Write-Host "  VITE_API_BASE_URL       = https://mmegdmfmozgaycuyeacl.supabase.co/functions/v1"
Write-Host "  VITE_SUPABASE_ANON_KEY  = <твой anon/publishable ключ из Supabase>"
Write-Host "После добавления — Vercel → Deployments → Redeploy последнего." -ForegroundColor White
Write-Host "────────────────────────────────────────────`n" -ForegroundColor DarkGray
