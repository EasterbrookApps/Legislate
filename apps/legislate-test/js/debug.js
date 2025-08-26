// apps/legislate-test/js/debug.js
// Minimal, robust legacy debug logger that writes to <pre id="dbg-log">.
// Safe to include on all pages. No external deps.

// Expose a very small API: window.LegislateDebug.log/info/error(kind, payload)

(function () {
  // Find or create the target <pre id="dbg-log">
  function ensureSink() {
    let el = document.getElementById('dbg-log');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'dbg-log';
      el.style.cssText = 'max-height:200px;overflow:auto;background:#111;color:#0f0;font-size:12px;padding:6px;margin:0;white-space:pre-wrap;';
      document.body.appendChild(el);
    }
    return el;
  }

  const sink = ensureSink();

  function stringify(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  function line(kind, payload) {
    const ts = new Date().toISOString();
    return `[${ts}] ${kind} ${stringify(payload)}`;
  }

  function write(kind, payload) {
    if (!sink) return;
    sink.textContent += line(kind, payload) + '\n';
    sink.scrollTop = sink.scrollHeight;
  }

  // Global error handlers so we see failures even before app boots
  window.addEventListener('error', (e) => {
    write('ERROR', (e && e.message) ? e.message : e);
  });

  window.addEventListener('unhandledrejection', (e) => {
    write('ERROR', (e && e.reason) ? (e.reason.message || e.reason) : e);
  });

  // Public API used by app.js
  window.LegislateDebug = {
    log: (kind, payload) => write(kind, payload),
    info: (kind, payload) => write(kind, payload),
    error: (kind, payload) => write(kind, payload)
  };

  // Small convenience helpers for quick manual checks
  window.__dbg = {
    show() { if (sink) sink.style.display = 'block'; },
    hide() { if (sink) sink.style.display = 'none'; },
    clear() { if (sink) sink.textContent = ''; }
  };

  // Boot line so we know the module is active
  write('INFO', '[debug enabled]');
})();