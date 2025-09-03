// ui.js — rendering helpers (no facade)
window.LegislateUI = (function () {
  const $ = (id) => document.getElementById(id);

  // ---- Turn indicator (primitive) ----
  function setTurnIndicator(text) {
    const el = $('turnIndicator');
    if (el) el.textContent = text;
  }

  // ---- Board renderer (percent coords + fan-out) ----
  function createBoardRenderer(arg) {
    const layer = $('tokensLayer');
    if (!layer) return { render: () => {} };
    const board = (arg && arg.board) ? arg.board : arg;

    // board.json stores x/y as percentages (0..100)
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

      // Group by position
      const groups = new Map();
      players.forEach(p => {
        const k = String(p.position || 0);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(p);
      });

      const seen = new Set();
      const TAU = Math.PI * 2;
      const RADIUS_PCT = 2.5; // fan radius in % of board

      for (const [key, group] of groups.entries()) {
        const posIndex = Number(key);
        const { x, y } = coordsFor(posIndex);

        if (group.length === 1) {
          const p = group[0];
          const t = ensureToken(p.id, p.color);
          t.style.left = x + '%';
          t.style.top  = y + '%';
          seen.add(p.id);
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
          seen.add(p.id);
        });
      }

      // Remove tokens for non-active players (e.g., after count change)
      layer.querySelectorAll('.token').forEach(el => {
        const id = el.getAttribute('data-id');
        if (!seen.has(id)) el.remove();
      });
    }

    return { render };
  }

  // ---- Modal (promise-based) ----
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

        const list = actions && actions.length ? actions : [{ label: 'OK', value: true }];
        list.forEach(a => {
          const btn = document.createElement('button');
          btn.className = 'button button--primary';
          btn.textContent = a.label || 'OK';
          btn.addEventListener('click', () => { root.innerHTML = ''; resolve(a.value); });
          acts.appendChild(btn);
        });

        card.appendChild(h); card.appendChild(b); card.appendChild(acts);
        backdrop.appendChild(card);
        root.appendChild(backdrop);
      });
    }
    return { open };
  }

  // ---- Dice overlay (original stable timing) ----
  function showDiceRoll(value) {
    const overlay = $('diceOverlay');
    const diceEl  = $('dice');
    if (!overlay || !diceEl) return;
    overlay.hidden = false;
    diceEl.className = 'dice rolling';
    setTimeout(() => { diceEl.className = 'dice show-' + (value || 1); }, 900);
    setTimeout(() => { overlay.hidden = true; diceEl.className = 'dice'; }, 2500);
  }

  // ---- Toasts (tiny, no CSS changes) ----
  (function ensureToast(){
    if (document.getElementById('toastRoot')) return;
    const root = document.createElement('div');
    root.id = 'toastRoot';
    Object.assign(root.style, {
      position:'fixed', right:'12px', top:'12px', zIndex:'2000',
      display:'flex', flexDirection:'column', gap:'8px'
    });
    document.body.appendChild(root);
  })();

  function toast(message, { kind='info', ttl=2200 } = {}) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    Object.assign(el.style, {
      padding:'10px 12px',
      background: kind === 'error' ? '#d4351c' : (kind === 'success' ? '#00703c' : '#1d70b8'),
      color:'#fff', borderRadius:'8px', boxShadow:'0 6px 16px rgba(0,0,0,.15)',
      fontWeight:'600', maxWidth:'320px', wordBreak:'break-word'
    });
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      setTimeout(() => el.remove(), 300);
    }, ttl);
  }
  // Legacy shim if anything calls window.toast directly
  window.toast = window.toast || ((msg, opts) => toast(msg, opts));

  // ---- Export primitives ----
  return {
    setTurnIndicator,
    createBoardRenderer,
    createModal,
    showDiceRoll,
    toast
  };
})();