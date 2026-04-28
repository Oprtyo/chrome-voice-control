let feedbackEl = null;
let linkLabels = [];
let linkMode = false;

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.action) {
    case 'scroll':
      handleScroll(message.direction);
      break;
    case 'scroll-to':
      handleScrollTo(message.position);
      break;
    case 'go-back':
      history.back();
      break;
    case 'go-forward':
      history.forward();
      break;
    case 'click':
      handleClick();
      break;
    case 'show-links':
      showLinkNumbers();
      break;
    case 'click-link':
      clickLinkByNumber(message.number);
      break;
    case 'hide-links':
      hideLinkNumbers();
      break;
    case 'press-key':
      pressKey(message.key);
      break;
    case 'show-feedback':
      showFeedback(message.text);
      break;
  }
});

function handleScroll(direction) {
  var amount = 400;
  switch (direction) {
    case 'down':
      window.scrollBy({ top: amount, behavior: 'smooth' });
      showFeedback('Прокрутка вниз');
      break;
    case 'up':
      window.scrollBy({ top: -amount, behavior: 'smooth' });
      showFeedback('Прокрутка вверх');
      break;
    case 'left':
      window.scrollBy({ left: -amount, behavior: 'smooth' });
      showFeedback('Прокрутка влево');
      break;
    case 'right':
      window.scrollBy({ left: amount, behavior: 'smooth' });
      showFeedback('Прокрутка вправо');
      break;
  }
}

function handleScrollTo(position) {
  if (position === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showFeedback('В начало страницы');
  } else if (position === 'bottom') {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    showFeedback('В конец страницы');
  }
}

function pressKey(key) {
  var activeEl = document.activeElement || document.body;
  var ev = new KeyboardEvent('keydown', {
    key: key,
    code: 'Key' + key.toUpperCase(),
    bubbles: true,
    cancelable: true
  });
  activeEl.dispatchEvent(ev);
  var evUp = new KeyboardEvent('keyup', {
    key: key,
    code: 'Key' + key.toUpperCase(),
    bubbles: true,
    cancelable: true
  });
  activeEl.dispatchEvent(evUp);
}

function handleClick() {
  var el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  if (el) {
    el.click();
    showFeedback('Клик');
  }
}

function showLinkNumbers() {
  hideLinkNumbers();
  linkMode = true;

  var elements = document.querySelectorAll('a[href], button, input[type="submit"], input[type="button"], [role="button"], [onclick]');
  var visibleElements = [];

  elements.forEach(function(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0) {
      var style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        visibleElements.push(el);
      }
    }
  });

  visibleElements.forEach(function(el, index) {
    var num = index + 1;
    var rect = el.getBoundingClientRect();

    var label = document.createElement('div');
    label.className = 'voice-control-link-label';
    label.textContent = num;
    label.style.cssText = 'position:fixed;z-index:2147483647;background:#e53935;color:#fff;font-size:12px;font-weight:bold;padding:1px 5px;border-radius:8px;pointer-events:none;line-height:18px;min-width:18px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);top:' + (rect.top - 2) + 'px;left:' + (rect.left - 2) + 'px;';

    document.body.appendChild(label);
    linkLabels.push({ label: label, element: el });
  });

  showFeedback('Назовите номер ссылки (1-' + visibleElements.length + ')');
}

function clickLinkByNumber(number) {
  var idx = number - 1;
  if (idx >= 0 && idx < linkLabels.length) {
    var item = linkLabels[idx];
    var el = item.element;
    hideLinkNumbers();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function() {
      el.focus();
      el.click();
      showFeedback('Нажата ссылка #' + number);
    }, 300);
  } else {
    showFeedback('Нет ссылки с номером ' + number);
  }
}

function hideLinkNumbers() {
  linkLabels.forEach(function(item) {
    if (item.label && item.label.parentNode) {
      item.label.parentNode.removeChild(item.label);
    }
  });
  linkLabels = [];
  linkMode = false;
}

function showFeedback(text) {
  if (feedbackEl) {
    feedbackEl.remove();
  }

  feedbackEl = document.createElement('div');
  feedbackEl.textContent = text;
  feedbackEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.9);color:#fff;padding:10px 24px;border-radius:24px;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;z-index:2147483647;pointer-events:none;transition:opacity 0.3s ease;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;';

  document.body.appendChild(feedbackEl);

  setTimeout(function() {
    if (feedbackEl) {
      feedbackEl.style.opacity = '0';
      setTimeout(function() {
        if (feedbackEl) {
          feedbackEl.remove();
          feedbackEl = null;
        }
      }, 300);
    }
  }, 2000);
}
