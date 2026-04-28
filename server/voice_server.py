#!/usr/bin/env python3
"""
Voice Control Server — локальное распознавание wake-фразы "Окей браузер".
Слушает микрофон через Vosk (офлайн), при обнаружении wake-фразы
отправляет сигнал в Chrome-расширение через WebSocket.
Распознавание команд выполняется в Chrome через Google Web Speech API.
"""

import asyncio
import json
import os
import sys
import queue
import subprocess
import platform

import pyaudio
import websockets
from vosk import Model, KaldiRecognizer, SetLogLevel

SetLogLevel(-1)

WAKE_PHRASE = "окей гугл"
LAUNCH_PHRASE = "открой браузер"
SAMPLE_RATE = 16000
BLOCK_SIZE = 4000
WS_PORT = 9876

# Chrome launch config
CHROME_PATH = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
CHROME_PROFILE = 'Profile 1'

# Поиск модели
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATHS = [
    os.path.join(SCRIPT_DIR, "model"),
    os.path.join(SCRIPT_DIR, "vosk-model-small-ru-0.22"),
    os.path.join(SCRIPT_DIR, "..", "model"),
]

model = None
for path in MODEL_PATHS:
    if os.path.isdir(path):
        model = Model(path)
        print(f"[*] Модель загружена: {path}")
        break

if model is None:
    print("[!] Модель Vosk не найдена. Скачайте модель:")
    print("    https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip")
    print(f"    Распакуйте в папку: {os.path.join(SCRIPT_DIR, 'model')}")
    sys.exit(1)

audio_queue = queue.Queue()
connected_clients = set()


def audio_callback(in_data, frame_count, time_info, status):
    audio_queue.put(in_data)
    return (None, pyaudio.paContinue)


async def broadcast(message):
    data = json.dumps(message)
    disconnected = set()
    for ws in list(connected_clients):
        try:
            await ws.send(data)
        except websockets.exceptions.ConnectionClosed:
            disconnected.add(ws)
    connected_clients.difference_update(disconnected)


def launch_browser():
    """Launch Chrome with the configured profile."""
    try:
        chrome_path = CHROME_PATH
        # Try to find Chrome if default path doesn't exist
        if not os.path.isfile(chrome_path):
            if platform.system() == 'Windows':
                for p in [
                    os.path.expandvars(r'%ProgramFiles%\Google\Chrome\Application\chrome.exe'),
                    os.path.expandvars(r'%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe'),
                    os.path.expandvars(r'%LocalAppData%\Google\Chrome\Application\chrome.exe'),
                ]:
                    if os.path.isfile(p):
                        chrome_path = p
                        break
            elif platform.system() == 'Darwin':
                chrome_path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            else:
                chrome_path = 'google-chrome'

        args = [chrome_path]
        if CHROME_PROFILE:
            args.append(f'--profile-directory={CHROME_PROFILE}')

        print(f'[*] Launching Chrome: {" ".join(args)}')
        subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('[*] Chrome launched')
    except Exception as e:
        print(f'[!] Failed to launch Chrome: {e}')


def focus_chrome_window():
    """Focus the Chrome window before sending key press."""
    if platform.system() == 'Windows':
        try:
            import ctypes
            user32 = ctypes.windll.user32

            def enum_callback(hwnd, results):
                if user32.IsWindowVisible(hwnd):
                    length = user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        buf = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, buf, length + 1)
                        if 'Chrome' in buf.value or 'Google Chrome' in buf.value:
                            results.append(hwnd)
                return True

            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int))
            results = []
            user32.EnumWindows(WNDENUMPROC(enum_callback), 0)
            if results:
                hwnd = results[0]
                user32.SetForegroundWindow(hwnd)
                return True
        except Exception as e:
            print(f'[!] Failed to focus Chrome: {e}')
    return False


