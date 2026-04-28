let recognizerWindowId = null;
let targetTabId = null;
let targetWindowId = null;
let linkModeActive = false;
let cmdConfig = null;

async function loadConfig() {
  try {
    var url = chrome.runtime.getURL('config.json');
    var resp = await fetch(url);
    cmdConfig = await resp.json();
  } catch (e) {
    console.warn('[Voice Control] Failed to load config.json:', e);
    cmdConfig = {};
  }
  return cmdConfig;
}

loadConfig();

async function ensureOffscreen() {
  try {
    var exists = await chrome.offscreen.hasDocument();
    if (!exists) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['WEB_RTC'],
        justification: 'Persistent WebSocket connection to local voice server'
      });
    }
  } catch (e) {
    console.warn('[Voice Control] Offscreen error:', e);
  }
}

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'keepalive') {
    ensureOffscreen();
  }
});

ensureOffscreen();

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'ws-status') {
    chrome.storage.local.set({ serverConnected: message.connected });
    return false;
  }

  if (message.type === 'wake-detected') {
    console.log('[Voice Control] Wake word detected!');
    openRecognizerWindow();
    return false;
  }

  if (message.type === 'get-status') {
    chrome.storage.local.get('serverConnected', function(data) {
      sendResponse({ isConnected: !!data.serverConnected });
    });
    return true;
  }

  if (message.type === 'reconnect') {
    ensureOffscreen().then(function() {
      chrome.runtime.sendMessage({ type: 'ws-reconnect' }).catch(function() {});
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'voice-command') {
    handleVoiceCommand(message.command);
    closeRecognizerWindow();
    setTimeout(function() { targetTabId = null; targetWindowId = null; }, 2000);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'recognition-timeout') {
    sendToActiveTab({ action: 'show-feedback', text: 'Команда не распознана' });
    closeRecognizerWindow();
    targetTabId = null;
    targetWindowId = null;
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function openRecognizerWindow() {
  if (recognizerWindowId !== null) {
    chrome.windows.update(recognizerWindowId, { focused: true }).catch(function() {
      recognizerWindowId = null;
      createRecognizerWindow();
    });
    return;
  }
  createRecognizerWindow();
}

async function createRecognizerWindow() {
  try {
    var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0] && tabs[0].id) {
      targetTabId = tabs[0].id;
      targetWindowId = tabs[0].windowId;
    }
  } catch (e) {}

  sendToActiveTab({ action: 'show-feedback', text: 'Слушаю команду...' });

  chrome.windows.create({
    url: chrome.runtime.getURL('recognizer/recognizer.html'),
    type: 'normal',
    width: 300,
    height: 200,
    top: 60,
    focused: true
  }, function(win) {
    if (win) recognizerWindowId = win.id;
  });
}

chrome.windows.onRemoved.addListener(function(windowId) {
  if (windowId === recognizerWindowId) {
    recognizerWindowId = null;
  }
});

function closeRecognizerWindow() {
  if (recognizerWindowId !== null) {
    chrome.windows.remove(recognizerWindowId).catch(function() {});
    recognizerWindowId = null;
  }
}

async function getTargetTab() {
  if (targetTabId) {
    try {
      var tab = await chrome.tabs.get(targetTabId);
      if (tab) return tab;
    } catch (e) {}
  }
  try {
    var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]) return tabs[0];
  } catch (e) {}
  return null;
}

function sendKeyViaDebugger(tabId, key) {
  var target = { tabId: tabId };
  chrome.debugger.attach(target, '1.3', function() {
    if (chrome.runtime.lastError) {
      console.warn('[Voice Control] Debugger attach failed:', chrome.runtime.lastError.message);
      return;
    }
    var keyCode = key.toUpperCase().charCodeAt(0);
    chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: key,
      code: 'Key' + key.toUpperCase(),
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode
    }, function() {
      chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: key,
        code: 'Key' + key.toUpperCase(),
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode
      }, function() {
        setTimeout(function() {
          chrome.debugger.detach(target, function() {});
        }, 300);
      });
    });
  });
}

