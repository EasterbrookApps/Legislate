(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // local cache to detect changes for dice/cards
  let lastRollSeen = null;
  let lastCardKey  = null;

  // Show dice roll animation on all clients when lastRoll changes
  function maybeShowDice(state){
    const n = state && state.lastRoll;
    if (n && n !== lastRollSeen) {
      lastRollSeen = n;
      if (window.LegislateUI && typeof window.LegislateUI.animateDie === 'function') {
        window.LegislateUI.animateDie(n, 900);
      }
    }
  }

  // Show card modal on all clients; only current player can dismiss (sends ACK)
  let sharedModal = null;
  function maybeShowCard(state){
    const pc = state && state.pendingCard;
    const key = pc ? (pc.id || pc.title || JSON.stringify(pc)).slice(0,100) : null;

    if (!pc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return; // already showing this one
    lastCardKey = key;

    // Build the modal content
    const title = (pc.title || 'Card').toString();
    const text  = (pc.text  || '').toString();

    // Who can dismiss?
    const myUid = (T.auth && T.auth.currentUser && T.auth.currentUser.uid) || null;
    const canDismiss = myUid && state.currentTurnUid && (state.currentTurnUid === myUid);

    // Use your UI modal if available; otherwise basic confirm()
    if (window.LegislateUI && typeof window.LegislateUI.createModal === 'function') {
      if (!sharedModal) sharedModal = window.LegislateUI.createModal();
      sharedModal.open({
        title,
        body: `<p>${text}</p>`,
        // If it's not our turn, hide/disable the OK. We'll just keep it open until state changes.
        okText: canDismiss ? 'OK' : 'Waiting for player…',
        okDisabled: !canDismiss
      }).then(() => {
        if (canDismiss) T.sendEvent({ type: 'ACK_CARD' });
      });
    } else {
      // Fallback: only the active player gets a blocking confirm
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        T.sendEvent({ type: 'ACK_CARD' });
      }
    }
  }

  // Push authoritative state into the local engine and trigger a re-render
  function renderFromState(engine, state){
    if (!state) return;

    // Copy over fields the renderer relies on
    engine.state.players   = state.players  || engine.state.players;
    engine.state.turnIndex = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll  = (state.lastRoll ?? engine.state.lastRoll);

    // Emit turn event to refresh UI
    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    // Shared UX
    maybeShowDice(state);
    maybeShowCard(state);
  }

  // Host processes events and publishes full state (including dice and any card info)
  async function hostLoop(engine){
    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn(); // engine updates players/turn/lastRoll internally

      } else if (ev.type === 'RESTART') {
        engine.reset();

      } else if (ev.type === 'SET_NAME') {
        // Assign a friendly name into the first default slot, if available
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        const used = new Set(engine.state.players.map(p => (p.name||'').toLowerCase()));
        if (!used.has(wanted.toLowerCase())) {
          const slot = engine.state.players.find(p => /^Player \d+$/i.test(p.name||''));
          if (slot) slot.name = wanted;
        }

      } else if (ev.type === 'ACK_CARD') {
        // Let the engine advance after card acknowledgement if your engine exposes such a method;
        // if not, just proceed to next player's turn here if your rules require it.
        if (typeof engine.ackCard === 'function') {
          engine.ackCard();
        }
      }

      // Build the authoritative state we publish
      const stateOut = deepClone(engine.state);

      // If your engine exposes a current card, include it so all clients can show it
      if (engine.state && engine.state.pendingCard) {
        stateOut.pendingCard = deepClone(engine.state.pendingCard);
      } else {
        // ensure we clear on guests if no card is pending
        stateOut.pendingCard = null;
      }

      // If you track whose turn by uid, include it; if not, guests will still render turnIndex
      if (!stateOut.currentTurnUid) {
        // Optional: if you store auth uid mapping in engine, set it here
        // stateOut.currentTurnUid = engine.state.currentTurnUid;
      }

      await T.writeState(stateOut);
    };

    // Publish initial state so late joiners see something immediately
    const firstState = deepClone(engine.state);
    if (!firstState.pendingCard) firstState.pendingCard = null;
    await T.writeState(firstState);

    // Process incoming events
    return T.onEvents(apply);
  }

  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return; // leave single-player untouched

    // Wait for the single-player engine to exist (poll up to ~5s)
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

    // Read lobby values (may be empty on some mobile flows)
    let myName    = sessionStorage.getItem('MP_NAME') || '';
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    // Fallback: if no name (common on mobile if they navigated directly), prompt once
    if (!myName) {
      try {
        const v = prompt('Enter your name');
        if (v && v.trim()) {
          myName = v.trim().slice(0,24);
          sessionStorage.setItem('MP_NAME', myName);
        }
      } catch {}
    }

    // Hide single-player setup UI entirely in multiplayer
    const pc = document.getElementById('playerCount');
    if (pc) pc.style.display = 'none';
    const playersSection = document.getElementById('playersSection');
    if (playersSection) playersSection.style.display = 'none';

    // Neutralise single-player button handlers so only overlay handles clicks
    function replaceWithClone(el){
      if (!el) return el;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      return clone;
    }
    let rollBtn    = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Subscribe to state updates for everyone (so dice/cards render everywhere)
    T.onState((st)=> renderFromState(engine, st));

    if (T.mode === 'host') {
      // Host applies lobby choices once
      if (hostCount && typeof engine.setPlayerCount === 'function') engine.setPlayerCount(hostCount);
      if (myName && engine.state.players[0]) engine.state.players[0].name = myName;

      // Host sends intents via events (uniform path)
      rollBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'ROLL' }); });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      // Start event processor
      hostLoop(engine);

    } else if (T.mode === 'guest') {
      // Guest announces their name once (if we have one)
      if (myName) { T.sendEvent({ type: 'SET_NAME', name: myName }); }

      // Guest: buttons only send intents; no local engine changes
      rollBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'ROLL' }); });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); /* optional: no-op */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();