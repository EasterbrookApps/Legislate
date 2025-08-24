
(function(){
  const qs = new URLSearchParams(location.search);
  const FLAG = (qs.get('debug') === '1') || (localStorage.getItem('legislate.debug') === '1');
  const DBG = window.LegislateDebug = window.LegislateDebug || {};

  const logs = [];
  function ts(){ return new Date().toISOString(); }
  function push(kind, msg, data){
    logs.push({ t: ts(), kind, msg, data });
    if (panel && panelOpen) appendRow({ t: ts(), kind, msg, data });
  }
  DBG.dump = () => logs.slice();
  DBG.clear = () => { logs.length = 0; };
  DBG.download = () => {
    const blob = new Blob([JSON.stringify({ua:navigator.userAgent, logs}, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'legislate-debug-log.json'; a.click(); URL.revokeObjectURL(a.href);
  };

  let badge, panel, panelOpen = false;
  function ensureUI(){
    if (badge) return;
    badge = document.createElement('button');
    badge.textContent = 'DEBUG';
    badge.setAttribute('aria-label','Open debug panel');
    Object.assign(badge.style, { position:'fixed', right:'12px', bottom:'12px', zIndex: 2000, background:'#0b0c0c', color:'#fff',
      border:'none', borderRadius:'9999px', padding:'6px 10px', fontWeight:'700', letterSpacing:'0.03em', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,.3)'});
    badge.onclick = ()=>{ panelOpen ? closePanel() : openPanel(); };
    document.body.appendChild(badge);

    panel = document.createElement('div');
    Object.assign(panel.style, { position:'fixed', right:'12px', bottom:'56px', width:'min(96vw, 520px)', maxHeight:'75vh', overflow:'auto',
      background:'#fff', color:'#0b0c0c', border:'1px solid #b1b4b6', borderRadius:'8px', boxShadow:'0 6px 24px rgba(0,0,0,.25)', zIndex: 2000, display:'none' });
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #e5e5e5">
        <strong>Legislate Debug</strong>
        <div>
          <button id="dbg-download" style="margin-right:6px">Download</button>
          <button id="dbg-clear" style="margin-right:6px">Clear</button>
          <button id="dbg-off">Turn Off</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid #e5e5e5;flex-wrap:wrap">
        <button id="dbg-step">Step +1 (active)</button>
        <label>Move active to index <input id="dbg-move" type="number" style="width:80px" min="0"></label>
        <button id="dbg-advance">Force next turn</button>
        <button id="dbg-reset">Reset Save</button>
        <button id="dbg-refresh">Refresh State</button>
      </div>
      <div id="dbg-state" style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-family:monospace;font-size:12px"></div>
      <div id="dbg-log" style="padding:8px 10px;font-family:monospace;font-size:12px"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#dbg-download').onclick = ()=> DBG.download();
    panel.querySelector('#dbg-clear').onclick = ()=> { DBG.clear(); panel.querySelector('#dbg-log').innerHTML=''; };
    panel.querySelector('#dbg-off').onclick = ()=> { localStorage.removeItem('legislate.debug'); location.reload(); };
    panel.querySelector('#dbg-reset').onclick = ()=> { try{ localStorage.removeItem('legislate.v1.save'); push('info','save cleared'); }catch(e){} };
    panel.querySelector('#dbg-refresh').onclick = ()=> updateState();
    panel.querySelector('#dbg-step').onclick = async ()=> {
      if (!DBG.engine) return;
      try { await DBG.engine.takeTurn(1); push('action','engine.takeTurn(1)'); updateState(); } catch(e){ push('error','takeTurn(1) failed', String(e)); }
    };
    panel.querySelector('#dbg-advance').onclick = ()=> {
      if (!DBG.engine) return;
      const s = DBG.engine.state;
      s.turnIndex = (s.turnIndex + 1) % s.players.length;
      try { DBG.engine.bus.emit('TURN_BEGIN', { playerId: s.players[s.turnIndex].id, index: s.turnIndex }); } catch(e){}
      push('action','force next turn', s.turnIndex);
      updateState();
    };
    panel.querySelector('#dbg-move').addEventListener('change', (e)=>{
      if (!DBG.engine) return;
      const idx = Math.max(0, Math.floor(Number(e.target.value)||0));
      const s = DBG.engine.state;
      const p = s.players[s.turnIndex];
      p.position = idx;
      try { DBG.engine.bus.emit('MOVE_STEP', { playerId:p.id, to: p.position }); } catch(e){}
      push('action','move active to index', idx);
      updateState();
    });
  }
  function openPanel(){ ensureUI(); panel.style.display='block'; panelOpen = true; updateState(); renderExistingLogs(); }
  function closePanel(){ panel.style.display='none'; panelOpen = false; }
  function renderExistingLogs(){ const logEl = panel.querySelector('#dbg-log'); logEl.innerHTML = ''; logs.forEach(appendRow); }
  function updateState(){
    if (!panel) return;
    const stateEl = panel.querySelector('#dbg-state');
    if (!DBG.engine){ stateEl.textContent = '(engine not attached yet)'; return; }
    const s = DBG.engine.state;
    const decks = Object.fromEntries(Object.entries(s.decks||{}).map(([k,v])=>[k, (v&&v.length)||0]));
    stateEl.textContent = JSON.stringify({ turnIndex: s.turnIndex, players: s.players.map(p=>({id:p.id,name:p.name,pos:p.position})), decks }, null, 2);
  }
  function appendRow(rec){
    const logEl = panel.querySelector('#dbg-log'); if (!logEl) return;
    const div = document.createElement('div');
    div.textContent = `[${rec.t}] ${rec.kind.toUpperCase()} ${rec.msg}${rec.data!==undefined? ' ' + (typeof rec.data==='string'? rec.data : JSON.stringify(rec.data)) : ''}`;
    if (rec.kind==='error') div.style.color = '#d4351c';
    else if (rec.kind==='warn') div.style.color = '#d97a00';
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function wireConsole(){
    const orig = { log:console.log, warn:console.warn, error:console.error };
    console.log = function(){ push('log', Array.from(arguments).join(' ')); return orig.log.apply(console, arguments); };
    console.warn = function(){ push('warn', Array.from(arguments).join(' ')); return orig.warn.apply(console, arguments); };
    console.error = function(){ push('error', Array.from(arguments).join(' ')); return orig.error.apply(console, arguments); };
    window.addEventListener('error', (e)=> push('error', 'window.onerror', e.message||String(e)), true);
    window.addEventListener('unhandledrejection', (e)=> push('error','unhandledrejection', String(e.reason||e)), true);
  }
  function wireFetch(){
    const origFetch = window.fetch;
    window.fetch = async function(url, opts){
      const t0 = performance.now();
      try{
        const res = await origFetch(url, opts);
        const t1 = performance.now();
        push(res.ok ? 'net' : 'error', res.ok ? `FETCH OK ${res.status}` : `FETCH ERR ${res.status}`, { url: String(url), ms: Math.round(t1-t0) });
        return res;
      } catch (err){
        const t1 = performance.now();
        push('error', 'FETCH THROW', { url: String(url), ms: Math.round(t1-t0), err: String(err) });
        throw err;
      }
    };
  }

  // Allow UI to report token placements if it wants
  DBG.tokensPlaced = function(info){ push('ui','TOKENS', info); };

  DBG.attach = function(engine, board, decks){
    DBG.engine = engine; DBG.board = board; DBG.decks = decks;
    ensureUI(); updateState();
    try {
      engine.bus.on('*', (type, payload)=>{
        push('bus', type, payload);
        if (type==='MOVE_STEP' || type==='TURN_BEGIN') updateState();
      });
      push('info','[debug attached]');
    } catch(e){ push('error','attach bus failed', String(e)); }
  };

  if (FLAG){ wireConsole(); wireFetch(); ensureUI(); push('info','[debug enabled]'); }
})();
