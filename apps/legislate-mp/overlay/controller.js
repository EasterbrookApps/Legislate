(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // local caches for UX
  let lastRollSeen = null;
  let lastCardKey  = null;

  // will be set after auth
  let myUid = null;

  // Enable/disable Roll button based on turn ownership
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    rollBtnRef.disabled = !!curr && myUid && curr !== myUid; // enabled only if it's *my* turn
  }

  function maybeShowDice(state){
    const n = state && state.lastRoll;
    if (n && n !== lastRollSeen) {
      lastRollSeen = n;
      if (window.LegislateUI?.animateDie) window.LegislateUI.animateDie(n, 900);
    }
  }

  // Only the current-turn player can dismiss
  let sharedModal = null;
  function maybeShowCard(state){
    const pc = state && state.pendingCard;
    const key = pc ? (pc.id || pc.title || JSON.stringify(pc)).slice(0,100) : null;

    if (!pc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return;
    lastCardKey = key;

    const title = String(pc.title || 'Card');
    const text  = String(pc.text  || '');

    const canDismiss = myUid && state.currentTurnUid && (state.currentTurnUid === myUid);

    if (window.LegislateUI?.createModal) {
      if (!sharedModal) sharedModal = window.LegislateUI.createModal();
      sharedModal.open({
        title,
        body: `<p>${text}</p>`,
        okText: canDismiss ? 'OK' : 'Waiting for player…',
        okDisabled: !canDismiss
      }).then(() => { if (canDismiss) T.sendEvent({ type: 'ACK_CARD' }); });
    } else {
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        T.sendEvent({ type: 'ACK_CARD' });
      }
    }
  }

  // Push authoritative state into the local engine and trigger a re-render
  function renderFromState(engine, state){
    if (!state) return;

    engine.state.players    = state.players  || engine.state.players;
    engine.state.turnIndex  = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll   = (state.lastRoll ?? engine.state.lastRoll);

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    updateRollEnabled(state);
    maybeShowDice(state);
    maybeShowCard(state);
  }

  // Host: maintain uid↔seat mapping and publish currentTurnUid so clients can gate actions
  function computeAndAttachTurnUid(engine, mapping){
    const out = deepClone(engine.state);
    out.pendingCard = engine.state?.pendingCard ? deepClone(engine.state.pendingCard) : null;
    const turnIdx = out.turnIndex || 0;
    const uidsArr = mapping.overlaySeatUids || [];
    out.overlaySeatUids = uidsArr;
    out.currentTurnUid = uidsArr[turnIdx] || null;
    return out;
  }

  async function hostLoop(engine){
    // mapping of seatIndex -> uid (stored into state as overlaySeatUids for clients)
    const map = { overlaySeatUids: [] };

    // On first publish, assign host to seat 0 (if empty)
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn();

      } else if (ev.type === 'RESTART') {
        engine.reset();

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        // assign into first default slot; capture seat index
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test(p.name||''));
        if (seat === -1) {
          // if no default slot, try to find exact name match to update
          seat = engine.state.players.findIndex(p => (p.name||'').toLowerCase() === wanted.toLowerCase());
        }
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          // record uid->seat mapping
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
        }

      } else if (ev.type === 'ACK_CARD') {
        if (typeof engine.ackCard === 'function') engine.ackCard();
      }

      await T.writeState(computeAndAttachTurnUid(engine, map));
    };

    // Initial publish
    await T.writeState(computeAndAttachTurnUid(engine, map));

    // Process incoming events
    return T.onEvents(apply);
  }

  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

    // Wait for engine (poll up to ~5s)
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = window.LegislateApp && window.LegislateApp.engine;
      if (engine) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!engine) { console.warn('Engine not detected; overlay inactive.'); return; }

    // Read lobby values
    const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    // MP UI rules
    const pc = $('playerCount'); if (pc) pc.style.display = 'none'; // player count from lobby
    const playersSection = $('playersSection');
    if (playersSection) {
      // keep visible, lock editing
      playersSection.querySelectorAll('[contenteditable]').forEach(el=>{
        el.setAttribute('contenteditable','false'); el.title='Names are set in the lobby';
      });
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    // Remove SP handlers; we'll rebind
    function replaceWithClone(el){ if (!el) return el; const c=el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; }
    rollBtnRef    = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Everyone mirrors state (enables per-turn gating + shared dice/cards)
    T.onState((st)=> renderFromState(engine, st));

    if (T.mode === 'host') {
      // Apply lobby choices once
      if (hostCount && typeof engine.setPlayerCount === 'function') engine.setPlayerCount(hostCount);
      if (myName && engine.state.players[0]) engine.state.players[0].name = myName;

      // Host: click Roll only if it's host's turn (gated in updateRollEnabled and below)
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        // client-side guard (extra safety)
        const enabled = !rollBtnRef.disabled;
        if (enabled) T.sendEvent({ type: 'ROLL' });
      });

      // Only host can restart
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      hostLoop(engine);

    } else { // guest
      // Guest announces their name once
      if (myName) { T.sendEvent({ type: 'SET_NAME', name: myName }); }

      // Guests can only roll on *their* turn (gated by state/currentTurnUid)
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        const enabled = !rollBtnRef.disabled;
        if (enabled) T.sendEvent({ type: 'ROLL' });
      });

      // Guests cannot restart
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); /* no-op */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();