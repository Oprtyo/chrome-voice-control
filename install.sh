#!/bin/bash
echo "========================================"
echo " Установка Voice Control для Chrome"
echo "========================================"
echo

# Проверка Python
if ! command -v python3 &> /dev/null; then
    echo "[!] Python3 не найден. Установите:"
    echo "    Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "    macOS: brew install python3"
    exit 1
fi

# Установка portaudio (для PyAudio)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "[0/2] Установка системных зависимостей..."
    sudo apt-get install -y portaudio19-dev python3-pyaudio 2>/dev/null || true
elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "[0/2] Установка системных зависимостей..."
    brew install portaudio 2>/dev/null || true
fi

# Установка Python зависимостей
echo "[1/2] Установка Python-зависимостей..."
pip3 install -r server/requirements.txt
if [ $? -ne 0 ]; then
    echo "[!] Ошибка установки зависимостей"
    exit 1
fi

# Скачивание модели
if [ ! -d "server/model" ]; then
    echo "[2/2] Скачивание модели Vosk для русского языка (~45 МБ)..."
    cd server
    wget -q --show-progress https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -O vosk-model.zip \
        || curl -L -o vosk-model.zip https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip
    unzip -q vosk-model.zip
    mv vosk-model-small-ru-0.22 model
    rm vosk-model.zip
    cd ..
    echo "Модель загружена!"
else
    echo "[2/2] Модель уже установлена"
fi

echo
echo "========================================"
echo " Установка завершена!"
echo "========================================"
echo
echo "Для запуска: ./start.sh"
