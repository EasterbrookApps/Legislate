// ui.js — single-facade UI for Legislate?!
(function () {
  const $  = (id) => document.getElementById(id);
  const ce = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };

  // Friendly deck labels for modal titles
  const DECK_LABELS = {
    early: "Early Stages",
    commons: "House of Commons",
    implementation: "Implementation",
    lords: "House of Lords",
    pingpong: "Ping Pong",
  };

  // ---------- Toasts ----------
  (function ensureToast(){
    if (document.getElementById('toastRoot')) return;
    const root = ce('div');
    root.id = 'toastRoot';
    Object.assign(root.style, {
      position: 'fixed', right: '12px', top: '12px', zIndex: '2000',
      display: 'flex', flexDirection: 'column', gap: '8px'
    });
    document.body.appendChild(root);
  })();

  function toast(message, { kind='info', ttl=2200 } = {}) {
    const root = document.getElementById('toastRoot');
    const el = ce('div', `toast toast--${kind}`);
    Object.assign(el.style, {
      padding: '10px 12px',
      background: kind === 'error' ? '#d4351c' : (kind === 'success' ? '#00703c' : '#1d70b8'),
      color: '#fff', borderRadius: '8px', boxShadow: '0 6px 16px rgba(0,0,0,.15)',
      fontWeight: '600', maxWidth: '320px', wordBreak: 'break-word'
    });
    el.textContent = message;
    root.appendChild(el);
    setTimeout(()=> {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      setTimeout(()=> el.remove(), 300);
    }, ttl);
  }
  // Legacy global shim if anything calls window.toast
  window.toast = window.toast || ((msg, opts) => toast(msg, opts));

  // ---------- Modal (promise-based) ----------
  function createModal() {
    const root = $('modalRoot');
    function open({ title = '', body = '', actions } = {}) {
      return new Promise((resolve) => {
        if (!root) return resolve();
        root.innerHTML = '';

        const backdrop = ce('div', 'modal-backdrop');
        backdrop.style.display = 'flex';

        const card = ce('div', 'modal');

        const h = ce('h2');
        h.textContent = title || 'Card';

        const b = ce('div', 'modal-body');
        b.innerHTML = body;

        const acts = ce('div', 'modal-actions');
        const list = actions && actions.length ? actions : [{ id: 'ok', label: 'OK', value: true }];
        list.forEach(a => {
          const btn = ce('button', 'button button--primary');
          btn.textContent = a.label || 'OK';
          btn.addEventListener('click', () => {
            root.innerHTML = '';
            resolve(a.value);
          });
          acts.appendChild(btn);
        });

        card.appendChild(h);
        card.appendChild(b);
        card.appendChild(acts);
        backdrop.appendChild(card);
        root.appendChild(backdrop);
      });
    }
    return { open };
  }

  // ---------- Dice overlay ----------
  function showDiceRoll(value, ms = 900) {
    const overlay = $('diceOverlay');
    const diceEl  = $('dice');
    if (!overlay || !diceEl) return Promise.resolve();

    return new Promise((resolve) => {
      overlay.hidden = false;
      diceEl.className = 'dice rolling';
      setTimeout(() => {
        diceEl.className = 'dice show-' + (value || 1);
        setTimeout(() => { overlay.hidden = true; resolve(); }, 250);
      }, ms);
    });
  }

  // ---------- Turn indicator ----------
  function setTurnIndicator(text) {
    const el = $('turnIndicator');
    if (el) el.textContent = text;
  }

  // ---------- Board / tokens renderer (percent coords + fan-out) ----------
  function createBoardRenderer(arg) {
    const layer = $('tokensLayer');
    if (!layer) return { render: () => {} };
    const board = (arg && arg.board) ? arg.board : arg;

    // board.json stores x/y as PERCENT values (0..100)
    const coordsFor = (index) => {
      const space = board && board.spaces && board.spaces.find(s => s.index === index);
      return {
        x: space && typeof space.x === 'number' ? space.x : 0,
        y: space && typeof space.y === 'number' ? space.y : 0
      };
    };

    function ensureToken(id, color) {
      let el = layer.querySelector(`[data-id="${id}"]`);
      if (!el) {
        el = ce('div', 'token');
        el.dataset.id = id;
        el.style.background = color;
        layer.appendChild(el);
      } else {
        el.style.background = color;
      }
      return el;
    }

    function render(players) {
      if (!Array.isArray(players)) return;

      // Group players by space index
      const groups = new Map();
      players.forEach(p => {
        const key = String(p.position || 0);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });

      const seenIds = new Set();
      const TAU = Math.PI * 2;
      const RADIUS_PCT = 2.5; // fan radius as % of board

      for (const [key, group] of groups.entries()) {
        const posIndex = Number(key);
        const { x, y } = coordsFor(posIndex);

        if (group.length === 1) {
          const p = group[0];
          const t = ensureToken(p.id, p.color);
          t.style.left = x + '%';
          t.style.top  = y + '%';
          seenIds.add(p.id);
          continue;
        }

        const n = group.length;
        group.forEach((p, i) => {
          const angle = (i / n) * TAU;
          const ox = Math.cos(angle) * RADIUS_PCT;
          const oy = Math.sin(angle) * RADIUS_PCT;
          const t = ensureToken(p.id, p.color);
          t.style.left = (x + ox) + '%';
          t.style.top  = (y + oy) + '%';
          seenIds.add(p.id);
        });
      }

      // Remove tokens no longer representing active players
      layer.querySelectorAll('.token').forEach(el => {
        const id = el.getAttribute('data-id');
        if (!seenIds.has(id)) el.remove();
      });
    }

    return { render };
  }

  // ---------- Facade: create({ board, engine, ...domRefs }) ----------
  function create(opts = {}) {
    const {
      board,
      engine,
      playersSection = $('playersSection'),
      tokensLayer   = $('tokensLayer'),
      turnIndicator = $('turnIndicator'),
      rollBtn       = $('rollBtn'),
      restartBtn    = $('restartBtn'),
      playerCountSelect = $('playerCount'),
      modalRoot     = $('modalRoot'),
      diceOverlay   = $('diceOverlay'),
    } = opts;

    // Guards
    if (!engine || !board) {
      console.error('LegislateUI.create missing board or engine');
      return {};
    }
    if (!tokensLayer) console.warn('tokensLayer not found');

    const modal = createModal();
    const boardUI = createBoardRenderer({ board });
    const offs = []; // event unsubscribe fns

    // --- Controls wiring ---
    if (rollBtn) rollBtn.addEventListener('click', () => engine.takeTurn());
    if (restartBtn) restartBtn.addEventListener('click', () => {
      engine.reset();
      renderPlayersList();
      boardUI.render(engine.state.players);
    });
    if (playerCountSelect) {
      playerCountSelect.addEventListener('change', (e) => {
        engine.setPlayerCount(Number(e.target.value) || 4);
        renderPlayersList();
        boardUI.render(engine.state.players);
      });
    }

    // --- Players list with inline editing (immediate) ---
    function renderPlayersList() {
      const section = playersSection;
      if (!section) return;
      section.innerHTML = '';
      engine.state.players.forEach((p, i) => {
        const pill = ce('div', 'player-pill');
        const dot  = ce('div', 'player-dot'); dot.style.background = p.color;
        const name = ce('span', 'player-name'); name.contentEditable = 'true'; name.textContent = p.name;

        function applyName(){
          const v = (name.textContent || '').trim();
          if (!v) return;
          engine.state.players[i].name = v;
          if (turnIndicator && i === engine.state.turnIndex) {
            turnIndicator.textContent = `${v}'s turn`;
          }
        }
        name.addEventListener('input', applyName);
        name.addEventListener('blur',  applyName);

        pill.appendChild(dot);
        pill.appendChild(name);
        section.appendChild(pill);
      });
    }
    renderPlayersList();

    // --- Engine event wiring (UI owns all wiring) ---
    offs.push(engine.bus.on('TURN_BEGIN', ({ index }) => {
      const p = engine.state.players[index];
      if (turnIndicator) turnIndicator.textContent = `${p.name}'s turn`;
      boardUI.render(engine.state.players);
    }));

    offs.push(engine.bus.on('MOVE_STEP', () => {
      boardUI.render(engine.state.players);
    }));

    offs.push(engine.bus.on('DICE_ROLL', ({ value }) => {
      showDiceRoll(value, 900);
    }));

    offs.push(engine.bus.on('CARD_DRAWN', async ({ deck, card }) => {
      if (!card) {
        await modal.open({
          title: 'No card',
          body: `<p>The ${DECK_LABELS[deck] || deck} deck is empty.</p>`
        });
        engine.bus.emit('CARD_RESOLVE');
        return;
      }
      await modal.open({
        title: (card.title || (DECK_LABELS[deck] || deck)),
        body: `<p>${(card.text || '').trim()}</p>`
      });
      engine.bus.emit('CARD_RESOLVE');
    }));

    offs.push(engine.bus.on('CARD_APPLIED', ({ card, playerId }) => {
      boardUI.render(engine.state.players);

      if (card && typeof card.effect === 'string') {
        const [type] = card.effect.split(':');
        const p = engine.state.players.find(x => x.id === playerId);
        if (type === 'extra_roll') {
          toast(`${p?.name || 'Player'} gets an extra roll`, { kind: 'success' });
        }
        if (type === 'miss_turn') {
          toast(`${p?.name || 'Player'} will miss their next turn`, { kind: 'info' });
        }
      }
    }));

    offs.push(engine.bus.on('MISS_TURN', ({ name }) => {
      toast(`${name} misses a turn`, { kind: 'info' });
    }));

    offs.push(engine.bus.on('EFFECT_GOTO', ({ playerId, index }) => {
      const p = engine.state.players.find(x => x.id === playerId);
      toast(`${p?.name || 'Player'} jumps to ${index}`, { kind: 'info', ttl: 1800 });
    }));

    offs.push(engine.bus.on('GAME_END', ({ name }) => {
      toast(`${name} reached the end!`, { kind: 'success', ttl: 2600 });
    }));

    // Initial paint
    boardUI.render(engine.state.players);
    if (turnIndicator) {
      const p = engine.state.players[engine.state.turnIndex];
      turnIndicator.textContent = `${p.name}'s turn`;
    }

    // Facade API (optional hooks)
    return {
      boardUI,
      destroy() { offs.forEach(off => { try { off(); } catch(e){} }); },
    };
  }

  // Export facade + primitives (handy if needed)
  window.LegislateUI = {
    create,
    toast,
    createModal,
    showDiceRoll,
    setTurnIndicator,
    createBoardRenderer,
  };
})();