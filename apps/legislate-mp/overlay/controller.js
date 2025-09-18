(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // Local UX caches
  let lastRollSeen = null;
  let lastCardKey  = null;
  let myUid = null;

  // ⬇️ ADD: buffer + sequence for shared dice / card ordering
  let queuedCard = null; // buffer a drawn card; publish after dice wobble
  let rollSeq = 0;       // monotonically increasing dice sequence

  // Roll button control (only enable on my turn)
  let rollBtnRef = null;
  function updateRollEnabled(state){
    if (!rollBtnRef) return;
    const curr = state && state.currentTurnUid;
    // Enabled only if we know whose turn it is AND it's mine
    rollBtnRef.disabled = !(curr && myUid && curr === myUid);
  }

  // --- Players UI sync (hide extras, set names, lock editing) ---
  function syncPlayersUI(engine, state){
    const players = (state && state.players) || engine.state.players || [];
    const root = $('playersSection');
    if (!root) return;

    const pills = Array.from(root.querySelectorAll('.player-pill'));
    // If there are no pills yet (very early), do nothing; the app will render once.
    if (!pills.length) return;

    for (let i = 0; i < pills.length; i++) {
      const pill = pills[i];
      const nameSpan = pill.querySelector('.player-name');

      if (i < players.length) {
        // Show & rename
        pill.style.display = '';
        if (nameSpan) {
          nameSpan.textContent = players[i]?.name || `Player ${i+1}`;
          nameSpan.setAttribute('contenteditable', 'false');
          nameSpan.title = 'Names are set in the lobby';
        }
        // Make the whole pill read-only
        pill.style.pointerEvents = 'none';
        pill.tabIndex = -1;
      } else {
        // Hide extra pills
        pill.style.display = 'none';
      }
    }
  }

  // Dice for everyone (shared overlay dice, ordered by seq)
  let lastRollSeqSeen = -1;
  function maybeShowDice(state){
    const r = state && state.overlayRoll;
    if (!r || typeof r.seq !== 'number' || typeof r.value !== 'number') return;
    if (r.seq === lastRollSeqSeen) return;
    lastRollSeqSeen = r.seq;

    // Try the CSS overlay dice first
    const overlay = document.getElementById('diceOverlay');
    const dice = document.getElementById('dice');
    if (overlay && dice) {
      for (let i = 1; i <= 6; i++) dice.classList.remove('show-' + i);
      dice.classList.add('show-' + Math.max(1, Math.min(6, Number(r.value) || 1)));
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }, 2000);
      return;
    }

    // Fallback to SP animateDie if overlay not present
    if (window.LegislateUI?.animateDie) {
      window.LegislateUI.animateDie(Number(r.value) || 1, 900);
    }
  }

  // Card modal for everyone; only current-turn player can dismiss
  let sharedModal = null;
  function maybeShowCard(state){
    const oc = state && state.overlayCard; // we publish this from host
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

    // Keep pills in sync with the authoritative state
    syncPlayersUI(engine, state);

    // Turn UI + tokens
    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    updateRollEnabled(state);
    maybeShowDice(state);
    maybeShowCard(state);
  }

  // Host: attach mapping of seat -> uid and compute currentTurnUid
  function computeOutState(engine, mapping, overlayCard){
    const out = deepClone(engine.state);
    const turnIdx = out.turnIndex || 0;
    out.overlaySeatUids = mapping.overlaySeatUids || [];
    out.currentTurnUid  = out.overlaySeatUids[turnIdx] || null;
    out.overlayCard     = overlayCard || null;
    return out;
  }

  async function hostLoop(engine){
    // seatIndex -> uid
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    // ⬇️ CHANGED: buffer the card; do not write in bus handlers
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      if (card) {
        queuedCard = { id: card.id || `${deck}-${Date.now()}`, title: card.title || deck, text: (card.text||'').trim() };
      } else {
        queuedCard = { id: `none-${Date.now()}`, title: deck || 'Card', text: 'No card.' };
      }
    });
    engine.bus.on('CARD_RESOLVE', ()=>{
      queuedCard = null;
    });

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        // Capture roller before engine mutates turnIndex
        const preTurnIdx = Number(engine.state.turnIndex || 0);
        const seatUids   = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids : (map.overlaySeatUids || []);
        const rollerUid  = seatUids[preTurnIdx] || null;

        await engine.takeTurn();

        // Broadcast shared dice first
        rollSeq += 1;
        await T.writeState(Object.assign(
          computeOutState(engine, { overlaySeatUids: seatUids }, /*overlayCard*/ null),
          {
            overlayRoll: { seq: rollSeq, value: Number(engine.state.lastRoll || 0) },
            currentTurnUid: rollerUid
          }
        ));

        // After dice wobble, publish the card if we buffered one
        setTimeout(async ()=>{
          if (queuedCard) {
            await T.writeState(Object.assign(
              computeOutState(engine, { overlaySeatUids: seatUids }, queuedCard),
              { currentTurnUid: rollerUid }
            ));
          } else {
            // Ensure no stale card remains
            await T.writeState({ overlayCard: null, currentTurnUid: rollerUid });
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
        // Place into first "Player N" slot; record uid mapping
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test(p.name||''));
        if (seat === -1) seat = engine.state.players.findIndex(p => (p.name||'').toLowerCase() === wanted.toLowerCase());
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
          await T.writeState(computeOutState(engine, map, queuedCard ? queuedCard : null));
        }

      } else if (ev.type === 'ACK_CARD') {
        if (typeof engine.ackCard === 'function') engine.ackCard();
        queuedCard = null;
        // Clear overlayCard after applying effect
        await T.writeState(Object.assign(
          computeOutState(engine, { overlaySeatUids: engine.state.overlaySeatUids || map.overlaySeatUids || [] }, null),
          { overlayCard: null }
        ));
      }

      // ⬇️ NOTE: removed the unconditional write here to avoid reordering
      // await T.writeState(computeOutState(engine, map, queuedCard ? queuedCard : null));
    };

    // Initial publish
    await T.writeState(computeOutState(engine, map, null));
    return T.onEvents(apply);
  }

  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

    // ⬇️ ADD: disable SP dice so we only show the shared overlay dice
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.animateDie === 'function') {
        window.LegislateUI.animateDie = function(){ return Promise.resolve(); };
      }
      if (typeof window.LegislateUI.showDiceRoll === 'function') {
        window.LegislateUI.showDiceRoll = function(){ return Promise.resolve(); };
      }
      if (typeof window.LegislateUI.waitForDice === 'function') {
        window.LegislateUI.waitForDice = function(){ return Promise.resolve(); };
      }
    }

    // Wait for engine (poll ~5s)
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
    const pc = $('playerCount');
    if (pc) pc.style.display = 'none'; // count set in lobby

    // Keep players container visible but read-only
    const playersSection = $('playersSection');
    if (playersSection) {
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    // Kill SP handlers; rebind
    function replaceWithClone(el){
      if (!el) return el;
      const c = el.cloneNode(true);
      el.parentNode.replaceChild(c, el);
      return c;
    }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Everyone mirrors authoritative state (and we sync pills every time)
    T.onState((st)=> renderFromState(engine, st));

    if (T.mode === 'host') {
      // === Apply lobby choices and trigger the real SP 'change' logic so tokens & pills rebuild ===
      if (pc && hostCount) {
        pc.value = String(hostCount);
        // This fires app.js' change handler: it calls engine.setPlayerCount, clears tokens, rebuilds pills.
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }
      if (myName && engine.state.players[0]) {
        engine.state.players[0].name = myName;
      }

      // Immediately align the current DOM pills to state (hide extras, set names, lock editing)
      syncPlayersUI(engine, { players: engine.state.players });

      // Host can roll only on *their* turn (also gated by updateRollEnabled) and can restart
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      // Start processing events & broadcasting card info/turn owner
      hostLoop(engine);

    } else {
      // Guest announces their name once
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      // Guests can only roll on their own turn
      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
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