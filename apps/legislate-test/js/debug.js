// js/debug.js
(function () {
  const qs = new URLSearchParams(location.search);
  const ENABLED = qs.has('debug') || qs.get('dbg') === '1';
  if (!ENABLED) return;

  // ---- State ----------------------------------------------------------
  const logs = [];
  const STORAGE_KEY = 'legislate.debug.collapsed';

  // ---- Public API -----------------------------------------------------
  const DBG = window.LegislateDebug = {
    event(type, payload) {
      const entry = { t: new Date().toISOString(), type, payload };
      logs.push(entry);
      if (body) append(entry);
    },
    log(...args) { console.log('[DBG]', ...args); },
    error(...args) { console.error('[DBG]', ...args); },
    clear() { logs.length = 0; if (body) body.textContent = ''; },
    download() {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `legislate-debug-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
  // short alias for app code
  window.DBG = DBG;

  // ---- UI -------------------------------------------------------------
  let shell, bar, body, badge, collapseBtn;

  function injectStyles() {
    if (document.getElementById('dbg-styles')) return;
    const s = document.createElement('style');
    s.id = 'dbg-styles';
    s.textContent = `
      #dbg-badge {
        position: fixed;
        right: max(8px, env(safe-area-inset-right));
        bottom: calc(max(8px, env(safe-area-inset-bottom)));
        z-index: 2147483000;
        width: 44px; height: 28px;
        border-radius: 14px;
        background: #111; color:#fff;
        display:flex; align-items:center; justify-content:center;
        font: 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,.25);
        cursor: pointer; user-select: none;
      }
      #dbg-shell {
        position: fixed;
        left: max(8px, env(safe-area-inset-left));
        right: max(8px, env(safe-area-inset-right));
        bottom: calc(max(8px, env(safe-area-inset-bottom)) + 36px);
        z-index: 2147483000;
        max-height: 36vh;
        background: #fff; border: 1px solid #b1b4b6; border-radius: 6px;
        box-shadow: 0 4px 24px rgba(0,0,0,.25);
        overflow: hidden;
        display: none;
        font: 12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        color: #0b0c0c;
      }
      #dbg-bar {
        display:flex; align-items:center; gap:.5rem;
        padding:.35rem .5rem; background:#f3f2f1; border-bottom:1px solid #e2e2e2;
      }
      #dbg-bar .spacer { flex: 1 1 auto; }
      #dbg-body {
        margin:0; padding:.5rem; background:#fff;
        max-height: 28vh; overflow:auto; white-space: pre-wrap;
      }
      #dbg-bar button {
        border: 1px solid #b1b4b6; background:#fff; border-radius:4px; padding:.2rem .5rem; cursor:pointer;
      }
      @media (min-width: 760px){
        #dbg-shell { left: auto; width: 640px; right: max(8px, env(safe-area-inset-right)); }
      }
    `;
    document.head.appendChild(s);
  }

  function mount() {
    injectStyles();

    badge = document.createElement('div');
    badge.id = 'dbg-badge';
    badge.textContent = 'DBG';
    document.body.appendChild(badge);

    shell = document.createElement('div');
    shell.id = 'dbg-shell';
    shell.innerHTML = `
      <div id="dbg-bar">
        <strong>Debug</strong>
        <span class="spacer"></span>
        <button id="dbg-download">Download</button>
        <button id="dbg-clear">Clear</button>
        <button id="dbg-collapse">Collapse</button>
      </div>
      <pre id="dbg-body"></pre>
    `;
    document.body.appendChild(shell);

    bar = shell.querySelector('#dbg-bar');
    body = shell.querySelector('#dbg-body');
    collapseBtn = shell.querySelector('#dbg-collapse');

    // wire buttons
    shell.querySelector('#dbg-download').onclick = () => DBG.download();
    shell.querySelector('#dbg-clear').onclick     = () => DBG.clear();
    collapseBtn.onclick = toggle;

    // badge toggles open/close
    badge.onclick = () => {
      const visible = shell.style.display !== 'none';
      if (visible) {
        shell.style.display = 'none';
        localStorage.setItem(STORAGE_KEY, '1');
      } else {
        shell.style.display = 'block';
        localStorage.setItem(STORAGE_KEY, '0');
        // shove last few logs into view
        if (logs.length) {
          body.textContent = '';
          logs.slice(-200).forEach(append);
        }
      }
    };

    // initial state: open unless previously collapsed
    const collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    shell.style.display = collapsed ? 'none' : 'block';

    // initial lines
    DBG.event('INFO', '[debug enabled]');
    DBG.event('ENV', {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  function toggle() {
    // collapse == hide body area, keep the bar visible
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    collapseBtn.textContent = hidden ? 'Collapse' : 'Expand';
  }

  function append({ t, type, payload }) {
    const line = `[${t}] ${type} ${
      payload == null ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload))
    }\n`;
    body.textContent += line;
    body.scrollTop = body.scrollHeight;
  }

  // mount ASAP
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();