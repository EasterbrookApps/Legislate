// app.js — wires Loader → Engine → UI; sequential dice→card
(function (){

  // Human-friendly deck titles
  const DECK_LABELS = {
    early: "Early Stages",
    commons: "House of Commons",
    implementation: "Implementation",
    lords: "House of Lords",
    pingpong: "Ping Pong",
  };
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
      
      // Keep turn indicator fresh if current player's name is edited
      $('playersSection')?.addEventListener('input', (e)=>{
        const cur = engine.state.players[engine.state.turnIndex];
        if (cur) window.LegislateUI.setTurnIndicator(possessive(cur.name));
      });

      
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
          title: (card.title || (DECK_LABELS[deck] || deck)),
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

      $('restartBtn')?.addEventListener('click', ()=>{
        if (confirm('Restart the game?')) location.reload();
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