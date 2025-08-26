// app.js — wires Loader → Engine → UI; logs to debug; dice→card sequencing; skip/extra-roll toasts
(function (){
  const $ = (id)=>document.getElementById(id);
  function log(kind, payload){ try{ window.LegislateDebug.log(kind, payload);}catch(e){} }
  const possessive = (name)=>`${(name||'Player').toString().trim()}'s turn`;

  let lastDicePromise = null;

  document.addEventListener('DOMContentLoaded', boot);

  async function boot(){
    log('INFO','[debug enabled]');
    log('ENV',{ ua:navigator.userAgent, dpr:devicePixelRatio, vw:innerWidth, vh:innerHeight, tz:Intl.DateTimeFormat().resolvedOptions().timeZone });
    log('DOM',{
      rollBtn:!!$('rollBtn'), restartBtn:!!$('restartBtn'), playerCount:!!$('playerCount'),
      boardImg:!!$('boardImg'), tokensLayer:!!$('tokensLayer'), turnIndicator:!!$('turnIndicator'),
      modalRoot:!!$('modalRoot'), 'modal-root':!!$('modal-root'), diceOverlay:!!$('diceOverlay'),
      dice:!!$('dice'), 'dbg-log':!!$('dbg-log')
    });

    try {
      const { board, decks } = await window.LegislateLoader.loadPack('uk-parliament');
      log('PACK',{ spaces: Array.isArray(board?.spaces)?board.spaces.length:-1, decks: Object.keys(decks||{}) });

      const engine = window.LegislateEngine.createEngine({ board, decks, rng: window.LegislateEngine.makeRng(Date.now()) });
      if(!engine || !engine.bus) throw new Error('engine missing');

      const modal = window.LegislateUI.createModal();
      const boardUI = window.LegislateUI.createBoardRenderer({ board });

      // Initial UI
      window.LegislateUI.renderPlayers(engine.state.players);
      boardUI.render(engine.state.players);
      window.LegislateUI.setTurnIndicator(engine.state.players[0]?.name);
      log('EVT BOOT_OK');

      // Events → UI
      engine.bus.on('DICE_ROLL', ({ value })=>{
        log('DICE_ROLL',{ value });
        lastDicePromise = window.LegislateUI.showDiceRoll(value, 900).then(()=>{ log('DICE_DONE',{ value }); return true; });
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
        try { if (lastDicePromise) await lastDicePromise; } catch(_) {}
        lastDicePromise = null;
        log('CARD_MODAL_OPEN',{ id:card.id, effect:card.effect });
        await modal.open({ title: card.title || deck, body: `<p>${(card.text||'').trim()}</p>`, actions:[{id:'ok',label:'OK'}] });
        log('CARD_MODAL_CLOSE',{ id:card.id });
        engine.bus.emit('CARD_RESOLVE', { card });
      });

      engine.bus.on('CARD_APPLIED', ({ card, playerId, position })=>{
        log('CARD_APPLIED',{ id:card?.id, effect:card?.effect, playerId, position });
        boardUI.render(engine.state.players);
      });

      engine.bus.on('EFFECT_EXTRA_ROLL', ({ playerId, name })=>{
        log('EFFECT_EXTRA_ROLL',{ playerId });
        window.LegislateUI.toast(`${(name||'Player').trim()} gets an extra roll`);
      });

      engine.bus.on('TURN_SKIPPED', ({ playerId, name, remaining })=>{
        log('TURN_SKIPPED',{ playerId, remaining });
        window.LegislateUI.toast(`${(name||'Player').trim()}'s turn is skipped`);
      });

      // NEW: end-game visibility in debug
      engine.bus.on('GAME_PLACE', ({ playerId, place, name })=>{
        log('GAME_PLACE', { playerId, place, name });
      });
      engine.bus.on('GAME_OVER', ({ podium, totalPlayers })=>{
        log('GAME_OVER', { podium, totalPlayers });
      });

      engine.bus.on('TURN_BEGIN', ({ index })=>{
        const cur = engine.state.players[index];
        window.LegislateUI.setTurnIndicator(cur?.name);
        log('TURN_BEGIN',{ playerId: cur?.id, index });
      });

      engine.bus.on('TURN_END', ({ playerId })=>{
        log('TURN_END',{ playerId });
      });

      // Controls
      $('rollBtn')?.addEventListener('click', ()=>{
        log('LOG','rollBtn click');
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

    } catch (err) {
      log('BOOT_FAIL', String(err));
      const ti = $('turnIndicator'); if (ti) ti.textContent = 'There was a problem starting the game.';
    }
  }
})();