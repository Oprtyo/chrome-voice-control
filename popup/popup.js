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
