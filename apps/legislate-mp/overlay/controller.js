(function(){
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id)=>document.getElementById(id);

  function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

  // Local UX caches
  let lastCardKey  = null;
  let myUid = null;

  // Shared overlay ordering
  let queuedCard = null;
  let rollSeq    = 0;

  // Roll button control
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

  // Dice (shared overlay)
  let lastRollSeqSeen = -1;
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

  // Card modal (shared only)
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
      if (!sharedModal) sharedModal = window.LegislateUI.createModal();
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

  // Render state into engine + UI
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

  // Build full outbound state
  function computeOutState(engine, mapping, overlayCard){
    const out = deepClone(engine.state);
    const turnIdx = out.turnIndex || 0;
    out.overlaySeatUids = mapping.overlaySeatUids || [];
    out.currentTurnUid  = out.overlaySeatUids[turnIdx] || null;
    out.overlayCard     = overlayCard || null;
    return out;
  }

  // Host loop
  async function hostLoop(engine){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    // Buffer cards
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
  queuedCard = card
    ? { id: card.id || `${deck}-${Date.now()}`, title: card.title || deck, text: (card.text||'').trim() }
    : { id: `none-${Date.now()}`, title: deck || 'Card', text: 'No card.' };
});

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        const preTurnIdx = Number(engine.state.turnIndex || 0);
        const seatUids   = Array.isArray(engine.state.overlaySeatUids)
          ? engine.state.overlaySeatUids
          : (map.overlaySeatUids || []);
        const rollerUid  = seatUids[preTurnIdx] || null;

        await engine.takeTurn();

        // Write #1: dice
        rollSeq += 1;
        await T.writeState(Object.assign(
          computeOutState(engine, { overlaySeatUids: seatUids }, null),
          { overlayRoll: { seq: rollSeq, value: Number(engine.state.lastRoll||0) },
            currentTurnUid: rollerUid }
        ));

        // Write #2: card (after wobble)
        setTimeout(async ()=>{
          if (queuedCard) {
            await T.writeState(Object.assign(
              computeOutState(engine, { overlaySeatUids: seatUids }, queuedCard),
              { currentTurnUid: rollerUid }
            ));
          }
        }, 2100);

      } else if (ev.type === 'RESTART') {
        engine.reset(); queuedCard = null; rollSeq = 0;
        await T.writeState(Object.assign(
          computeOutState(engine, map, null),
          { overlayCard: null, overlayRoll: null }
        ));

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name||'').trim().slice(0,24) || 'Player';
        let seat = engine.state.players.findIndex(p=>/^Player \d+$/i.test(p.name||''));
        if (seat === -1) seat = engine.state.players.findIndex(p=>(p.name||'').toLowerCase()===wanted.toLowerCase());
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
          await T.writeState(computeOutState(engine, map, queuedCard||null));
        }

      } else if (ev.type === 'ACK_CARD') {
  // Only the active player's ACK is valid
  const turnIdx = Number(engine.state.turnIndex || 0);
  const currUid = Array.isArray(map.overlaySeatUids)
    ? map.overlaySeatUids[turnIdx] || null
    : null;
  if (!currUid || !ev.by || ev.by !== currUid) return;

  // Apply the effect in the SP engine (positions/turn may change)
  if (typeof engine.ackCard === 'function') {
    engine.ackCard();
  }

  // Now it’s safe to clear the shared card
  queuedCard = null;

  // Publish a full state with overlayCard cleared (no partial overwrite)
  await T.writeState(Object.assign(
    computeOutState(engine, map, null),
    { overlayCard: null }
  ));
}
};
    await T.writeState(computeOutState(engine, map, null));
    return T.onEvents(apply);
  }

  // Boot
  async function bootOverlay(){
    await T.init();
    if (T.mode==='solo') return;

    myUid = T.auth?.currentUser?.uid || null;

    // Disable SP dice + card modal
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.animateDie==='function') window.LegislateUI.animateDie=()=>Promise.resolve();
      if (typeof window.LegislateUI.showDiceRoll==='function') window.LegislateUI.showDiceRoll=()=>Promise.resolve();
      if (typeof window.LegislateUI.waitForDice==='function') window.LegislateUI.waitForDice=()=>Promise.resolve();
      if (typeof window.LegislateUI.createModal==='function') window.LegislateUI.createModal=()=>({ open:()=>Promise.resolve() });
    }

    // Wait for engine
    let engine=null;
    for (let i=0;i<25;i++){ engine=window.LegislateApp&&window.LegislateApp.engine; if(engine) break; await new Promise(r=>setTimeout(r,200)); }
    if (!engine) { console.warn('Engine not detected; overlay inactive.'); return; }

    // Lobby values
    const myName=(sessionStorage.getItem('MP_NAME')||'').trim().slice(0,24);
    const hostCount=Number(sessionStorage.getItem('MP_PLAYER_COUNT')||0);

    // UI
    const pc=$('playerCount'); if(pc) pc.style.display='none';
    const playersSection=$('playersSection');
    if(playersSection){
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown', e=>e.preventDefault(), true);
    }

    // Replace SP buttons
    function replaceWithClone(el){ if(!el) return el; const c=el.cloneNode(true); el.parentNode.replaceChild(c,el); return c; }
    rollBtnRef=replaceWithClone($('rollBtn'));
    let restartBtn=replaceWithClone($('restartBtn'));

    T.onState(st=>renderFromState(engine, st));

    if(T.mode==='host'){
      if(pc && hostCount){ pc.value=String(hostCount); pc.dispatchEvent(new Event('change',{bubbles:true})); }
      else if(hostCount && typeof engine.setPlayerCount==='function'){ engine.setPlayerCount(hostCount); }
      if(myName && engine.state.players[0]) engine.state.players[0].name=myName;

      syncPlayersUI(engine,{players:engine.state.players});

      rollBtnRef?.addEventListener('click', e=>{ e.preventDefault(); if(!rollBtnRef.disabled) T.sendEvent({type:'ROLL'}); });
      restartBtn?.addEventListener('click', e=>{ e.preventDefault(); T.sendEvent({type:'RESTART'}); });

      hostLoop(engine);
    } else {
      if(myName) T.sendEvent({type:'SET_NAME', name:myName});
      rollBtnRef?.addEventListener('click', e=>{ e.preventDefault(); if(!rollBtnRef.disabled) T.sendEvent({type:'ROLL'}); });
      restartBtn?.addEventListener('click', e=>{ e.preventDefault(); });
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();