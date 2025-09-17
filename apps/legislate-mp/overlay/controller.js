(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // --- UX caches / flags ---
  let myUid = null;
  let lastCardKey = null;
  let lastRollSeqSeen = -1;
  let seenFirstState = false;

  // Roll button control (only enable on my turn)
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    rollBtnRef.disabled = !(curr && myUid && curr === myUid);
  }

  // --- Players UI sync ---
  function syncPlayersUI(engine, state){
    const players = (state && state.players) || engine.state.players || [];
    const root = $('playersSection');
    if (!root) return;
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

  // --- Dice helpers ---
  function setDiceFace(value){
    const dice = document.getElementById('dice');
    if (!dice) return;
    for (let i=1;i<=6;i++) dice.classList.remove('show-'+i);
    dice.classList.add('show-'+Math.max(1, Math.min(6, Number(value)||1)));
  }

  function maybeShowDice(state){
    const r = state && state.overlayRoll;
    if (!r || typeof r.seq !== 'number' || typeof r.value !== 'number') return;

    if (!seenFirstState) {
      lastRollSeqSeen = r.seq;
      return;
    }
    if (r.seq === lastRollSeqSeen) return;
    lastRollSeqSeen = r.seq;

    const overlay = document.getElementById('diceOverlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
    }

    setDiceFace(r.value);

    setTimeout(()=>{
      if (overlay) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }
    }, 2000);
  }

  // --- Cards ---
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

  // --- Render state into engine + UI ---
  function renderFromState(engine, state){
    if (!state) return;

    // sync engine core state (used by your existing UI)
    engine.state.players    = state.players  || engine.state.players;
    engine.state.turnIndex  = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll   = (state.lastRoll ?? engine.state.lastRoll);

    // keep pills/names in sync
    syncPlayersUI(engine, state);

    // refresh turn UI
    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    updateRollEnabled(state);

    // ✅ Dice overlay only for guests (host already has native feedback)
    if (T.mode !== 'host') {
      maybeShowDice(state);
    }

    // ✅ Always pass full Firestore state to card renderer (fixes guests not seeing cards)
    maybeShowCard(state);

    seenFirstState = true;
  }

  // --- Host compute out state ---
  function computeOutState(engine, mapping, overlayCard, overlayRoll){
    const out = deepClone(engine.state);
    const turnIdx = out.turnIndex || 0;
    out.overlaySeatUids = mapping.overlaySeatUids || [];
    out.currentTurnUid  = out.overlaySeatUids[turnIdx] || null;
    out.overlayCard     = overlayCard || null;
    out.overlayRoll     = overlayRoll || null;
    return out;
  }

  async function hostLoop(engine){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    let overlayCard = null;
    let overlayRoll = null;
    let rollSeq = 0;

    // Track whether we're handling a roll so we can queue card publication
    let duringRoll = false;
    let queuedCard = null;

    // Buffer cards during a roll; publish immediately otherwise
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      const payload = card
        ? { id: card.id || `${deck}-${Date.now()}`, title: card.title || deck, text: (card.text||'').trim() }
        : { id: `none-${Date.now()}`, title: 'No card', text: `The ${deck} deck is empty.` };

      if (duringRoll) {
        queuedCard = payload; // publish right after dice
      } else {
        overlayCard = payload; // publish now
        T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
      }
    });

    engine.bus.on('CARD_RESOLVE', ()=>{
      overlayCard = null;
      queuedCard = null;
      T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    });

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        duringRoll = true;

        await engine.takeTurn();

        // Publish dice first
        rollSeq += 1;
        overlayRoll = { seq: rollSeq, value: Number(engine.state.lastRoll || 0) };
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));

        // Then publish queued card (if any)
        if (queuedCard) {
          overlayCard = queuedCard;
          queuedCard = null;
          await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        }

        duringRoll = false;
        return; // avoid extra write that might reorder

      } else if (ev.type === 'RESTART') {
        engine.reset();
        rollSeq = 0;
        overlayRoll = null;
        overlayCard = null;
        queuedCard = null;
        duringRoll = false;

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
        // re-publish to sync turnIndex/currentTurnUid for effects like "miss a turn"
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        return;
      }

      // Generic sync write
      await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    };

    // Initial publish
    await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
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

    const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    const pc = $('playerCount'); if (pc) pc.style.display = 'none';
    const playersSection = $('playersSection');
    if (playersSection) {
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    function replaceWithClone(el){ if (!el) return el; const c=el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Everyone mirrors authoritative state
    T.onState((st)=> {
      renderFromState(engine, st);
    });

    if (T.mode === 'host') {
      // Apply lobby choices
      if (pc && hostCount) {
        pc.value = String(hostCount);
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }
      if (myName && engine.state.players[0]) {
        engine.state.players[0].name = myName;
      }
      syncPlayersUI(engine, { players: engine.state.players });

      // Host UI handlers
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      hostLoop(engine);

    } else {
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();