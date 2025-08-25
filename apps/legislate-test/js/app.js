// js/app.js
// Boots the game, connects UI with the engine, and persists state.

(async function () {
  const DBG = window.LegislateDebug;
  DBG?.info('[debug enabled]');

  // --- DOM lookups
  const rollBtn      = document.getElementById('rollBtn');
  const restartBtn   = document.getElementById('restartBtn');
  const playerCount  = document.getElementById('playerCount');
  const boardImg     = document.getElementById('boardImg');
  const tokensLayer  = document.getElementById('tokensLayer');
  const turnBanner   = document.getElementById('turnIndicator');
  const modalRoot    = document.getElementById('modalRoot');
  const diceOverlay  = document.getElementById('diceOverlay');
  const dice         = document.getElementById('dice');

  DBG?.env();
  DBG?.dom({
    rollBtn: !!rollBtn, restartBtn: !!restartBtn, playerCount: !!playerCount,
    boardImg: !!boardImg, tokensLayer: !!tokensLayer, turnIndicator: !!turnBanner,
    modalRoot: !!modalRoot, diceOverlay: !!diceOverlay, dice: !!dice, 'dbg-log': !!document.getElementById('dbg-log')
  });

  // --- Assets & simple pack
  // For now we boot with a simple linear board (40 spaces); pack JSON will overwrite when present.
  const board = { packId: 'uk-parliament', spaces: Array.from({length:40}, (_,i)=>({ index:i, x:(i/39)*100, y:50, stage: i===0?'start':(i===39?'end':'early'), deck:'none' })) };
  const decks = { early:[], commons:[], lords:[], implementation:[], pingpong:[] };

  // load saved game if present
  const save = window.LegislateStorage?.load?.() || null;

  // --- Engine
  const { createEngine, makeRng } = window.LegislateEngine;
  const rng = makeRng(Date.now());
  const engine = createEngine({ board, decks, rng, playerCount: Number(playerCount?.value || 4) });

  // hydrate from save
  if (save) {
    engine.hydrate(save);
  }

  // --- Debug hookups (listen to everything)
  if (DBG) {
    engine.bus.on('*', (type, payload) => {
      switch (type) {
        case 'TURN_BEGIN':
        case 'TURN_END':
        case 'MISS_TURN_CONSUMED':
        case 'EXTRA_ROLL_GRANTED':
        case 'DICE_ROLL':
        case 'MOVE_STEP':
        case 'LANDED':
        case 'CARD_DRAWN':
        case 'CARD_APPLIED':
          DBG.log(`EVT ${type}`, payload);
          break;
        default:
          // noisy internal events can be ignored
          break;
      }
    });
  }

  // --- Minimal UI bindings
  function updateBanner() {
    const p = engine.state.players[engine.state.turnIndex];
    turnBanner.textContent = `${p?.name || 'Player'}’s turn`;
  }
  function drawTokens() {
    // super simple tokens: we keep them visible and evenly spaced on Y=50 (linear board)
    tokensLayer.innerHTML = '';
    engine.state.players.forEach((p, idx) => {
      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      dot.style.position = 'absolute';
      const xPct = (p.position / (engine.endIndex || 39)) * 100;
      const yPct = 50 + (idx - (engine.state.players.length - 1) / 2) * 6; // stagger
      dot.style.left = `calc(${xPct}% - .4rem)`;
      dot.style.top = `calc(${yPct}% - .4rem)`;
      tokensLayer.appendChild(dot);
    });
  }

  engine.bus.on('MOVE_STEP', drawTokens);
  engine.bus.on('TURN_BEGIN', updateBanner);

  // initial paint
  drawTokens();
  updateBanner();
  DBG?.log('EVT BOOT_OK');

  // --- Controls
  rollBtn?.addEventListener('click', async () => {
    DBG?.log('rollBtn click');
    // show dice (accessibility: hidden image role=img)
    if (diceOverlay) {
      diceOverlay.hidden = false;
      diceOverlay.style.display = 'flex';
    }
    await engine.takeTurn(); // engine will emit all events and handle skip/extra
    // hide dice
    if (diceOverlay) {
      diceOverlay.hidden = true;
      diceOverlay.style.display = 'none';
    }
    // persist
    window.LegislateStorage?.save?.(engine.serialize());
  });

  restartBtn?.addEventListener('click', () => {
    if (!confirm('Reset the game and clear the save?')) return;
    window.LegislateStorage?.clear?.();
    engine.reset();
    drawTokens();
    updateBanner();
    DBG?.log('EVT RESET');
  });

  playerCount?.addEventListener('change', (e) => {
    const n = Number(e.target.value || 4);
    engine.setPlayerCount(n);
    drawTokens();
    updateBanner();
    window.LegislateStorage?.save?.(engine.serialize());
  });

  // Keyboard shortcuts: disabled while any input/textarea is focused
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'r' || e.key === 'R') rollBtn?.click();
  });
})();