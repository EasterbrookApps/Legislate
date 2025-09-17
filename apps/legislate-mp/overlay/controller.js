(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // --- UX caches / flags ---
  let myUid = null;
  let lastCardKey = null;

  // dice: animate when seq changes; ignore first state to prevent join-flash
  let lastRollSeqSeen = -1;
  let seenFirstState = false;

  // Roll button gated by whose turn it is
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    rollBtnRef.disabled = !(curr && myUid && curr === myUid);
  }

  // --- Players UI sync (hide extras, set names, lock editing) ---
  function syncPlayersUI(engine, state){
    const players = (state && state.players) || engine.state.players || [];
    const root = $('playersSection');
    if (!root) return;

    // Expect pills like: <button class="player-pill"><span class="player-name">...</span></button>
    const pills = Array.from(root.querySelectorAll('.player-pill, button, [data-player-pill]'));
    if (!pills.length) return;

    for (let i = 0; i < pills.length; i++) {
      const pill = pills[i];
      const nameSpan = pill.querySelector('.player-name, [data-name]');

      if (i < players.length) {
        pill.style.display = '';
        if (nameSpan) {
          nameSpan.textContent = players[i]?.name || `Player ${i+1}`;
          nameSpan.setAttribute('contenteditable','false');
          nameSpan.title = 'Names are set in the lobby';
        }
        pill.style.pointerEvents = 'none';
        pill.tabIndex = -1;
      } else {
        pill.style.display = 'none';
      }
    }
  }

  // Dice for everyone: animate when overlayRoll.seq changes
  function maybeShowDice(state){
    const r = state && state.overlayRoll;
    if (!r || typeof r.seq !== 'number' || typeof r.value !== 'number') return;

    if (!seenFirstState) {
      // don’t animate the very first state we see (avoids flash on join)
      lastRollSeqSeen = r.seq;
      return;
    }
    if (r.seq === lastRollSeqSeen) return;

    lastRollSeqSeen = r.seq;
    if (window.LegislateUI?.animateDie) {
      window.LegislateUI.animateDie(r.value, 900);
    }
  }

  // Card modal: only current-turn player may dismiss
  let sharedModal = null;
  function maybeShowCard(state){
    const oc = state && state.overlayCard;
    const key = oc ? (oc.id || oc.title || JSON.stringify(oc)).slice(0,100) : null;

    if (!oc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return;
    lastCardKey = key;

    const title = String(oc.title || 'Card');
    const text  = String(oc.text  || '');

    const canDismiss = !!(myUid && state.currentTurnUid && (state.currentTurnUid === myUid));

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

  // Render state into engine + UI
  function renderFromState(engine, state){
    if (!state) return;

    engine.state.players    = state.players  || engine.state.players;
    engine.state.turnIndex  = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll   = (state.lastRoll ?? engine.state.lastRoll);

    syncPlayersUI(engine, state);

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    updateRollEnabled(state);
    maybeShowDice(state);
    maybeShowCard(state);

    seenFirstState = true;
  }

  // Host: attach seat→uid, currentTurnUid, overlayCard, overlayRoll
  function computeOutState(engine, mapping, overlayCard, overlayRoll){
    const out = deepClone(engine.state);
    const turnIdx = out.turnIndex || 0;
    out.overlaySeatUids = mapping.overlaySeatUids || [];
    out.currentTurnUid  = out.overlaySeatUids[turnIdx] || null;
    out.overlayCard     = overlayCard || null;
    out.overlayRoll     = overlayRoll || null; // {seq, value}
    return out;
  }

  async function hostLoop(engine){
    // seatIndex -> uid
    const map = { overlaySeatUids: [] };

    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    // Broadcast cards via overlayCard
    let overlayCard = null;
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      if (card) {
        overlayCard = { id: card.id || `${deck}-${Date.now()}`, title: card.title || deck, text: (card.text||'').trim() };
      } else {
        overlayCard = { id: `none-${Date.now()}`, title: 'No card', text: `The ${deck} deck is empty.` };
      }
      T.writeState(computeOutState(engine, map, overlayCard, lastOverlayRoll));
    });
    engine.bus.on('CARD_RESOLVE', ()=>{
      overlayCard = null;
      T.writeState(computeOutState(engine, map, overlayCard, lastOverlayRoll));
    });

    // Broadcast dice via overlayRoll.seq
    let rollSeq = 0;
    let lastOverlayRoll = null;

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn();
        // After engine updated lastRoll, publish overlayRoll with incremented seq
        rollSeq += 1;
        lastOverlayRoll = { seq: rollSeq, value: Number(engine.state.lastRoll || 0) };

      } else if (ev.type === 'RESTART') {
        engine.reset();
        // reset roll sequence + clear overlays
        rollSeq = 0;
        lastOverlayRoll = null;
        overlayCard = null;

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test(p.name||''));
        if (seat === -1) seat = engine.state.players.findIndex(p => (p.name||'').toLowerCase() === wanted.toLowerCase());
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
        }

      } else if (ev.type === 'ACK_CARD') {
        if (typeof engine.ackCard === 'function') engine.ackCard();
      }

      await T.writeState(computeOutState(engine, map, overlayCard, lastOverlayRoll));
    };

    // Initial publish
    await T.writeState(computeOutState(engine, map, overlayCard, lastOverlayRoll));

    // Process events
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

    // Lobby values
    const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    // MP UI rules
    const pc = $('playerCount'); if (pc) pc.style.display = 'none';

    const playersSection = $('playersSection');
    if (playersSection) {
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    // Remove SP handlers; rebind for overlay
    function replaceWithClone(el){ if (!el) return el; const c=el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Everyone mirrors authoritative state
    T.onState((st)=> renderFromState(engine, st));

    if (T.mode === 'host') {
      // Apply lobby selections (drive SP UI by firing change on the select)
      if (pc && hostCount) {
        pc.value = String(hostCount);
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }
      if (myName && engine.state.players[0]) {
        engine.state.players[0].name = myName;
      }

      // Align pills immediately
      syncPlayersUI(engine, { players: engine.state.players });

      // Host can restart; rolling still gated by currentTurnUid (same as guests)
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      // Start processing events / broadcasting overlays
      hostLoop(engine);

    } else {
      // Guest announces name once
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      // Guests can only roll on their turn
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); /* no-op */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();