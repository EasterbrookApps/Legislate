// Step 5 — App: pass full board to renderer (use calibrated x/y from board.json)
(function(){
  const D = window.LegislateDebug;
  const UI = window.LegislateUI;
  const Engine = window.LegislateEngine;
  const Loader = window.LegislateLoader;

  let engine;
  let renderer;
  let animating = false;
  let busWired = false;
  let boardRef = null;

  function playerById(id){ return engine.state.players.find(p => p.id === id); }
  function nameFor(id){ const p = playerById(id); return p ? p.name : id; }

  function beginTurn(payload){
    const p = playerById(payload.playerId);
    const name = p ? p.name : 'Player';
    UI.setTurnIndicator(`${name}’s turn`);
    D.event('TURN_BEGIN', payload);
  }

  function wireBus(){
    if (busWired) return;
    busWired = true;
    const bus = engine.bus;

    bus.on('DICE_ROLL', ({ value, playerId }) => {
      const name = nameFor(playerId);
      D.event('DICE_ROLL', { value, playerId, name });
      UI.showDiceRoll(value);
    });

    bus.on('MOVE_STEP', ({ playerId, position, step, total }) => {
      const p = playerById(playerId);
      if (p) p.position = position;
      if (renderer) renderer.placeToken(p || {id:playerId, position}, position);
      D.event('MOVE_STEP', { playerId, position, step, total });
    });

    bus.on('CARD_DRAWN', ({ deck, card, playerId, position }) => {
      D.event('CARD_DRAWN', { deck, playerId, position, title: card?.title || card?.name });
      if (card){ UI.showCardModal(card); }
    });

    bus.on('CARD_APPLIED', payload => { D.event('CARD_APPLIED', payload); });
    bus.on('GAME_WIN', ({ playerId, name }) => {
      D.event('GAME_WIN', { playerId, name });
      UI.showCardModal({ title: 'Winner!', text: `${name} reached the end!` });
    });
    bus.on('TURN_END', payload => { D.event('TURN_END', payload); });
    bus.on('TURN_BEGIN', beginTurn);
  }

  async function boot(){
    try {
      D.mount();
      D.event('BOOT_OK');

      const pack = await Loader.loadPack();
      const board = pack.board || { spaces: Array.from({length:40}, (_,i)=>({index:i, x:5, y:5, deck:'none'})) };
      const decks = pack.decks || {};
      boardRef = board;

      D.event('PACK', { spaces: board?.spaces?.length, decks: Object.keys(decks||{}) });

      // Set board image if provided by pack
      if (board?.asset){
        const img = document.getElementById('boardImg');
        if (img) img.src = board.asset;
      }

      const initialPlayers = Number(document.getElementById('playerCount').value) || 4;
      engine = Engine.createEngine({ board, decks, players: initialPlayers });

      // renderer now uses calibrated x/y in board.spaces
      renderer = UI.createBoardRenderer(board);
      renderer.renderAll(engine.state.players);

      wireBus();
      beginTurn({ playerId: engine.state.players[0].id, index: 0 });

      document.getElementById('rollBtn')?.addEventListener('click', async ()=>{
        if (animating) return;
        animating = true;
        D.log('rollBtn click');
        await engine.takeTurn();
        animating = false;
      });

      document.getElementById('restartBtn')?.addEventListener('click', ()=>{ location.reload(); });

      document.getElementById('playerCount')?.addEventListener('change', (e)=>{
        const n = Number(e.target.value);
        engine.setPlayerCount(n);
        renderer = UI.createBoardRenderer(boardRef);
        renderer.renderAll(engine.state.players);
        beginTurn({ playerId: engine.state.players[0].id, index: 0 });
        D.event('PLAYER_COUNT', { value: n });
      });

    } catch(e){
      console.error(e);
      D.error('BOOT_FAIL', { error: String(e) });
      const bar = document.getElementById('errorBanner');
      const txt = document.getElementById('errorBannerText');
      if (txt) txt.textContent = 'Boot failed: ' + String(e);
      if (bar) bar.hidden = false;
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();