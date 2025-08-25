/* debug.js — comprehensive debug harness (feature-flagged)
   Enable by adding ?debug=1 to the URL or localStorage.setItem('legislate.debug','1')
*/
(function(){
  const DBG = {
    enabled() {
      try {
        const q = new URLSearchParams(location.search).get('debug') === '1';
        const ls = localStorage.getItem('legislate.debug') === '1';
        return q || ls;
      } catch { return false; }
    },

    log(...args){ try { console.log('[DBG]', ...args); } catch {} },
    warn(...args){ try { console.warn('[DBG]', ...args); } catch {} },
    error(...args){ try { console.error('[DBG]', ...args); } catch {} },

    // Panel UI
    ensurePanel(){
      if (!this.enabled()) return null;
      if (document.getElementById('dbg-panel')) return document.getElementById('dbg-panel');
      const wrap = document.createElement('div');
      wrap.id = 'dbg-panel';
      Object.assign(wrap.style, {
        position:'fixed', right:'8px', bottom:'8px', width:'min(92vw,360px)',
        maxHeight:'70vh', overflow:'auto', background:'#111', color:'#eee',
        border:'1px solid #444', borderRadius:'8px', padding:'8px', zIndex: 3000,
        font: '12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
      });
      wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
          <strong>Legislate Debug</strong>
          <div style="display:flex;gap:4px">
            <button id="dbg-hide"   style="padding:4px 6px">Hide</button>
            <button id="dbg-clear"  style="padding:4px 6px">Clear</button>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
          <button id="dbg-roll"    style="padding:4px 6px">Sim Roll</button>
          <button id="dbg-forcehide" style="padding:4px 6px">Force-hide overlays</button>
          <button id="dbg-testmodal" style="padding:4px 6px">Test modal</button>
          <button id="dbg-reset"   style="padding:4px 6px">Reset state</button>
          <button id="dbg-dump"    style="padding:4px 6px">Dump state</button>
        </div>
        <pre id="dbg-log" style="white-space:pre-wrap;background:#000;color:#0f0;padding:6px;border-radius:4px;min-height:120px"></pre>
      `;
      document.body.appendChild(wrap);
      wrap.querySelector('#dbg-hide').onclick = ()=> { wrap.style.display='none'; };
      wrap.querySelector('#dbg-clear').onclick = ()=> { const pre = wrap.querySelector('#dbg-log'); pre.textContent=''; };
      return wrap;
    },

    panelLog(msg, obj){
      const pnl = this.ensurePanel();
      if (!pnl) return;
      const pre = pnl.querySelector('#dbg-log');
      const line = `[${new Date().toISOString()}] ${msg}` + (obj ? ' ' + JSON.stringify(obj) : '');
      pre.textContent += line + '\n';
      pre.scrollTop = pre.scrollHeight;
    },

    bootDOMHooks(){
      if (!this.enabled()) return;
      // Log when critical elements exist + when listeners are attached
      const ids = ['rollBtn','restartBtn','playerCount','boardImg','tokensLayer','turnIndicator','modalRoot','modal-root','diceOverlay','dice'];
      const found = {};
      ids.forEach(id=>{ found[id] = !!document.getElementById(id); });
      this.panelLog('DOM presence', found);

      // Wrap addEventListener to detect handler attachment on targets of interest
      const origAdd = EventTarget.prototype.addEventListener;
      const self = this;
      EventTarget.prototype.addEventListener = function(type, listener, options){
        try {
          const el = this;
          if (el && (el.id === 'rollBtn' || el.id === 'restartBtn' || el.id === 'playerCount')) {
            self.panelLog(`Listener attached`, { id: el.id, type });
          }
        } catch {}
        return origAdd.call(this, type, listener, options);
      };

      // Global tap location inspector (first 10 taps)
      let tapCount = 0;
      document.addEventListener('pointerdown', (e)=>{
        if (tapCount++ > 10) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const desc = el ? (el.id ? ('#'+el.id) : (el.className ? '.'+String(el.className).split(' ').join('.') : el.tagName)) : 'null';
        this.panelLog('Tap @', { x:e.clientX, y:e.clientY, top: desc });
      }, { capture:true });

      // Overlay state snapshot
      setInterval(()=>{
        const o = document.getElementById('diceOverlay') || document.querySelector('.dice-overlay');
        const m = document.getElementById('modalRoot') || document.getElementById('modal-root');
        if (o) {
          const cs = getComputedStyle(o);
          this.panelLog('Overlay', { hidden: o.hidden, display: cs.display, vis: cs.visibility, z: cs.zIndex, pe: cs.pointerEvents });
        }
        if (m) {
          const cs = getComputedStyle(m);
          this.panelLog('Modal', { display: cs.display, z: cs.zIndex });
        }
      }, 3500);
    },

    attach(engine, board, decks){
      if (!this.enabled()) return;
      this.panelLog('Engine attached', { players: engine?.state?.players?.length ?? 0 });

      // Bus event mirroring
      try {
        engine.bus.on('*', (type, payload)=>{
          this.panelLog(`BUS ${type}`, payload || {});
        });
      } catch {}

      // Utility hooks for panel actions
      const pnl = this.ensurePanel();
      if (pnl) {
        const btnRoll = pnl.querySelector('#dbg-roll');
        const btnHide = pnl.querySelector('#dbg-forcehide');
        const btnTest = pnl.querySelector('#dbg-testmodal');
        const btnDump = pnl.querySelector('#dbg-dump');
        const btnReset= pnl.querySelector('#dbg-reset');

        btnRoll.onclick = async ()=> {
          const r = 1 + Math.floor(Math.random()*6);
          this.panelLog('Sim roll', { value: r });
          try { await window.LegislateUI?.showDiceRoll?.(r, 600); } catch {}
          try { await engine.takeTurn(r); } catch (e) { this.panelLog('Sim roll error', { msg: String(e) }); }
        };
        btnHide.onclick = ()=>{
          const o = document.getElementById('diceOverlay') || document.querySelector('.dice-overlay');
          if (o) { o.hidden = true; o.style.display = 'none'; o.style.pointerEvents = 'none'; }
          this.panelLog('Force-hide overlays');
        };
        btnTest.onclick = async ()=>{
          try { await window.LegislateUI?.createModal()?.open({ title:'Test modal', body:'If you can see this and press OK, modals work.' }); }
          catch(e){ this.panelLog('Test modal failed', { msg: String(e) }); }
        };
        btnDump.onclick = ()=> {
          const snap = {
            turnIndex: engine.state.turnIndex,
            positions: engine.state.players.map(p=>({id:p.id,name:p.name,pos:p.position})),
            decks: Object.fromEntries(Object.entries(engine.state.decks||{}).map(([k,v])=>[k, v.length]))
          };
          this.panelLog('State', snap);
        };
        btnReset.onclick = ()=> {
          try { engine.reset(); this.panelLog('Reset invoked'); } catch(e){ this.panelLog('Reset failed', { msg: String(e) }); }
        };
      }
    },

    instrumentHandlers(){
      if (!this.enabled()) return;
      // Log clicks/changes on primary controls
      const roll = document.getElementById('rollBtn');
      const rst  = document.getElementById('restartBtn');
      const pc   = document.getElementById('playerCount');
      if (roll) roll.addEventListener('click', ()=> this.panelLog('rollBtn click'));
      if (rst)  rst.addEventListener('click', ()=> this.panelLog('restartBtn click'));
      if (pc)   pc.addEventListener('change', (e)=> this.panelLog('playerCount change', { value: e.target.value }));
    },

    installErrorTraps(){
      if (!this.enabled()) return;
      window.addEventListener('error', (e)=>{
        this.panelLog('ERROR window.onerror', { msg: e.message, file: e.filename, line: e.lineno, col: e.colno });
      });
      window.addEventListener('unhandledrejection', (e)=>{
        this.panelLog('ERROR unhandledrejection', { reason: String(e.reason) });
      });
      // Environment
      this.panelLog('Env', { ua: navigator.userAgent, dpr: window.devicePixelRatio, vw: innerWidth, vh: innerHeight, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    }
  };

  window.LegislateDebug = {
    attach: (...args)=> DBG.attach(...args),
    ensurePanel: ()=> DBG.ensurePanel(),
  };

  if (DBG.enabled()) {
    // Initialize panel and traps ASAP
    document.addEventListener('DOMContentLoaded', ()=>{
      DBG.ensurePanel();
      DBG.installErrorTraps();
      DBG.bootDOMHooks();
      DBG.instrumentHandlers();
    });
  }
})();