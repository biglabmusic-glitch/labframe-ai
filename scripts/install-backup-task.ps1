# Runs only while the owner is logged on; it is not an independent server backup.
$ErrorActionPreference='Stop'
$script=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-backup.ps1')).Path
$pwsh=(Get-Command pwsh).Source
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$script+'"'
$action=New-ScheduledTaskAction -Execute $pwsh -Argument $arguments
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddHours(1) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$task=New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Encrypted LabFrame backup; database restore check, daily Storage verification. Requires this Windows account and CLI login.'
Register-ScheduledTask -TaskName 'LabFrame encrypted backup' -InputObject $task -Force|Select-Object TaskName,State
