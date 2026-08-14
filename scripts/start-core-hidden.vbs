' Runs start-core.cmd with no console window (autostart aesthetics only).
Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
shell.Run "cmd /c """ & here & "start-core.cmd""", 0, False
