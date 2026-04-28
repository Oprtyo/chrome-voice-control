const statusEl = document.getElementById('status');
const partialEl = document.getElementById('partial');

const TIMEOUT = 5000;
let done = false;

const recognition = new webkitSpeechRecognition();
recognition.lang = 'ru-RU';
recognition.continuous = false;
recognition.interimResults = true;
recognition.maxAlternatives = 1;

recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript.trim();
    if (event.results[i].isFinal) {
      if (transcript && !done) {
        done = true;
        statusEl.textContent = transcript;
        partialEl.textContent = '';
        chrome.runtime.sendMessage({
          type: 'voice-command',
          command: transcript
        });
      }
    } else {
      partialEl.textContent = transcript;
    }
  }
};

recognition.onerror = (event) => {
  console.warn('Speech error:', event.error);
  if (!done) {
    done = true;
    chrome.runtime.sendMessage({ type: 'recognition-timeout' });
  }
};

recognition.onend = () => {
  if (!done) {
    done = true;
    chrome.runtime.sendMessage({ type: 'recognition-timeout' });
  }
};

// Таймаут на случай тишины
setTimeout(() => {
  if (!done) {
    done = true;
    recognition.stop();
    chrome.runtime.sendMessage({ type: 'recognition-timeout' });
  }
}, TIMEOUT);

recognition.start();
