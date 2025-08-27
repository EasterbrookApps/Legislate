<!-- File: apps/legislate-test/js/ui.js -->
<script>
window.LegislateUI = (function () {
  // ---------- small helpers ----------
  const $id = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- simple setters used by app.js ----------
  function setAlt(img, text) {
    if (img) img.alt = text || '';
  }
  function setSrc(img, src) {
    if (img) img.src = src;
  }
  function setTurnIndicator(elm, text) {
    if (!elm) return;
    elm.textContent = text;
  }

  // ---------- modal infrastructure ----------
  // build a single modal inside #modalRoot and control it here.
  function createModal(root) {
    const host = root || $id('modalRoot');
    if (!host) throw new Error('modalRoot not found');

    // if we already initialised, just return the controller we stashed
    if (host.__controller) return host.__controller;

    const backdrop = el('div', 'modal-backdrop', '');
    backdrop.style.display = 'none';

    const modal = el('div', 'modal', '');
    const h2 = el('h2', '', '');
    const body = el('div', 'modal-body', '');
    const actions = el('div', 'modal-actions', '');
    const okBtn = el('button', 'button', 'OK');
    okBtn.id = 'modalOK';

    actions.appendChild(okBtn);
    modal.append(h2, body, actions);
    backdrop.appendChild(modal);
    host.appendChild(backdrop);

    let resolver = null;
    function open({ title = '', html = '' }) {
      h2.textContent = title || '';
      body.innerHTML = html || '';
      backdrop.style.display = 'flex';
      okBtn.focus();
      return new Promise((resolve) => {
        resolver = resolve;
      });
    }
    function close(result) {
      backdrop.style.display = 'none';
      body.innerHTML = '';
      if (resolver) {
        const r = resolver;
        resolver = null;
        r(result);
      }
    }
    okBtn.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => {
      // only close if user clicks outside the modal box
      if (e.target === backdrop) close(false);
    });

    const controller = { open, close, elements: { backdrop, modal, body, okBtn } };
    host.__controller = controller;
    return controller;
  }

  // Show a card using the shared modal; resolves when user presses OK
  async function showCardModal(card) {
    const ctrl = createModal($id('modalRoot'));
    const title = card?.id || 'Card';
    const html = `
      <p>${(card?.text || '').replace(/\n/g, '<br>')}</p>
      ${card?.effect ? `<p><em>Effect:</em> ${card.effect}</p>` : ''}
    `;
    return ctrl.open({ title, html });
  }

  // ---------- dice overlay ----------
  // Uses #diceOverlay and #dice from index.html
  function showDiceRoll(value, durationMs = 1100) {
    return new Promise((resolve) => {
      const overlay = $id('diceOverlay');
      const dice = $id('dice');
      if (!overlay || !dice) {
        // if markup missing, just resolve immediately
        return resolve();
      }

      // honour reduced motion
      const prefersReduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dur = prefersReduced ? 300 : durationMs;

      // Set visible + animate between faces quickly, then settle on final
      overlay.hidden = false;
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden', 'false');

      dice.classList.remove(
        'show-1',
        'show-2',
        'show-3',
        'show-4',
        'show-5',
        'show-6'
      );
      dice.classList.add('rolling');

      // quick jitter to make it feel alive
      const temp = setInterval(() => {
        const r = 1 + Math.floor(Math.random() * 6);
        dice.className = `dice rolling show-${r}`;
      }, 120);

      setTimeout(() => {
        clearInterval(temp);
        dice.className = `dice show-${value}`;

        // small pause with the final face visible
        setTimeout(() => {
          overlay.hidden = true;
          overlay.style.display = 'none';
          overlay.setAttribute('aria-hidden', 'true');
          resolve();
        }, prefersReduced ? 250 : 450);
      }, dur);
    });
  }

  // ---------- toast (subtle notifications) ----------
  function toast(message, ms = 2200) {
    const root = $id('modalRoot') || document.body;
    let box = root.querySelector('.toast');
    if (!box) {
      box = el('div', 'toast', '');
      // minimal inline style so it works without extra CSS
      box.style.position = 'fixed';
      box.style.right = '12px';
      box.style.bottom = '12px';
      box.style.background = '#111';
      box.style.color = '#fff';
      box.style.padding = '8px 10px';
      box.style.borderRadius = '6px';
      box.style.fontSize = '14px';
      box.style.zIndex = '1600';
      root.appendChild(box);
    }
    box.textContent = message || '';
    box.style.opacity = '1';
    clearTimeout(box.__t);
    box.__t = setTimeout(() => {
      box.style.opacity = '0';
    }, ms);
  }

  // ---------- board + tokens ----------
  // Creates a token renderer bound to the image + overlay layer.
  function createBoardRenderer(boardImgEl, tokensLayerEl, spaces) {
    if (!boardImgEl || !tokensLayerEl) {
      throw new Error('Board image or tokens layer missing');
    }

    // Ensure overlay is positioned correctly
    tokensLayerEl.style.position = 'absolute';
    tokensLayerEl.style.inset = '0';

    // cache player elements by id
    const tokenMap = new Map();

    function ensureToken(id, color) {
      if (tokenMap.has(id)) return tokenMap.get(id);
      const dot = el('div', 'token');
      // minimal style so it works regardless of CSS
      dot.style.position = 'absolute';
      dot.style.width = '2.2%';
      dot.style.height = '2.2%';
      dot.style.borderRadius = '50%';
      dot.style.boxShadow = '0 1px 4px rgba(0,0,0,.35)';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.pointerEvents = 'none';
      dot.style.zIndex = '5';
      dot.style.background = color || '#d4351c';
      dot.dataset.playerId = id;
      tokensLayerEl.appendChild(dot);
      tokenMap.set(id, dot);
      return dot;
    }

    function positionForIndex(index) {
      const s = Array.isArray(spaces) ? spaces.find((t) => t.index === index) : null;
      if (!s) return null;
      return { x: s.x, y: s.y }; // percentages 0..100
    }

    function placeToken(player) {
      const pos = positionForIndex(player.position);
      const dot = ensureToken(player.id, player.color);
      if (!pos) {
        dot.style.display = 'none';
        return;
      }
      dot.style.display = 'block';
      dot.style.left = pos.x + '%';
      dot.style.top = pos.y + '%';
    }

    function renderPlayers(players) {
      if (!players) return;
      players.forEach(placeToken);
    }

    return { renderPlayers, placeToken };
  }

  // ---------- players list (header pills) ----------
  function renderPlayersList(container, players) {
    if (!container) return;
    container.innerHTML = '';
    players.forEach((p) => {
      const pill = el('span', 'player-pill', '');
      const dot = el('span', 'player-dot', '');
      dot.style.background = p.color || '#1d70b8';

      const name = el('span', 'player-name', p.name || '');
      name.contentEditable = 'true';
      name.spellcheck = false;
      name.addEventListener('blur', () => {
        const v = (name.textContent || '').trim();
        p.name = v || p.name; // app will persist on next save
      });

      pill.append(dot, name);
      container.appendChild(pill);
    });
  }

  // Expose all functions app.js expects
  return {
    setAlt,
    setSrc,
    setTurnIndicator,
    createModal,           // << restored and exported
    createBoardRenderer,
    renderPlayers: renderPlayersList,
    showDiceRoll,
    showCardModal,
    toast,
  };
})();
</script>