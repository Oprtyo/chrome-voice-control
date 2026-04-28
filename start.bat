@echo off
echo [*] Starting Voice Control Server...
echo [*] Say "Okey brauzer" to activate
echo [*] Ctrl+C to stop
echo [*] For tray mode use: start_tray.bat
echo.
python server\voice_server.py
pause
