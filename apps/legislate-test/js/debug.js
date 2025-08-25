(function(){
  const state = { mounted:false, panel:null, logEl:null, clearBtn:null, dlBtn:null };
  const logs = [];

  function ts(){ return new Date().toISOString(); }
  function line(kind, msg, meta){
    const e = { t: ts(), kind, msg, meta: meta ?? null };
    logs.push(e);
    if (state.logEl){
      state.logEl.textContent += `[${e.t}] ${kind} ${msg}${meta ? " " + JSON.stringify(meta) : ""}\n`;
      state.logEl.scrollTop = state.logEl.scrollHeight;
    }
    return e;
  }

  function envSnapshot(){
    try {
      return {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio || 1,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'n/a',
      };
    } catch(e){ return { error:String(e) }; }
  }

  function domPresence(){
    const ids = ['rollBtn','restartBtn','playerCount','boardImg','tokensLayer','turnIndicator','modalRoot','modal-root','diceOverlay','dice','dbg-log'];
    const res = {};
    ids.forEach(id => res[id] = !!document.getElementById(id));
    return res;
  }

  function download(){
    try{
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `legislate-debug-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
    }catch(e){
      line('ERR','download failed',{error:String(e)});
    }
  }

  function clear(){
    logs.length = 0;
    if (state.logEl) state.logEl.textContent = '';
    line('INFO','[cleared]');
  }

  function mount(){
    if (state.mounted) return;
    state.panel   = document.getElementById('dbg-panel');
    state.logEl   = document.getElementById('dbg-log');
    state.dlBtn   = document.getElementById('dbg-download');
    state.clearBtn= document.getElementById('dbg-clear');

    if (!state.panel || !state.logEl){
      // panel is optional: keep API no-op but log to console
      console.warn('[LegislateDebug] panel elements not found; continuing in headless mode');
    } else {
      state.dlBtn && state.dlBtn.addEventListener('click', download);
      state.clearBtn && state.clearBtn.addEventListener('click', clear);
    }
    state.mounted = true;

    line('INFO','[debug enabled]');
    line('ENV',  JSON.stringify(envSnapshot()));
    line('DOM',  JSON.stringify(domPresence()));
  }

  window.LegislateDebug = {
    mount,
    log:   (msg, meta)=> line('LOG', msg, meta),
    event: (msg, meta)=> line('EVT', msg, meta),
    error: (msg, meta)=> line('ERROR', msg, meta),
    get:   ()=> logs.slice(),
    clear,
    download
  };
})();