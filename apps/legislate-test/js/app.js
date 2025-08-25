// js/app.js
// Boots the game with the calibrated board pack + ties engine to UI & debug.

(async function () {
  const DBG = window.LegislateDebug;
  DBG?.info('[debug enabled]');

  // ---- Elements
  const rollBtn     = document.getElementById('rollBtn');
  const restartBtn  = document.getElementById('restartBtn');
  const playerCount = document.getElementById('playerCount');
  const boardImg    = document.getElementById('boardImg');
  const tokensLayer = document.getElementById('tokensLayer');
  const turnBanner  = document.getElementById('turnIndicator');
  const modalRoot   = document.getElementById('modalRoot');
  const diceOverlay = document.getElementById('diceOverlay');
  const dice        = document.getElementById('dice');

  // Basic environment + DOM inventory to debug
  DBG?.env();
  DBG?.dom({
    rollBtn: !!rollBtn, restartBtn: !!restartBtn, playerCount: !!playerCount,
    boardImg: !!boardImg, tokensLayer: !!tokensLayer, turnIndicator: !!turnBanner,
    modalRoot: !!modalRoot, diceOverlay: !!diceOverlay, dice: !!dice, 'dbg-log': !!document.getElementById('dbg-log')
  });

  // ---- Helpers
  const fetchJSON = async (rel) => {
    const res = await fetch(rel + '?cb=' + Date.now());
    if (!res.ok) throw new Error('Failed to load ' + rel);
    return res.json();
  };

  // ---- Load the calibrated pack directly (no registry step)
  // Paths are based on your current repo layout:
  // apps/legislate-test/assets/packs/uk-parliament/{board.json, cards/*.json}
  const PACK_BASE = 'assets/packs/uk-parliament';

  let board, decks = {};
  try {
    board = await fetchJSON(`${PACK_BASE}/board.json`);
    // Cards are optional per deck; only load what exists
    const deckNames = ['early','commons','lords','implementation','pingpong'];
    for (const name of deckNames) {
      try {
        decks[name] = await fetchJSON(`${PACK_BASE}/cards/${name}.json`);
      } catch {
        decks[name] = [];
      }
    }
    DBG?.log('EVT PACK', { spaces: board?.spaces?.length || 0, decks: Object.keys(decks).filter(k=>decks[k]?.length) });
  } catch (e) {
    DBG?.log('ERROR PACK_LOAD', String(e));
    // Fallback to a simple straight board so the app still boots
    board = { packId: 'uk-parliament', spaces: Array.from({length:40}, (_,i)=>({index:i, x:(i/39)*100, y:50, stage:i===0?'start':(i===39?'end':'early'), deck:'none'})) };
    decks = { early:[], commons:[], lords:[], implementation:[], pingpong:[] };
  }

  // Ensure the board image is shown (you already placed it in assets/board.png)
  if (boardImg && !boardImg.src) boardImg.src = 'assets/board.png';
  boardImg?.setAttribute('alt', 'Game board');

  // ---- Engine
  const { createEngine, makeRng } = window.LegislateEngine;
  const rng = makeRng(Date.now());

  // restore from save if present
  const save = window.LegislateStorage?.load?.() || null;

  const engine = createEngine({
    board,
    decks,
    rng,
    playerCount: Number(playerCount?.value || 4)
  });

  if (save) engine.hydrate(save);

  // ---- Debug: listen to everything useful
  if (DBG) {
    engine.bus.on('*', (type, payload) => {
      const important = new Set([
        'TURN_BEGIN','TURN_END','MISS_TURN_CONSUMED','EXTRA_ROLL_GRANTED',
        'DICE_ROLL','MOVE_STEP','LANDED','CARD_DRAWN','CARD_APPLIED'
      ]);
      if (important.has(type)) DBG.log('EVT ' + type, payload);
    });
  }

  // ---- Calibrated token placement (uses board.json x/y percentages)
  function renderTokens() {
    if (!Array.isArray(board.spaces) || !tokensLayer) return;
    tokensLayer.innerHTML = '';

    const lastIndex = (board.spaces.length ? board.spaces[board.spaces.length-1].index : 39) || 39;
    const byId = new Map(board.spaces.map(s => [s.index, s]));

    engine.state.players.forEach((p, i) => {
      const space = byId.get(p.position) || byId.get(0);
      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      dot.style.position = 'absolute';

      // Use calibrated percentages from board.json; small vertical stagger so overlapping tokens are visible
      const xPct = space?.x ?? 0;
      const yPct = (space?.y ?? 50) + (i - (engine.state.players.length - 1) / 2) * 3;

      dot.style.left = `calc(${xPct}% - .4rem)`;
      dot.style.top  = `calc(${yPct}% - .4rem)`;

      tokensLayer.appendChild(dot);
    });
  }

  function updateBanner() {
    const p = engine.state.players[engine.state.turnIndex];
    turnBanner.textContent = `${p?.name || 'Player'}’s turn`;
  }

  // Hook up movement & turn changes to re-render
  engine.bus.on('MOVE_STEP', renderTokens);
  engine.bus.on('TURN_BEGIN', updateBanner);

  // First paint
  renderTokens();
  updateBanner();
  DBG?.log('EVT BOOT_OK');

  // ---- Controls
  rollBtn?.addEventListener('click', async () => {
    DBG?.log('rollBtn click');
    // Show dice overlay while rolling
    if (diceOverlay) {
      diceOverlay.hidden = false;
      diceOverlay.style.display = 'flex';
    }
    await engine.takeTurn();
    // Hide dice overlay after turn resolves
    if (diceOverlay) {
      diceOverlay.hidden = true;
      diceOverlay.style.display = 'none';
    }
    window.LegislateStorage?.save?.(engine.serialize());
  });

  restartBtn?.addEventListener('click', () => {
    if (!confirm('Reset the game and clear the save?')) return;
    window.LegislateStorage?.clear?.();
    engine.reset();
    renderTokens();
    updateBanner();
    DBG?.log('EVT RESET');
  });

  playerCount?.addEventListener('change', (e) => {
    const n = Number(e.target.value || 4);
    engine.setPlayerCount(n);
    renderTokens();
    updateBanner();
    window.LegislateStorage?.save?.(engine.serialize());
  });

  // Keyboard shortcut (disabled while typing)
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'r' || e.key === 'R') rollBtn?.click();
  });
})();