' On-demand launcher: starts jarvis-core then jarvis-shell (hidden consoles),
' for manually reopening Jarvis after it's been closed. For start-at-login,
' see install-autostart.ps1 instead.
Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
shell.Run "wscript.exe """ & here & "start-core-hidden.vbs""", 0, False
WScript.Sleep 8000
shell.Run "wscript.exe """ & here & "start-shell-hidden.vbs""", 0, False
