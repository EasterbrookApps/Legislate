(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // Local caches for UX
  let lastRollSeen = null;
  let lastCardKey  = null;

  // Will be set after auth
  let myUid = null;

  // Keep a reference to Roll button to enable/disable per turn
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    // Enable only if it's *my* turn; otherwise disabled
    rollBtnRef.disabled = !!curr && myUid && curr !== myUid;
  }

  // Dice for everyone
  function maybeShowDice(state){
    const n = state && state.lastRoll;
    if (n && n !== lastRollSeen) {
      lastRollSeen = n;
      if (window.LegislateUI && typeof window.LegislateUI.animateDie === 'function') {
        window.LegislateUI.animateDie(n, 900);
      }
    }
  }

  // Card modal: only current-turn player may dismiss (host cannot dismiss for others)
  let sharedModal = null;
  function maybeShowCard(state){
    const pc = state && state.pendingCard;
    const key = pc ? (pc.id || pc.title || JSON.stringify(pc)).slice(0,100) : null;

    if (!pc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return;
    lastCardKey = key;

    const title = String(pc.title || 'Card');
    const text  = String(pc.text  || '');

    const canDismiss = !!(myUid && state.currentTurnUid && (state.currentTurnUid === myUid));

    if (window.LegislateUI && typeof window.LegislateUI.createModal === 'function') {
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

  // Push authoritative state into local engine and trigger UI
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

  // Host: compute currentTurnUid + seat→uid mapping and publish
  function computeAndAttachTurnUid(engine, mapping){
    const out = deepClone(engine.state);
    out.pendingCard = engine.state?.pendingCard ? deepClone(engine.state.pendingCard) : null;
    const turnIdx = out.turnIndex || 0;
    const uidsArr = mapping.overlaySeatUids || [];
    out.overlaySeatUids = uidsArr;
    out.currentTurnUid  = uidsArr[turnIdx] || null;
    return out;
  }

  async function hostLoop(engine){
    // mapping of seatIndex -> uid
    const map = { overlaySeatUids: [] };

    // On first publish, assign host to seat 0 (if empty)
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        // Only current-turn player will be able to trigger this (button gated on client)
        await engine.takeTurn();

      } else if (ev.type === 'RESTART') {
        engine.reset();

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        // Assign into first default slot; record seat mapping for this uid
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test(p.name||''));
        if (seat === -1) {
          // If no default slot, try replace an existing identical named slot
          seat = engine.state.players.findIndex(p => (p.name||'').toLowerCase() === wanted.toLowerCase());
        }
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
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
    if (T.mode === 'solo') return; // leave SP untouched

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

    // ---- MP UI rules ----
    // Hide player-count dropdown (count comes from lobby)
    const pc = $('playerCount'); if (pc) pc.style.display = 'none';

    // Keep players container visible but lock editing
    const playersSection = $('playersSection');
    if (playersSection) {
      playersSection.querySelectorAll('[contenteditable]').forEach(el=>{
        el.setAttribute('contenteditable','false'); el.title='Names are set in the lobby';
      });
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    // Remove SP handlers; rebind for overlay
    function replaceWithClone(el){
      if (!el) return el;
      const c = el.cloneNode(true);
      el.parentNode.replaceChild(c, el);
      return c;
    }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Everyone mirrors authoritative state
    T.onState((st)=> renderFromState(engine, st));

    if (T.mode === 'host') {
      // Host applies lobby choices once
      if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }
      if (myName && engine.state.players[0]) {
        engine.state.players[0].name = myName;
      }

      // 🔧 Force UI refresh so players container shows correct count & names
      // (fixes: "selected 2 but saw 4", and host name not shown in list)
      engine.bus.emit('PLAYERS_CHANGED', { players: engine.state.players });

      // Host can only roll on *their* turn (button also gated by updateRollEnabled)
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        const enabled = !rollBtnRef.disabled;
        if (enabled) T.sendEvent({ type: 'ROLL' });
      });

      // Only host can restart
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      // Start event processor
      hostLoop(engine);

    } else { // guest
      // Guest announces their name once
      if (myName) { T.sendEvent({ type: 'SET_NAME', name: myName }); }

      // Guests can only roll on *their* turn
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