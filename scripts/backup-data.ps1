<#
.SYNOPSIS
  Снимает бэкап ДАННЫХ прод-базы LabFrame в SQL-файл.

.DESCRIPTION
  Работает через Management API, поэтому НЕ требует ни Docker, ни pg_dump —
  `supabase db dump` их требует, и на машине владельца их нет.

  Схему не выгружаем сознательно: она целиком воспроизводится из supabase/migrations/,
  а данные (балансы, работы, бренды) не воспроизводятся ничем.

  Вставка через json_populate_recordset: восстановление переживает добавление
  новых колонок со значением по умолчанию.

.PARAMETER OutDir
  Куда класть файл. По умолчанию — рядом с репозиторием, ВНЕ него:
  в файле персональные данные (first_name, last_name, photo_url), в git ему нельзя.

.EXAMPLE
  $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
  .\scripts\backup-data.ps1
#>
param(
  [string] $ProjectRef = 'mmegdmfmozgaycuyeacl',
  [string] $OutDir     = "$env:USERPROFILE\Desktop\labframe-backups"
)

$ErrorActionPreference = 'Stop'

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "Нужен токен: `$env:SUPABASE_ACCESS_TOKEN = 'sbp_...' (https://supabase.com/dashboard/account/tokens)"
}

$uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$hdr = @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" }

function Invoke-Sql([string] $Query) {
  $body = @{ query = $Query } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri $uri -Headers $hdr -ContentType 'application/json' -Body $body -TimeoutSec 120
}

# Таблицы берём из базы, а не списком: новая таблица попадёт в бэкап сама,
# без правки скрипта — иначе про неё вспомнят только когда понадобится восстановиться.
$tables = (Invoke-Sql @"
select table_name from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE'
 order by table_name
"@).table_name

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$path  = Join-Path $OutDir "data_$stamp.sql"

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("-- Бэкап ДАННЫХ LabFrame AI, снят $stamp.")
[void]$sb.AppendLine("--")
[void]$sb.AppendLine("-- ВОССТАНОВЛЕНИЕ: накатить миграции на пустую базу (supabase db push),")
[void]$sb.AppendLine("-- затем выполнить этот файл в SQL Editor.")
[void]$sb.AppendLine("--")
[void]$sb.AppendLine("-- ВНИМАНИЕ: содержит персональные данные. Вне репозитория и вне общих папок.")
[void]$sb.AppendLine()

$total = 0
foreach ($t in $tables) {
  $row = Invoke-Sql @"
select coalesce(
         'insert into public.$t select * from json_populate_recordset(null::public.$t, '
         || quote_literal(json_agg(x)::text) || ');',
         '-- ${t}: пусто'
       ) as stmt,
       count(*) as n
  from public.$t x
"@
  $total += $row.n
  [void]$sb.AppendLine("-- $t`: $($row.n) строк")
  [void]$sb.AppendLine($row.stmt)
  [void]$sb.AppendLine()
  Write-Output ("  {0,-12} {1,5} строк" -f $t, $row.n)
}

[System.IO.File]::WriteAllText($path, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Output ""
Write-Output "Готово: $path"
Write-Output "Строк данных: $total, размер: $((Get-Item $path).Length) байт"
