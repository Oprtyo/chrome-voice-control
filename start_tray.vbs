Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("Shell.Application")
shell.ShellExecute "pythonw.exe", """" & scriptDir & "\server\tray_server.py""", scriptDir, "runas", 0