function parseNumber(text) {
  var direct = parseInt(text, 10);
  if (!isNaN(direct)) return direct;

  var words = {
    'один': 1, 'одна': 1, 'первый': 1, 'первая': 1, 'первое': 1,
    'два': 2, 'две': 2, 'второй': 2, 'вторая': 2, 'второе': 2,
    'три': 3, 'третий': 3, 'третья': 3, 'третье': 3,
    'четыре': 4, 'четвёртый': 4, 'четвертый': 4,
    'пять': 5, 'пятый': 5,
    'шесть': 6, 'шестой': 6,
    'семь': 7, 'седьмой': 7,
    'восемь': 8, 'восьмой': 8,
    'девять': 9, 'девятый': 9,
    'десять': 10, 'десятый': 10,
    'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13,
    'четырнадцать': 14, 'пятнадцать': 15, 'шестнадцать': 16,
    'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19,
    'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50
  };
  var w = text.toLowerCase().trim();
  if (words[w] !== undefined) return words[w];

  var parts = w.split(/\s+/);
  if (parts.length === 2 && words[parts[0]] !== undefined && words[parts[1]] !== undefined) {
    return words[parts[0]] + words[parts[1]];
  }
  return NaN;
}

function getCmds(group) {
  if (!cmdConfig || !cmdConfig.commands) return {};
  return cmdConfig.commands[group] || {};
}

function matchCmd(command, group) {
  var cmds = getCmds(group);
  return cmds[command] || null;
}

function matchPrefix(command, group) {
  var prefixes = getCmds(group);
  if (!Array.isArray(prefixes)) return null;
  for (var i = 0; i < prefixes.length; i++) {
    if (command.startsWith(prefixes[i] + ' ')) {
      return command.substring(prefixes[i].length + 1);
    }
  }
  return null;
}

function matchList(command, group) {
  var list = getCmds(group);
  if (!Array.isArray(list)) return false;
  return list.indexOf(command) !== -1;
}

