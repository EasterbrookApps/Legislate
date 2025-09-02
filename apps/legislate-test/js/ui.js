// ui.js — rendering and interaction layer
window.LegislateUI = (function () {
  function $(id) { return document.getElementById(id); }

  function create({ board, engine, root, playersSection, tokensLayer, turnIndicator, rollBtn, restartBtn, playerCountSelect, modalRoot, diceOverlay }) {
    const bus = engine.bus;

    // ---------- Players section ----------
    function renderPlayers() {
      playersSection.innerHTML = '';
      engine.state.players.forEach((p, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'player-row';

        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = p.color;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = p.name;
        input.className = 'player-name';
        input.addEventListener('change', () => {
          p.name = input.value.trim() || p.name;
          renderPlayers(); // re-render immediately
        });

        wrap.appendChild(swatch);
        wrap.appendChild(input);
        playersSection.appendChild(wrap);
      });
    }

    bus.on('TURN_BEGIN', () => renderPlayers());
    renderPlayers();

    // ---------- Tokens layer ----------
    function renderTokens() {
      tokensLayer.innerHTML = '';
      const grouped = {};

      engine.state.players.forEach(p => {
        if (!grouped[p.position]) grouped[p.position] = [];
        grouped[p.position].push(p);
      });

      Object.entries(grouped).forEach(([pos, players]) => {
        const space = board.spaces.find(s => s.index === Number(pos));
        if (!space) return;
        const baseX = space.x;
        const baseY = space.y;

        // Fan tokens in a circle if more than one on same square
        const r = 14; // radius offset
        const count = players.length;

        players.forEach((p, i) => {
          const angle = (i / count) * 2 * Math.PI;
          const offsetX = count > 1 ? Math.cos(angle) * r : 0;
          const offsetY = count > 1 ? Math.sin(angle) * r : 0;

          const el = document.createElement('div');
          el.className = 'token';
          el.style.background = p.color;
          el.style.left = (baseX + offsetX) + '%';
          el.style.top = (baseY + offsetY) + '%';
          el.title = p.name;
          tokensLayer.appendChild(el);
        });
      });
    }

    bus.on('MOVE_STEP', renderTokens);
    bus.on('TURN_BEGIN', renderTokens);
    bus.on('CARD_APPLIED', renderTokens);
    renderTokens();

    // ---------- Turn indicator ----------
    function updateTurnIndicator() {
      const p = engine.state.players[engine.state.turnIndex];
      turnIndicator.textContent = p ? `Turn: ${p.name}` : '—';
    }
    bus.on('TURN_BEGIN', updateTurnIndicator);
    updateTurnIndicator();

    // ---------- Controls ----------
    rollBtn.addEventListener('click', () => {
      engine.takeTurn();
    });
    restartBtn.addEventListener('click', () => {
      engine.reset();
    });
    playerCountSelect.addEventListener('change', () => {
      engine.setPlayerCount(Number(playerCountSelect.value));
    });

    // ---------- Modal handling ----------
    function createModal(card) {
      return new Promise(res => {
        const modal = document.createElement('div');
        modal.className = 'modal';

        const cardBox = document.createElement('div');
        cardBox.className = 'card-box ' + (card.deck || '');

        const title = document.createElement('h2');
        title.textContent = deckLabel(card.deck);

        const body = document.createElement('p');
        body.textContent = card.text || '';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.className = 'button';
        okBtn.addEventListener('click', () => {
          modal.remove();
          bus.emit('CARD_RESOLVE');
          res();
        });

        cardBox.appendChild(title);
        cardBox.appendChild(body);
        cardBox.appendChild(okBtn);
        modal.appendChild(cardBox);
        modalRoot.appendChild(modal);
      });
    }

    function deckLabel(name) {
      const labels = {
        early: 'Early Stages',
        commons: 'House of Commons',
        lords: 'House of Lords',
        royal: 'Royal Assent',
        final: 'Final Stage'
      };
      return labels[name] || (name ? name[0].toUpperCase() + name.slice(1) : '');
    }

    bus.on('CARD_DRAWN', ({ card }) => {
      if (card) createModal(card);
    });

    // ---------- Dice overlay (original stable version) ----------
    function showDiceRoll(value) {
      const overlay = document.getElementById('diceOverlay');
      const diceEl  = document.getElementById('dice');
      if (!overlay || !diceEl) return;

      overlay.hidden = false;
      // Reset classes
      diceEl.className = 'dice rolling';

      // After ~900ms, show the face
      setTimeout(() => {
        diceEl.className = 'dice show-' + (value || 1);
      }, 900);

      // Hide a bit later
      setTimeout(() => {
        overlay.hidden = true;
        diceEl.className = 'dice';
      }, 2500);
    }

    bus.on('DICE_ROLL', ({ value }) => {
      showDiceRoll(value);
    });

    // ---------- Toasts ----------
    function showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = msg;
      root.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 50);
      setTimeout(() => { toast.classList.remove('show'); toast.remove(); }, 2500);
    }

    bus.on('MISS_TURN', ({ name }) => {
      showToast(`${name} misses a turn`);
    });
    bus.on('TURN_BEGIN', ({ playerId }) => {
      const p = engine.state.players.find(pp => pp.id === playerId);
      if (p && p.extraRoll) {
        showToast(`${p.name} gets an extra roll!`);
      }
    });

    return { renderPlayers, renderTokens, updateTurnIndicator, createModal };
  }

  return { create };
})();