const statusBlock = document.getElementById('statusBlock');
const statusText = document.getElementById('statusText');
const hintEl = document.getElementById('hint');
const reconnectBtn = document.getElementById('reconnectBtn');
const wakeInfo = document.getElementById('wakeInfo');

function updateUI(connected) {
  if (connected) {
    statusBlock.className = 'status-block connected';
    statusText.textContent = 'Сервер подключён — слушаю';
    hintEl.style.display = 'none';
    reconnectBtn.style.display = 'none';
    wakeInfo.style.display = 'block';
  } else {
    statusBlock.className = 'status-block disconnected';
    statusText.textContent = 'Сервер не подключён';
    hintEl.style.display = 'block';
    reconnectBtn.style.display = 'block';
    wakeInfo.style.display = 'none';
  }
}

// Читаем статус напрямую из storage
chrome.storage.local.get('serverConnected', (data) => {
  updateUI(!!data.serverConnected);
});

// Обновляем при изменении
chrome.storage.onChanged.addListener((changes) => {
  if (changes.serverConnected) {
    updateUI(changes.serverConnected.newValue);
  }
});

reconnectBtn.addEventListener('click', () => {
  reconnectBtn.textContent = 'Подключаюсь...';
  chrome.runtime.sendMessage({ type: 'reconnect' }, () => {
    setTimeout(() => {
      chrome.storage.local.get('serverConnected', (data) => {
        updateUI(!!data.serverConnected);
        reconnectBtn.textContent = 'Переподключиться';
      });
    }, 2000);
  });
});

// Debug panel
const debugToggle = document.getElementById('debugToggle');
const debugPanel = document.getElementById('debugPanel');
const debugInput = document.getElementById('debugInput');
const debugSend = document.getElementById('debugSend');
const debugLog = document.getElementById('debugLog');

debugToggle.addEventListener('change', () => {
  debugPanel.style.display = debugToggle.checked ? 'block' : 'none';
  if (debugToggle.checked) {
    debugInput.focus();
  }
});

function sendDebugCommand() {
  const cmd = debugInput.value.trim();
  if (!cmd) return;

  const isFullscreen = /на весь экран|полный экран|фулскрин|разверни/.test(cmd.toLowerCase());

  addLog('> ' + cmd, 'log-cmd');
  chrome.runtime.sendMessage({ type: 'voice-command', command: cmd }, (resp) => {
    if (resp && resp.ok) {
      addLog('OK', 'log-ok');
    }
  });
  debugInput.value = '';

  if (isFullscreen) {
    setTimeout(() => window.close(), 300);
  } else {
    debugInput.focus();
  }
}

function addLog(text, cls) {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + (cls || '');
  entry.textContent = text;
  debugLog.prepend(entry);
  if (debugLog.children.length > 20) {
    debugLog.removeChild(debugLog.lastChild);
  }
}

debugSend.addEventListener('click', sendDebugCommand);
debugInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendDebugCommand();
});
