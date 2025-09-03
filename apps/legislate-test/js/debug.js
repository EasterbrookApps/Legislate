// debug.js — restore verbose logging
(function () {
  function log(msg, data) {
    const el = document.getElementById('dbg-log');
    if (!el) return;

    const line = document.createElement('div');
    line.textContent = `[${new Date().toISOString()}] ${msg}` + (data ? ' ' + JSON.stringify(data) : '');
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  window.addEventListener('error', e => {
    log('BOOT_FAIL ' + e.message);
  });

  window.addEventListener('DOMContentLoaded', () => {
    log('BOOT_OK');

    if (window.LegislateEngine) {
      const engine = window.engine;
      if (engine && engine.bus) {
        engine.bus.on('*', (type, payload) => {
          log(type, payload);
        });
      }
    }
  });
})();