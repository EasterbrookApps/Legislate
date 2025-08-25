// js/debug.js
(function () {
  const qs = new URLSearchParams(location.search);
  const ENABLED = qs.has('debug') || qs.get('dbg') === '1';
  if (!ENABLED) return;

  const logs = [];
  const DBG = window.LegislateDebug = {
    event(type, payload) {
      logs.push({ t: new Date().toISOString(), type, payload });
      if (panelBody) appendLine(type, payload);
    },
    log(...args) { console.log('[DBG]', ...args); },
    error(...args) { console.error('[DBG]', ...args); },
    download() {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `legislate-debug-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  // UI -----------------------------------------------------------------
  let panel, panelBody, toggleBtn;

  function mountUI() {
    if (panel) return;
    panel = document.createElement('div');
    panel.setAttribute('id', 'dbg-panel');
    panel.style.cssText = `
      position:fixed;left:0;right:0;bottom:0;z-index:2000;
      font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      color:#0b0c0c;
    `;
    panel.innerHTML = `
      <div id="dbg-bar" style="display:flex;align-items:center;gap:.5rem;padding:.25rem .5rem;background:#f3f2f1;border-top:1px solid #b1b4b6;">
        <strong style="margin-right:auto">Debug</strong>
        <button id="dbg-toggle" class="button" style="padding:.2rem .5rem">Collapse</button>
        <button id="dbg-download" class="button" style="padding:.2rem .5rem">Download</button>
        <button id="dbg-clear" class="button" style="padding:.2rem .5rem">Clear</button>
      </div>
      <pre id="dbg-body" style="margin:0;max-height:28vh;overflow:auto;padding:.5rem;border-top:1px solid #d9d9d9;background:#fff;"></pre>
    `;
    document.body.appendChild(panel);
    panelBody = panel.querySelector('#dbg-body');
    toggleBtn = panel.querySelector('#dbg-toggle');

    panel.querySelector('#dbg-download').onclick = () => DBG.download();
    panel.querySelector('#dbg-clear').onclick = () => { logs.length = 0; panelBody.textContent = ''; };
    toggleBtn.onclick = toggle;

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
    const collapsed = panelBody.style.display === 'none';
    panelBody.style.display = collapsed ? 'block' : 'none';
    toggleBtn.textContent = collapsed ? 'Collapse' : 'Expand';
  }

  function appendLine(type, payload) {
    const line = `[${new Date().toISOString()}] ${type} ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n`;
    panelBody.textContent += line;
    panelBody.scrollTop = panelBody.scrollHeight;
  }

  // mount as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUI);
  } else {
    mountUI();
  }

  // convenience helpers for the rest of the app
  window.DBG = DBG;
})();