(function () {
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id) => document.getElementById(id);

  // ---------- Local caches ----------
  let myUid = null;

  // Overlay guards (authoritative is engine.turnSeq; these are client-side last-seen)
  let lastTurnSeqSeen = -1;
  let lastRollSeqSeen = -1;
  let lastCardIdSeen  = null;

  // Host-only: capture per-turn card and modal blocker
  let queuedCard = null;
  let resolveCardPromise = null;

  // ---------- Helpers ----------
  function hidePlayerCountAndLockPills(playersLen) {
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
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.showDiceRoll === 'function') {
        window.LegislateUI.showDiceRoll = function () { return Promise.resolve(); };
      }
      if (typeof window.LegislateUI.waitForDice === 'function') {
        window.LegislateUI.waitForDice = function () { return Promise.resolve(); };
      }
      if (typeof window.LegislateUI.animateDie === 'function') {
        window.LegislateUI.animateDie = function () { return Promise.resolve(); };
      }
    }
  }

  // ---------- Dice UI (overlay-driven only) ----------
  function showSharedDice(value) {
    const overlay = document.getElementById('diceOverlay');
    const dice = document.getElementById('dice');

    if (overlay && dice) {
      for (let i = 1; i <= 6; i++) dice.classList.remove('show-' + i);
      dice.classList.add('show-' + Math.max(1, Math.min(6, Number(value) || 1)));
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      // Match CSS hide timing; 2000ms + margin so card always follows after
      setTimeout(() => {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }, 2000);
    }
  }

  // ---------- Card UI (overlay-driven only) ----------
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
    } else if (canDismiss) {
      if (confirm(`${title}\n\n${text}\n\nPress OK to continue.`)) {
        T.sendEvent({ type: 'ACK_CARD' });
      }
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  // ---------- Engine rendering (tokens, names, turn indicator) ----------
  function applyEngineToLocal(engineSnap) {
    const app = window.LegislateApp;
    if (!app || !app.engine) return;
    const engine = app.engine;

    // Merge state
    if (Array.isArray(engineSnap.players)) {
      for (let i = 0; i < engineSnap.players.length; i++) {
        if (!engine.state.players[i]) continue;
        const src = engineSnap.players[i];
        engine.state.players[i].name     = src.name;
        engine.state.players[i].position = src.position;
        engine.state.players[i].skipped  = !!src.skipped;
      }
    }
    if (typeof engineSnap.turnIndex === 'number') engine.state.turnIndex = engineSnap.turnIndex;
    if (typeof engineSnap.lastRoll  === 'number') engine.state.lastRoll  = engineSnap.lastRoll;

    // Emit turn begin so UI refreshes (turn indicator, tokens layer etc.)
    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    // Lock UI to avoid edits; hide extra pills
    hidePlayerCountAndLockPills(Array.isArray(engineSnap.players) ? engineSnap.players.length : 0);

    // NOTE: do NOT gate the Roll button here (avoid flicker). Gating is overlay-driven.
  }

  // ---------- Overlay rendering (dice + card + gating) ----------
  function applyOverlayToLocal(overlaySnap) {
    // Prefer authoritative turnSeq for ordering and gating
    const turnSeq = typeof overlaySnap.turnSeq === 'number' ? overlaySnap.turnSeq : 0;
    if (turnSeq < lastTurnSeqSeen) return;
    if (turnSeq > lastTurnSeqSeen) {
      lastTurnSeqSeen = turnSeq;
      lastCardIdSeen = null; // new turn, reset card guard
    }

    const phase   = overlaySnap.phase || 'idle';
    const roll    = overlaySnap.roll || null;
    const card    = overlaySnap.card || null;
    const currUid = overlaySnap.currentTurnUid || null;

    // Authoritative gating: only the currentTurnUid can press Roll/OK
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

  // ---------- Host-only orchestration ----------
  function installHostModalInterceptors(engine) {
    // Intercept SP modal on host to block engine until shared ACK.
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;
    const originalFactory = window.LegislateUI.createModal;
    window.LegislateUI.createModal = function () {
      // Do not call original factory here (avoid side-effects)
      return {
        open(opts) {
          // Extract plain text for shared modal
          const tmp = document.createElement('div');
          tmp.innerHTML = opts?.body || '';
          const text = (tmp.textContent || tmp.innerText || '').trim();
          // Fill queuedCard if engine constructs the modal before CARD_DRAWN bus hook
          queuedCard = queuedCard || {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: String(opts?.title || 'Card'),
            text
          };
          // Return a promise that we resolve on ACK (from the active player)
          return new Promise((resolve) => { resolveCardPromise = resolve; });
        }
      };
    };
  }

  function attachHostCardBus(engine) {
    // Authoritatively capture card content; clear on resolve
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
      // resolveCardPromise is resolved via ACK path; do not auto-resolve here.
    });
  }

  // Host-only: perform one turn and publish engine + overlay in the correct order.
  let globalRollSeq = 0;
  async function doRoll(engine) {
    // Capture whose turn it is BEFORE we mutate engine (for gating the shared UI)
    const preTurnIdx = Number(engine.state.turnIndex || 0);
    const seatUids   = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids : [];
    const activeUid  = seatUids[preTurnIdx] || null;

    // Perform the turn (moves tokens, sets lastRoll, may trigger CARD_DRAWN + modal)
    await engine.takeTurn();

    // Increment authoritative turn sequence and publish engine snapshot
    engine.state.turnSeq = Number(engine.state.turnSeq || 0) + 1;
    await T.writeEngine(engine.state);

    // Publish dice first for this turnSeq
    globalRollSeq += 1;
    await T.updateOverlay({
      turnSeq: engine.state.turnSeq,
      phase: 'dice',
      roll: { value: Number(engine.state.lastRoll || 0), seq: globalRollSeq },
      currentTurnUid: activeUid
    });

    // After dice wobble time, publish the card (or explicitly go idle if none)
    await new Promise(r => setTimeout(r, 2100)); // dice overlay hides at ~2000ms
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
        // clear any prior card/roll from overlay; guards prevent replays anyway
        card: firebase.firestore.FieldValue.delete(),
        roll:  firebase.firestore.FieldValue.delete()
      });
    }
  }

  async function hostFlow(engine) {
    attachHostCardBus(engine);
    installHostModalInterceptors(engine);

    // Host UI buttons
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
        engine.state.turnSeq = Number(engine.state.turnSeq || 0); // don’t bump turnSeq on reset
        await T.writeEngine(engine.state);
        await T.updateOverlay({
          phase: 'idle',
          card: firebase.firestore.FieldValue.delete(),
          roll: firebase.firestore.FieldValue.delete()
        });
      });
    }

    // Host processes guest events
    T.onEvents(async (ev) => {
      if (!ev || !ev.type) return;

      if (ev.type === 'SET_NAME') {
        const wanted = String(ev.name || '').trim().slice(0, 24) || 'Player';
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
        await doRoll(engine);
      }

      else if (ev.type === 'ACK_CARD') {
        // Validate active player
        const turnIdx = Number(engine.state.turnIndex || 0);
        const currUid = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids[turnIdx] || null : null;
        if (!currUid || !ev.by || ev.by !== currUid) return;

        // Release the intercepted SP modal so engine applies the effect
        if (typeof resolveCardPromise === 'function') {
          try { resolveCardPromise(true); } catch(e) {}
          resolveCardPromise = null;
        }
        if (typeof engine.ackCard === 'function') engine.ackCard();

        // Engine state may change (move:-1, miss_turn, etc.)
        await T.writeEngine(engine.state);

        // Clear overlay
        await T.updateOverlay({
          phase: 'idle',
          card: firebase.firestore.FieldValue.delete(),
          roll: firebase.firestore.FieldValue.delete()
        });
      }

      else if (ev.type === 'RESTART') {
        engine.reset();
        engine.state.turnSeq = Number(engine.state.turnSeq || 0);
        await T.writeEngine(engine.state);
        await T.updateOverlay({
          phase: 'idle',
          card: firebase.firestore.FieldValue.delete(),
          roll: firebase.firestore.FieldValue.delete()
        });
      }
    });
  }

  // ---------- Boot ----------
  async function boot() {
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

    // Banner feedback
    const banner = $('roomBanner');
    if (banner && T.roomId) banner.textContent = `Room Code: ${T.roomId}`;

    // Wait for the single-player engine instance
    let engine = null;
    for (let i = 0; i < 25; i++) {
      engine = window.LegislateApp && window.LegislateApp.engine;
      if (engine) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!engine) {
      console.warn('Engine not detected; overlay inactive.');
      return;
    }

    // Shared rules for MP UI
    disableLocalDiceEverywhere();

    // Apply lobby selections on host so tokens/pills rebuild exactly once
    if (T.mode === 'host') {
      const myName    = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0, 24);
      const hostCount = Number(sessionStorage.getItem('MP_PLAYER_COUNT') || 0);

      // Apply player count by triggering the same SP path
      const pc = $('playerCount');
      if (pc && hostCount) {
        pc.value = String(hostCount);
        pc.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (hostCount && typeof engine.setPlayerCount === 'function') {
        engine.setPlayerCount(hostCount);
      }

      // Seat 0 name visual
      if (myName && engine.state.players[0]) {
        engine.state.players[0].name = myName;
      }

      // Ensure overlaySeatUids exists and seat 0 is the host
      engine.state.overlaySeatUids = engine.state.overlaySeatUids || [];
      const hostUid = T.auth?.currentUser?.uid || null;
      if (hostUid) engine.state.overlaySeatUids[0] = hostUid;

      // Initialize turnSeq if absent
      engine.state.turnSeq = Number(engine.state.turnSeq || 0);

      // Publish initial engine snapshot so guests get a base state
      await T.writeEngine(engine.state);

      // Lock pills and hide extras
      hidePlayerCountAndLockPills(engine.state.players.length);

      // Start host loop
      await hostFlow(engine);

    } else {
      // Guest: announce name once
      const myName = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0, 24);
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });

      // Guest Roll button just sends a request; overlay will gate it
      const rollBtn = $('rollBtn');
      if (rollBtn) {
        rollBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (!rollBtn.disabled) T.sendEvent({ type: 'ROLL' });
        });
      }
      const restartBtn = $('restartBtn');
      if (restartBtn) restartBtn.addEventListener('click', (e) => { e.preventDefault(); });

      // Pills/UI lock
      hidePlayerCountAndLockPills(engine.state.players.length);
    }

    // Subscribe to engine (tokens, names, turn indicator)
    T.onEngine((snap) => {
      // Initialize client-side guards with authoritative turnSeq if first time
      if (typeof snap.turnSeq === 'number' && lastTurnSeqSeen < 0) {
        lastTurnSeqSeen = snap.turnSeq;
      }
      applyEngineToLocal(snap);
    });

    // Subscribe to overlay (dice + card + gating)
    T.onOverlay((snap) => {
      // If overlay carries a newer turnSeq, it will naturally advance guards
      applyOverlayToLocal(snap);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();