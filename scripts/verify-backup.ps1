param([string]$Snapshot,[switch]$IncludeStorage)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'This backup requires the original Windows account'}
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$entropy=[Text.Encoding]::UTF8.GetBytes('LabFrame backup v2')
if(-not $Snapshot){
 $latest=Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE 'Desktop\labframe-backups\encrypted-v2') -Filter '*.lfbackup' -File|Sort-Object LastWriteTime -Descending|Select-Object -First 1
 if(-not $latest){throw 'No encrypted snapshot found'}
 $Snapshot=$latest.FullName
}
$resolved=(Resolve-Path -LiteralPath $Snapshot).Path
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($resolved),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{
 $text=[Text.Encoding]::UTF8.GetString($bytes)
 # Plaintext only passes through process memory/stdin, never a disk file or command-line argument.
 $text|& node (Join-Path $PSScriptRoot 'validate-backup.mjs')
 if($LASTEXITCODE -ne 0){throw 'Restore validation failed'}
 if($IncludeStorage){
  $document=[Text.Json.JsonDocument]::Parse($text)
  $checked=0;$missing=0
  foreach($object in $document.RootElement.GetProperty('objects').EnumerateArray()){
   $bucket=$object.GetProperty('bucket').GetString();$name=$object.GetProperty('name').GetString()
   $version=$object.GetProperty('version').ToString();$updated=$object.GetProperty('updated_at').ToString()
   $identity=[Text.Encoding]::UTF8.GetBytes("$bucket/$name`n$version`n$updated")
   $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($identity)).ToLowerInvariant()
   $file=Join-Path (Split-Path -Parent $resolved) "objects\$hash.lfobject"
   if(-not(Test-Path -LiteralPath $file)){$missing++;continue}
   $content=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
   if($object.GetProperty('bytes').ValueKind -ne [Text.Json.JsonValueKind]::Null -and $content.Length -ne [long]$object.GetProperty('bytes').GetString()){throw 'Storage length mismatch'}
   [Array]::Clear($content,0,$content.Length);$checked++
  }
  $document.Dispose()
  @{storageValidation=if($missing){'incomplete'}else{'passed'};checked=$checked;missing=$missing}|ConvertTo-Json -Compress
  if($missing){throw 'Storage backup incomplete'}
 }
}finally{[Array]::Clear($bytes,0,$bytes.Length);$text=$null}
