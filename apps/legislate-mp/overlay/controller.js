(function () {
  const MP = (window.MP = window.MP || {});
  const T = MP.transport;
  const $ = (id) => document.getElementById(id);

  // ---------- Local caches ----------
  let myUid = null;

  // Overlay state guards
  let lastTurnIdSeen = -1;
  let lastRollSeqSeen = -1;
  let lastCardIdSeen = null;

  // For host: queued card info + a resolver to unblock the engine’s modal
  let queuedCard = null;
  let resolveCardPromise = null;

  // ---------- Dice UI (overlay-driven only) ----------
  function showSharedDice(value) {
    // Prefer the app’s overlay dice, else fall back to legacy “animateDie”
    const overlay = document.getElementById('diceOverlay');
    const dice = document.getElementById('dice');

    if (overlay && dice) {
      // CSS dice (single shared overlay)
      for (let i = 1; i <= 6; i++) dice.classList.remove('show-' + i);
      dice.classList.add('show-' + Math.max(1, Math.min(6, Number(value) || 1)));
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }, 2000);
    } else if (window.LegislateUI?.animateDie) {
      // Fallback to single-player function but invoked from overlay only
      window.LegislateUI.animateDie(Number(value) || 1, 900);
    }
  }

  // ---------- Card UI (overlay-driven only) ----------
  let sharedModal = null;
  function showSharedCard(card, canDismiss) {
    const title = String(card.title || 'Card');
    const text = String(card.text || '');

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

    // Players / turn / lastRoll
    if (Array.isArray(engineSnap.players)) {
      // Merge fields we care about
      for (let i = 0; i < engineSnap.players.length; i++) {
        const src = engineSnap.players[i];
        if (!engine.state.players[i]) continue;
        engine.state.players[i].name = src.name;
        engine.state.players[i].position = src.position;
        engine.state.players[i].skipped = !!src.skipped;
      }
    }
    if (typeof engineSnap.turnIndex === 'number') engine.state.turnIndex = engineSnap.turnIndex;
    if (typeof engineSnap.lastRoll === 'number') engine.state.lastRoll = engineSnap.lastRoll;

    // Emit turn begin so UI refreshes (turn indicator, tokens layer etc.)
    const idx = engine.state.turnIndex || 0;
    engine.bus.emit('TURN_BEGIN', { index: idx, playerId: engine.state.players[idx]?.id });

    // Lock player editing in MP (names are from lobby/host)
    const root = $('playersSection');
    if (root) {
      const pills = Array.from(root.querySelectorAll('.player-pill, [data-player-pill]'));
      pills.forEach(pill => {
        const nameSpan = pill.querySelector('.player-name, [data-name]');
        if (nameSpan) {
          nameSpan.setAttribute('contenteditable', 'false');
          nameSpan.title = 'Names are set in the lobby';
        }
        pill.style.pointerEvents = 'none';
        pill.tabIndex = -1;
      });
    }

    // Disable the local roll button unless it's my turn (gated by overlay below too)
    const currUid = Array.isArray(engineSnap.overlaySeatUids)
      ? engineSnap.overlaySeatUids[engine.state.turnIndex] || null
      : null;
    const rollBtn = $('rollBtn');
    if (rollBtn) rollBtn.disabled = !(myUid && currUid && myUid === currUid);
  }

  // ---------- Overlay rendering (dice + card + gating) ----------
  function applyOverlayToLocal(overlaySnap) {
    // Ignore stale overlay updates (turnId and roll.seq guards)
    const turnId = typeof overlaySnap.turnId === 'number' ? overlaySnap.turnId : 0;
    if (turnId < lastTurnIdSeen) return;
    if (turnId > lastTurnIdSeen) {
      lastTurnIdSeen = turnId;
      // reset per-turn trackers
      lastCardIdSeen = null;
    }

    const phase = overlaySnap.phase || 'idle';
    const roll = overlaySnap.roll || null;
    const card = overlaySnap.card || null;
    const currUid = overlaySnap.currentTurnUid || null;

    // Gate Roll button here as well (authoritative, since overlay carries currentTurnUid)
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
    // Suppress the single-player modal and hold a promise we resolve on ACK.
    if (!window.LegislateUI || typeof window.LegislateUI.createModal !== 'function') return;
    const orig = window.LegislateUI.createModal;
    window.LegislateUI.createModal = function () {
      orig && orig(); // satisfy any side-effects
      return {
        open(opts) {
          // Extract plain text from body HTML
          const tmp = document.createElement('div');
          tmp.innerHTML = opts?.body || '';
          const text = (tmp.textContent || tmp.innerText || '').trim();
          queuedCard = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: String(opts?.title || 'Card'),
            text
          };
          // Return a promise we resolve when the active player ACKs
          return new Promise((resolve) => {
            resolveCardPromise = resolve;
          });
        }
      };
    };
  }

  function suppressGuestSPUI() {
    // Guests: disable local SP modal entirely
    if (window.LegislateUI && typeof window.LegislateUI.createModal === 'function') {
      const orig = window.LegislateUI.createModal;
      window.LegislateUI.createModal = function () {
        orig && orig();
        return { open() { return Promise.resolve(); } };
      };
    }
  }

  function disableLocalDiceEverywhere() {
    // Ensure only overlay-driven dice runs
    if (window.LegislateUI) {
      if (typeof window.LegislateUI.showDiceRoll === 'function') {
        window.LegislateUI.showDiceRoll = function () { return Promise.resolve(); };
      }
      if (typeof window.LegislateUI.waitForDice === 'function') {
        window.LegislateUI.waitForDice = function () { return Promise.resolve(); };
      }
    }
  }

  async function hostFlow(engine) {
    // Listen for guest events
    T.onEvents(async (ev) => {
      if (!ev || !ev.type) return;

      if (ev.type === 'SET_NAME') {
        // Map name into first free placeholder; also store seat→uid in engine.state
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
        // Only the active player's ACK is valid
        const turnIdx = Number(engine.state.turnIndex || 0);
        const currUid = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids[turnIdx] || null : null;
        if (!currUid || !ev.by || ev.by !== currUid) return;

        // Release the intercepted SP modal (so engine can apply the card effect)
        if (typeof resolveCardPromise === 'function') { try { resolveCardPromise(true); } catch(e) {} finally { resolveCardPromise = null; } }
        if (typeof engine.ackCard === 'function') engine.ackCard();

        queuedCard = null;
        // Engine state may have changed (e.g., move:-1, miss_turn)
        await T.writeEngine(engine.state);
        // Clear overlay back to idle
        await T.updateOverlay({ phase: 'idle', card: firebase.firestore.FieldValue.delete() });
      }

      else if (ev.type === 'RESTART') {
        engine.reset();
        await T.writeEngine(engine.state);
        await T.updateOverlay({ phase: 'idle', card: firebase.firestore.FieldValue.delete(), roll: firebase.firestore.FieldValue.delete() });
      }
    });

    // Host UI buttons
    const rollBtn = $('rollBtn');
    if (rollBtn) {
      rollBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        // Let overlay gating (currentTurnUid) control enablement
        if (rollBtn.disabled) return;
        await doRoll(engine);
      });
    }
    const restartBtn = $('restartBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        engine.reset();
        await T.writeEngine(engine.state);
        await T.updateOverlay({ phase: 'idle', card: firebase.firestore.FieldValue.delete(), roll: firebase.firestore.FieldValue.delete() });
      });
    }
  }

  // Host-only: perform one turn and publish engine + overlay in the correct order.
  let globalRollSeq = 0;
  async function doRoll(engine) {
    // Run engine turn (moves tokens, sets lastRoll, and triggers SP modal open → intercepted to fill queuedCard)
    await engine.takeTurn();

    // Publish engine snapshot so tokens/turn/lastRoll are visible
    await T.writeEngine(engine.state);

    // Publish dice first
    globalRollSeq += 1;
    const turnId = (typeof lastTurnIdSeen === 'number' ? lastTurnIdSeen : 0) + 1;
    const turnIdx = Number(engine.state.turnIndex || 0);
    const seatUids = Array.isArray(engine.state.overlaySeatUids) ? engine.state.overlaySeatUids : [];
    const currentTurnUid = seatUids[turnIdx] || null;

    await T.updateOverlay({
      turnId,
      phase: 'dice',
      roll: { value: Number(engine.state.lastRoll || 0), seq: globalRollSeq },
      currentTurnUid
    });

    // If a card was queued by the intercepted SP modal, publish it after the dice wobble
    if (queuedCard) {
      await new Promise(r => setTimeout(r, 1200)); // ~ dice wobble length (+margin)
      await T.updateOverlay({
        turnId,
        phase: 'card',
        card: queuedCard,
        currentTurnUid
      });
    } else {
      // No card: return overlay to idle after a short delay so dice can finish
      await new Promise(r => setTimeout(r, 200));
      await T.updateOverlay({ phase: 'idle' });
    }
  }

  // ---------- Boot ----------
  async function boot() {
    await T.init();
    if (T.mode === 'solo') return;

    myUid = T.auth?.currentUser?.uid || null;

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

    // Disable local SP dice everywhere (shared overlay dice only)
    disableLocalDiceEverywhere();

    if (T.mode === 'host') {
      // Host: suppress SP modal and hold promise; guests: pure no-op
      installHostModalInterceptors(engine);
      await T.writeEngine(engine.state); // ensure engine doc exists early

      // Apply lobby choices: player count/name are already handled elsewhere; we just ensure seat→uid is tracked as people join
      // (Guests announce SET_NAME below; we map them when events arrive.)

      await hostFlow(engine);

    } else {
      // Guests: disable local SP modal completely
      suppressGuestSPUI();

      // Guests announce name once
      const myName = (sessionStorage.getItem('MP_NAME') || '').trim().slice(0, 24);
      if (myName) T.sendEvent({ type: 'SET_NAME', name: myName });
      const rollBtn = $('rollBtn');
      if (rollBtn) {
        rollBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (!rollBtn.disabled) T.sendEvent({ type: 'ROLL' });
        });
      }
      const restartBtn = $('restartBtn');
      if (restartBtn) {
        restartBtn.addEventListener('click', (e) => { e.preventDefault(); /* guests cannot restart */ });
      }
    }

    // Subscribe to engine (tokens, names, turn indicator)
    T.onEngine((snap) => {
      // Mirror engine snapshot into the local SP engine and UI
      applyEngineToLocal(snap);
      // Also render the "Players" pills lock + turn gating handled there
    });

    // Subscribe to overlay (dice + card + gating)
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