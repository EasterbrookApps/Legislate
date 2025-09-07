// multiplayer-app.js — thin socket client reusing stable UI (legislate-test)
(function () {
  const $ = (id) => document.getElementById(id);

  // ---- CONFIG --------------------------------------------------------------
  // Assets base for board.json (used for token placement)
  const base = 'https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs/uk-parliament';
  // Your Render WebSocket endpoint
  const wsUrl = 'wss://legislate.onrender.com/game';

  // ---- STATE ---------------------------------------------------------------
  let ws = null;
  let board = null;
  let boardUI = null;       // renderer instance (fan-out, etc.)
  let engineState = null;   // minimal mirror of server state after JOIN_OK

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

  // ---- PLAYERS LIST (rename → server) -------------------------------------
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

      const name = document.createElement('span');
      name.className = 'player-name';
      name.contentEditable = 'true';
      name.textContent = p.name;
      name.addEventListener('blur', () => {
        const v = (name.textContent || '').trim();
        if (!v) return;
        try { ws?.send(JSON.stringify({ type: 'RENAME', index: i, name: v })); } catch {}
      });

      pill.appendChild(dot);
      pill.appendChild(name);
      root.appendChild(pill);
    });
  }

  // ---- SERVER → UI EVENT MAP ----------------------------------------------
  function handleServerEvent(msg, stateRef) {
    const { type, payload } = msg;

    if (type === 'TURN_BEGIN') {
      const p = stateRef.players[payload.index];
      $('turnIndicator').textContent = `${p.name}'s turn`;
      stateRef.players.forEach((pl) => {
        const el = ensureToken(pl.id, pl.color);
        positionToken(el, pl.position);
      });
      boardUI?.render(stateRef.players);
      return;
    }

    if (type === 'DICE_ROLL') {
      window.LegislateUI.showDiceRoll(Number(payload.value) || 1);
      return;
    }

    if (type === 'MOVE_STEP') {
      const p = stateRef.players.find((x) => x.id === payload.playerId) || { color: '#000' };
      const el = ensureToken(payload.playerId, p.color);
      positionToken(el, payload.position);
      if (p) p.position = payload.position; // keep mirror in sync
      boardUI?.render(stateRef.players);
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
      if (p) {
        p.position = payload.position ?? p.position;
        const el = ensureToken(p.id, p.color);
        positionToken(el, p.position);
        boardUI?.render(stateRef.players);

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
  }

  // ---- CONNECT & JOIN ------------------------------------------------------
  async function connectAndJoin(roomCode, playerCount) {
    try {
      // Load board (client needs only for token coordinates)
      const resp = await fetch(`${base}/board.json`, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`board.json ${resp.status}`);
      board = await resp.json();

      // Create board renderer now we have board
      boardUI = (window.LegislateUI && window.LegislateUI.createBoardRenderer)
        ? window.LegislateUI.createBoardRenderer({ board })
        : { render: () => {} };

      // Open WebSocket
      ws = new WebSocket(wsUrl);

      // Status indicators
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

        // ---- DEBUG passthrough (server → page + console) ----
        if (msg.type === 'DEBUG') {
          const pre = document.getElementById('dbg-log');
          if (pre) pre.textContent += msg.payload + '\n';
          console.log('[DEBUG]', msg.payload);
          return; // keep showing debug even before JOIN_OK
        }

        if (msg.type === 'JOIN_OK') {
          engineState = msg.payload.state;
          $('turnIndicator').textContent = `Joined room ${(roomCode || '').toUpperCase()}`;

          // Players UI
          renderPlayers(engineState);

          // Initial token paint
          engineState.players.forEach((pl) => {
            const el = ensureToken(pl.id, pl.color);
            positionToken(el, pl.position);
          });

          // First render
          boardUI?.render(engineState.players);
          return;
        }

        if (!engineState) return; // ignore non-debug, non-join until joined
        handleServerEvent(msg, engineState);
      });
    } catch (err) {
      $('turnIndicator').textContent = 'Failed to load board';
      window.LegislateUI?.toast(`Could not load board.json: ${err.message}`, { kind: 'error' });
      console.error(err);
    }
  }

  // ---- UI HOOKS ------------------------------------------------------------
  $('joinBtn').addEventListener('click', () => {
    const code = ($('#roomCode').value || '').trim().toUpperCase();
    if (!code) {
      window.LegislateUI.toast('Enter a room code', { kind: 'info' });
      $('#roomCode').focus();
      return;
    }
    connectAndJoin(code, $('#playerCount').value);
  });

  $('rollBtn').addEventListener('click', () => {
    try { ws?.send(JSON.stringify({ type: 'ROLL' })); } catch {}
  });

  $('restartBtn').addEventListener('click', () => {
    try { ws?.send(JSON.stringify({ type: 'RESET' })); } catch {}
  });
})();