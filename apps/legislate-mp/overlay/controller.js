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

  // Shared card handling (host-side)
  let queuedCard = null;
  let resolveCardPromise = null;

  // --- Always-on multiplayer diagnostics (console + #dbg-log) ---
  function mpDbg(ev, data){
    const stamp = new Date().toISOString();
    const pretty = (data && typeof data === 'object') ? JSON.stringify(data, null, 2) : String(data ?? '');
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

  // --- Players UI sync (keep pills visible but locked) ---
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
          nameSpan.textContent = players[i] && players[i].name ? players[i].name : `Player ${i+1}`;
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

  // --- Dice helpers (shared overlay dice only) ---
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

    if (!seenFirstState) { lastRollSeqSeen = r.seq; return; }
    if (r.seq === lastRollSeqSeen) return;
    lastRollSeqSeen = r.seq;

    const overlay = document.getElementById('diceOverlay');
    if (overlay) { overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false'); }
    setDiceFace(r.value);
    setTimeout(()=>{ if (overlay) { overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); } }, 2000);
  }

  // --- Cards (shared modal only) ---
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

    if (window.LegislateUI && typeof window.LegislateUI.createModal === 'function') {
      if (!sharedModal) sharedModal = window.LegislateUI.createModal();
      sharedModal.open({
        title,
        body: `<p>${text}</p>`,
        okText: canDismiss ? 'OK' : 'Waiting for player…',
        okDisabled: !canDismiss
      }).then(() => {
        if (canDismiss) {
          mpDbg('CARD_ACK_SENT', { by: myUid });
          T.sendEvent({ type: 'ACK_CARD', by: myUid });
        }
      });
    } else {
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        mpDbg('CARD_ACK_SENT', { by: myUid });
        T.sendEvent({ type: 'ACK_CARD', by: myUid });
      }
    }
  }

  // --- Render state into engine + UI ---
  function renderFromState(engine, state){
    if (!state) return;
    engine.state.players    = state.players  || engine.state.players;
    engine.state.turnIndex  = (state.turnIndex !== undefined ? state.turnIndex : engine.state.turnIndex);
    engine.state.lastRoll   = (state.lastRoll !== undefined ? state.lastRoll : engine.state.lastRoll);

    syncPlayersUI(engine, state);

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: (engine.state.players[idx] && engine.state.players[idx].id) });

    updateRollEnabled(state);
    maybeShowDice(state);
    maybeShowCard(state);

    // HUD update (small overlay box)
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
      try { const res = await orig(diagState); mpDbg('WRITE_STATE_OK', { ok: true }); return res; }
      catch (e){ mpDbg('WRITE_STATE_FAIL', { message: e && e.message ? e.message : String(e) }); throw e; }
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

  // --- Modal interception/suppression ---
  function installHostModalInterceptor(queueFn, setResolverFn){
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;
    const origCreate = window.LegislateUI.createModal;
    window.LegislateUI.createModal = function(){
      origCreate && origCreate(); // keep engine expectations
      return {
        open(opts){
          const title = String((opts && opts.title) || 'Card');
          const bodyHtml = (opts && opts.body) || '';
          const tmp = document.createElement('div'); tmp.innerHTML = bodyHtml;
          const text = (tmp.textContent || tmp.innerText || '').trim();
          const payload = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, title, text };
          mpDbg('HOST_INTERCEPT_MODAL', payload);
          if (typeof queueFn === 'function') queueFn(payload);
          return new Promise((resolve)=> { if (typeof setResolverFn === 'function') setResolverFn(resolve); });
        }
      };
    };
  }

  function installGuestModalSuppressor(){
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;
    const origCreate = window.LegislateUI.createModal;
    window.LegislateUI.createModal = function(){
      origCreate && origCreate();
      return { open(){ mpDbg('GUEST_SUPPRESS_SP_MODAL', {}); return Promise.resolve(); } };
    };
  }

  // --- Host loop (authoritative) ---
  async function hostLoop(engine){
    const map = { overlaySeatUids: [] };
    const hostUid = T.auth && T.auth.currentUser ? T.auth.currentUser.uid : null;
    if (hostUid) map.overlaySeatUids[0] = hostUid;

    let overlayCard = null;
    let overlayRoll = null;

    // Queue card on draw (do NOT write yet; we write after dice wobble)
    engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
      if (card) queuedCard = { id: card.id || `${deck}-${Date.now()}`, title: deck, text: (card.text||'').trim() };
      else queuedCard = { id: `none-${Date.now()}`, title: deck, text: `The ${deck} deck is empty.` };
      mpDbg('HOST_CARD_QUEUED', queuedCard);
    });

    // Do not clear on CARD_RESOLVE; we clear on ACK
    engine.bus.on('CARD_RESOLVE', ()=>{ mpDbg('HOST_CARD_RESOLVE_EVENT', {}); });

    const apply = async (ev) => {
      if (ev.type === 'RESTART') {
        engine.reset();
        overlayRoll = null;
        overlayCard = null;
        queuedCard = null;
        resolveCardPromise = null;
        await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));

      } else if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test((p && p.name) || ''));
        if (seat === -1) seat = engine.state.players.findIndex(p => ((p && p.name) || '').toLowerCase() === wanted.toLowerCase());
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          map.overlaySeatUids[seat] = ev.by || map.overlaySeatUids[seat] || null;
          mpDbg('HOST_SET_NAME', { seat, name: wanted, by: ev.by || null });
          await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        }

      } else if (ev.type === 'ACK_CARD') {
        mpDbg('HOST_ACK_CARD_RCVD', { by: ev.by || null });
        const currUid = map.overlaySeatUids[engine.state.turnIndex] || null;
        if (!currUid || !ev.by || ev.by !== currUid) {
          mpDbg('HOST_ACK_IGNORED_NOT_TURN', { currUid, by: ev.by || null });
        } else {
          if (typeof resolveCardPromise === 'function') { resolveCardPromise(true); resolveCardPromise = null; }
          if (typeof engine.ackCard === 'function') engine.ackCard();
          overlayCard = null; queuedCard = null;
          await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
        }
      }

      // Final write to keep out state consistent
      await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    };

    await T.writeState(computeOutState(engine, map, overlayCard, overlayRoll));
    return T.onEvents(apply);
  }

  // --- Boot overlay ---
  async function bootOverlay(){
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth && T.auth.currentUser ? T.auth.currentUser.uid : null;
    mpDbg('BOOT_OK', { mode: T.mode, myUid });

    // Wait for engine
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = (window.LegislateApp && window.LegislateApp.engine) || null;
      if (engine) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!engine) { console.warn('Engine not detected; overlay inactive.'); mpDbg('BOOT_FAIL', { message: 'Engine not detected' }); return; }

    // Diagnostics HUD box (top-left)
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

    // Disable SP dice animations (shared overlay only)
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.showDiceRoll === 'function') window.LegislateUI.showDiceRoll = function(){ return Promise.resolve(); };
      if (typeof window.LegislateUI.waitForDice === 'function') window.LegislateUI.waitForDice = function(){ return Promise.resolve(); };
    }

    const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
    const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

    // Lock SP controls
    const pc = $('playerCount'); if (pc) pc.style.display = 'none';
    const playersSection = $('playersSection');
    if (playersSection) {
      playersSection.addEventListener('beforeinput', e=>e.preventDefault(), true);
      playersSection.addEventListener('keydown',     e=>e.preventDefault(), true);
    }

    // Replace SP button handlers
    function replaceWithClone(el){ if (!el) return el; const c = el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; }
    rollBtnRef     = replaceWithClone($('rollBtn'));
    let restartBtn = replaceWithClone($('restartBtn'));

    // Mirror authoritative state into engine + UI
    T.onState((st)=> { renderFromState(engine, st); });

    if (T.mode === 'host') {
      // Intercept SP modal so host never shows a local card; we’ll broadcast a shared one and wait for ACK
      const setQueued = (p)=>{ queuedCard = p; };
      const setResolver = (fn)=>{ resolveCardPromise = fn; };
      installHostModalInterceptor(setQueued, setResolver);

      // Force ALL rolls to go through MP broadcaster regardless of how SP triggers them
      (function(){
        if (!engine || engine._mpWrapped) return;
        const spTakeTurn = engine.takeTurn.bind(engine);  // original SP method
        let rollSeq = 0; // per-host-tab counter

        engine.takeTurn = async function(){
          // Run original logic (moves pieces, sets lastRoll, emits CARD_DRAWN)
          await spTakeTurn();

          // 1) Broadcast dice immediately
          rollSeq += 1;
          const overlayRoll = { seq: rollSeq, value: Number(engine.state.lastRoll || 0) };
          mpDbg('HOST_WRITE_DICE_NOW', overlayRoll);

          const buildOut = (extra) => {
            const out = JSON.parse(JSON.stringify(engine.state));
            const turnIdx = out.turnIndex || 0;
            out.overlaySeatUids = out.overlaySeatUids || [];    // maintained by overlay
            out.currentTurnUid  = (out.overlaySeatUids && out.overlaySeatUids[turnIdx]) || null;
            return Object.assign(out, extra || {});
          };

          await T.writeState(buildOut({ overlayRoll }));

          // 2) After dice wobble, publish card if queued via modal interceptor
          if (queuedCard) {
            const toPublish = queuedCard; // snapshot
            mpDbg('HOST_SCHEDULE_CARD_PUBLISH', { delayMs: 2100, queuedCard: toPublish });
            setTimeout(async ()=>{
              if (!queuedCard) return; // cleared already
              mpDbg('HOST_WRITE_CARD_NOW', toPublish);
              await T.writeState(buildOut({
                overlayRoll: { seq: rollSeq, value: Number(engine.state.lastRoll || 0) },
                overlayCard: toPublish
              }));
            }, 2100);
          }
        };

        engine._mpWrapped = true;
      })();

      // Apply lobby values
      if (pc && hostCount) { pc.value = String(hostCount); pc.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (hostCount && typeof engine.setPlayerCount === 'function') { engine.setPlayerCount(hostCount); }
      if (myName && engine.state.players[0]) { engine.state.players[0].name = myName; }
      syncPlayersUI(engine, { players: engine.state.players });

      // Buttons (enabled only on your turn)
      rollBtnRef && rollBtnRef.addEventListener('click', (e)=>{ e.preventDefault(); if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' }); });
      restartBtn && restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); T.sendEvent({ type: 'RESTART' }); });

      // Start authoritative loop (names, restart, ACK processing)
      hostLoop(engine);

    } else {
      // Guests: suppress SP modals entirely; only shared overlay is shown
      installGuestModalSuppressor();

      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName, by: myUid });

      rollBtnRef && rollBtnRef.addEventListener('click', (e)=>{ e.preventDefault(); if (!rollBtnRef.disabled) T.sendEvent({ type: 'ROLL' }); });
      restartBtn && restartBtn.addEventListener('click', (e)=>{ e.preventDefault(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOverlay);
  } else {
    bootOverlay();
  }
})();