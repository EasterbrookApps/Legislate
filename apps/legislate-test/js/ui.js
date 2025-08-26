/* ui.js — consolidated UI layer
   - Restores inline name editing
   - Renders tokens centered at board coordinates
   - Dice overlay animation + DICE_DONE debug hook
   - Adds UI.toast + UI.openGameOver (end-game modal)
   - Keeps same public API expected by app.js
*/
window.LegislateUI = (function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const log = (...args) => { try { window.LegislateDebug?.log(...args); } catch {} };

  // Cache common DOM
  const els = {
    boardImg: $('#boardImg'),
    tokensLayer: $('#tokensLayer') || $('.tokens-layer'),
    turnIndicator: $('#turnIndicator'),
    diceOverlay: $('#diceOverlay'),
    dice: $('#dice'),
    playersSection: $('#playersSection') || $('.players-section'),
    modalRoot: $('#modalRoot') || $('#modal-root')
  };

  // ---------- Helpers ----------
  function placeTokenDiv(div, xPct, yPct) {
    // Position using percentages and center using transform to avoid misalignment at different sizes
    div.style.position = 'absolute';
    div.style.left = xPct + '%';
    div.style.top = yPct + '%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.willChange = 'transform, left, top';
  }

  function createTokenEl(color, id) {
    const d = document.createElement('div');
    d.className = 'token';
    d.dataset.playerId = id;
    d.style.width = '18px';
    d.style.height = '18px';
    d.style.borderRadius = '50%';
    d.style.border = '2px solid #fff';
    d.style.boxShadow = '0 2px 6px rgba(0,0,0,.35)';
    d.style.background = color || '#1d70b8';
    d.setAttribute('aria-hidden', 'true');
    return d;
  }

  function ensurePlayersHost() {
    let host = els.playersSection;
    if (!host) {
      host = document.createElement('div');
      host.className = 'players-section';
      els.playersSection = host;
      (els.turnIndicator?.parentNode || document.body).appendChild(host);
    }
    return host;
  }

  function preventHotkeys(e) {
    // Stop global shortcuts while editing names
    e.stopPropagation();
  }

  function commitPlayerName(playerId, newName) {
    const name = (newName || '').trim() || undefined;
    const eng = window.LegislateApp?.engine;
    if (!eng) return;
    const p = eng.state.players.find(pl => pl.id === playerId);
    if (p && name) {
      p.name = name;
      // Update banner if it's their turn
      if (eng.state.players[eng.state.turnIndex]?.id === p.id) {
        setTurnIndicator(`${p.name}’s turn`);
      }
    }
  }

  // ---------- Public API ----------
  function setTurnIndicator(text) {
    if (!els.turnIndicator) return;
    els.turnIndicator.textContent = text || '';
  }

  function renderPlayers(players, state, board) {
    // 1) Render name pills (with inline editing)
    const host = ensurePlayersHost();
    host.innerHTML = ''; // clear
    players.forEach(p => {
      const pill = document.createElement('span');
      pill.className = 'player-pill';

      const dot = document.createElement('span');
      dot.className = 'player-dot';
      dot.style.background = p.color || '#1d70b8';

      const name = document.createElement('span');
      name.className = 'player-name player-name-input';
      name.contentEditable = 'true';
      name.spellcheck = false;
      name.dataset.playerId = p.id;
      name.textContent = p.name || '';
      name.title = 'Click to edit name';

      // Accessibility
      name.setAttribute('role', 'textbox');
      name.setAttribute('aria-label', `Edit name for ${p.name}`);

      // Prevent global shortcuts while typing
      name.addEventListener('keydown', preventHotkeys);
      name.addEventListener('keyup', preventHotkeys);

      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          name.blur();
        }
      });
      name.addEventListener('blur', () => {
        commitPlayerName(p.id, name.textContent);
      });

      pill.appendChild(dot);
      pill.appendChild(name);
      host.appendChild(pill);
    });

    // 2) Render tokens at positions
    if (!els.tokensLayer) {
      // create tokens layer if missing
      const tl = document.createElement('div');
      tl.id = 'tokensLayer';
      tl.className = 'tokens-layer';
      tl.style.position = 'absolute';
      tl.style.inset = '0';
      els.tokensLayer = tl;
      if (els.boardImg && els.boardImg.parentNode) {
        els.boardImg.parentNode.style.position = 'relative';
        els.boardImg.parentNode.appendChild(tl);
      } else {
        document.body.appendChild(tl);
      }
    }
    els.tokensLayer.innerHTML = '';

    // Build an index -> {x,y} map once
    const coords = new Map();
    (board?.spaces || []).forEach(s => coords.set(s.index, { x: s.x, y: s.y }));

    // Group by board index to offset stacked tokens slightly
    const stacks = new Map(); // index -> count so far
    players.forEach(p => {
      const pos = (typeof p.position === 'number') ? p.position : 0;
      const c = coords.get(pos);
      if (!c) return;
      const t = createTokenEl(p.color, p.id);

      // Stack offset to prevent perfect overlap (small radial fan)
      const n = (stacks.get(pos) || 0);
      stacks.set(pos, n + 1);
      const angle = (n * 42) * Math.PI / 180; // 42° increments for fun
      const r = 8; // px radius
      const offsetX = (r * Math.cos(angle)) / (els.tokensLayer.clientWidth || 1) * 100;
      const offsetY = (r * Math.sin(angle)) / (els.tokensLayer.clientHeight || 1) * 100;

      placeTokenDiv(t, c.x + offsetX, c.y + offsetY);
      els.tokensLayer.appendChild(t);
    });

    // Turn banner highlight
    const current = state.players[state.turnIndex];
    $$('.player-pill', host).forEach((pill, i) => {
      pill.style.outline = (players[i]?.id === current?.id) ? '2px solid #1d70b8' : '1px solid var(--border, #b1b4b6)';
    });
  }

  function showDiceRoll(value) {
    if (!els.diceOverlay || !els.dice) return;
    // show overlay
    els.diceOverlay.hidden = false;
    els.diceOverlay.style.display = 'flex';
    els.dice.classList.add('rolling');

    // set face
    // remove any previous show-* class
    els.dice.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6');
    const face = Math.max(1, Math.min(6, Number(value) || 1));
    els.dice.classList.add(`show-${face}`);

    // short animation then hide overlay
    setTimeout(() => {
      els.dice.classList.remove('rolling');
      // leave the face visible for a beat
      setTimeout(() => {
        els.diceOverlay.hidden = true;
        els.diceOverlay.style.display = 'none';
        log('DICE_DONE', { value: face });
      }, 600);
    }, 700);
  }

  // ---------- Toast + Game Over modal ----------
  function ensureToastHost() {
    let host = $('#toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.setAttribute('aria-live', 'polite');
      host.style.position = 'fixed';
      host.style.insetInline = '0';
      host.style.bottom = '1rem';
      host.style.display = 'grid';
      host.style.placeItems = 'center';
      host.style.zIndex = '1600';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, opts = {}) {
    const { ttl = 2600 } = opts;
    const host = ensureToastHost();
    const card = document.createElement('div');
    card.className = 'toast';
    card.style.maxWidth = '90vw';
    card.style.padding = '.6rem .9rem';
    card.style.borderRadius = '.5rem';
    card.style.border = '1px solid #b1b4b6';
    card.style.background = '#fff';
    card.style.boxShadow = '0 6px 24px rgba(0,0,0,.18)';
    card.style.fontWeight = '600';
    card.style.fontSize = '0.95rem';
    card.style.margin = '0.25rem auto';
    card.textContent = message;
    host.appendChild(card);
    window.setTimeout(() => {
      card.style.opacity = '0';
      card.style.transition = 'opacity .25s ease';
      card.addEventListener('transitionend', () => card.remove(), { once: true });
    }, ttl);
  }

  function openGameOver(podium, totalPlayers, onPlayAgain, onClose) {
    let mount = els.modalRoot;
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'modalRoot';
      document.body.appendChild(mount);
      els.modalRoot = mount;
    }

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.background = 'rgba(0,0,0,.55)';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'flex-start';
    backdrop.style.justifyContent = 'center';
    backdrop.style.padding = '10vh 1rem';
    backdrop.style.zIndex = '1700';

    // Panel
    const panel = document.createElement('div');
    panel.className = 'modal';
    panel.style.background = '#fff';
    panel.style.maxWidth = '640px';
    panel.style.width = '100%';
    panel.style.borderRadius = '.5rem';
    panel.style.padding = '1rem';
    panel.style.boxShadow = '0 12px 40px rgba(0,0,0,.3)';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'gameOverTitle');

    const h2 = document.createElement('h2');
    h2.id = 'gameOverTitle';
    h2.textContent = 'Game over';

    const body = document.createElement('div');
    const lead = document.createElement('p');
    lead.style.marginTop = '.25rem';
    lead.textContent = 'Final placings';

    const ol = document.createElement('ol');
    ol.style.paddingLeft = '1.25rem';
    ol.style.marginTop = '.25rem';

    const placeLabel = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

    podium.forEach(entry => {
      const li = document.createElement('li');
      li.style.margin = '.25rem 0';

      const swatch = document.createElement('span');
      swatch.style.display = 'inline-block';
      swatch.style.width = '.85rem';
      swatch.style.height = '.85rem';
      swatch.style.borderRadius = '50%';
      swatch.style.marginRight = '.45rem';
      swatch.style.verticalAlign = 'middle';
      try {
        const pl = window.LegislateApp?.engine?.state?.players?.find(p => p.id === entry.playerId);
        swatch.style.background = pl?.color || '#1d70b8';
      } catch { swatch.style.background = '#1d70b8'; }

      const label = document.createElement('strong');
      label.textContent = `${placeLabel(entry.place)} — ${entry.name}`;

      li.appendChild(swatch);
      li.appendChild(label);
      ol.appendChild(li);
    });

    body.appendChild(lead);
    body.appendChild(ol);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '.5rem';
    actions.style.marginTop = '1rem';

    const btnAgain = document.createElement('button');
    btnAgain.className = 'button';
    btnAgain.textContent = 'Play again';

    const btnClose = document.createElement('button');
    btnClose.className = 'button button--secondary';
    btnClose.textContent = 'Close';

    actions.appendChild(btnAgain);
    actions.appendChild(btnClose);

    panel.appendChild(h2);
    panel.appendChild(body);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    mount.appendChild(backdrop);

    const prevFocus = document.activeElement;
    btnAgain.focus();

    function teardown() {
      backdrop.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (typeof onClose === 'function') onClose();
    }

    btnClose.addEventListener('click', teardown);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) teardown(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') teardown(); }, { once: true });

    btnAgain.addEventListener('click', () => {
      if (typeof onPlayAgain === 'function') onPlayAgain();
      teardown();
    });
  }

  // Public API
  return {
    setTurnIndicator,
    renderPlayers,
    showDiceRoll,
    toast,
    openGameOver
  };
})();