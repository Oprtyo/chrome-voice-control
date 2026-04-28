@echo off
cd /d "%~dp0"
echo ========================================
echo  Voice Control - Installation
echo ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [!] Python not found. Download: https://www.python.org/downloads/
    echo     Check "Add Python to PATH" during install
    pause
    exit /b 1
)

echo [1/2] Installing Python dependencies...
pip install -r server\requirements.txt
if errorlevel 1 (
    echo [!] Failed to install dependencies
    pause
    exit /b 1
)

if not exist "server\model" (
    echo [2/2] Downloading Vosk Russian model (~45 MB)...
    python -c "import urllib.request, zipfile, os; print('Downloading...'); urllib.request.urlretrieve('https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip', 'vosk-model.zip'); print('Extracting...'); zipfile.ZipFile('vosk-model.zip').extractall('server'); os.rename('server\\vosk-model-small-ru-0.22', 'server\\model'); os.remove('vosk-model.zip'); print('Done!')"
    if errorlevel 1 (
        echo [!] Failed to download model. Download manually:
        echo     https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip
        echo     Extract to: server\model
        pause
        exit /b 1
    )
) else (
    echo [2/2] Model already installed
)

echo.
echo ========================================
echo  Installation complete!
echo ========================================
echo.
echo To start: run start.bat
echo.
pause
