// ui.js — UI utilities and render helpers for Legislate?!
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Turn indicator ----------
  function setTurnIndicator(text) {
    const el = $('turnIndicator');
    if (el) el.textContent = text;
  }

  // ---------- Players list (inline editor UI) ----------
  // (Your app.js handles editing/updates. This keeps parity and doesn't interfere.)
  function renderPlayers(players /*, board (unused) */) {
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
  // Usage in app.js: const boardUI = LegislateUI.createBoardRenderer({ board });
  // Supports EITHER a plain board object OR { board }.
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
        el = document.createElement('div');
        el.className = 'token';
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

      // Remove any tokens no longer representing active players
      layer.querySelectorAll('.token').forEach(el => {
        const id = el.getAttribute('data-id');
        if (!seenIds.has(id)) el.remove();
      });
    }

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
  // Keeps contract with app.js: showDiceRoll(value, ms)
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

  // ---------- Toasts ----------
  (function ensureToast(){
    if (document.getElementById('toastRoot')) return;
    const root = document.createElement('div');
    root.id = 'toastRoot';
    root.style.position = 'fixed';
    root.style.right = '12px';
    root.style.top = '12px';
    root.style.zIndex = '2000';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '8px';
    document.body.appendChild(root);
  })();

  function toast(message, { kind='info', ttl=2200 } = {}) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.style.padding = '10px 12px';
    el.style.background = kind === 'error' ? '#d4351c' : (kind === 'success' ? '#00703c' : '#1d70b8');
    el.style.color = '#fff';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 16px rgba(0,0,0,.15)';
    el.style.fontWeight = '600';
    el.style.maxWidth = '320px';
    el.style.wordBreak = 'break-word';
    el.textContent = message;
    root.appendChild(el);

    setTimeout(()=> {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      setTimeout(()=> el.remove(), 300);
    }, ttl);
  }

  // Global shim if something calls window.toast(...)
  window.toast = window.toast || ((msg, opts) => toast(msg, opts));

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