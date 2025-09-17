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
    if (r.seq === lastRollSeqSeen) return;
    lastRollSeqSeen = r.seq;

    mpLog("Received overlayRoll", r);

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
          setTimeout(()=>{ T.sendEvent({ type: 'ACK_CARD' }); }, 1200);
        }
      });
    } else {
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        setTimeout(()=>{ T.sendEvent({ type: 'ACK_CARD' }); }, 1200);
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

  async function hostLoop(engine, intercept){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth?.currentUser?.uid || null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    let overlayCard = null;
    let overlayRoll = null;
    let rollSeq = 0;

    let queuedCard = null;
    let resolveCardPromise = null;

    intercept.setQueuedCard = (payload, resolver) => {
      queuedCard = payload;
      resolveCardPromise = resolver;
      mpLog("Host queued card (intercepted)", payload);
    };

    engine.bus.on('CARD_RESOLVE', ()=>{
      overlayCard = null;
      T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
      mpLog("Host cleared overlayCard", {});
    });

    const apply = async (ev)=>{
      if (ev.type === 'ROLL') {
        await engine.takeTurn();
        rollSeq += 1;
        overlayRoll = { seq: rollSeq, value: Number(engine.state.lastRoll || 0) };
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        mpLog("Host wrote overlayRoll", overlayRoll);

        if (queuedCard) {
          setTimeout(async ()=>{
            overlayCard = queuedCard;
            await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
            mpLog("Host wrote overlayCard (post-dice)", overlayCard);
          }, 2100);
        }

      } else if (ev.type === 'ACK_CARD') {
        if (typeof resolveCardPromise === 'function') {
          resolveCardPromise(true);
          resolveCardPromise = null;
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
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test(p.name||''));
        if (seat === -1) seat = engine.state.players.findIndex(p => (p.name||'').toLowerCase() === wanted.toLowerCase());
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
        }
      }

      await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    };

    await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    return T.onEvents(apply);
  }

  // --- Interceptor (patched) ---
  function htmlToPlainText(html){
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function installHostCardInterceptor(intercept){
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;

    const originalCreateModal = window.LegislateUI.createModal;

    window.LegislateUI.createModal = function(){
      originalCreateModal && originalCreateModal();
      return {
        open(opts){
          const title = String(opts?.title || 'Card');
          const text  = htmlToPlainText(opts?.body || '');
          const payload = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, title, text };

          return new Promise((resolve)=>{
            if (typeof intercept.setQueuedCard === 'function') {
              intercept.setQueuedCard(payload, resolve);
            } else {
              let tries = 0;
              const timer = setInterval(()=>{
                if (typeof intercept.setQueuedCard === 'function') {
                  clearInterval(timer);
                  intercept.setQueuedCard(payload, resolve);
                } else if (++tries > 60) {
                  clearInterval(timer);
                }
              }, 50);
            }
          });
        }
      };
    };
  }

  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

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

    T.onState((st)=> {
      mpLog("State sync", snapshotForLog(st));
      renderFromState(engine, st);
    });

    if (T.mode === 'host') {
      const intercept = {};
      hostLoop(engine, intercept);
      installHostCardInterceptor(intercept);

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

      rollBtnRef?.addEventListener('click', (e)=>{
        e.preventDefault();
        if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' });
      });
      restartBtn?.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

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