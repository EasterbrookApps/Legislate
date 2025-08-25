// Feature-flagged debug panel. Enable with ?debug=1 (or &debug=1)
(function () {
  const qs = new URLSearchParams(location.search);
  const ENABLED = qs.get('debug') === '1';

  // Remove any legacy panels so we don't get the "thin line" issue
  ['dbg-log','dbg-panel','debug','debug-panel','dbg-shell','dbg-badge','dbg-styles']
    .forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });

  if (!ENABLED) {
    // Minimal shim so calls don't explode
    window.LegislateDebug = {
      info(){}, log(){}, event(){}, emit(){}, error(){}, clear(){}, download(){}
    };
    return;
  }

  // Inject styles
  const style = document.createElement('style');
  style.id = 'dbg-styles';
  style.textContent = `
    #dbg-badge{
      position:fixed; right:max(10px, env(safe-area-inset-right));
      bottom:max(10px, env(safe-area-inset-bottom));
      z-index:2147483000;
      width:44px;height:28px;border-radius:14px;
      background:#111;color:#fff;display:flex;align-items:center;justify-content:center;
      font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,.25); cursor:pointer; user-select:none;
    }
    #dbg-panel{
      position:fixed; right:max(10px, env(safe-area-inset-right));
      bottom:calc(max(10px, env(safe-area-inset-bottom)) + 36px);
      z-index:2147483000; width:min(92vw, 720px); max-height:50vh;
      background:#fff; border:1px solid #b1b4b6; border-radius:6px;
      box-shadow:0 4px 24px rgba(0,0,0,.25); overflow:hidden; display:none;
      font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#0b0c0c;
    }
    #dbg-bar{display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;background:#f3f2f1;border-bottom:1px solid #e2e2e2}
    #dbg-bar .sp{flex:1}
    #dbg-bar button{border:1px solid #b1b4b6;background:#fff;border-radius:4px;padding:.2rem .5rem;cursor:pointer}
    #dbg-log{margin:0;padding:.6rem;max-height:40vh;overflow:auto;white-space:pre-wrap;font:12px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace}
    #dbg-panel.mini #dbg-log{display:none}
  `;
  document.head.appendChild(style);

  // Build UI
  const badge = document.createElement('div');
  badge.id = 'dbg-badge';
  badge.textContent = 'DBG';

  const panel = document.createElement('div');
  panel.id = 'dbg-panel';
  panel.innerHTML = `
    <div id="dbg-bar">
      <strong>Debug</strong>
      <span class="sp"></span>
      <button id="dbg-download">Download</button>
      <button id="dbg-clear">Clear</button>
      <button id="dbg-collapse">Collapse</button>
    </div>
    <pre id="dbg-log"></pre>
  `;

  document.body.appendChild(badge);
  document.body.appendChild(panel);

  const pre = panel.querySelector('#dbg-log');
  const btnDownload = panel.querySelector('#dbg-download');
  const btnClear = panel.querySelector('#dbg-clear');
  const btnCollapse = panel.querySelector('#dbg-collapse');

  const logs = [];
  function append(line){
    logs.push(line);
    pre.textContent += line + '\n';
    pre.scrollTop = pre.scrollHeight;
  }
  function line(tag, payload){
    const ts = new Date().toISOString();
    append(`[${ts}] ${tag} ${payload != null ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : ''}`);
  }

  badge.onclick = () => {
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  };
  btnClear.onclick = () => { logs.length = 0; pre.textContent=''; };
  btnDownload.onclick = () => {
    const blob = new Blob([logs.join('\n')], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `legislate-debug-${Date.now()}.log`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 0);
  };
  btnCollapse.onclick = () => {
    panel.classList.toggle('mini');
    btnCollapse.textContent = panel.classList.contains('mini') ? 'Expand' : 'Collapse';
  };

  // Public API
  window.LegislateDebug = {
    info(msg){ line('INFO', msg); },
    log(tag, payload){ line(tag, payload); },
    event(tag, payload){ line(tag, payload); },
    emit(tag, payload){ line(tag, payload); }, // alias
    error(tag, payload){ line('ERROR ' + tag, payload); },
    clear(){ logs.length = 0; pre.textContent = ''; },
    download(){ btnDownload.click(); }
  };

  // Hello line so you know it's alive
  window.LegislateDebug.info('[debug enabled]');
})();