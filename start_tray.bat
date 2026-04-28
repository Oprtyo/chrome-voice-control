@echo off
cd /d "%~dp0"

:: Check for admin rights
net session >nul 2>&1
if errorlevel 1 (
    echo [*] Requesting admin rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [*] Starting Voice Control Server (tray mode, admin)...
pythonw server\tray_server.py %*
