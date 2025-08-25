// js/debug.js — feature-flagged, collapsible; purges any legacy debug on load
(function () {
  const qs = new URLSearchParams(location.search);
  const ENABLED = qs.has('debug') || qs.get('dbg') === '1';

  // Purge legacy debug DOM even if debug is off
  (function purgeLegacy(){
    const legacyIds = [
      'dbg-log','debug','debug-panel','dbg-panel','dbg-panel-old',
      'dbg-root','devtools','devtools-root','debugger','debug-root'
    ];
    legacyIds.forEach(id => { const el = document.getElementById(id); if (el && el.remove) el.remove(); });
    Array.from(document.querySelectorAll('style')).forEach(s => {
      const t = (s.textContent||'').toLowerCase();
      if (t.includes('#dbg-log') || t.includes('#debug-panel')) s.remove();
    });
  })();

  if (!ENABLED) return;

  // kill any previous instance
  for (const id of ['dbg-badge','dbg-shell','dbg-styles']) {
    const el = document.getElementById(id);
    if (el && el.remove) el.remove();
  }

  const logs = [];
  const STORAGE_KEY = 'legislate.debug.collapsed';

  const API = window.LegislateDebug = window.DBG = {
    event(type, payload){ push(type, payload); },
    log(...a){ push('LOG', a.length===1?a[0]:a); },
    error(...a){ push('ERROR', a.length===1?a[0]:a); },
    clear(){ logs.length=0; body && (body.textContent=''); },
    download(){
      const blob = new Blob([JSON.stringify(logs,null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `legislate-debug-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
    }
  };

  let shell, body, badge, btnCollapse;
  function injectCSS(){
    if (document.getElementById('dbg-styles')) return;
    const s = document.createElement('style');
    s.id = 'dbg-styles';
    s.textContent = `
      #dbg-badge{
        position:fixed; right:max(10px, env(safe-area-inset-right,0px));
        bottom:calc(max(10px, env(safe-area-inset-bottom,0px)));
        z-index:2147483000; width:44px; height:28px; border-radius:14px;
        background:#111; color:#fff; display:flex;align-items:center;justify-content:center;
        font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,.25); cursor:pointer; user-select:none;
      }
      #dbg-shell{
        position:fixed; right:max(10px, env(safe-area-inset-right,0px));
        bottom:calc(max(54px, env(safe-area-inset-bottom,0px) + 44px));
        z-index:2147483000; width:min(92vw, 680px); max-height:50vh;
        background:#fff; border:1px solid #b1b4b6; border-radius:6px;
        box-shadow:0 4px 24px rgba(0,0,0,.25); overflow:hidden; display:none;
        font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#0b0c0c;
      }
      #dbg-bar{display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;background:#f3f2f1;border-bottom:1px solid #e2e2e2}
      #dbg-bar .sp{flex:1 1 auto}
      #dbg-bar button{border:1px solid #b1b4b6;background:#fff;border-radius:4px;padding:.2rem .5rem;cursor:pointer}
      #dbg-body{margin:0;padding:.6rem;background:#fff;max-height:40vh;overflow:auto;white-space:pre-wrap}
      #dbg-shell.mini #dbg-body{display:none}
    `;
    document.head.appendChild(s);
  }
  function mount(){
    injectCSS();

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

    body = shell.querySelector('#dbg-body');
    btnCollapse = shell.querySelector('#dbg-collapse');

    shell.querySelector('#dbg-download').onclick = () => API.download();
    shell.querySelector('#dbg-clear').onclick = () => API.clear();

    btnCollapse.onclick = () => {
      const mini = shell.classList.toggle('mini');
      btnCollapse.textContent = mini ? 'Expand' : 'Collapse';
      localStorage.setItem(STORAGE_KEY, mini ? '1' : '0');
    };
    badge.onclick = () => {
      const show = shell.style.display !== 'block';
      shell.style.display = show ? 'block' : 'none';
      if (show && logs.length) {
        body.textContent = '';
        logs.slice(-200).forEach((e)=>append(e));
      }
    };

    shell.style.display = 'block';
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      shell.classList.add('mini'); btnCollapse.textContent = 'Expand';
    }

    API.event('INFO', '[debug enabled]');
  }
  function push(type, payload){
    const e = { t: new Date().toISOString(), type, payload };
    logs.push(e); append(e);
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