<#
.SYNOPSIS
  Consistent encrypted backup through the authenticated Supabase CLI (no Docker).
.DESCRIPTION
  Windows DPAPI CurrentUser protects every payload before it is written to disk.
  Run as the same Windows account for restore; a portable/off-site recovery key
  must be configured separately before claiming recovery after loss of this PC.
  -IncludeStorage copies work photos, logos and results incrementally. Ephemeral
  smile-pilot files are excluded so backups do not extend their 24-hour retention.
  Never prints records, object paths, API keys or query responses.
#>
param(
  [string]$ProjectRef='mmegdmfmozgaycuyeacl',
  [string]$OutDir=(Join-Path $env:USERPROFILE 'Desktop\labframe-backups\encrypted-v2'),
  [switch]$IncludeStorage,
  [ValidateRange(1,12)][int]$Parallelism=8
)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'This backup format requires Windows DPAPI.'}
if($ProjectRef -notmatch '^[a-z]{20}$'){throw 'Invalid project reference'}
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$entropy=[Text.Encoding]::UTF8.GetBytes('LabFrame backup v2')
$resolvedOut=[IO.Path]::GetFullPath($OutDir)
[IO.Directory]::CreateDirectory($resolvedOut)|Out-Null

function Invoke-BackupQuery([string]$Sql) {
  $raw=(& supabase db query --linked --output json $Sql 2>$null) -join "`n"
  if($LASTEXITCODE -ne 0){throw 'Supabase backup query failed; no sensitive output was printed.'}
  try {return [Text.Json.JsonDocument]::Parse($raw)}catch{throw 'Invalid backup query response'}
}
function Protect-BackupBytes([byte[]]$Bytes,[string]$Path) {
  $sealed=[Security.Cryptography.ProtectedData]::Protect($Bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  [IO.File]::WriteAllBytes($temporary,$sealed)
  Move-Item -LiteralPath $temporary -Destination $Path
}

Set-Location (Join-Path $PSScriptRoot '..')
$project=(Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if($project -ne $ProjectRef){throw 'Linked project does not match requested backup project'}
$metadata=Invoke-BackupQuery "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name"
$tableParts=@();$countParts=@()
foreach($row in $metadata.RootElement.GetProperty('rows').EnumerateArray()) {
  $name=$row.GetProperty('table_name').GetString()
  if($name -notmatch '^[a-z_][a-z0-9_]*$'){throw 'Unsupported table name'}
  $tableParts+="'$name',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.`"$name`" t)"
  $countParts+="'$name',(select count(*) from public.`"$name`")"
}
$sql=@"
select jsonb_build_object(
 'format','labframe-backup-v2','at',now(),'project_ref','$ProjectRef',
 'tables',jsonb_build_object($($tableParts -join ',')),
 'counts',jsonb_build_object($($countParts -join ',')),
 'enums',(select jsonb_agg(jsonb_build_object('name',t.typname,'labels',(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid))) from pg_type t where t.typnamespace='public'::regnamespace and t.typtype='e'),
 'schema_columns',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))) from pg_class c join pg_namespace n on c.relnamespace=n.oid join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r'),
 'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public'),
 'constraints',(select jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid),'target',f.relname)) from pg_constraint c join pg_class r on c.conrelid=r.oid join pg_namespace n on r.relnamespace=n.oid left join pg_class f on c.confrelid=f.oid where n.nspname='public'),
 'functions',(select jsonb_agg(jsonb_build_object('name',proname,'definition',pg_get_functiondef(oid))) from pg_proc where pronamespace='public'::regnamespace and prokind='f'),
 'sequences',(select jsonb_agg(to_jsonb(s)) from pg_sequences s where schemaname='public'),
 'migrations',(select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations),
 'objects',(select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name,'version',version,'updated_at',updated_at,'bytes',metadata->>'size')),'[]'::jsonb) from storage.objects where bucket_id in ('photos','brand','results') and name not like '%/smile-pilot/%')
) as snapshot
"@
# All data subqueries share this one statement's MVCC snapshot.
$snapshot=Invoke-BackupQuery $sql
$root=$snapshot.RootElement.GetProperty('rows')[0].GetProperty('snapshot')
$plain=[Text.Encoding]::UTF8.GetBytes($root.GetRawText())
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$snapshotPath=Join-Path $resolvedOut "snapshot-$stamp.lfbackup"
Protect-BackupBytes $plain $snapshotPath
[Array]::Clear($plain,0,$plain.Length)
$copied=0;$reused=0;$failed=0;$totalBytes=0L
if($IncludeStorage) {
  $keyOutput=(& supabase projects api-keys --project-ref $ProjectRef --output json 2>$null) -join "`n"
  if($LASTEXITCODE -ne 0){throw 'Storage backup could not obtain project credentials'}
  $keys=$keyOutput|ConvertFrom-Json
  $credential=($keys|Where-Object {$_.name -eq 'service_role'}|Select-Object -First 1).api_key
  if(-not $credential){throw 'Storage backup service credential unavailable'}
  $keyOutput=$null;$keys=$null
  $objectDir=Join-Path $resolvedOut 'objects';[IO.Directory]::CreateDirectory($objectDir)|Out-Null
  $client=[Net.Http.HttpClient]::new();$client.Timeout=[TimeSpan]::FromSeconds(45)
  $client.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$credential)
  $client.DefaultRequestHeaders.TryAddWithoutValidation('apikey',$credential)|Out-Null
  try {
    $statistics=[Collections.Concurrent.ConcurrentBag[object]]::new()
    $root.GetProperty('objects').EnumerateArray() | ForEach-Object -Parallel {
      $object=$_;$objectDir=$using:objectDir;$ProjectRef=$using:ProjectRef;$client=$using:client
      $entropy=$using:entropy;$statistics=$using:statistics
      $bucket=$object.GetProperty('bucket').GetString();$name=$object.GetProperty('name').GetString()
      $version=$object.GetProperty('version').ToString();$updated=$object.GetProperty('updated_at').ToString()
      $identity=[Text.Encoding]::UTF8.GetBytes("$bucket/$name`n$version`n$updated")
      $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($identity)).ToLowerInvariant()
      $target=Join-Path $objectDir ($hash+'.lfobject')
      if(Test-Path -LiteralPath $target){$statistics.Add(@{state='reused';bytes=0});return}
      $encoded=($name.Split('/')|ForEach-Object {[Uri]::EscapeDataString($_)}) -join '/'
      try {
        $response=$client.GetAsync("https://$ProjectRef.supabase.co/storage/v1/object/$bucket/$encoded").GetAwaiter().GetResult()
        try {
          if(-not $response.IsSuccessStatusCode){throw 'Object unavailable'}
          if($response.Content.Headers.ContentLength -gt 21MB){throw 'Object exceeds backup limit'}
          $bytes=$response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
          if($bytes.Length -gt 21MB){throw 'Object exceeds backup limit'}
          $sealed=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
          $temporary=$target+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
          [IO.File]::WriteAllBytes($temporary,$sealed)
          Move-Item -LiteralPath $temporary -Destination $target
          $statistics.Add(@{state='copied';bytes=$bytes.Length})
          [Array]::Clear($bytes,0,$bytes.Length)
        }finally{$response.Dispose()}
      }catch{$statistics.Add(@{state='failed';bytes=0})}
      if($statistics.Count%200 -eq 0){Write-Output "Storage processed: $($statistics.Count)"}
    } -ThrottleLimit $Parallelism
    $copied=@($statistics|Where-Object {$_.state -eq 'copied'}).Count
    $reused=@($statistics|Where-Object {$_.state -eq 'reused'}).Count
    $failed=@($statistics|Where-Object {$_.state -eq 'failed'}).Count
    $totalBytes=($statistics|Measure-Object -Property bytes -Sum).Sum
  }finally{$client.Dispose();$credential=$null}
}
$counts=$root.GetProperty('counts').GetRawText()|ConvertFrom-Json -AsHashtable
$status=[ordered]@{at=[DateTime]::UtcNow.ToString('o');format='labframe-backup-v2';project=$ProjectRef;
  snapshot=[IO.Path]::GetFileName($snapshotPath);sha256=(Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256).Hash;
  rows=($counts.Values|Measure-Object -Sum).Sum;tables=$counts.Count;storageRequested=[bool]$IncludeStorage;
  copied=$copied;reused=$reused;failed=$failed;storageBytes=$totalBytes;smilePilotArchived=$false;portableRecovery=$false}
$status|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $resolvedOut 'status.json') -Encoding utf8
$metadata.Dispose();$snapshot.Dispose()
$status|ConvertTo-Json -Compress
if($failed){throw 'Database snapshot saved; some Storage objects were unavailable. Backup is incomplete.'}
