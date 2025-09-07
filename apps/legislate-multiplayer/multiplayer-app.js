// --- Firebase readiness guard (multiplayer-app.js) ---
if (window.fbReady) {
  await window.fbReady; // wait for Firebase init + anonymous auth
}
const { db, rtdb, auth } = window.fb || {};

// multiplayer-app.js — presence-aware client + keep-alive for Legislate Multiplayer

(function () {
  const $ = (id) => document.getElementById(id);

  // ---- CONFIG --------------------------------------------------------------
  const base = 'https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs/uk-parliament';
  const wsUrl = 'wss://legislate.onrender.com/game';

  // ---- UI ELEMENTS ---------------------------------------------------------
  const joinBtn = $('joinBtn');
  const roomInput = $('roomCode');
  const rollBtn = $('rollBtn');
  const restartBtn = $('restartBtn');
  const playerCountSel = $('playerCount');
  const playersSection = $('playersSection');
  const turnIndicator = $('turnIndicator');
  const diceOverlay = $('diceOverlay');
  const diceEl = $('dice');
  const tokensLayer = $('tokensLayer');
  const dbg = $('dbg-log');

  const log = (msg) => {
    if (!dbg) return;
    dbg.textContent += (typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)) + '\n';
  };

  // ---- STATE ---------------------------------------------------------------
  let ws = null;
  let roomCode = '';
  let board = null;
  let boardUI = null;
  let engineState = null;
  let mySeat = null;

  // ---- TOKENS --------------------------------------------------------------
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
    const space = board.spaces.find((s) => s.index === posIndex);
    if (!space) return;
    el.style.left = space.x + '%';
    el.style.top = space.y + '%';
  }

  // ---- DICE OVERLAY --------------------------------------------------------
  let diceTimer = 0;
  function showDiceRoll(value, ms = 900) {
    if (!diceOverlay || !diceEl) return;
    diceOverlay.hidden = false;
    diceEl.className = 'dice rolling';
    clearTimeout(diceTimer);
    diceTimer = setTimeout(() => {
      diceEl.className = 'dice show-' + (value || 1);
      setTimeout(() => (diceOverlay.hidden = true), 250);
    }, ms);
  }

  // ---- TOAST ---------------------------------------------------------------
  function toast(message, { kind = 'info', ttl = 2200 } = {}) {
    if (window.LegislateUI?.toast) return window.LegislateUI.toast(message, { kind, ttl });
    const rootId = 'toastRoot';
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement('div');
      root.id = rootId;
      root.style.position = 'fixed';
      root.style.right = '12px';
      root.style.top = '12px';
      root.style.zIndex = '2000';
      root.style.display = 'flex';
      root.style.flexDirection = 'column';
      root.style.gap = '8px';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.style.padding = '10px 12px';
    el.style.background = kind === 'error' ? '#d4351c' : kind === 'success' ? '#00703c' : '#1d70b8';
    el.style.color = '#fff';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 16px rgba(0,0,0,.15)';
    el.style.fontWeight = '600';
    el.style.maxWidth = '320px';
    el.style.wordBreak = 'break-word';
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      setTimeout(() => el.remove(), 300);
    }, ttl);
  }

  // ---- LOAD BOARD ----------------------------------------------------------
  async function loadBoard() {
    const res = await fetch(`${base}/board.json`);
    board = await res.json();
    boardUI = window.LegislateUI?.createBoardRenderer?.({ board });
  }

  // ---- RENDER HELPERS ------------------------------------------------------
  function renderPlayersPills(players) {
    playersSection.innerHTML = '';
    players.forEach((p, i) => {
      const pill = document.createElement('div');
      pill.className = 'player-pill';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;

      const name = document.createElement('span');
      name.className = 'player-name';
      name.contentEditable = 'true';
      name.textContent = p.name;

      // send rename on blur (server echoes back authoritative name)
      name.addEventListener('blur', () => {
        const v = (name.textContent || '').trim();
        if (!v) return;
        send({ type: 'RENAME', index: i, name: v });
      });

      pill.appendChild(dot);
      pill.appendChild(name);
      playersSection.appendChild(pill);
    });
  }

  function renderAllTokens(players) {
    players.forEach((p) => {
      const el = ensureToken(p.id || p.uid || p.name, p.color);
      positionToken(el, p.position || 0);
    });
    // optional fan-out if UI provides it
    boardUI?.render?.(players);
  }

  function updateRollEnabled() {
    if (!engineState) {
      rollBtn.disabled = true;
      return;
    }
    const presentCount = (engineState.players || []).filter((p) => p.present).length;
    const enough = presentCount >= 2;
    const myTurn = engineState.turnIndex === mySeat;
    rollBtn.disabled = !(enough && myTurn);
  }

  // ---- WEBSOCKET CLIENT ----------------------------------------------------
  function connectAndJoin(code, desiredCount) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.close(); } catch {}
    }
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => {
      send({ type: 'JOIN', room: code, playerCount: Number(desiredCount) || 4 });
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        handleServerEvent(msg);
      } catch (e) {
        console.warn('WS parse error', e);
      }
    });
    ws.addEventListener('close', () => {
      toast('Disconnected from server. Reconnecting…', { kind: 'info' });
      setTimeout(() => connectAndJoin(roomCode, playerCountSel.value), 1200);
    });
    ws.addEventListener('error', () => {
      toast('Connection error', { kind: 'error' });
    });
  }

  function send(obj) {
    try {
      ws?.send(JSON.stringify(obj));
    } catch (e) {
      console.warn('Send failed', e);
    }
  }

  // ---- SERVER EVENTS -------------------------------------------------------
  function handleServerEvent(msg) {
    const { type } = msg;

    if (type === 'JOIN_OK') {
      const { state, seatIndex } = msg;
      engineState = state;
      mySeat = seatIndex;

      renderPlayersPills(engineState.players);
      renderAllTokens(engineState.players);

      turnIndicator.textContent = `${engineState.players[engineState.turnIndex].name}'s turn`;
      updateRollEnabled();
      log('JOIN_OK');
      return;
    }

    if (type === 'TURN_BEGIN') {
      engineState.turnIndex = msg.index;
      turnIndicator.textContent = `${engineState.players[engineState.turnIndex].name}'s turn`;
      updateRollEnabled();
      return;
    }

    if (type === 'DICE_ROLL') {
      engineState.lastRoll = msg.value;
      showDiceRoll(msg.value, 900);
      return;
    }

    if (type === 'MOVE_STEP') {
      const { playerId, position } = msg;
      const p = engineState.players.find((x) => x.id === playerId);
      if (p) p.position = position;
      const el = ensureToken(playerId, p?.color);
      positionToken(el, position);
      boardUI?.render?.(engineState.players);
      return;
    }

    if (type === 'LANDED') {
      // purely informative in the client
      return;
    }

    if (type === 'CARD_DRAWN') {
      const { deck, card } = msg;
      // Show a modal: we rely on UI file’s modal
      const modal = window.LegislateUI?.createModal?.();
      if (modal) {
        modal.open({
          title: (card?.title || deck),
          body: `<p>${(card?.text || '').trim()}</p>`,
        }).then(() => send({ type: 'RESOLVE_CARD' }));
      } else {
        send({ type: 'RESOLVE_CARD' });
      }
      return;
    }

    if (type === 'CARD_APPLIED') {
      const { playerId, card } = msg;
      // update position if included
      if (typeof msg.position === 'number') {
        const p = engineState.players.find((x) => x.id === playerId);
        if (p) p.position = msg.position;
        const el = ensureToken(playerId, p?.color);
        positionToken(el, p?.position || 0);
      }
      boardUI?.render?.(engineState.players);

      if (card && typeof card.effect === 'string') {
        const [eff] = card.effect.split(':');
        const p = engineState.players.find((x) => x.id === playerId);
        if (eff === 'extra_roll') toast(`${p?.name || 'Player'} gets an extra roll`, { kind: 'success' });
        if (eff === 'miss_turn') toast(`${p?.name || 'Player'} will miss their next turn`, { kind: 'info' });
      }
      return;
    }

    if (type === 'EFFECT_GOTO') {
      const { playerId, index } = msg;
      const p = engineState.players.find((x) => x.id === playerId);
      const el = ensureToken(playerId, p?.color);
      positionToken(el, index);
      boardUI?.render?.(engineState.players);
      toast(`${p?.name || 'Player'} jumps to ${index}`, { kind: 'info', ttl: 1800 });
      return;
    }

    if (type === 'GAME_END') {
      const { name } = msg;
      toast(`${name} reached the end!`, { kind: 'success', ttl: 2600 });
      return;
    }

    if (type === 'PLAYER_PRESENT') {
      const { index, present } = msg;
      if (engineState.players[index]) engineState.players[index].present = present;
      updateRollEnabled();
      return;
    }

    if (type === 'PLAYER_RENAMED') {
      const { index, name } = msg;
      if (engineState.players[index]) engineState.players[index].name = name;
      // refresh pills and turn indicator if needed
      renderPlayersPills(engineState.players);
      if (engineState.turnIndex === index) {
        turnIndicator.textContent = `${name}'s turn`;
      }
      return;
    }

    if (type === 'PLAYER_LEFT') {
      // server drives presence; UI reflects on TURN_BEGIN gating
      updateRollEnabled();
      return;
    }

    if (type === 'PING') {
      send({ type: 'PONG' });
      return;
    }
  }

  // ---- UI HANDLERS ---------------------------------------------------------
  joinBtn.addEventListener('click', () => {
    const code = (roomInput.value || '').trim().toUpperCase();
    if (!code) return;
    roomCode = code;
    connectAndJoin(roomCode, playerCountSel.value);
    toast(`Joining ${roomCode}…`, { kind: 'info', ttl: 1200 });
  });

  rollBtn.addEventListener('click', () => {
    send({ type: 'ROLL' });
  });

  restartBtn.addEventListener('click', () => {
    send({ type: 'RESET' });
  });

  // ---- BOOT ---------------------------------------------------------------
  (async function boot() {
    await loadBoard();
    log('BOOT_OK');
  })();
})();