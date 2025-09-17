(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // Push current engine.state to UI
  function renderFromState(engine, state){
    // Replace engine.state with incoming state (shallow copy for safety)
    // We only assign the fields used by the app renderer.
    engine.state.players = state.players || engine.state.players;
    engine.state.turnIndex = state.turnIndex ?? engine.state.turnIndex;
    engine.state.lastRoll = state.lastRoll ?? engine.state.lastRoll;

    // Trigger a turn begin to refresh UI
    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });
  }

  async function hostLoop(engine){
    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn();
      } else if (ev.type === 'RESTART') {
        engine.reset();
      } else if (ev.type === 'ACK_CARD') {
        // In this single-player engine, card OK is handled inside takeTurn flow.
      }
      // Publish full state after applying
      await T.writeState(deepClone(engine.state));
    };

    // Initial publish so late joiners see something
    await T.writeState(deepClone(engine.state));

    return T.onEvents(apply);
  }

  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return; // nothing to do; SP continues as normal

    // Wait for single-player boot to finish
    if (!window.LegislateApp || !window.LegislateApp.engine) {
      // Try to detect after a tick
      await new Promise(r => setTimeout(r, 200));
    }
    const engine = window.LegislateApp && window.LegislateApp.engine;
    if (!engine) {
      console.warn('Engine not detected; overlay inactive.');
      return;
    }

    if (T.mode === 'host') {
      // Wire buttons to send events (consistent path), and run host loop that processes them
      $('rollBtn')?.addEventListener('click', (e)=>{
        e.preventDefault();
        T.sendEvent({ type: 'ROLL' });
      });
      $('restartBtn')?.addEventListener('click', (e)=>{
        e.preventDefault();
        T.sendEvent({ type: 'RESTART' });
      });
      T.onState((st)=>{ /* host also renders from state to keep parity */ renderFromState(engine, st); });
      hostLoop(engine);
    } else if (T.mode === 'guest') {
      // Guests: buttons only send events; never mutate engine directly
      $('rollBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'ROLL' }); });
      $('restartBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); /* ignore or send request */ });
      // Render: always mirror host's state
      T.onState((st)=> renderFromState(engine, st));
    }
  }

  // Run after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();