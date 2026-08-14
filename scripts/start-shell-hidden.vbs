' Runs start-shell.cmd with the console hidden; the Electron HUD windows
' themselves are GUI windows and appear normally.
Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
shell.Run "cmd /c """ & here & "start-shell.cmd""", 0, False
