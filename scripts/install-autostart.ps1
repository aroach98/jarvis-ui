# Registers the always-on pieces on THIS machine (ROADMAP Phase 5):
#   JarvisCore  - headless service, hidden console, restarts on failure
#   JarvisShell - fullscreen HUD, starts after core, restarts on failure
#   Murmur      - Startup-folder shortcut for the tray app (serves STT)
# Re-run any time; it replaces existing registrations. Remove with:
#   Unregister-ScheduledTask JarvisCore, JarvisShell; delete the Startup .lnk
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$coreAction = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$repo\scripts\start-core-hidden.vbs`"" -WorkingDirectory $repo
$coreTrigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName 'JarvisCore' -Action $coreAction -Trigger $coreTrigger -Settings $settings -Principal $principal -Force | Out-Null

$shellAction = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$repo\scripts\start-shell-hidden.vbs`"" -WorkingDirectory $repo
$shellTrigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$shellTrigger.Delay = 'PT25S'   # let core + Murmur come up first (shell reconnects regardless)
Register-ScheduledTask -TaskName 'JarvisShell' -Action $shellAction -Trigger $shellTrigger -Settings $settings -Principal $principal -Force | Out-Null

# Murmur tray app (dictation hotkey + the STT server jarvis-core uses)
$murmurExe = "$HOME\Murmur\publish\Murmur.exe"
if (Test-Path $murmurExe) {
  $startup = [Environment]::GetFolderPath('Startup')
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut("$startup\Murmur.lnk")
  $lnk.TargetPath = $murmurExe
  $lnk.WorkingDirectory = Split-Path $murmurExe
  $lnk.Save()
  Write-Host "Murmur startup shortcut created"
} else {
  Write-Warning "Murmur publish exe not found at $murmurExe - startup shortcut skipped"
}

Write-Host "Registered: JarvisCore + JarvisShell (at logon, restart x3 on failure)"
