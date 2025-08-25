// app.js — wire loader, engine, UI and debug
(function(){
  // --- Debug bootstrap (panel + API) ---
  const qs = new URLSearchParams(location.search);
  const DEBUG = Number(qs.get('debug') || '0'); // 0=off,1=basic,2=verbose
  (function initDebug(){
    if(!DEBUG){ window.DBG = { log(){}, info(){}, error(){}, panel:null }; return; }
    const logs = [];
    function ts(){ return new Date().toISOString(); }
    const panel = document.createElement('div');
    panel.id = 'dbg-panel';
    Object.assign(panel.style, { position:'fixed', left:'1rem', bottom:'1rem', right:'1rem', maxHeight:'40vh', overflow:'auto', background:'#fff', border:'1px solid #b1b4b6', borderRadius:'.5rem', boxShadow:'0 6px 18px rgba(0,0,0,.15)', zIndex:'2000' });
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 1rem;background:#f3f2f1;border-bottom:1px solid #b1b4b6">
      <strong>Debug</strong>
      <div>
        <button id="dbg-download" class="button">Download</button>
        <button id="dbg-clear" class="button">Clear</button>
        <button id="dbg-toggle" class="button">Collapse</button>
      </div>
    </div>
    <pre id="dbg-log" style="margin:0;padding:.75rem 1rem;white-space:pre-wrap"></pre>`;
    document.addEventListener('DOMContentLoaded', ()=> document.body.appendChild(panel));
    const pre = panel.querySelector ? panel.querySelector('#dbg-log') : null;
    function push(kind, payload){
      const line = `[${ts()}] ${kind} ${payload?JSON.stringify(payload):''}`;
      logs.push(line);
      if (pre){ pre.textContent = logs.join('\n'); pre.scrollTop = pre.scrollHeight; }
      console[kind.startsWith('ERROR')?'error':'log'](line);
    }
    function dump(){ return logs.slice(); }
    function clear(){ logs.length = 0; if(pre) pre.textContent=''; }
    function download(){
      const blob = new Blob([logs.join('\n')], { type:'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'legislate-debug.log'; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 500);
    }
    panel.addEventListener('click', (e)=>{
      if (e.target.id === 'dbg-download') download();
      if (e.target.id === 'dbg-clear') clear();
      if (e.target.id === 'dbg-toggle'){
        const pre = panel.querySelector('#dbg-log');
        if (pre.style.display === 'none'){ pre.style.display = 'block'; e.target.textContent = 'Collapse'; }
        else { pre.style.display = 'none'; e.target.textContent = 'Expand'; }
      }
    });
    window.DBG = {
      log(kind, payload){
        if (DEBUG >= 2) push(kind, payload);
        else if (DEBUG >= 1 && (kind.startsWith('INFO') || kind.startsWith('ERROR') || kind.startsWith('EVT'))) push(kind, payload);
      },
      info(msg, extra){ push('INFO ' + msg, extra); },
      error(msg, extra){ push('ERROR ' + msg, extra); },
      dump, clear, panel
    };
    window.DBG.info('[debug enabled]');
  })();

  document.addEventListener('DOMContentLoaded', boot);

  async function boot(){
    try{
      // DOM
      const rollBtn = document.getElementById('rollBtn');
      const restartBtn = document.getElementById('restartBtn');
      const playerCountSel = document.getElementById('playerCount');
      const boardImg = document.getElementById('boardImg');
      const modalRoot = document.getElementById('modalRoot');
      const diceOverlay = document.getElementById('diceOverlay');
      const dice = document.getElementById('dice');

      window.DBG.log('ENV', {
        ua: navigator.userAgent, dpr: window.devicePixelRatio, vw: window.innerWidth, vh: window.innerHeight, tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      window.DBG.log('DOM', {
        rollBtn: !!rollBtn, restartBtn: !!restartBtn, playerCount: !!playerCountSel, boardImg: !!boardImg, tokensLayer: !!document.getElementById('tokensLayer'),
        turnIndicator: !!document.getElementById('turnIndicator'), modalRoot: !!modalRoot, 'modal-root': !!document.getElementById('modal-root'),
        diceOverlay: !!diceOverlay, dice: !!dice, 'dbg-log': !!document.getElementById('dbg-log')
      });

      // Load assets
      const { meta, board, decks } = await window.LegislateLoader.loadPack('uk-parliament');
      window.DBG.log('EVT PACK', { spaces: board.spaces.length, decks: Object.keys(decks) });

      // Wire UI + Engine
      const engine = window.LegislateEngine.createEngine({ board, decks, playerCount: Number(playerCountSel.value||4) });
      const modal = window.LegislateUI.createModal();
      const renderer = window.LegislateUI.createBoardRenderer(board, engine);

      // Event mirroring to debug
      engine.bus.on('*', (type, payload)=> window.DBG.log('EVT '+type, payload));

      // UI reacts to engine
      engine.bus.on('DICE_ROLL', async ({value, playerId}) => {
        window.DBG.log('ROLL', { value });
        await window.LegislateUI.showDiceRoll(value, 700);
      });

      engine.bus.on('CARD_DRAWN', ({deck, card}) => {
        if (!card) return;
        const html = `<p><strong>${deck.toUpperCase()}</strong></p><p>${(card.title||'').replace(/</g,'&lt;')}</p><p style="color:#505a5f">${(card.effect||'').replace(/</g,'&lt;')}</p>`;
        modal.open({ titleText: 'You drew a card', bodyHtml: html, onOk(){ engine.bus.emit('CARD_RESOLVE', { card }); } });
      });

      // Controls
      rollBtn.addEventListener('click', async function(){
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
        window.DBG.log('LOG rollBtn click');
        await engine.takeTurn();
        renderer.drawAll();
      });

      restartBtn.addEventListener('click', function(){
        if (!confirm('Restart the game and clear the save?')) return;
        location.reload();
      });

      playerCountSel.addEventListener('change', function(){
        const n = Number(this.value||4);
        engine.setPlayerCount(n);
        renderer.drawAll();
      });

      renderer.drawAll();
      engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[0].id, index: 0 });
      window.DBG.log('EVT BOOT_OK');
    }catch(err){
      console.error(err);
      window.DBG.error('BOOT_FAIL', { error: String(err) });
      const banner = document.getElementById('error-banner');
      if (banner){ banner.textContent = 'Boot failed: ' + err; banner.hidden = false; }
    }
  }
})();
