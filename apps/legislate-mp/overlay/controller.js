(function () {
  const MP = (window.MP = window.MP || {});
  const T  = MP.transport;
  const $  = (id) => document.getElementById(id);

  // Local caches
  let myUid = null;

  // Guards (authoritative order comes from engine.turnSeq; these are last-seen)
  let lastTurnSeqSeen = -1;
  let lastRollSeqSeen = -1;
  let lastCardIdSeen  = null;

  // Host-only: card capture + promise to unblock host’s modal on ACK
  let queuedCard = null;
  let resolveCardPromise = null;

  // -------- Utilities / UI helpers ------------------------------------------
  function lockPlayersUI(playersLen) {
    const pc = $('playerCount');
    if (pc) pc.style.display = 'none';

    const root = $('playersSection');
    if (!root) return;
    const pills = Array.from(root.querySelectorAll('.player-pill, [data-player-pill]'));
    pills.forEach((pill, i) => {
      const nameSpan = pill.querySelector('.player-name, [data-name]');
      if (i < playersLen) {
        pill.style.display = '';
        if (nameSpan) {
          nameSpan.setAttribute('contenteditable', 'false');
          nameSpan.title = 'Names are set in the lobby';
        }
        pill.style.pointerEvents = 'none';
        pill.tabIndex = -1;
      } else {
        pill.style.display = 'none';
      }
    });
  }

  function disableLocalDiceEverywhere() {
    if (!window.LegislateUI) return;
    if (typeof window.LegislateUI.showDiceRoll === 'function') window.LegislateUI.showDiceRoll = () => Promise.resolve();
    if (typeof window.LegislateUI.waitForDice === 'function') window.LegislateUI.waitForDice   = () => Promise.resolve();
    if (typeof window.LegislateUI.animateDie  === 'function') window.LegislateUI.animateDie    = () => Promise.resolve();
  }

  // -------- Shared dice & card (overlay-driven only) -------------------------
  function showSharedDice(value) {
    const overlay = document.getElementById('diceOverlay');
    const dice    = document.getElementById('dice');
    if (!overlay || !dice) return;
    for (let i = 1; i <= 6; i++) dice.classList.remove('show-' + i);
    dice.classList.add('show-' + Math.max(1, Math.min(6, Number(value) || 1)));
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }, 2000);
  }

  let sharedModal = null;
  function showSharedCard(card, canDismiss) {
    const title = String(card.title || 'Card');
    const text  = String(card.text  || '');
    if (window.LegislateUI?.createModal) {
      if (!sharedModal) sharedModal = window.LegislateUI.createModal();
      return sharedModal.open({
        title,
        body: `<p>${text}</p>`,
        okText: canDismiss ? 'OK' : 'Waiting for player…',
        okDisabled: !canDismiss
      }).then(() => {
        if (canDismiss) T.sendEvent({ type: 'ACK_CARD' });
      });
    } else {
      if (canDismiss && confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        T.sendEvent({ type: 'ACK_CARD' });
      }
      return Promise.resolve();
    }
  }

  // -------- Apply engine snapshot locally (tokens, names, turn UI) -----------
  function applyEngineToLocal(engineSnap) {
    const app = window.LegislateApp;
    if (!app?.engine) return;
    const engine = app.engine;

    if (Array.isArray(engineSnap.players)) {
      for (let i = 0; i < engineSnap.players.length; i++) {
        if (!engine.state.players[i]) continue;
        const src = engineSnap.players[i];
        engine.state.players[i].id       = src.id;
        engine.state.players[i].name     = src.name;
        engine.state.players[i].position = src.position;
        engine.state.players[i].skipped  = !!src.skipped;
      }
    }
    if (typeof engineSnap.turnIndex === 'number') engine.state.turnIndex = engineSnap.turnIndex;
    if (typeof engineSnap.lastRoll  === 'number') engine.state.lastRoll  = engineSnap.lastRoll;

    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    lockPlayersUI(Array.isArray(engineSnap.players) ? engineSnap.players.length : 0);
    // Button gating is overlay-driven only to avoid flicker.
  }

  // -------- Apply overlay (dice, card, gating) -------------------------------
  function applyOverlayToLocal(overlaySnap) {
    const turnSeq = typeof overlaySnap.turnSeq === 'number' ? overlaySnap.turnSeq : 0;
    if (turnSeq < lastTurnSeqSeen) return;
    if (turnSeq > lastTurnSeqSeen) {
      lastTurnSeqSeen = turnSeq;
      lastCardIdSeen  = null;
    }

    const phase   = overlaySnap.phase || 'idle';
    const roll    = overlaySnap.roll || null;
    const card    = overlaySnap.card || null;
    const currUid = overlaySnap.currentTurnUid || null;

    const rollBtn = $('rollBtn');
    if (rollBtn) rollBtn.disabled = !(myUid && currUid && myUid === currUid);

    if (phase === 'dice' && roll && typeof roll.seq === 'number') {
      if (roll.seq > lastRollSeqSeen) {
        lastRollSeqSeen = roll.seq;
        showSharedDice(roll.value);
      }
    }

    if (phase === 'card' && card) {
      const cardKey = card.id || card.title || JSON.stringify(card);
      if (cardKey !== lastCardIdSeen) {
        lastCardIdSeen = cardKey;
        const canDismiss = !!(myUid && currUid && myUid === currUid);
        showSharedCard(card, canDismiss);
      }
    }
  }

  // -------- Host-only plumbing ----------------------------------------------
  function attachHostCardBus(engine) {
    engine.bus.on('CARD_DRAWN', ({ deck, card }) => {
      queuedCard = card ? {
        id: card.id || `${deck}-${Date.now()}`,
        title: card.title || deck,
        text: (card.text || '').trim()
      } : {
        id: `none-${Date.now()}`,
        title: deck || 'Card',
        text: 'No card.'
      };
    });
    engine.bus.on('CARD_RESOLVE', () => {
      queuedCard = null;
      // resolveCardPromise is completed via ACK path.
    });
  }

  function interceptHostModal(engine) {
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;
    window.LegislateUI.createModal = function () {
      return {
        open() {
          // Do not populate queuedCard here; bus is the source of truth.
          return new Promise((resolve) => { resolveCardPromise = resolve; });
        }
      };
    };
  }

  let globalRollSeq = 0;
  async function doRoll(engine) {
    // Capture whose turn it is BEFORE we mutate state.
    const preTurnIdx = Number(engine.state.turnIndex || 0);
    const seatUids   = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids : [];
    const activeUid  = seatUids[preTurnIdx] || null;

    // Execute the turn (moves, lastRoll; may emit CARD_DRAWN).
    await engine.takeTurn();

    // Increment authoritative turn sequence once per roll.
    engine.state.turnSeq = Number(engine.state.turnSeq || 0) + 1;

    // Publish engine snapshot first (board/turn/lastRoll).
    await T.writeEngine(engine.state);

    // Publish dice for this turn
    globalRollSeq += 1;
    await T.updateOverlay({
      turnSeq: engine.state.turnSeq,
      phase: 'dice',
      roll: { value: Number(engine.state.lastRoll || 0), seq: globalRollSeq },
      currentTurnUid: activeUid
    });

    // After dice overlay ends, publish card or go idle
    await new Promise(r => setTimeout(r, 2100));
    if (queuedCard) {
      await T.updateOverlay({
        turnSeq: engine.state.turnSeq,
        phase: 'card',
        card: queuedCard,
        currentTurnUid: activeUid
      });
    } else {
      await T.updateOverlay({
        turnSeq: engine.state.turnSeq,
        phase: 'idle',
        card: firebase.firestore.FieldValue.delete(),
        roll:  firebase.firestore.FieldValue.delete()
      });
    }
  }

  async function hostFlow(engine) {
    attachHostCardBus(engine);
    interceptHostModal(engine);

    const rollBtn = $('rollBtn');
    if (rollBtn) {
      rollBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (rollBtn.disabled) return;
        await doRoll(engine);
      });
    }
    const restartBtn = $('restartBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        engine.reset();
        engine.state.turnSeq = Number(engine.state.turnSeq || 0); // don’t bump on reset
        await T.writeEngine(engine.state);
        await T.updateOverlay({
          phase: 'idle',
          card: firebase.firestore.FieldValue.delete(),
          roll:  firebase.firestore.FieldValue.delete()
        });
      });
    }

    // Host consumes guest events with authorization checks
    T.onEvents(async (ev) => {
      if (!ev || !ev.type) return;

      if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0,24) || 'Player';
        let seat = engine.state.players.findIndex(p => /^Player \d+$/i.test((p && p.name) || ''));
        if (seat === -1) seat = engine.state.players.findIndex(p => (((p && p.name) || '').toLowerCase() === wanted.toLowerCase()));
        if (seat >= 0) {
          engine.state.players[seat].name = wanted;
          engine.state.overlaySeatUids = engine.state.overlaySeatUids || [];
          engine.state.overlaySeatUids[seat] = ev.by || engine.state.overlaySeatUids[seat] || null;
          await T.writeEngine(engine.state);
        }
      }

      else if (ev.type === 'ROLL') {
        // Defense-in-depth: accept only from the active player
        const turnIdx = Number(engine.state.turnIndex || 0);
        const currUid = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids[turnIdx] || null : null;
        if (!currUid || ev.by !== currUid) return;
        await doRoll(engine);
      }

      else if (ev.type === 'ACK_CARD') {
        // Only the active player can ACK
        const turnIdx = Number(engine.state.turnIndex || 0);
        const currUid = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids[turnIdx] || null : null;
        if (!currUid || ev.by !== currUid) return;

        if (typeof resolveCardPromise === 'function') { try { resolveCardPromise(true); } catch(e){} finally { resolveCardPromise = null; } }
        if (typeof engine.ackCard === 'function') engine.ackCard();

        await T.writeEngine(engine.state);
        await T.updateOverlay({
          phase: 'idle',
          card: firebase.firestore.FieldValue.delete(),
          roll:  firebase.firestore.FieldValue.delete()
        });
      }

      else if (ev.type === 'RESTART') {
        engine.reset();
        engine.state.turnSeq = Number(engine.state.turnSeq || 0);
        await T.writeEngine(engine.state);
        await T.updateOverlay({
          phase: 'idle',
          card: firebase.firestore.FieldValue.delete(),
          roll:  firebase.firestore.FieldValue.delete()
        });
      }
    });
  }

  // -------- Boot -------------------------------------------------------------
  async function boot() {
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

    const banner = $('roomBanner');
    if (banner && T.roomId) banner.textContent = `Room Code: ${T.roomId}`;

    // Wait for SP engine
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = (window.LegislateApp && window.LegislateApp.engine) || null;
      if (engine) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!engine) { console.warn('Engine not detected; overlay inactive.'); return; }

    disableLocalDiceEverywhere();

    if (T.mode === 'host') {
      // Apply lobby selections once using SP path
      const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
      const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

      const pc = $('playerCount');
      if (pc && hostCount) {
        pc.value = String(hostCount);
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }
      if (myName && engine.state.players[0]) engine.state.players[0].name = myName;

      // Ensure seat map exists and host occupies seat 0
      engine.state.overlaySeatUids = engine.state.overlaySeatUids || [];
      const hostUid = T.auth?.currentUser?.uid || null;
      if (hostUid) engine.state.overlaySeatUids[0] = hostUid;

      // Initialise turnSeq if missing
      engine.state.turnSeq = Number(engine.state.turnSeq || 0);

      await T.writeEngine(engine.state);
      lockPlayersUI(engine.state.players.length);

      await hostFlow(engine);

    } else {
      // Guest: announce name once; roll button just sends a request.
      const myName = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0,24);
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      const rollBtn = $('rollBtn');
      if (rollBtn) rollBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!rollBtn.disabled) T.sendEvent({ type: 'ROLL' });
      });
      const restartBtn = $('restartBtn');
      if (restartBtn) restartBtn.addEventListener('click', (e) => { e.preventDefault(); });

      lockPlayersUI(engine.state.players.length);
    }

    // Subscriptions
    T.onEngine((snap) => {
      if (typeof snap.turnSeq === 'number' && lastTurnSeqSeen < 0) lastTurnSeqSeen = snap.turnSeq;
      applyEngineToLocal(snap);
    });

    T.onOverlay((snap) => {
      applyOverlayToLocal(snap);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();