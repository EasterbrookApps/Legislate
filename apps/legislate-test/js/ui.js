// ui.js — UI utilities and render helpers for Legislate?!
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Turn indicator ----------
  function setTurnIndicator(text) {
    const el = $('turnIndicator');
    if (el) el.textContent = text;
  }

  // ---------- Players list (inline editor UI) ----------
  // Note: your app.js may handle player list; this stays available and non-invasive.
  function renderPlayers(players /*, board (unused here) */) {
    const section = $('playersSection');
    if (!section) return;
    section.innerHTML = '';

    players.forEach((p) => {
      const pill = document.createElement('div');
      pill.className = 'player-pill';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;

      const name = document.createElement('span');
      name.className = 'player-name';
      name.contentEditable = 'true';
      name.textContent = p.name;

      pill.appendChild(dot);
      pill.appendChild(name);
      section.appendChild(pill);
    });
  }

  // ---------- Board / tokens renderer ----------
  // Creates a renderer bound to a specific board object.
  // Usage: const br = LegislateUI.createBoardRenderer(board); br.render(engine.state.players);
  function createBoardRenderer(board) {
    const layer = $('tokensLayer');
    if (!layer) {
      // Return a no-op renderer to avoid crashes if DOM not ready yet
      return { render: () => {} };
    }

    // Find normalised coordinates (percentages) for a board index
    const coordsFor = (index) => {
      const space = board && board.spaces && board.spaces.find(s => s.index === index);
      return {
        x: space && typeof space.x === 'number' ? space.x : 0,
        y: space && typeof space.y === 'number' ? space.y : 0
      };
    };

    // Ensure a token element exists for a given player id/color
    function ensureToken(id, color) {
      let el = layer.querySelector(`[data-id="${id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'token';
        el.dataset.id = id;
        el.style.background = color;
        layer.appendChild(el);
      } else {
        // keep color updated in case it changed
        el.style.background = color;
      }
      return el;
    }

    // Public render method — paints tokens, fanning out any overlaps
    function render(players) {
      if (!Array.isArray(players)) return;

      // Group players by their board position
      const groups = new Map();
      players.forEach(p => {
        const key = String(p.position || 0);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });

      // We won’t remove nodes each frame to avoid GC churn; instead we position existing tokens
      // and create missing ones on demand.
      const seenIds = new Set();

      const TAU = Math.PI * 2;
      const RADIUS_PCT = 3; // token spread radius (as % of board size)

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

      // Optionally hide tokens for players not present (e.g., after player count changes)
      layer.querySelectorAll('.token').forEach(el => {
        const id = el.getAttribute('data-id');
        if (!seenIds.has(id)) {
          el.remove();
        }
      });
    }

    // Important: return the bound renderer so `board` stays in scope
    return { render };
  }

  // ---------- Modal (promise-based) ----------
  function createModal() {
    const root = $('modalRoot');
    function open({ title = '', body = '', actions } = {}) {
      return new Promise((resolve) => {
        if (!root) return resolve();

        root.innerHTML = '';
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'flex';

        const card = document.createElement('div');
        card.className = 'modal';

        const h = document.createElement('h2');
        h.textContent = title || 'Card';

        const b = document.createElement('div');
        b.className = 'modal-body';
        b.innerHTML = body;

        const acts = document.createElement('div');
        acts.className = 'modal-actions';

        const list = actions && actions.length ? actions : [{ id: 'ok', label: 'OK', value: true }];
        list.forEach(a => {
          const btn = document.createElement('button');
          btn.className = 'button button--primary';
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
  // Keep this signature compatible with app.js: showDiceRoll(value, ms)
  function showDiceRoll(value, ms = 900) {
    const overlay = $('diceOverlay');
    const diceEl  = $('dice');
    if (!overlay || !diceEl) return Promise.resolve();

    return new Promise((resolve) => {
      overlay.hidden = false;
      // wobble during roll
      diceEl.className = 'dice rolling';
      // reveal face at the end of wobble
      setTimeout(() => {
        diceEl.className = 'dice show-' + (value || 1);
        setTimeout(() => { overlay.hidden = true; resolve(); }, 250);
      }, ms);
    });
  }

  // ---------- Toast helper ----------
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // ---------- Export UI API ----------
  window.LegislateUI = {
    setTurnIndicator,
    renderPlayers,
    createBoardRenderer,
    createModal,
    showDiceRoll,
    toast
  };
})();