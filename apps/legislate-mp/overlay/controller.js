(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // Push current engine.state to UI
  function renderFromState(engine, state){
    // Copy over only the fields the renderer relies on
    engine.state.players  = state.players  || engine.state.players;
    engine.state.turnIndex = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll = (state.lastRoll ?? engine.state.lastRoll);

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });
  }

  async function hostLoop(engine){
    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn();

      } else if (ev.type === 'RESTART') {
        engine.reset();

      } else if (ev.type === 'SET_NAME') {
        // Very simple name assignment: first default slot gets the guest's name (once).
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        const used = new Set(engine.state.players.map(p => (p.name||'').toLowerCase()));
        if (!used.has(wanted.toLowerCase())) {
          const slot = engine.state.players.find(p => /^Player \d+$/i.test(p.name||''));
          if (slot) slot.name = wanted;
        }
      }

      // Publish authoritative full state
      await T.writeState(deepClone(engine.state));
    };

    // Initial publish so late joiners see something immediately
    await T.writeState(deepClone(engine.state));

    // Process incoming events (ROLL, RESTART, SET_NAME)
    return T.onEvents(apply);
  }

  async function bootOverlay(){
    // Init transport (reads room/host from sessionStorage; falls back to URL)
    await T.init();
    if (T.mode === 'solo') return; // Single-player: leave everything as-is

    // Wait for single-player engine to be ready (poll up to ~5s)
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = window.LegislateApp && window.LegislateApp.engine;
      if (engine) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!engine) {
      console.warn('Engine not detected; overlay inactive.');
      return;
    }

    // ---- Read lobby choices ----
    const myName    = sessionStorage.getItem('MP_NAME') || 'Player';
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    // ---- Hide single-player setup UI entirely in multiplayer ----
    const pc = document.getElementById('playerCount');
    if (pc) pc.style.display = 'none';

    const playersSection = document.getElementById('playersSection');
    if (playersSection) playersSection.style.display = 'none';

    // ---- Neutralise single-player button handlers (so only overlay handles clicks) ----
    function replaceWithClone(el){
      if (!el) return el;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      return clone;
    }
    let rollBtn    = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    if (T.mode === 'host') {
      // Host applies lobby choices once
      if (hostCount) engine.setPlayerCount(hostCount);
      if (myName && engine.state.players[0]) engine.state.players[0].name = myName;

      // Host: send events (uniform path) and render from authoritative state too
      rollBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'ROLL' }); });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      T.onState((st)=> renderFromState(engine, st));
      hostLoop(engine); // process events and publish state

    } else if (T.mode === 'guest') {
      // Guest announces their name once
      if (myName) { T.sendEvent({ type: 'SET_NAME', name: myName }); }

      // Guest: buttons only send intents; no direct engine changes
      rollBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'ROLL' }); });
      // Guests don't restart (optional: could send a request)
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); /* no-op */ });

      // Always mirror host's state
      T.onState((st)=> renderFromState(engine, st));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();