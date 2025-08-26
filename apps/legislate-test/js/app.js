// app.js — wires Loader → Engine → UI, no roll-cancel, legacy debug
(function (){
  const $ = (id)=>document.getElementById(id);
  function log(kind, payload){ try{ window.LegislateDebug.log(kind, payload);}catch(e){} }
  const possessive = (name)=>`${(name||'Player').trim()}'s turn`;

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

      // engine → ui
      engine.bus.on('DICE_ROLL', ({ value })=>{
        log('DICE_ROLL',{ value });
        window.LegislateUI.showDiceRoll(value, 900);
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
        await new Promise(r=>setTimeout(r, 200));
        await modal.open({
          title: card.title || deck,
          body: `<p>${(card.text||'').trim()}</p>`,
          actions: [{ id:'ok', label:'OK' }]
        });
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
      engine.bus.on('TURN_END', ({ playerId })=>{
        log('TURN_END',{ playerId });
      });

      // controls
      $('rollBtn')?.addEventListener('click', ()=>{
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