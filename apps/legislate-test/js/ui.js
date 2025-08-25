// Lightweight UI helpers focused on rendering tokens & basic widgets
window.LegislateUI = (function () {

  function setTurnIndicator(text) {
    const el = document.getElementById('turnIndicator');
    if (el) el.textContent = text;
  }

  function setSrc(id, src) {
    const el = document.getElementById(id);
    if (el) el.src = src;
  }

  function setAlt(id, alt) {
    const el = document.getElementById(id);
    if (el) el.alt = alt;
  }

  function createModal() {
    const root = document.getElementById('modalRoot');
    return {
      open({ title = '', body = '', actions = [{ id: 'ok', label: 'OK' }] }) {
        if (!root) return Promise.resolve();
        root.innerHTML = `
          <div class="modal-backdrop">
            <div class="modal" role="dialog" aria-modal="true">
              <h2 id="modalTitle">${title}</h2>
              <div id="modalBody">${body}</div>
              <div class="modal-actions">
                ${actions.map(a => `<button class="button" id="modal-${a.id}">${a.label}</button>`).join('')}
              </div>
            </div>
          </div>`;
        return new Promise(resolve => {
          actions.forEach(a => {
            const btn = document.getElementById(`modal-${a.id}`);
            if (btn) btn.onclick = () => { root.innerHTML = ''; resolve(a.id); };
          });
        });
      }
    };
  }

  // Create a renderer that places tokens by percentage coordinates.
  function createBoardRenderer({ board }) {
    const layer = document.getElementById('tokensLayer');
    if (!layer) throw new Error('tokensLayer not found');

    function clear() { layer.innerHTML = ''; }

    function render(players) {
      layer.innerHTML = '';
      for (const p of players) {
        const s = board.spaces.find(sp => sp.index === (p.pos ?? p.position ?? 0)) || board.spaces[0];
        const dot = document.createElement('div');
        dot.className = 'player-dot';
        dot.style.background = p.color || '#d4351c';

        // s.x, s.y are 0..100 percentages relative to board image
        dot.style.left = (s.x || 0) + '%';
        dot.style.top  = (s.y || 0) + '%';

        dot.title = `${p.name || p.id}: ${s.index}`;
        layer.appendChild(dot);
      }
    }

    return { clear, render };
  }

  // Full-screen dice animation overlay. Resolves when finished.
  async function showDiceRoll(value, durationMs = 900) {
    return new Promise(resolve => {
      const overlay = document.getElementById('diceOverlay');
      const dice = document.getElementById('dice');
      if (!overlay || !dice) return resolve();

      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      dice.className = 'dice rolling';

      const tempTimer = setInterval(() => {
        const r = 1 + Math.floor(Math.random() * 6);
        dice.className = 'dice rolling show-' + r;
      }, 120);

      setTimeout(() => {
        clearInterval(tempTimer);
        dice.className = 'dice show-' + value;

        // brief “hold” so players can see the result
        setTimeout(() => {
          overlay.hidden = true;
          overlay.setAttribute('aria-hidden', 'true');
          resolve();
        }, 500);
      }, durationMs);
    });
  }

  return {
    setAlt, setSrc, setTurnIndicator,
    createModal, createBoardRenderer, showDiceRoll
  };
})();