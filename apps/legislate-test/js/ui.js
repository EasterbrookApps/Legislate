// ui.js — DOM rendering and helpers
window.LegislateUI = (function () {
  function setTurnIndicator(player) {
    const el = document.getElementById('turnIndicator');
    if (el) el.textContent = `${player.name}'s turn`;
  }

  function renderPlayers(players, tokensLayer) {
    tokensLayer.innerHTML = '';
    players.forEach(p => {
      const div = document.createElement('div');
      div.className = 'token';
      div.style.background = p.color;
      div.style.left = p.x + '%';
      div.style.top = p.y + '%';
      tokensLayer.appendChild(div);
    });
  }

  function createModal() {
    const root = document.getElementById('modalRoot');
    return {
      show(content) {
        root.innerHTML = '';
        root.style.display = 'block';
        const box = document.createElement('div');
        box.className = 'modal';
        box.innerHTML = content;
        const ok = document.createElement('button');
        ok.textContent = 'OK';
        ok.className = 'button';
        ok.addEventListener('click', () => this.hide());
        box.appendChild(ok);
        root.appendChild(box);
      },
      hide() {
        const root = document.getElementById('modalRoot');
        root.style.display = 'none';
        root.innerHTML = '';
      }
    };
  }

  function showDiceRoll(value) {
    const overlay = document.getElementById('diceOverlay');
    const dice = document.getElementById('dice');
    overlay.style.display = 'flex';
    dice.className = 'dice show-' + value;
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 1000);
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '1rem',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#333',
      color: '#fff',
      padding: '.5rem 1rem',
      borderRadius: '4px',
      opacity: '0.9',
      zIndex: 2000
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  return { setTurnIndicator, renderPlayers, createModal, showDiceRoll, toast };
})();