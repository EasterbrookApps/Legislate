// debug.js — resilient event logger (works regardless of script order)
(function () {
  const LOG_ID = 'dbg-log';
  let attached = false;
  let tries = 0;
  const MAX_TRIES = 200; // ~10s at 50ms intervals

  function print(line, data) {
    const pre = document.getElementById(LOG_ID);
    if (!pre) return;
    const ts = new Date().toISOString();
    try {
      pre.textContent += `[${ts}] ${line}` + (data !== undefined ? ' ' + JSON.stringify(data) : '') + '\n';
      pre.scrollTop = pre.scrollHeight;
    } catch {
      pre.textContent += `[${ts}] ${line}\n`;
    }
  }

  function attach() {
    if (attached) return true;
    const eng = window.engine;
    if (!eng || !eng.bus || typeof eng.bus.on !== 'function') return false;

    // wildcard logger (your bus supports '*' -> (type, payload))
    eng.bus.on('*', (type, payload) => {
      print(type, payload);
    });
    attached = true;
    print('DEBUG_ATTACHED');
    return true;
  }

  // Log synchronous boot errors early
  window.addEventListener('error', (e) => {
    print('BOOT_FAIL', { message: e.message, file: e.filename, line: e.lineno, col: e.colno });
  });

  // Basic lifecycle logs
  document.addEventListener('DOMContentLoaded', () => print('BOOT_OK'));

  // Try immediately, then retry until engine is ready (no script-order assumptions)
  if (!attach()) {
    const t = setInterval(() => {
      if (attach() || (++tries > MAX_TRIES)) clearInterval(t);
    }, 50);
  }
})();