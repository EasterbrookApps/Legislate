// ui.js — handles rendering, tokens, modals, dice, toasts
window.LegislateUI = (function () {
  function $(id) { return document.getElementById(id); }

  // -------------------
  // TOKEN RENDERING
  // -------------------
  function renderPlayers({ engine, tokensLayer }) {
    tokensLayer.innerHTML = '';
    const players = engine.state.players;

    // Group players by board position
    const grouped = {};
    players.forEach(p => {
      if (!grouped[p.position]) grouped[p.position] = [];
      grouped[p.position].push(p);
    });

    for (const [pos, group] of Object.entries(grouped)) {
      const space = engine.state.board.spaces.find(s => s.index === Number(pos));
      if (!space) continue;

      const centerX = space.x;
      const centerY = space.y;
      const r = 12; // fan radius

      group.forEach((p, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);

        const el = document.createElement('div');
        el.className = 'token';
        el.style.backgroundColor = p.color;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.title = p.name;
        tokensLayer.appendChild(el);
      });
    }
  }

  // -------------------
  // CARD MODALS
  // -------------------
  function createModal({ title, body, onResolve, root }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-card';

    const h2 = document.createElement('h2');
    h2.textContent = title;

    const p = document.createElement('p');
    p.textContent = body;

    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.className = 'button';
    btn.addEventListener('click', () => {
      root.removeChild(overlay);
      onResolve();
    });

    modal.appendChild(h2);
    modal.appendChild(p);
    modal.appendChild(btn);
    overlay.appendChild(modal);
    root.appendChild(overlay);
  }

  // -------------------
  // TOASTS
  // -------------------
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 2500);
  }

  // -------------------
  // DICE OVERLAY
  // -------------------
  let dicePromise = null;

  function showDiceRoll(value) {
    const overlay = $('diceOverlay');
    const dice = $('dice');

    if (!overlay || !dice) return;

    // clear previous
    dice.className = 'dice';
    void dice.offsetWidth; // reflow trick

    // set face FIRST (fixes wrong number issue)
    dice.classList.add(`show-${value}`);

    overlay.hidden = false;

    // animate
    dice.classList.add('rolling');

    if (dicePromise) dicePromise.resolve(); // clean up old
    let resolve;
    dicePromise = new Promise(res => { resolve = res; });
    dicePromise.resolve = resolve;

    setTimeout(() => {
      dice.classList.remove('rolling');
      setTimeout(() => {
        overlay.hidden = true;
        if (dicePromise) {
          dicePromise.resolve();
          dicePromise = null;
        }
      }, 600); // short delay before hiding
    }, 1800);
  }

  function waitForDice() {
    return dicePromise || Promise.resolve();
  }

  // -------------------
  // PUBLIC API
  // -------------------
  return {
    renderPlayers,
    createModal,
    showToast,
    showDiceRoll,
    waitForDice,
  };
})();