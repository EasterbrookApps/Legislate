// app.js — drop-in replacement
(function(){
  // Resolve libs defensively
  const UI = window.LegislateUI || window.UI;
  const Loader = window.LegislateLoader || window.Loader;
  const Storage = window.LegislateStorage || window.Storage;
  const EngineLib = window.LegislateEngine || window.EngineLib || window.Engine;

  if (!UI || !Loader || !Storage || !EngineLib) {
    console.error('[BOOT] Missing core libraries', { hasUI: !!UI, hasLoader: !!Loader, hasStorage: !!Storage, hasEngine: !!EngineLib });
  }

  // Elements
  const boardImg = document.getElementById('board-img');
  const tokensLayer = document.getElementById('tokens-layer');
  const turnIndicator = document.getElementById('turn-indicator');
  const playerCountSel = document.getElementById('player-count');
  const footerAttrib = document.getElementById('footer-attribution');
  const rollBtn = document.getElementById('roll-btn');
  const restartBtn = document.getElementById('restart-btn');

  // Helpers
  function waitForImage(img){
    return new Promise((resolve)=>{
      if (!img) return resolve();
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.addEventListener('load', ()=> resolve(), { once:true });
      img.addEventListener('error', ()=> resolve(), { once:true });
    });
  }
  function dice(){ return 1 + Math.floor(Math.random()*6); }

  let engine, board, decks, modal, boardUI;
  let namesLocked = false;

  async function bootstrap(){
    try {
      // Load registry & selected board (UK for now)
      const registry = await Loader.loadJSON('./content/registry.json');
      const key = registry?.default || 'uk-parliament';
      const meta = await Loader.loadJSON(`./content/${key}/meta.json`);
      board = await Loader.loadJSON(`./content/${key}/board.json`);
      decks = await Loader.loadDecks(`./content/${key}/cards`);

      // Wire assets
      UI.setSrc(boardImg, Loader.withBase(meta.boardImage || 'public/board.png'));
      UI.setAlt(boardImg, meta.alt || 'UK Parliament board');
      footerAttrib.textContent = meta.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0.';

      // Wait for image so token math has real dimensions
      await waitForImage(boardImg);

      // UI components
      modal = UI.createModal();
      boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);

      // Restore or init state
      const saved = Storage.load();
      const initialCount = Number(playerCountSel?.value || 4);
      const engineFactory = typeof EngineLib.createEngine === 'function'
        ? (opts)=>EngineLib.createEngine(opts)
        : (opts)=>EngineLib(opts);
      engine = engineFactory({
        board,
        decks,
        rng: Math.random,
        playerCount: saved?.players?.length || initialCount,
        savedState: saved || null
      });

      // Expose for debug panel
      try {
        if (window.LegislateDebug && (new URLSearchParams(location.search).get('debug')==='1' || localStorage.getItem('legislate.debug')==='1')){
          window.LegislateDebug.attach(engine, board, decks);
        }
      } catch(e){ console.warn('debug attach failed', e); }

      // Initial render
      updateUI();
      // Kick off turn
      engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });

      // Event wiring
      engine.bus.on('TURN_BEGIN', () => updateUI());
      engine.bus.on('MOVE_STEP', () => updateUI());
      window.addEventListener('resize', () => updateUI());

      // Player count change (only before first roll)
      if (playerCountSel){
        playerCountSel.addEventListener('change', (e)=>{
          if (namesLocked) { e.preventDefault(); playerCountSel.value = String(engine.state.players.length); return; }
          const n = Math.max(2, Math.min(6, Number(playerCountSel.value)||4));
          engine.setPlayerCount(n);
          updateUI();
          Storage.save(engine.serialize());
        });
      }

      // Inline name editing: prevent shortcuts while typing; update banner on commit
      document.addEventListener('input', (ev)=>{
        const t = ev.target;
        if (!t || !t.matches || !t.matches('.player-name-input')) return;
        if (namesLocked) { t.blur(); return; }
      }, true);
      document.addEventListener('keydown', (ev)=>{
        const t = ev.target;
        if (t && t.matches && t.matches('.player-name-input')){
          ev.stopPropagation(); // prevent shortcuts while typing
        }
      }, true);
      document.addEventListener('change', (ev)=>{
        const t = ev.target;
        if (!t || !t.matches || !t.matches('.player-name-input')) return;
        const pid = t.getAttribute('data-player-id');
        const value = (t.value || '').trimEnd();
        const p = engine.state.players.find(p=>p.id===pid);
        if (p){ p.name = value; UI.setTurnIndicator(turnIndicator, engine.state.players[engine.state.turnIndex].name); Storage.save(engine.serialize()); updateUI(); }
      });

      // Roll flow
      rollBtn?.addEventListener('click', async ()=>{
        const r = dice();
        namesLocked = true;
        if (playerCountSel) playerCountSel.disabled = true;
        if (UI.showDiceRoll) await UI.showDiceRoll(r, 1800);
        await modal.open({ title: 'Dice roll', body: `You rolled a ${r}.` });
        await engine.takeTurn(r);
        Storage.save(engine.serialize());
        updateUI();
      });

      // Restart with confirmation
      restartBtn?.addEventListener('click', async ()=>{
        const body = document.createElement('div');
        body.innerHTML = `<p>Are you sure you want to restart and scrap all these bills?</p>`;
        await modal.open({ title: 'Play again?', body });
        // After modal closes, confirm via native confirm (subtle)
        if (confirm('Restart the game and keep player names?')){
          const keepNames = engine.state.players.map(p=>p.name);
          engine.reset({ keepNames });
          namesLocked = false;
          if (playerCountSel){ playerCountSel.disabled = false; playerCountSel.value = String(keepNames.length); }
          Storage.clear();
          updateUI();
          engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });
        }
      });

    } catch (err){
      console.error('[BOOT] Failed to start', err);
      const errBox = document.getElementById('error-box');
      if (errBox){ errBox.style.display = 'block'; errBox.textContent = 'There\'s a problem loading the game. Please refresh.'; }
    }
  }

  function updateUI(){
    try {
      if (!engine || !boardUI) return;
      // Turn banner
      const current = engine.state.players[engine.state.turnIndex];
      UI.setTurnIndicator(turnIndicator, current?.name || 'Player');
      // Tokens
      boardUI.renderPlayers(engine.state.players);
    } catch(e){
      console.error('[UI] update failed', e);
    }
  }

  // Start
  document.addEventListener('DOMContentLoaded', bootstrap);
})(); 
