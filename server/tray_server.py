#!/usr/bin/env python3
"""
Voice Control Tray Server — запускает voice_server.py в фоне
с иконкой в системном трее для управления.
"""

import subprocess
import sys
import os
import threading

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_SCRIPT = os.path.join(SCRIPT_DIR, "voice_server.py")

server_process = None
status_text = "Starting..."


def get_icon_image():
    """Create a simple microphone icon."""
    try:
        from PIL import Image, ImageDraw
        img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # Microphone body
        draw.rounded_rectangle([22, 8, 42, 38], radius=10, fill='#4CAF50')
        # Microphone stand
        draw.arc([16, 20, 48, 50], start=0, end=180, fill='#4CAF50', width=3)
        draw.line([32, 50, 32, 58], fill='#4CAF50', width=3)
        draw.line([22, 58, 42, 58], fill='#4CAF50', width=3)
        return img
    except Exception:
        from PIL import Image
        return Image.new('RGBA', (64, 64), (76, 175, 80, 255))


def get_icon_image_off():
    """Create a red icon for stopped state."""
    try:
        from PIL import Image, ImageDraw
        img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle([22, 8, 42, 38], radius=10, fill='#F44336')
        draw.arc([16, 20, 48, 50], start=0, end=180, fill='#F44336', width=3)
        draw.line([32, 50, 32, 58], fill='#F44336', width=3)
        draw.line([22, 58, 42, 58], fill='#F44336', width=3)
        # X mark
        draw.line([10, 10, 54, 54], fill='#F44336', width=4)
        draw.line([54, 10, 10, 54], fill='#F44336', width=4)
        return img
    except Exception:
        from PIL import Image
        return Image.new('RGBA', (64, 64), (244, 67, 54, 255))


def start_server():
    global server_process, status_text
    if server_process and server_process.poll() is None:
        return

    args = [sys.executable, SERVER_SCRIPT]
    # Pass through command line arguments (e.g. --device)
    if len(sys.argv) > 1:
        args.extend(sys.argv[1:])

    try:
        server_process = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
            cwd=SCRIPT_DIR
        )
        status_text = "Running (PID: {})".format(server_process.pid)
        print("[*] Server started, PID:", server_process.pid)
    except Exception as e:
        status_text = "Error: {}".format(str(e))
        print("[!] Failed to start server:", e)


def stop_server():
    global server_process, status_text
    if server_process and server_process.poll() is None:
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()
        print("[*] Server stopped")
    server_process = None
    status_text = "Stopped"


def restart_server():
    stop_server()
    start_server()


def on_quit(icon):
    stop_server()
    icon.stop()


def setup_tray():
    import pystray
    from pystray import MenuItem, Menu

    icon = pystray.Icon(
        "VoiceControl",
        get_icon_image(),
        "Voice Control Server",
        menu=Menu(
            MenuItem(lambda item: status_text, None, enabled=False),
            Menu.SEPARATOR,
            MenuItem("Restart server", lambda: restart_server()),
            MenuItem("Stop server", lambda: stop_server()),
            MenuItem("Start server", lambda: start_server()),
            Menu.SEPARATOR,
            MenuItem("Quit", lambda: on_quit(icon)),
        )
    )

    # Monitor server process and update icon
    def monitor():
        import time
        while icon.visible:
            if server_process and server_process.poll() is not None:
                global status_text
                status_text = "Stopped (exited)"
                try:
                    icon.icon = get_icon_image_off()
                except Exception:
                    pass
            elif server_process and server_process.poll() is None:
                try:
                    icon.icon = get_icon_image()
                except Exception:
                    pass
            time.sleep(2)

    monitor_thread = threading.Thread(target=monitor, daemon=True)
    monitor_thread.start()

    return icon


def main():
    start_server()
    icon = setup_tray()
    icon.run()


if __name__ == "__main__":
    main()
