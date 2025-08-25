// Step 3 — Roll acknowledgement modal (no cancel), movement starts immediately
(function(){
  const D = window.LegislateDebug;
  const UI = window.LegislateUI;
  const Engine = window.LegislateEngine;

  let engine;
  let renderer;
  let animating = false;
  let busWired = false;

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
      UI.showRollModal(`${name} rolled ${value}. Moving ${value} spaces…`);
    });

    bus.on('MOVE_STEP', ({ playerId, position, step, total }) => {
      const p = playerById(playerId);
      if (p) p.position = position;
      renderer.placeToken(p || {id:playerId, position}, position);
      D.event('MOVE_STEP', { playerId, position, step, total });
    });

    bus.on('LANDED', payload => {
      D.event('LANDED', payload);
    });

    bus.on('TURN_END', payload => {
      D.event('TURN_END', payload);
      UI.dismissModal(); // in case still open
    });

    bus.on('TURN_BEGIN', beginTurn);
  }

  function onReady(){
    try {
      D.mount();
      D.event('BOOT_OK');

      const initialPlayers = Number(document.getElementById('playerCount').value) || 4;
      engine = Engine.createEngine({ players: initialPlayers, spaces: 40 });
      renderer = UI.createBoardRenderer(engine.state.spaces);
      renderer.renderAll(engine.state.players);
      wireBus();
      beginTurn({ playerId: engine.state.players[0].id, index: 0 });

      const rollBtn = document.getElementById('rollBtn');
      rollBtn?.addEventListener('click', async ()=>{
        if (animating) return;
        animating = true;
        D.log('rollBtn click');
        await engine.takeTurn(); // emits DICE_ROLL then moves; modal is just acknowledgement
        animating = false;
      });

      const restartBtn = document.getElementById('restartBtn');
      restartBtn?.addEventListener('click', ()=>{ location.reload(); });

      const playerCount = document.getElementById('playerCount');
      playerCount?.addEventListener('change', (e)=>{
        const n = Number(e.target.value);
        engine.setPlayerCount(n);
        renderer = UI.createBoardRenderer(engine.state.spaces);
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
    setTimeout(onReady, 0);
  } else {
    document.addEventListener('DOMContentLoaded', onReady);
  }
})();