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

  // Shared card handling
  let queuedCard = null;
  let resolveCardPromise = null;

  // --- Always-on multiplayer diagnostics ---
  function mpDbg(ev, data){
    const stamp = new Date().toISOString();
    const pretty = (data && typeof data === 'object')
      ? JSON.stringify(data, null, 2)
      : String(data ?? '');
    console.log(`[MP][${stamp}] ${ev}`, data);
    const dbg = document.getElementById('dbg-log');
    if (dbg) {
      if (dbg.textContent.length > 50000) dbg.textContent = dbg.textContent.slice(-35000);
      dbg.textContent += `\n[${stamp}] ${ev}\n${pretty}\n`;
      dbg.scrollTop = dbg.scrollHeight;
    }
  }

  // Roll button control (only enable on my turn)
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    const enabled = !!(curr && myUid && curr === myUid);
    rollBtnRef.disabled = !enabled;
    mpDbg('ROLL_BTN_GATING', { myUid, currentTurnUid: curr, enabled });
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
    if (r) mpDbg('DICE_SHOW_ATTEMPT', r);
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
    if (oc) mpDbg('CARD_SHOW_ATTEMPT', { id: oc.id, title: oc.title });
    const key = oc ? (oc.id || oc.title || JSON.stringify(oc)).slice(0,100) : null;
    if (!oc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return;
    lastCardKey = key;

    const title = String(oc.title || 'Card');
    const text  = String(oc.text  || '');
    const canDismiss = !!(myUid && state.currentTurnUid && (state.currentTurnUid === myUid));
    mpDbg('CARD_CAN_DISMISS', { myUid, currentTurnUid: state.currentTurnUid, canDismiss });

    if (window.LegislateUI?.createModal) {
      if (!sharedModal) sharedModal = window.LegislateUI.createModal();
      sharedModal.open({
        title,
        body: `<p>${text}</p>`,
        okText: canDismiss ? 'OK' : 'Waiting for player…',
        okDisabled: !canDismiss
      }).then(() => {
        if (canDismiss) {
          mpDbg('CARD_ACK_SENT', { by: myUid });
          T.sendEvent({ type: 'ACK_CARD' });
        }
      });
    } else {
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        mpDbg('CARD_ACK_SENT', { by: myUid });
        T.sendEvent({ type: 'ACK_CARD' });
      }
    }
  }

  // --- Render state into engine + UI ---
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

    // HUD update
    try {
      const hudBox = document.getElementById('mp-hud');
      if (hudBox && state) {
        const oc = state.overlayCard ? `${state.overlayCard.title || 'Card'} (#${(state.overlayCard.id||'').slice(-6)})` : '—';
        const or = state.overlayRoll ? `seq:${state.overlayRoll.seq} val:${state.overlayRoll.value}` : '—';
        hudBox.textContent =
          `turnIndex: ${state.turnIndex}\n` +
          `currentTurnUid: ${state.currentTurnUid || 'null'}\n` +
          `overlayRoll: ${or}\n` +
          `overlayCard: ${oc}`;
      }
    } catch(e){}

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

  // --- Wrap transport for diagnostics (writes/reads) ---
  (function wrapWriteState(){
    if (!T || !T.writeState || T._writeStateWrapped) return;
    const orig = T.writeState.bind(T);
    T.writeState = async function(diagState){
      mpDbg('WRITE_STATE_ATTEMPT', {
        turnIndex: diagState && diagState.turnIndex,
        overlayRoll: diagState && diagState.overlayRoll,
        overlayCard: diagState && diagState.overlayCard
          ? { id: diagState.overlayCard.id, title: diagState.overlayCard.title }
          : null
      });
      try {
        const res = await orig(diagState);
        mpDbg('WRITE_STATE_OK', { ok: true });
        return res;
      } catch (e){
        mpDbg('WRITE_STATE_FAIL', { message: e && e.message ? e.message : String(e) });
        throw e;
      }
    };
    T._writeStateWrapped = true;
  })();

  (function wrapOnState(){
    if (!T || !T.onState || T._onStateWrapped) return;
    const orig = T.onState.bind(T);
    T.onState = function(handler){
      return orig(function(state){
        mpDbg('STATE_RX', {
          turnIndex: state && state.turnIndex,
          currentTurnUid: state && state.currentTurnUid,
          overlayRoll: state && state.overlayRoll,
          overlayCard: state && state.overlayCard
            ? { id: state.overlayCard.id, title: state.overlayCard.title }
            : null,
          players: Array.isArray(state && state.players) ? state.players.map(p => p && p.name) : []
        });
        handler(state);
      });
    };
    T._onStateWrapped = true;
  })();

  async function hostLoop(engine){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    let overlayCard = null;
    let overlayRoll = null;
    let rollSeq = 0;

    // Intercept cards: queue only (no immediate write)
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      if (card) {
        queuedCard = { id: card.id || `${deck}-${Date.now()}`, title: deck, text: (card.text||'').trim() };
      } else {
        queuedCard = { id: `none-${Date.now()}`, title: deck, text: `The ${deck} deck is empty.` };
      }
      mpDbg('HOST_CARD_QUEUED', queuedCard);
    });

    engine.bus.on('CARD_RESOLVE', ()=>{
      mpDbg('HOST_CARD_RESOLVED_CLEARING', {});
      overlayCard = null;
      queuedCard = null;
      resolveCardPromise = null;
      T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    });

    const apply = async (ev) => {
      if (ev.type === 'ROLL') {
        // Run the engine turn; may queue a card via CARD_DRAWN
        await engine.takeTurn();

        // 1) Broadcast dice immediately
        rollSeq += 1;
        overlayRoll = { seq: rollSeq, value: Number(engine.state.lastRoll || 0) };
        mpDbg('HOST_WRITE_DICE_NOW', overlayRoll);
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));

        // 2) After dice wobble, publish the card if one was queued
        if (queuedCard) {
          mpDbg('HOST_SCHEDULE_CARD_PUBLISH', { delayMs: 2100, queuedCard });
          setTimeout(async () => {
            overlayCard = queuedCard;
            mpDbg('HOST_WRITE_CARD_NOW', overlayCard);
            await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
          }, 2100);
        }

      } else if (ev.type === 'RESTART') {
        engine.reset();
        rollSeq = 0;
        overlayRoll = null;
        overlayCard = null;
        queuedCard = null;
        resolveCardPromise = null;
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';

        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test((p && p.name) || ''));
        if (seat === -1) {
          seat = engine.state.players.findIndex(p => ((p && p.name) || '').toLowerCase() === wanted.toLowerCase());
        }

        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
          mpDbg('HOST_SET_NAME', { seat, name: wanted, by: ev.by || null });

          // Immediate write for names
          await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        }

      } else if (ev.type === 'ACK_CARD') {
        mpDbg('HOST_ACK_CARD_RCVD', {});
        if (typeof engine.ackCard === 'function') engine.ackCard();
      }

      // Final write to ensure state consistency
      await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    };

    await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    return T.onEvents(apply);
  }

  async function bootOverlay(){
    // 1) Initialise transport (Auth + Firestore). Bail if solo.
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth && T.auth.currentUser ? T.auth.currentUser.uid : null;
    mpDbg('BOOT_OK', { mode: T.mode, myUid });

    // 2) Wait for the single-player engine to be ready (poll up to ~5s)
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = (window.LegislateApp && window.LegislateApp.engine) || null;
      if (engine) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!engine) {
      console.warn('Engine not detected; overlay inactive.');
      mpDbg('BOOT_FAIL', { message: 'Engine not detected' });
      return;
    }

    // Diagnostics HUD
    try {
      let hud = document.getElementById('mp-hud');
      if (!hud) {
        hud = document.createElement('div');
        hud.id = 'mp-hud';
        hud.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;font:12px/1.3 monospace;background:rgba(0,0,0,.65);color:#fff;padding:8px 10px;border-radius:6px;max-width:340px;pointer-events:none;white-space:pre-wrap';
        hud.textContent = 'HUD init…';
        document.body.appendChild(hud);
      }
    } catch(e){}

    // 3) In MP, disable SP dice animation (we show the shared overlay dice only)
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.showDiceRoll === 'function') {
        window.LegislateUI.showDiceRoll = function(){ return Promise.resolve(); };
      }
      if (typeof window.LegislateUI.waitForDice === 'function') {
        window.LegislateUI.waitForDice = function(){ return Promise.resolve(); };
      }
    }

    // 4) Pull lobby selections
    const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    // 5) Lock SP controls (names edited in lobby; player count fixed)
    const pc = $('playerCount'); if (pc) pc.style.display = 'none';
    const playersSection = $('playersSection');
    if (playersSection) {
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    // Replace SP click handlers so overlay can gate rolls by turn owner
    function replaceWithClone(el){
      if (!el) return el;
      const c = el.cloneNode(true);
      el.parentNode.replaceChild(c, el);
      return c;
    }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // 6) Mirror authoritative Firestore state into the local engine + UI
    T.onState((st)=> {
      // trimmed snapshot also goes to #dbg-log via mpDbg in wrapper
      renderFromState(engine, st);
    });

    // 7) Host vs Guest wiring
    if (T.mode === 'host') {
      // Apply lobby player count to engine (triggers token render)
      if (pc && hostCount) {
        pc.value = String(hostCount);
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }

      // Apply host name to seat 0 (visual; ownership tracked by UIDs)
      if (myName && engine.state.players[0]) {
        engine.state.players[0].name = myName;
      }
      syncPlayersUI(engine, { players: engine.state.players });

      // Buttons (only enabled on your turn by updateRollEnabled)
      rollBtnRef && rollBtnRef.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn && restartBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        T.sendEvent({ type: 'RESTART' });
      });

      // Start the host event loop (handles dice → card order, names, etc.)
      hostLoop(engine);

    } else {
      // Guest: announce name once; host will immediately write it to state
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName, by: myUid });

      // Guests can press Roll only on their turn
      rollBtnRef && rollBtnRef.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });

      // Guests cannot restart
      restartBtn && restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();