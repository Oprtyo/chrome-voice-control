let recognizerWindowId = null;
let targetTabId = null;
let targetWindowId = null;
let linkModeActive = false;

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

async function handleVoiceCommand(raw) {
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

  if (command === 'выбрать ссылку' || command === 'выбери ссылку' || command === 'ссылки' || command === 'покажи ссылки' || command === 'показать ссылки') {
    sendToActiveTab({ action: 'show-links' });
    linkModeActive = true;
    return;
  }

  if (command === 'убрать ссылки' || command === 'скрыть ссылки' || command === 'убрать номера' || command === 'скрыть номера') {
    sendToActiveTab({ action: 'hide-links' });
    linkModeActive = false;
    return;
  }

  if (command === 'новая вкладка' || command === 'новая страница') {
    try { chrome.tabs.create({ windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({}); }
    sendToActiveTab({ action: 'show-feedback', text: 'Новая вкладка' });
    return;
  }
  if (command === 'закрыть вкладку' || command === 'закрыть страницу' || command === 'закрой вкладку') {
    var tab = await getTargetTab();
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch(e) {} }
    return;
  }
  if (command === 'следующая вкладка') {
    await switchTab(1);
    return;
  }
  if (command === 'предыдущая вкладка') {
    await switchTab(-1);
    return;
  }

  if (command === 'назад') {
    sendToActiveTab({ action: 'go-back' });
    return;
  }
  if (command === 'вперёд' || command === 'вперед') {
    sendToActiveTab({ action: 'go-forward' });
    return;
  }
  if (command === 'обновить' || command === 'обновить страницу' || command === 'перезагрузить' || command === 'обнови') {
    var tab = await getTargetTab();
    if (tab) { try { await chrome.tabs.reload(tab.id); } catch(e) {} }
    sendToActiveTab({ action: 'show-feedback', text: 'Обновление' });
    return;
  }
  if (command === 'домой' || command === 'на главную') {
    var tab = await getTargetTab();
    if (tab) { try { await chrome.tabs.update(tab.id, { url: 'chrome://newtab' }); } catch(e) {} }
    return;
  }

  if (command === 'вниз' || command === 'прокрути вниз') {
    sendToActiveTab({ action: 'scroll', direction: 'down' });
    return;
  }
  if (command === 'вверх' || command === 'наверх' || command === 'прокрути вверх') {
    sendToActiveTab({ action: 'scroll', direction: 'up' });
    return;
  }
  if (command === 'в начало' || command === 'в самый верх') {
    sendToActiveTab({ action: 'scroll-to', position: 'top' });
    return;
  }
  if (command === 'в конец' || command === 'в самый низ' || command === 'прокрути в конец' || command === 'конец') {
    sendToActiveTab({ action: 'scroll-to', position: 'bottom' });
    return;
  }
  if (command === 'влево' || command === 'прокрути влево') {
    sendToActiveTab({ action: 'scroll', direction: 'left' });
    return;
  }
  if (command === 'вправо' || command === 'прокрути вправо') {
    sendToActiveTab({ action: 'scroll', direction: 'right' });
    return;
  }

  if (command === 'увеличить' || command === 'приблизить') {
    var tab = await getTargetTab();
    if (tab) { try { var z = await chrome.tabs.getZoom(tab.id); await chrome.tabs.setZoom(tab.id, Math.min(z + 0.25, 5)); } catch(e) {} }
    return;
  }
  if (command === 'уменьшить' || command === 'отдалить') {
    var tab = await getTargetTab();
    if (tab) { try { var z = await chrome.tabs.getZoom(tab.id); await chrome.tabs.setZoom(tab.id, Math.max(z - 0.25, 0.25)); } catch(e) {} }
    return;
  }

  if (command.startsWith('найди ') || command.startsWith('поиск ') || command.startsWith('найти ')) {
    var query = command.replace(/^(найди|поиск|найти)\s+/, '');
    try { chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(query), windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({ url: 'https://www.google.com/search?q=' + encodeURIComponent(query) }); }
    return;
  }

  if (command === 'открой браузер' || command === 'открыть браузер' || command === 'запусти браузер' || command === 'запустить браузер') {
    chrome.runtime.sendMessage({ type: 'ws-send', data: { type: 'launch-browser' } }).catch(function() {});
    sendToActiveTab({ action: 'show-feedback', text: 'Запуск браузера...' });
    return;
  }

  if (command.startsWith('открой ') || command.startsWith('открыть ')) {
    var site = command.replace(/^(открой|открыть)\s+/, '');
    var url = site;
    if (site === 'новую вкладку' || site === 'новая вкладка') {
      try { chrome.tabs.create({ windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({}); }
      return;
    }
    if (!url.includes('.')) {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(site);
    } else if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    try { chrome.tabs.create({ url: url, windowId: targetWindowId || undefined }); } catch(e) { chrome.tabs.create({ url: url }); }
    return;
  }

  if (command === 'на весь экран' || command === 'разверни на весь экран' || command === 'полный экран' || command === 'фулскрин') {
    var fsTab = await getTargetTab();
    if (fsTab) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: fsTab.id },
          func: function() {
            if (document.fullscreenElement) {
              document.exitFullscreen();
              return;
            }
            // YouTube: double-click on video to toggle fullscreen
            var video = document.querySelector('.html5-video-player video');
            if (video) {
              video.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
              return;
            }
            // Other players: try fullscreen buttons
            var selectors = [
              'button[aria-label*="fullscreen" i]', 'button[aria-label*="полный экран" i]',
              'button[title*="fullscreen" i]', 'button[title*="полный экран" i]',
              '[class*="fullscreen-button"]', '[class*="fullscreen_button"]',
              '[class*="vjs-fullscreen-control"]'
            ];
            for (var i = 0; i < selectors.length; i++) {
              var b = document.querySelector(selectors[i]);
              if (b) { b.click(); return; }
            }
            // Fallback: any video element
            var vid = document.querySelector('video');
            if (vid) {
              vid.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
            }
          }
        });
      } catch(e) {}
    }
    return;
  }

  if (command === 'нажми' || command === 'клик') {
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
