(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // --- UX caches / flags ---
  let myUid = null;
  let lastCardKey = null;
  let lastRollSeqSeen = -1;

  // --- Debug helpers (trimmed snapshot) ---
  function snapshotForLog(st){
    if (!st) return st;
    return {
      turnIndex: st.turnIndex,
      currentTurnUid: st.currentTurnUid,
      lastRoll: st.lastRoll,
      overlayRoll: st.overlayRoll || null,
      overlayCard: st.overlayCard
        ? { id: st.overlayCard.id || null, title: st.overlayCard.title || '', text: String(st.overlayCard.text||'').slice(0,140) }
        : null,
      players: Array.isArray(st.players) ? st.players.map(p => p && p.name) : []
    };
  }
  function mpLog(label, data){
    const pretty = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    console.log("MP:", label, data);
    const dbg = document.getElementById("dbg-log");
    if (dbg) {
      if (dbg.textContent.length > 30000) dbg.textContent = dbg.textContent.slice(-20000);
      dbg.textContent += `\nMP: ${label}\n${pretty}\n`;
      dbg.scrollTop = dbg.scrollHeight;
    }
  }

  // Roll button control (only enable on my turn)
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    rollBtnRef.disabled = !(curr && myUid && curr === myUid);
  }

  // --- Players UI sync (lock names, keep pills) ---
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

  // --- Dice overlay (overlay-driven ONLY) ---
  function setDiceFace(value){
    const dice = document.getElementById('dice');
    if (!dice) return;
    for (let i=1;i<=6;i++) dice.classList.remove('show-'+i);
    dice.classList.add('show-'+Math.max(1, Math.min(6, Number(value)||1)));
  }

  function maybeShowDice(state){
    const r = state && state.overlayRoll;
    if (!r || typeof r.seq !== 'number' || typeof r.value !== 'number') return;
    if (r.seq === lastRollSeqSeen) return;
    lastRollSeqSeen = r.seq;

    mpLog("Received overlayRoll", r);

    const overlay = document.getElementById('diceOverlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
    }
    setDiceFace(r.value);

    // Auto-hide after ~2s (matches SP UI feel)
    setTimeout(()=>{
      if (overlay) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }
    }, 2000);
  }

  // --- Cards (overlay-driven; only active player can dismiss) ---
  let sharedModal = null;
  function maybeShowCard(state){
    const oc = state && state.overlayCard;
    const key = oc ? (oc.id || oc.title || JSON.stringify(oc)).slice(0,100) : null;
    if (!oc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return; // avoid duplicate open on same card
    lastCardKey = key;

    mpLog("Received overlayCard", oc);

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
      }).then(() => {
        if (canDismiss) {
          // Brief pause before advancing turn (multiplayer-consistent)
          setTimeout(()=>{ T.sendEvent({ type: 'ACK_CARD' }); }, 1200);
        }
      });
    } else {
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        setTimeout(()=>{ T.sendEvent({ type: 'ACK_CARD' }); }, 1200);
      }
    }
  }

  // --- Render Firestore state into engine + UI ---
  function renderFromState(engine, state){
    if (!state) return;

    engine.state.players    = state.players  || engine.state.players;
    engine.state.turnIndex  = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll   = (state.lastRoll ?? engine.state.lastRoll);

    syncPlayersUI(engine, state);

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    updateRollEnabled(state);

    // Everyone sees overlay dice; card shows when host publishes it after dice
    maybeShowDice(state);
    if (state.overlayCard) maybeShowCard(state);
  }

  // --- Host compute + publish ---
  function computeOutState(engine, mapping, overlayCard, overlayRoll){
    const out = deepClone(engine.state);
    const turnIdx = out.turnIndex || 0;
    out.overlaySeatUids = mapping.overlaySeatUids || [];
    out.currentTurnUid  = out.overlaySeatUids[turnIdx] || null;
    out.overlayCard     = overlayCard || null;
    out.overlayRoll     = overlayRoll || null;
    return out;
  }

  async function hostLoop(engine, intercept){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    let overlayCard = null;
    let overlayRoll = null;
    let rollSeq = 0;

    // Card captured via interceptor (see bootOverlay); store here:
    let queuedCard = null;
    intercept.setQueuedCard = (payload) => { queuedCard = payload; mpLog("Host queued card (intercepted)", payload); };

    // Keep legacy safety: if engine does emit CARD_DRAWN, also queue it
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      const payload = card
        ? { id: card.id || `${deck}-${Date.now()}`, title: card.title || deck, text: (card.text||'').trim() }
        : { id: `none-${Date.now()}`, title: 'No card', text: `The ${deck} deck is empty.` };
      queuedCard = payload;
      mpLog("Host queued card (bus)", payload);
    });

    // Clear card overlay when resolved
    engine.bus.on('CARD_RESOLVE', ()=>{
      overlayCard = null;
      queuedCard = null;
      T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
      mpLog("Host cleared overlayCard", {});
    });

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn();

        // 1) Publish dice immediately
        rollSeq += 1;
        overlayRoll = { seq: rollSeq, value: Number(engine.state.lastRoll || 0) };
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        mpLog("Host wrote overlayRoll", overlayRoll);

        // 2) Publish card after dice wobble
        if (queuedCard) {
          setTimeout(async ()=>{
            overlayCard = queuedCard;
            queuedCard = null;
            await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
            mpLog("Host wrote overlayCard (post-dice)", overlayCard);
          }, 2100);
        }
        return;

      } else if (ev.type === 'RESTART') {
        engine.reset();
        rollSeq = 0;
        overlayRoll = null;
        overlayCard = null;
        queuedCard = null;

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
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        mpLog("Host processed ACK_CARD", {});
        return;
      }

      await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    };

    await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    return T.onEvents(apply);
  }

  // Helper: extract text from HTML snippets we intercept
  function htmlToPlainText(html){
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  // Host-side interceptor: capture SP modal requests and turn them into queued cards
  function installHostCardInterceptor(intercept){
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;

    const originalCreateModal = window.LegislateUI.createModal;

    window.LegislateUI.createModal = function(){
      const real = originalCreateModal ? originalCreateModal() : null;

      // Return a proxy with an open() that captures and suppresses SP modal
      return {
        open(opts){
          // Extract details from SP modal call
          const title = String(opts && opts.title || 'Card');
          // Body may be HTML; convert to plain text for transport
          const bodyHtml = opts && opts.body || '';
          const text = htmlToPlainText(bodyHtml);

          // Queue for overlay publication (handled in hostLoop)
          const payload = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, title, text };
          if (typeof intercept.setQueuedCard === 'function') {
            intercept.setQueuedCard(payload);
          }

          // Suppress local SP modal (overlay will show shared one later)
          return Promise.resolve(true);
        }
      };
    };
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

    // Lock SP controls that shouldn't change in MP
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
    T.onState((st)=> {
      mpLog("State sync", snapshotForLog(st));
      renderFromState(engine, st);
    });

    if (T.mode === 'host') {
      // Intercept SP modal opens to capture cards for overlay
      const intercept = {};
      installHostCardInterceptor(intercept);

      // Apply lobby selections and trigger SP rebuild (players/tokens)
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

      // Host controls
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      hostLoop(engine, intercept);

    } else {
      // Guest announces their chosen name once
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      // Guests can only roll on their turn
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });

      // Guests cannot restart
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();