/* ui.js — augment existing UI with end-game helpers (toast + game-over modal)
   NOTE: This does NOT replace your existing UI; it extends window.LegislateUI safely. */
window.LegislateUI = (function (UI) {
  'use strict';

  // --- Utilities ---
  const $ = (sel, root = document) => root.querySelector(sel);

  // Ensure a single toast container
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
      host.style.zIndex = '1600'; // above overlays
      document.body.appendChild(host);
    }
    return host;
  }

  // Simple toast (non-blocking)
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

  // Modal factory (uses existing modal root if present)
  function openGameOver(podium, totalPlayers, onPlayAgain, onClose) {
    const root = $('#modalRoot') || $('#modal-root');
    if (!root) {
      // Fallback: create a root so we never fail
      const r = document.createElement('div');
      r.id = 'modalRoot';
      document.body.appendChild(r);
    }
    const mount = $('#modalRoot') || $('#modal-root');

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

    // Modal panel
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

    // Title
    const h = document.createElement('h2');
    h.id = 'gameOverTitle';
    h.textContent = 'Game over';

    // Body: podium list
    const p = document.createElement('div');
    const title = document.createElement('p');
    title.style.marginTop = '.25rem';
    title.textContent = 'Final placings';
    const list = document.createElement('ol');
    list.style.paddingLeft = '1.25rem';
    list.style.marginTop = '.25rem';

    const placeLabel = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

    podium.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.style.margin = '.25rem 0';
      const swatch = document.createElement('span');
      swatch.style.display = 'inline-block';
      swatch.style.width = '.85rem';
      swatch.style.height = '.85rem';
      swatch.style.borderRadius = '50%';
      swatch.style.marginRight = '.45rem';
      swatch.style.verticalAlign = 'middle';
      // Try to find player colour if we can (optional)
      try {
        const pl = window.LegislateApp?.engine?.state?.players?.find(pp => pp.id === entry.playerId);
        if (pl?.color) swatch.style.background = pl.color;
        else swatch.style.background = '#1d70b8';
      } catch { swatch.style.background = '#1d70b8'; }

      const label = document.createElement('strong');
      label.textContent = `${placeLabel(entry.place)} — ${entry.name}`;

      li.appendChild(swatch);
      li.appendChild(label);
      list.appendChild(li);
    });

    p.appendChild(title);
    p.appendChild(list);

    // Actions
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

    panel.appendChild(h);
    panel.appendChild(p);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    mount.appendChild(backdrop);

    // Focus handling
    const prevFocus = document.activeElement;
    btnAgain.focus();

    function teardown() {
      backdrop.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (typeof onClose === 'function') onClose();
    }

    btnClose.addEventListener('click', teardown);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) teardown(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') teardown();
    }, { once: true });

    btnAgain.addEventListener('click', () => {
      if (typeof onPlayAgain === 'function') onPlayAgain();
      // onPlayAgain will reset and then we close
      teardown();
    });
  }

  // Expose (augment only; keep existing methods intact)
  UI.toast = UI.toast || toast;
  UI.openGameOver = openGameOver;

  return UI;
})(window.LegislateUI || {});