async function handleVoiceCommand(raw) {
  if (!cmdConfig) await loadConfig();
  var command = raw.toLowerCase().trim();
  console.log('Voice command:', command);

  if (linkModeActive) {
    var num = parseNumber(command);
    if (!isNaN(num)) {
      sendToActiveTab({ action: 'click-link', number: num });
      linkModeActive = false;
      return;
    }
    if (command === 'отмена' || command === 'закрыть' || command === 'убрать') {
      sendToActiveTab({ action: 'hide-links' });
      linkModeActive = false;
      return;
    }
  }

  // Links
  var linkAction = matchCmd(command, 'links');
  if (linkAction === 'show-links') {
    sendToActiveTab({ action: 'show-links' });
    linkModeActive = true;
    return;
  }
  if (linkAction === 'hide-links') {
    sendToActiveTab({ action: 'hide-links' });
    linkModeActive = false;
    return;
  }

  // Tabs
  var tabAction = matchCmd(command, 'tabs');
  if (tabAction === 'new-tab') {
    try { chrome.tabs.create({ windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({}); }
    sendToActiveTab({ action: 'show-feedback', text: 'Новая вкладка' });
    return;
  }
  if (tabAction === 'close-tab') {
    var tab = await getTargetTab();
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch(e) {} }
    return;
  }
  if (tabAction === 'next-tab') { await switchTab(1); return; }
  if (tabAction === 'prev-tab') { await switchTab(-1); return; }

  // Navigation
  var navAction = matchCmd(command, 'navigation');
  if (navAction === 'go-back') { sendToActiveTab({ action: 'go-back' }); return; }
  if (navAction === 'go-forward') { sendToActiveTab({ action: 'go-forward' }); return; }
  if (navAction === 'reload') {
    var tab = await getTargetTab();
    if (tab) { try { await chrome.tabs.reload(tab.id); } catch(e) {} }
    sendToActiveTab({ action: 'show-feedback', text: 'Обновление' });
    return;
  }
  if (navAction === 'home') {
    var tab = await getTargetTab();
    if (tab) { try { await chrome.tabs.update(tab.id, { url: 'chrome://newtab' }); } catch(e) {} }
    return;
  }

  // Scroll
  var scrollAction = matchCmd(command, 'scroll');
  if (scrollAction === 'up' || scrollAction === 'down' || scrollAction === 'left' || scrollAction === 'right') {
    sendToActiveTab({ action: 'scroll', direction: scrollAction });
    return;
  }
  if (scrollAction === 'top' || scrollAction === 'bottom') {
    sendToActiveTab({ action: 'scroll-to', position: scrollAction });
    return;
  }

  // Zoom
  var zoomAction = matchCmd(command, 'zoom');
  if (zoomAction === 'zoom-in') {
    var tab = await getTargetTab();
    if (tab) { try { var z = await chrome.tabs.getZoom(tab.id); await chrome.tabs.setZoom(tab.id, Math.min(z + 0.25, 5)); } catch(e) {} }
    return;
  }
  if (zoomAction === 'zoom-out') {
    var tab = await getTargetTab();
    if (tab) { try { var z = await chrome.tabs.getZoom(tab.id); await chrome.tabs.setZoom(tab.id, Math.max(z - 0.25, 0.25)); } catch(e) {} }
    return;
  }

  // Search
  var searchQuery = matchPrefix(command, 'search_prefix');
  if (searchQuery) {
    try { chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(searchQuery), windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(searchQuery) }); }
    return;
  }

  // Launch browser
  if (matchList(command, 'launch_browser')) {
    chrome.runtime.sendMessage({ type: 'ws-send', data: { type: 'launch-browser' } }).catch(function() {});
    sendToActiveTab({ action: 'show-feedback', text: 'Запуск браузера...' });
    return;
  }

  // Open site
  var openTarget = matchPrefix(command, 'open_prefix');
  if (openTarget) {
    if (openTarget === 'новую вкладку' || openTarget === 'новая вкладка') {
      try { chrome.tabs.create({ windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({}); }
      return;
    }
    var url = openTarget;
    if (!url.includes('.')) {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(openTarget);
    } else if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    try { chrome.tabs.create({ url: url, windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({ url: url }); }
    return;
  }

  // VPN
  var vpnAction = matchCmd(command, 'vpn');
  if (vpnAction === 'vpn-on') {
    chrome.runtime.sendMessage({ type: 'ws-send', data: { type: 'vpn-on' } }).catch(function() {});
    sendToActiveTab({ action: 'show-feedback', text: 'VPN включается...' });
    return;
  }
  if (vpnAction === 'vpn-off') {
    chrome.runtime.sendMessage({ type: 'ws-send', data: { type: 'vpn-off' } }).catch(function() {});
    sendToActiveTab({ action: 'show-feedback', text: 'VPN выключается...' });
    return;
  }

  // Fullscreen
  var fsAction = matchCmd(command, 'fullscreen');
  if (fsAction === 'fullscreen') {
    var fsTab = await getTargetTab();
    if (fsTab) {
      try {
        await chrome.windows.update(fsTab.windowId, { focused: true });
        await chrome.tabs.update(fsTab.id, { active: true });
      } catch(e) {}
      sendKeyViaDebugger(fsTab.id, 'f');
    }
    return;
  }

  // Click
  var clickAction = matchCmd(command, 'click');
  if (clickAction === 'click') {
    sendToActiveTab({ action: 'click' });
    return;
  }

  if (linkModeActive) {
    var num = parseNumber(command);
    if (!isNaN(num)) {
      sendToActiveTab({ action: 'click-link', number: num });
      linkModeActive = false;
      return;
    }
  }

  sendToActiveTab({ action: 'show-feedback', text: '"' + raw + '"' });
}

async function switchTab(direction) {
  try {
    var wId = targetWindowId || undefined;
    var tabs;
    if (wId) {
      tabs = await chrome.tabs.query({ windowId: wId });
    } else {
      tabs = await chrome.tabs.query({ currentWindow: true });
    }
    var activeTab = tabs.find(function(t) { return t.active; });
    if (!activeTab) return;
    var idx = tabs.indexOf(activeTab);
    var newIdx = (idx + direction + tabs.length) % tabs.length;
    await chrome.tabs.update(tabs[newIdx].id, { active: true });
  } catch (e) {}
}

async function sendToActiveTab(message) {
  try {
    var tabId = targetTabId;
    if (!tabId) {
      var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome://') && !tabs[0].url.startsWith('chrome-extension://')) {
        tabId = tabs[0].id;
      }
    }
    if (tabId) {
      await chrome.tabs.sendMessage(tabId, message).catch(function() {});
    }
  } catch (e) {}
}
