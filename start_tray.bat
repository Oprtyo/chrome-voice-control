@echo off
cd /d "%~dp0"
echo [*] Starting Voice Control Server (tray mode)...
pythonw server\tray_server.py %*
