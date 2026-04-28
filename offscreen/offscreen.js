const WS_URL = 'ws://localhost:9876';
let ws = null;
let reconnectTimer = null;
let pingTimer = null;

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    notifyStatus(false);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[Offscreen] Connected');
    notifyStatus(true);
    startPing();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'wake') {
        chrome.runtime.sendMessage({ type: 'wake-detected' }).catch(() => {});
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    ws = null;
    notifyStatus(false);
    stopPing();
    scheduleReconnect();
  };

  ws.onerror = () => {};
}

function notifyStatus(connected) {
  chrome.runtime.sendMessage({ type: 'ws-status', connected }).catch(() => {});
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send('ping'); } catch (e) {}
    }
  }, 15000);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ws-reconnect') {
    connectWebSocket();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'ws-get-status') {
    const connected = ws && ws.readyState === WebSocket.OPEN;
    sendResponse({ connected });
    return true;
  }
  if (message.type === 'ws-send') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(message.data)); } catch (e) {}
    }
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

connectWebSocket();
