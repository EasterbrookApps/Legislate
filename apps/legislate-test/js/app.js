// app.js — wires Loader → Engine → UI; sequential dice→card
(function (){
  const $ = (id)=>document.getElementById(id);
  function log(kind, payload){ try{ window.LegislateDebug.log(kind, payload);}catch(e){} }
  const possessive = (name)=>`${(name||'Player').trim()}'s turn`;

  let lastDicePromise = null; // holds the in-flight dice animation promise for this turn

  document.addEventListener('DOMContentLoaded', boot);

  async function boot(){
    log('ENV',{ ua:navigator.userAgent, dpr:devicePixelRatio, vw:innerWidth, vh:innerHeight, tz:Intl.DateTimeFormat().resolvedOptions().timeZone });
    log('DOM',{ rollBtn:!!$('rollBtn'), restartBtn:!!$('restartBtn'), playerCount:!!$('playerCount'), boardImg:!!$('boardImg'), tokensLayer:!!$('tokensLayer'), turnIndicator:!!$('turnIndicator'), modalRoot:!!$('modalRoot'), diceOverlay:!!$('diceOverlay'), dice:!!$('dice'), 'dbg-log':!!$('dbg-log') });

    try {
      const { board, decks } = await window.LegislateLoader.loadPack('uk-parliament');
      log('PACK',{ spaces: Array.isArray(board?.spaces)?board.spaces.length:-1, decks: Object.keys(decks||{}) });

      const engine = window.LegislateEngine.createEngine({ board, decks });
      if(!engine || !engine.bus){ throw new Error('engine missing'); }

      const modal = window.LegislateUI.createModal();
      const boardUI = window.LegislateUI.createBoardRenderer({ board });

      // initial render
      window.LegislateUI.renderPlayers(engine.state.players);
      boardUI.render(engine.state.players);
      window.LegislateUI.setTurnIndicator(possessive(engine.state.players[0]?.name));
      log('EVT BOOT_OK');
      
      // --- game-over flag (UI only; engine unchanged)
      let gameOver = false;

      // engine → ui
      engine.bus.on('DICE_ROLL', ({ value })=>{
        log('DICE_ROLL',{ value });
        // store the promise so CARD_DRAWN can await it
        lastDicePromise = window.LegislateUI.showDiceRoll(value, 900).then(()=>{
          log('DICE_DONE', { value });
          return true;
        });
      });

      engine.bus.on('MOVE_STEP', ({ playerId, position, step, total })=>{
        const p = engine.state.players.find(x=>x.id===playerId);
        if (p) p.position = position;
        boardUI.render(engine.state.players);
        log('MOVE_STEP',{ playerId, position, step, total });
      });

      engine.bus.on('LANDED', ({ playerId, position, space })=>{
        log('LANDED',{ playerId, position, space });
      });

      engine.bus.on('DECK_CHECK', ({ name, len })=>{
        log('DECK_CHECK',{ name, len });
      });

      engine.bus.on('CARD_DRAWN', async ({ deck, card })=>{
        log('CARD_DRAWN',{ deck, card });
        if (!card) return;

        // **Key change**: ensure dice fully finishes before showing the card
        try { if (lastDicePromise) await lastDicePromise; } catch(_) {}
        lastDicePromise = null;

        log('CARD_MODAL_OPEN', { id: card.id, effect: card.effect });
        await modal.open({
          title: card.title || deck,
          body: `<p>${(card.text||'').trim()}</p>`,
          actions: [{ id:'ok', label:'OK' }]
        });
        log('CARD_MODAL_CLOSE', { id: card.id });
        engine.bus.emit('CARD_RESOLVE', { card });
      });

      engine.bus.on('CARD_APPLIED', ({ card, playerId, position })=>{
        log('CARD_APPLIED',{ id:card?.id, effect:card?.effect, playerId, position });
        boardUI.render(engine.state.players);
      });

      engine.bus.on('TURN_BEGIN', ({ index })=>{
        const cur = engine.state.players[index];
        window.LegislateUI.setTurnIndicator(possessive(cur?.name));
        log('TURN_BEGIN',{ playerId: cur?.id, index });
      });
      
      
      // --- toast on missed turn ---
      function playerName(id) {
        const p = engine.state.players.find(p => p.id === id);
        return p ? p.name : id;
      }
      
      // When a turn is actually skipped (emitted by the engine)
      engine.bus.on('TURN_SKIPPED', ({ playerId }) => {
        LegislateUI.toast(`${playerName(playerId)}’s turn is skipped`);
      });
      
      // (Optional, nice UX) When the card is applied, before the skip
      engine.bus.on('EFFECT_MISS_TURN', ({ playerId }) => {
        LegislateUI.toast(`${playerName(playerId)} will miss a turn`);
      });
      
      engine.bus.on('LANDED', ({ playerId, space }) => {
      // We only care about the very first arrival at an 'end' space
      if (gameOver || !space || space.stage !== 'end') return;

      gameOver = true;

      // Resolve a friendly name
      const p = engine.state.players.find(x => x.id === playerId);
      const name = p?.name || 'Player';
    
      // Nice little toast (optional)
      window.LegislateUI?.toast?.(`${name} wins!`);
    
      // Single, simple modal that won’t interfere with dice/cards
      window.LegislateUI?.createModal?.({
        title: 'Winner!',
        body: `${name} reached the finish.`,
        primary: {
          label: 'Restart',
          onClick: () => location.reload()
        },
        secondary: {
          label: 'Close'
          // no onClick needed; default close is fine
        }
      })?.open?.();
    });
      engine.bus.on('TURN_END', ({ playerId })=>{
        log('TURN_END',{ playerId });
      });

      // controls
      $('rollBtn')?.addEventListener('click', ()=>{
          if (gameOver) {
            // non-blocking UX; no CSS dependency
            window.LegislateUI?.toast?.('Game over — restart to play again.');
            return;
          }
          log('rollBtn click');
          engine.takeTurn();
});

// --- restart wiring (safe + instrumented) ---

// 0) tiny helpers
const $ = (id) => document.getElementById(id);
const log = (t, o) => { try { window.LegislateDebug?.log(t, o); } catch (e) {} };

// 1) optional confirmation gate (set to true if you want the prompt)
const REQUIRE_CONFIRM = false;

// 2) immediate in-place reset so the UI visibly clears even if reload is flaky
function hardResetInPlace() {
  log('RESTART_BEGIN');

  // Clear persisted save
  try { window.LegislateStorage?.clear?.(); } catch {}

  // Hide/clear overlays
  try {
    const modalRoot = $('modalRoot'); if (modalRoot) modalRoot.innerHTML = '';
    const diceOverlay = $('diceOverlay'); if (diceOverlay) { diceOverlay.hidden = true; diceOverlay.style.display = 'none'; }
  } catch {}

  // Reset in-memory engine state (best-effort)
  try {
    const s = window.engine?.state;
    if (s) {
      s.turnIndex = 0;
      (s.players || []).forEach(p => { p.position = 0; p.skip = 0; p.extraRoll = false; });
    }
  } catch {}

  // Re-render UI (best-effort)
  try {
    window.boardUI?.render?.(window.engine?.state?.players || []);
    const firstName = window.engine?.state?.players?.[0]?.name || 'Player 1';
    window.LegislateUI?.setTurnIndicator?.(firstName);
  } catch {}

  // Clear any UI guard you use
  try { window.gameOver = false; } catch {}

  log('RESTART_INPLACE_DONE');
}

// 3) cache-busting reload that avoids bfcache
function hardReload() {
  try {
    const url = new URL(location.href);
    url.searchParams.set('t', Date.now().toString());
    log('RESTART_RELOAD', { url: url.toString() });
    // assign() is more reliable than replace() for busting certain caches on iOS
    location.assign(url.toString());
  } catch (e) {
    // last-resort
    location.href = location.href.split('#')[0] + (location.search ? '&' : '?') + 't=' + Date.now();
  }
}

// 4) wire up the button robustly (both onclick and addEventListener)
(function attachRestart() {
  const btn = $('restartBtn');
  if (!btn) { log('RESTART_BTN_MISSING'); return; }

  const handler = (ev) => {
    ev?.preventDefault?.();
    if (REQUIRE_CONFIRM && !confirm('Restart the game?')) return;

    hardResetInPlace();
    // Give the UI a tick to paint the cleared state, then reload.
    setTimeout(hardReload, 50);
  };

  // overwrite any previous handlers to avoid accidental stacking
  btn.onclick = null;
  btn.removeEventListener('click', handler);
  btn.addEventListener('click', handler);
  // fallback inline hook
  btn.onclick = handler;

  log('RESTART_WIRED');
})();

});

      $('playerCount')?.addEventListener('change', (e)=>{
        const n = Number(e.target.value||4) || 4;
        engine.setPlayerCount(n);
        window.LegislateUI.renderPlayers(engine.state.players);
        boardUI.render(engine.state.players);
        log('TURN_BEGIN',{ playerId: engine.state.players[engine.state.turnIndex]?.id, index: engine.state.turnIndex });
      });

    } catch (err){
      log('BOOT_FAIL', String(err));
      const ti=$('turnIndicator'); if(ti) ti.textContent='There was a problem starting the game.';
    }
  }
})();