$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
$root=Join-Path $env:USERPROFILE 'Desktop\labframe-backups\encrypted-v2'
try{
 & (Join-Path $PSScriptRoot 'backup-data.ps1') -IncludeStorage -Parallelism 8
 & (Join-Path $PSScriptRoot 'verify-backup.ps1')
 $full=$true
 $lastFile=Join-Path $root 'storage-verified.json'
 if(Test-Path -LiteralPath $lastFile){
  $last=Get-Content -LiteralPath $lastFile -Raw|ConvertFrom-Json
  # PowerShell 7.5 deserializes ISO JSON dates as DateTime; avoid a
  # culture-dependent DateTime -> string -> DateTimeOffset conversion.
  $verifiedAt=if($last.at -is [DateTime]){[DateTimeOffset]$last.at}else{
   [DateTimeOffset]::Parse($last.at,[Globalization.CultureInfo]::InvariantCulture)
  }
  $full=([DateTimeOffset]::UtcNow-$verifiedAt).TotalHours -ge 24
 }
 if($full){
  & (Join-Path $PSScriptRoot 'verify-backup.ps1') -IncludeStorage
  & (Join-Path $PSScriptRoot 'register-backup.ps1') -DataVerified -StorageVerified
 }else{& (Join-Path $PSScriptRoot 'register-backup.ps1') -DataVerified}
 $errorFile=Join-Path $root 'last-error.json'
 if(Test-Path -LiteralPath $errorFile){Remove-Item -LiteralPath $errorFile}
}catch{
 @{at=[DateTime]::UtcNow.ToString('o');error='backup_or_verification_failed'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'last-error.json') -Encoding utf8
 throw 'Backup failed; inspect authenticated CLI access and local disk. No record contents are logged.'
}
