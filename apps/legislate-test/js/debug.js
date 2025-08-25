// js/debug.js — compact, docked, collapsible debug panel
(function () {
  const qs = new URLSearchParams(location.search);
  const ENABLED = qs.has('debug') || qs.get('dbg') === '1';
  if (!ENABLED) return;

  // Kill any prior debug panel to avoid duplicates
  for (const id of ['dbg-badge','dbg-shell','debug','dbg-styles']) {
    const el = document.getElementById(id);
    if (el && el.remove) el.remove();
  }

  const logs = [];
  const STORAGE_KEY_COLLAPSED = 'legislate.debug.collapsed';

  // Public API
  const API = {
    event(type, payload) { push(type, payload); },
    log(...a){ console.log('[DBG]', ...a); },
    error(...a){ console.error('[DBG]', ...a); },
    clear(){ logs.length = 0; if (body) body.textContent = ''; },
    download(){
      const blob = new Blob([JSON.stringify(logs, null, 2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `legislate-debug-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
  window.LegislateDebug = API;
  window.DBG = API;

  let shell, bar, body, badge, collapseBtn;

  function css() {
    if (document.getElementById('dbg-styles')) return;
    const s = document.createElement('style');
    s.id = 'dbg-styles';
    s.textContent = `
      #dbg-badge{
        position:fixed;
        right: max(10px, env(safe-area-inset-right, 0px));
        bottom: calc(max(10px, env(safe-area-inset-bottom, 0px)));
        z-index:2147483000;
        width:44px;height:28px;border-radius:14px;
        background:#111;color:#fff;display:flex;align-items:center;justify-content:center;
        font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,.25); cursor:pointer; user-select:none;
      }
      #dbg-shell{
        position:fixed;
        right: max(10px, env(safe-area-inset-right, 0px));
        bottom: calc(max(54px, env(safe-area-inset-bottom, 0px) + 44px));
        z-index:2147483000;
        background:#fff; border:1px solid #b1b4b6; border-radius:6px;
        box-shadow:0 4px 24px rgba(0,0,0,.25);
        width: min(92vw, 680px);
        max-height: 50vh; overflow: hidden;
        display:none;
        font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        color:#0b0c0c;
      }
      #dbg-bar{display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;background:#f3f2f1;border-bottom:1px solid #e2e2e2}
      #dbg-bar .sp{flex:1 1 auto}
      #dbg-bar button{border:1px solid #b1b4b6;background:#fff;border-radius:4px;padding:.2rem .5rem;cursor:pointer}
      #dbg-body{margin:0;padding:.6rem;background:#fff;max-height:40vh;overflow:auto;white-space:pre-wrap}
      /* collapsed to thin bar */
      #dbg-shell.mini #dbg-body{display:none}
    `;
    document.head.appendChild(s);
  }

  function mount(){
    css();

    badge = document.createElement('div');
    badge.id = 'dbg-badge';
    badge.textContent = 'DBG';
    document.body.appendChild(badge);

    shell = document.createElement('div');
    shell.id = 'dbg-shell';
    shell.innerHTML = `
      <div id="dbg-bar">
        <strong>Debug</strong>
        <span class="sp"></span>
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

    // Buttons
    shell.querySelector('#dbg-download').onclick = () => API.download();
    shell.querySelector('#dbg-clear').onclick = () => API.clear();
    collapseBtn.onclick = () => {
      const mini = shell.classList.toggle('mini');
      collapseBtn.textContent = mini ? 'Expand' : 'Collapse';
      // remember bar-only vs full panel
      localStorage.setItem(STORAGE_KEY_COLLAPSED, mini ? '1' : '0');
    };

    // Badge toggles visibility of the panel itself
    badge.onclick = () => {
      shell.style.display = (shell.style.display === 'none' || !shell.style.display) ? 'block' : 'none';
      // When showing, backfill last lines
      if (shell.style.display === 'block' && logs.length) {
        body.textContent = '';
        logs.slice(-200).forEach(append);
      }
    };

    // Initial state
    shell.style.display = 'block';
    const mini = localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1';
    if (mini) { shell.classList.add('mini'); collapseBtn.textContent = 'Expand'; }

    // Boot lines
    API.event('INFO', '[debug enabled]');
    API.event('ENV', {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  function push(type, payload){
    const e = { t: new Date().toISOString(), type, payload };
    logs.push(e);
    append(e);
  }
  function append(e){
    if (!body) return;
    const line = `[${e.t}] ${e.type} ${e.payload == null ? '' :
      (typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload))}\n`;
    body.textContent += line;
    body.scrollTop = body.scrollHeight;
  }

  (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();