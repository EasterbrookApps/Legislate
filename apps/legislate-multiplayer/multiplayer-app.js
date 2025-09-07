// multiplayer-app.js — presence-aware client for Legislate Multiplayer

(function () {
  const $ = (id) => document.getElementById(id);

  // ---- CONFIG --------------------------------------------------------------
  const base = 'https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs/uk-parliament';
  const wsUrl = 'wss://legislate.onrender.com/game';

  // ---- STATE ---------------------------------------------------------------
  let ws = null;
  let board = null;
  let boardUI = null;
  let engineState = null;
  let mySeat = null;

  // ---- TOKENS --------------------------------------------------------------
  const tokensLayer = $('tokensLayer');
  const tokenEls = new Map();

  function ensureToken(id, color) {
    if (tokenEls.has(id)) return tokenEls.get(id);
    const el = document.createElement('div');
    el.className = 'token';
    el.dataset.id = id;
    el.style.background = color || '#000';
    tokensLayer.appendChild(el);
    tokenEls.set(id, el);
    return el;
  }

  function positionToken(el, posIndex) {
    const space = board?.spaces?.find((s) => s.index === posIndex);
    if (!space) return;
    el.style.left = space.x + '%';
    el.style.top = space.y + '%';
  }

  function presentCount(state) {
    return (state?.players || []).reduce((n,p)=>n + (p.present ? 1 : 0), 0);
  }

  function updateRollEnabled() {
    const btn = $('rollBtn');
    if (!btn || !engineState) return;
    const onTurn = engineState.turnIndex;
    const enough = presentCount(engineState) >= 2;
    const mine = (mySeat != null && mySeat === onTurn && engineState.players[onTurn]?.present);
    const enabled = enough && mine;
    btn.disabled = !enabled;
    btn.title = enabled ? '' :
      (!enough ? 'Need at least 2 players joined' :
       (mySeat == null ? 'You are a spectator' :
        'Wait for your turn'));
  }

  // ---- PLAYERS LIST & TOKENS (presence-aware) ------------------------------
  function renderPlayers(state) {
    const root = $('playersSection');
    if (!root) return;
    root.innerHTML = '';
    state.players.forEach((p, i) => {
      const pill = document.createElement('div');
      pill.className = 'player-pill';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      dot.style.opacity = p.present ? '1' : '.35';

      const name = document.createElement('span');
      name.className = 'player-name';
      name.contentEditable = 'true';
      name.textContent = p.name;
      name.style.opacity = p.present ? '1' : '.6';
      name.addEventListener('blur', () => {
        const v = (name.textContent || '').trim();
        if (!v) return;
        try { ws?.send(JSON.stringify({ type: 'RENAME', index: i, name: v })); } catch {}
      });

      // Seat badge for me
      if (mySeat === i) {
        const badge = document.createElement('span');
        badge.textContent = ' (you)';
        badge.style.fontWeight = '600';
        pill.appendChild(badge);
      }

      pill.appendChild(dot);
      pill.appendChild(name);
      root.appendChild(pill);
    });

    // Tokens: only render for present players
    (state.players || []).forEach((pl) => {
      const el = ensureToken(pl.id, pl.color);
      if (!pl.present) {
        el.style.display = 'none';
      } else {
        el.style.display = 'block';
        positionToken(el, pl.position);
      }
    });

    boardUI?.render(state.players.filter(p => p.present));
    updateRollEnabled();
  }

  // ---- SERVER → UI EVENTS --------------------------------------------------
  function handleServerEvent(msg, stateRef) {
    const { type, payload } = msg;

    if (type === 'TURN_BEGIN') {
      const p = stateRef.players[payload.index];
      $('turnIndicator').textContent = `${p.name}'s turn`;
      renderPlayers(stateRef);
      return;
    }

    if (type === 'DICE_ROLL') {
      window.LegislateUI.showDiceRoll(Number(payload.value) || 1);
      return;
    }

    if (type === 'MOVE_STEP') {
      const p = stateRef.players.find((x) => x.id === payload.playerId) || { color: '#000' };
      if (!p.present) return; // ignore movement for non-present seats (shouldn’t happen, but safe)
      const el = ensureToken(payload.playerId, p.color);
      el.style.display = 'block';
      positionToken(el, payload.position);
      p.position = payload.position;
      boardUI?.render(stateRef.players.filter(x => x.present));
      return;
    }

    if (type === 'CARD_DRAWN') {
      (async () => {
        await window.LegislateUI.waitForDice();
        const modal = window.LegislateUI.createModal();
        const DECK_LABELS = {
          early: 'Early Stages',
          commons: 'House of Commons',
          implementation: 'Implementation',
          lords: 'House of Lords',
          pingpong: 'Ping Pong',
        };

        if (!payload.card) {
          await modal.open({
            title: 'No card',
            body: `<p>The ${DECK_LABELS[payload.deck] || payload.deck} deck is empty.</p>`,
          });
          try { ws?.send(JSON.stringify({ type: 'RESOLVE_CARD' })); } catch {}
          return;
        }

        await modal.open({
          title: payload.card.title || (DECK_LABELS[payload.deck] || payload.deck),
          body: `<p>${(payload.card.text || '').trim()}</p>`,
        });
        try { ws?.send(JSON.stringify({ type: 'RESOLVE_CARD' })); } catch {}
      })();
      return;
    }

    if (type === 'CARD_APPLIED') {
      const p = stateRef.players.find((x) => x.id === payload.playerId);
      if (p && p.present) {
        p.position = payload.position ?? p.position;
        const el = ensureToken(p.id, p.color);
        el.style.display = 'block';
        positionToken(el, p.position);
        boardUI?.render(stateRef.players.filter(x => x.present));

        if (payload.card && typeof payload.card.effect === 'string') {
          const [effect] = payload.card.effect.split(':');
          if (effect === 'extra_roll') window.LegislateUI.toast(`${p.name} gets an extra roll`, { kind: 'success' });
          if (effect === 'miss_turn') window.LegislateUI.toast(`${p.name} will miss their next turn`, { kind: 'info' });
        }
      }
      return;
    }

    if (type === 'MISS_TURN') {
      window.LegislateUI.toast(`${payload.name} misses a turn`, { kind: 'info' });
      return;
    }

    if (type === 'EFFECT_GOTO') {
      window.LegislateUI.toast(`Jump to ${payload.index}`, { kind: 'info', ttl: 1800 });
      return;
    }

    if (type === 'GAME_END') {
      window.LegislateUI.toast(`${payload.name} reached the end!`, { kind: 'success', ttl: 2600 });
      return;
    }

    if (type === 'PLAYER_RENAMED') {
      stateRef.players[payload.index].name = payload.name;
      renderPlayers(stateRef);
      return;
    }

    if (type === 'PLAYER_PRESENT') {
      stateRef.players[payload.index].present = true;
      renderPlayers(stateRef);
      return;
    }

    if (type === 'PLAYER_LEFT') {
      stateRef.players[payload.index].present = false;
      renderPlayers(stateRef);
      return;
    }
  }

  // ---- CONNECT & JOIN ------------------------------------------------------
  async function connectAndJoin(roomCode, playerCount) {
    try {
      const resp = await fetch(`${base}/board.json`, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`board.json ${resp.status}`);
      board = await resp.json();

      boardUI = (window.LegislateUI && window.LegislateUI.createBoardRenderer)
        ? window.LegislateUI.createBoardRenderer({ board })
        : { render: () => {} };

      ws = new WebSocket(wsUrl);

      ws.addEventListener('open', () => {
        $('turnIndicator').textContent = 'Connected — joining room…';
        try {
          ws.send(JSON.stringify({
            type: 'JOIN',
            roomCode: (roomCode || '').trim().toUpperCase(),
            playerCount: Number(playerCount) || 4
          }));
        } catch {}
      });

      ws.addEventListener('error', () => {
        $('turnIndicator').textContent = 'Connection error';
        window.LegislateUI?.toast('WebSocket connection error', { kind: 'error' });
      });

      ws.addEventListener('close', () => {
        $('turnIndicator').textContent = 'Disconnected';
      });

      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'DEBUG') {
          const pre = document.getElementById('dbg-log');
          if (pre) pre.textContent += msg.payload + '\n';
          console.log('[DEBUG]', msg.payload);
          return;
        }

        if (msg.type === 'JOIN_OK') {
          engineState = msg.payload.state;
          mySeat = msg.payload.seatIndex; // may be null if spectator
          $('turnIndicator').textContent =
            `Joined room ${(roomCode || '').toUpperCase()}${mySeat!=null ? ` — seat ${mySeat+1}` : ' — spectator'}`;

          renderPlayers(engineState);
          // Initial tokens (present-only)
          engineState.players.forEach((pl) => {
            const el = ensureToken(pl.id, pl.color);
            if (pl.present) {
              el.style.display = 'block';
              positionToken(el, pl.position);
            } else {
              el.style.display = 'none';
            }
          });
          updateRollEnabled();
          return;
        }

        if (!engineState) return;
        handleServerEvent(msg, engineState);
        updateRollEnabled();
      });
    } catch (err) {
      $('turnIndicator').textContent = 'Failed to load board';
      window.LegislateUI?.toast(`Could not load board.json: ${err.message}`, { kind: 'error' });
      console.error(err);
    }
  }

  // ---- UI HOOKS (robust) ---------------------------------------------------
  const roomInput    = document.getElementById('roomCode');
  const playerSelect = document.getElementById('playerCount');
  const joinBtn      = document.getElementById('joinBtn');
  const rollBtn      = document.getElementById('rollBtn');
  const restartBtn   = document.getElementById('restartBtn');

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      const codeRaw = roomInput && typeof roomInput.value === 'string' ? roomInput.value : '';
      const code = codeRaw.trim().toUpperCase();
      if (!code) {
        if (window.LegislateUI?.toast) window.LegislateUI.toast('Enter a room code', { kind: 'info' });
        roomInput && roomInput.focus?.();
        return;
      }
      const count = playerSelect && playerSelect.value ? playerSelect.value : 4;
      connectAndJoin(code, count);
    });
  }

  if (rollBtn) {
    rollBtn.addEventListener('click', () => {
      try { ws?.send(JSON.stringify({ type: 'ROLL' })); } catch {}
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      try { ws?.send(JSON.stringify({ type: 'RESET' })); } catch {}
    });
  }
})();