// debug.js — robust attach to engine bus (works regardless of script order)
(function () {
  const LOG_ID = 'dbg-log';

  function line(type, payload) {
    const pre = document.getElementById(LOG_ID);
    if (!pre) return;
    try {
      pre.textContent += payload === undefined
        ? `${type}\n`
        : `${type} ${JSON.stringify(payload)}\n`;
    } catch {
      pre.textContent += `${type} [payload]\n`;
    }
  }

  function attach() {
    const eng = window.engine;
    if (!eng || !eng.bus || typeof eng.bus.on !== 'function') return false;

    // Avoid double attach
    if (attach._attached) return true;
    attach._attached = true;

    // Wildcard listener (your event bus supports '*' and passes (type, payload))
    eng.bus.on('*', (type, payload) => line(type, payload));

    line('DEBUG_ATTACHED');
    return true;
  }

  // Try immediately, then retry briefly until engine exists (max ~10s)
  if (!attach()) {
    let tries = 0;
    const timer = setInterval(() => {
      if (attach() || (++tries > 200)) clearInterval(timer);
    }, 50);
  }
})();