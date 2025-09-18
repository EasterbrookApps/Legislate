(function(){
  const MP = (window.MP = window.MP || {});
  const T  = MP.transport;
  const $  = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // ────────────────────────────────────────────────────────────────────────────
  // Local UX caches
  // ────────────────────────────────────────────────────────────────────────────
  let myUid = null;

  // Dice / card display guards
  let lastCardKey = null;
  let lastRollSeqSeen = -1;

  // Shared overlay ordering & buffering
  let queuedCard = null;          // buffer the drawn card; publish after dice wobble
  let rollSeq    = 0;             // monotonically increasing dice sequence
  let resolveCardPromise = null;  // host-only: release SP modal on shared ACK
  let ORIG_CREATE_MODAL = null;   // host-only: keep original factory to render shared modal

  // Roll button control (enabled only on my turn)
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    rollBtnRef.disabled = !(curr && myUid && curr === myUid);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Players UI sync (hide extras, set names, lock editing)
  // ────────────────────────────────────────────────────────────────────────────
  function syncPlayersUI(engine, state){
    const players = (state && state.players) || engine.state.players || [];
    const root = $('playersSection');
    if (!root) return;

    const pills = Array.from(root.querySelectorAll('.player-pill'));
    if (!pills.length) return;

    for (let i = 0; i < pills.length; i++) {
      const pill = pills[i];
      const nameSpan = pill.querySelector('.player-name');

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

  // ────────────────────────────────────────────────────────────────────────────
  // Dice (shared overlay, ordered by seq)
  // ────────────────────────────────────────────────────────────────────────────
  function maybeShowDice(state){
    const r = state && state.overlayRoll;
    if (!r || typeof r.seq !== 'number' || typeof r.value !== 'number') return;
    if (r.seq === lastRollSeqSeen) return;
    lastRollSeqSeen = r.seq;

    const overlay = document.getElementById('diceOverlay');
    const dice    = document.getElementById('dice');
    if (overlay && dice) {
      for (let i = 1; i <= 6; i++) dice.classList.remove('show-'+i);
      dice.classList.add('show-'+Math.max(1, Math.min(6, Number(r.value)||1)));
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden','false');
      setTimeout(()=>{
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden','true');
      }, 2000);
      return;
    }
    if (window.LegislateUI?.animateDie) {
      window.LegislateUI.animateDie(Number(r.value)||1, 900);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Card modal for everyone; only current-turn player can dismiss
  // ────────────────────────────────────────────────────────────────────────────
  let sharedModal = null;
  function maybeShowCard(state){
    const oc  = state && state.overlayCard;
    const key = oc ? (oc.id || oc.title || JSON.stringify(oc)).slice(0,100) : null;

    if (!oc) { lastCardKey = null; return; }
    if (key && key === lastCardKey) return;
    lastCardKey = key;

    const title = String(oc.title || 'Card');
    const text  = String(oc.text  || '');
    const canDismiss = !!(myUid && state.currentTurnUid && (state.currentTurnUid === myUid));

    if (window.LegislateUI?.createModal) {
      if (!sharedModal) {
        // Host uses the original factory so the shared modal renders on host too
        const factory = (T.mode === 'host' && ORIG_CREATE_MODAL) ? ORIG_CREATE_MODAL : window.LegislateUI.createModal;
        sharedModal = factory();
      }
      sharedModal.open({
        title,
        body: `<p>${text}</p>`,
        okText: canDismiss ? 'OK' : 'Waiting for player…',
        okDisabled: !canDismiss
      }).then(()=>{ if (canDismiss) T.sendEvent({ type: 'ACK_CARD' }); });
    } else if (canDismiss) {
      if (confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        T.sendEvent({ type: 'ACK_CARD' });
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Render state into local engine + UI
  // ────────────────────────────────────────────────────────────────────────────
  function renderFromState(engine, state){
    if (!state) return;

    engine.state.players   = state.players  || engine.state.players;
    engine.state.turnIndex = (state.turnIndex ?? engine.state.turnIndex);
    engine.state.lastRoll  = (state.lastRoll  ?? engine.state.lastRoll);

    syncPlayersUI(engine, state);

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    updateRollEnabled(state);
    maybeShowDice(state);
    maybeShowCard(state);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Build the full outbound state (never partial!)
  // ────────────────────────────────────────────────────────────────────────────
  function computeOutState(engine, mapping, overlayCard){
    const out = deepClone(engine.state);
    const turnIdx = out.turnIndex || 0;
    out.overlaySeatUids = mapping.overlaySeatUids || [];
    out.currentTurnUid  = out.overlaySeatUids[turnIdx] || null;
    out.overlayCard     = overlayCard || null;
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Host loop: handle events and publish dice→card in order
  // ────────────────────────────────────────────────────────────────────────────
  async function hostLoop(engine){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    // Buffer the card; don't write from handlers
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      if (card) {
        queuedCard = { id: card.id || `${deck}-${Date.now()}`, title: card.title || deck, text: (card.text||'').trim() };
      } else {
        queuedCard = { id: `none-${Date.now()}`, title: deck || 'Card', text: 'No card.' };
      }
    });
    engine.bus.on('CARD_RESOLVE', ()=>{ queuedCard = null; });

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        // Capture roller before engine mutates turnIndex
        const preTurnIdx = Number(engine.state.turnIndex || 0);
        const seatUids   = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids : (map.overlaySeatUids || []);
        const rollerUid  = seatUids[preTurnIdx] || null;

        await engine.takeTurn();

        // Write #1: DICE FIRST (full doc) — correctness: no partial overwrite
        rollSeq += 1;
        await T.writeState(Object.assign(
          computeOutState(engine, { overlaySeatUids: seatUids }, /* overlayCard */ null),
          {
            overlayRoll:   { seq: rollSeq, value: Number(engine.state.lastRoll || 0) },
            currentTurnUid: rollerUid
          }
        ));

        // After wobble, write #2: CARD (full doc) if any; else leave as-is
        setTimeout(async ()=>{
          if (queuedCard) {
            await T.writeState(Object.assign(
              computeOutState(engine, { overlaySeatUids: seatUids }, queuedCard),
              { currentTurnUid: rollerUid }
            ));
          }
        }, 2100);

      } else if (ev.type === 'RESTART') {
        engine.reset();
        queuedCard = null;
        rollSeq = 0;
        await T.writeState(Object.assign(
          computeOutState(engine, map, null),
          { overlayCard: null, overlayRoll: null }
        ));

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test(p.name||''));
        if (seat === -1) seat = engine.state.players.findIndex(p => (p.name||'').toLowerCase() === wanted.toLowerCase());
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
          await T.writeState(computeOutState(engine, map, queuedCard ? queuedCard : null));
        }

      } else if (ev.type === 'ACK_CARD') {
        // Only the active player's ACK is valid
        const turnIdx = Number(engine.state.turnIndex || 0);
        const currUid = Array.isArray(map.overlaySeatUids) ? map.overlaySeatUids[turnIdx] || null : null;
        if (!currUid || !ev.by || ev.by !== currUid) return;

        // Apply effect in SP engine and resolve suppressed SP modal (if any)
        if (typeof engine.ackCard === 'function') engine.ackCard();
        if (typeof resolveCardPromise === 'function') { try { resolveCardPromise(true); } catch(_) {} resolveCardPromise = null; }
        queuedCard = null;

        // Publish updated engine with overlayCard cleared (full write)
        await T.writeState(Object.assign(
          computeOutState(engine, map, null),
          { overlayCard: null }
        ));
      }
    };

    // Initial publish (full)
    await T.writeState(computeOutState(engine, map, null));
    return T.onEvents(apply);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Boot
  // ────────────────────────────────────────────────────────────────────────────
  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

    // Disable SP dice so only shared overlay dice runs
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.animateDie   === 'function') window.LegislateUI.animateDie   = ()=>Promise.resolve();
      if (typeof window.LegislateUI.showDiceRoll === 'function') window.LegislateUI.showDiceRoll = ()=>Promise.resolve();
      if (typeof window.LegislateUI.waitForDice  === 'function') window.LegislateUI.waitForDice  = ()=>Promise.resolve();
    }

    // Wait for SP engine instance
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = window.LegislateApp && window.LegislateApp.engine;
      if (engine) break;
      await new Promise(r=>setTimeout(r,200));
    }
    if (!engine) { console.warn('Engine not detected; overlay inactive.'); return; }

    // Host: suppress SP modal → buffer card (don’t block / don’t render)
    if (T.mode === 'host' && window.LegislateUI && typeof window.LegislateUI.createModal === 'function') {
      ORIG_CREATE_MODAL = window.LegislateUI.createModal;
      window.LegislateUI.createModal = function(){
        return {
          open(opts){
            // Pull plain text from provided HTML body
            const tmp = document.createElement('div');
            tmp.innerHTML = (opts && opts.body) || '';
            const text = (tmp.textContent || tmp.innerText || '').trim();
            queuedCard = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
              title: String((opts && opts.title) || 'Card'),
              text
            };
            // Return promise that we resolve on shared ACK
            return new Promise((resolve)=>{ resolveCardPromise = resolve; });
          }
        };
      };
    }

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

    // Replace SP handlers; overlay will gate rolls by currentTurnUid
    function replaceWithClone(el){
      if (!el) return el;
      const c = el.cloneNode(true);
      el.parentNode.replaceChild(c, el);
      return c;
    }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    const restartBtn = replaceWithClone($('restartBtn'));

    // Mirror authoritative state into local engine + UI
    T.onState((st)=> renderFromState(engine, st));

    if (T.mode === 'host') {
      // Apply lobby choices and trigger SP 'change' for token rebuild
      if (pc && hostCount) {
        pc.value = String(hostCount);
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }
      if (myName && engine.state.players[0]) engine.state.players[0].name = myName;

      syncPlayersUI(engine, { players: engine.state.players });

      rollBtnRef && rollBtnRef.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn && restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      hostLoop(engine);
    } else {
      // Guest name once; host will map it to a seat
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      rollBtnRef && rollBtnRef.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn && restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); /* guests cannot restart */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();