def press_key_native(key):
    """Simulate a real key press at OS level."""
    if not key:
        return
    try:
        import keyboard
        import time
        focus_chrome_window()
        time.sleep(0.5)
        keyboard.press_and_release(key)
        print(f'[*] Key pressed: {key}')
    except ImportError:
        print('[!] keyboard library not installed. Run: pip install keyboard')
    except Exception as e:
        print(f'[!] Failed to press key: {e}')


async def handle_client(websocket):
    connected_clients.add(websocket)
    addr = websocket.remote_address
    print(f"[+] Подключён клиент: {addr}")
    await websocket.send(json.dumps({"type": "connected", "wake_phrase": WAKE_PHRASE}))
    try:
        async for message in websocket:
            if message == 'ping':
                continue
            try:
                data = json.loads(message)
                if data.get('type') == 'launch-browser':
                    launch_browser()
                elif data.get('action') == 'press-key':
                    press_key_native(data.get('key', ''))
            except (json.JSONDecodeError, KeyError):
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[-] Отключён клиент: {addr}")


def normalize(text):
    return " ".join(text.lower().strip().split())


async def handle_detected_phrase(text):
    """Handle detected wake/launch phrases."""
    if LAUNCH_PHRASE in text:
        print(f'[!] Обнаружена фраза: "{LAUNCH_PHRASE}"')
        launch_browser()
        return True
    if WAKE_PHRASE in text:
        print(f'[!] Обнаружена фраза: "{WAKE_PHRASE}"')
        await broadcast({"type": "wake"})
        return True
    return False


async def recognition_loop():
    rec = KaldiRecognizer(model, SAMPLE_RATE)
    rec.SetWords(False)

    print(f'[*] Wake-phrases:')
    print(f'[*]   "{WAKE_PHRASE}" -> voice commands via Chrome')
    print(f'[*]   "{LAUNCH_PHRASE}" -> launch Chrome')

    while True:
        try:
            data = audio_queue.get(timeout=0.1)
        except queue.Empty:
            await asyncio.sleep(0.01)
            continue

        if rec.AcceptWaveform(data):
            result = json.loads(rec.Result())
            text = normalize(result.get("text", ""))

            if text and await handle_detected_phrase(text):
                rec = KaldiRecognizer(model, SAMPLE_RATE)
        else:
            partial = json.loads(rec.PartialResult())
            partial_text = normalize(partial.get("partial", ""))
            if await handle_detected_phrase(partial_text):
                rec = KaldiRecognizer(model, SAMPLE_RATE)


async def main():
    import argparse
    parser = argparse.ArgumentParser(description='Voice Control Server')
    parser.add_argument('--device', '-d', type=int, default=None,
                        help='Audio input device index (see list below)')
    parser.add_argument('--list-devices', '-l', action='store_true',
                        help='List audio devices and exit')
    args = parser.parse_args()

    pa = pyaudio.PyAudio()

    print("\n[*] Audio input devices:")
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info["maxInputChannels"] > 0:
            marker = " <--" if args.device == i else ""
            print(f"    [{i}] {info['name']}{marker}")

    if args.list_devices:
        pa.terminate()
        return

    open_kwargs = dict(
        format=pyaudio.paInt16,
        channels=1,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=BLOCK_SIZE,
        stream_callback=audio_callback,
    )
    if args.device is not None:
        open_kwargs['input_device_index'] = args.device
        dev_name = pa.get_device_info_by_index(args.device)['name']
        print(f"\n[*] Using device [{args.device}]: {dev_name}")
    else:
        print(f"\n[*] Using default input device")

    stream = pa.open(**open_kwargs)
    stream.start_stream()
    print(f'[*] Say "{WAKE_PHRASE}" to activate')
    print(f"[*] Commands recognized via Google Speech API in Chrome")
    print(f"[*] WebSocket server: ws://localhost:{WS_PORT}")
    print(f"[*] Tip: use --device N to select a specific microphone")
    print()

    async with websockets.serve(handle_client, "localhost", WS_PORT):
        await recognition_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Stopped")
