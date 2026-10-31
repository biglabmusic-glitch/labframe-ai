param([string]$Snapshot,[switch]$DataVerified,[switch]$StorageVerified)
$ErrorActionPreference='Stop'
$root=Join-Path $env:USERPROFILE 'Desktop\labframe-backups\encrypted-v2'
$status=Get-Content -LiteralPath (Join-Path $root 'status.json') -Raw|ConvertFrom-Json
if(-not $Snapshot){$Snapshot=Join-Path $root $status.snapshot}
$hash=(Get-FileHash -LiteralPath $Snapshot -Algorithm SHA256).Hash
if($hash -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid backup hash'}
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Snapshot),[Text.Encoding]::UTF8.GetBytes('LabFrame backup v2'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{
 $document=[Text.Json.JsonDocument]::Parse([Text.Encoding]::UTF8.GetString($bytes))
 if($document.RootElement.GetProperty('project_ref').GetString() -ne 'mmegdmfmozgaycuyeacl'){throw 'Unexpected backup project'}
 $at=[DateTimeOffset]::Parse($document.RootElement.GetProperty('at').GetString()).ToString('o')
 $count=$document.RootElement.GetProperty('objects').GetArrayLength()
 $document.Dispose()
}finally{[Array]::Clear($bytes,0,$bytes.Length)}
$stored=if($status.storageRequested -and $status.failed -eq 0){'true'}else{'false'}
$dataOk=if($DataVerified){'true'}else{'false'}
$filesOk=if($StorageVerified){'true'}else{'false'}
$sql=@"
insert into public.backup_runs(snapshot_at,sha256,row_count,table_count,storage_objects,storage_included,data_verified,storage_verified,portable_recovery)
 values('$at','$hash',$([long]$status.rows),$([int]$status.tables),$count,$stored,$dataOk,$filesOk,false)
 on conflict(sha256) do update set data_verified=public.backup_runs.data_verified or excluded.data_verified,
 storage_verified=public.backup_runs.storage_verified or excluded.storage_verified;
"@
Set-Location (Join-Path $PSScriptRoot '..')
$result=(& supabase db query --linked --output json $sql 2>$null) -join "`n"
if($LASTEXITCODE -ne 0){throw 'Backup metadata registration failed'}
if($StorageVerified){@{at=[DateTime]::UtcNow.ToString('o');sha256=$hash}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'storage-verified.json') -Encoding utf8}
@{backupRecorded=$true;dataVerified=[bool]$DataVerified;storageVerified=[bool]$StorageVerified}|ConvertTo-Json -Compress
