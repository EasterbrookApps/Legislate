// js/app.js — calibrated board (percent coords), dice animation, rich debug
(async function () {
  const DBG = window.LegislateDebug;

  // ---- DOM
  const rollBtn     = document.getElementById('rollBtn');
  const restartBtn  = document.getElementById('restartBtn');
  const playerCount = document.getElementById('playerCount');
  const boardImg    = document.getElementById('boardImg');
  const tokensLayer = document.getElementById('tokensLayer');
  const turnBanner  = document.getElementById('turnIndicator');

  // ---- Basic debug header
  DBG?.event('INFO', '[debug enabled]');
  DBG?.event('ENV', {
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
    vw: document.documentElement.clientWidth,
    vh: document.documentElement.clientHeight,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  DBG?.event('DOM', {
    rollBtn: !!rollBtn, restartBtn: !!restartBtn, playerCount: !!playerCount,
    boardImg: !!boardImg, tokensLayer: !!tokensLayer, turnIndicator: !!turnBanner
  });

  // ---- Helpers
  const PACK_BASE = 'assets/packs/uk-parliament';
  async function getJSON(path){
    const res = await fetch(`${path}?cb=${Date.now()}`, { cache:'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  }

  // ---- Load pack (NO normalisation: x/y are percentages)
  let board, decks = {};
  try {
    board = await getJSON(`${PACK_BASE}/board.json`);
    const names = ['early','commons','lords','implementation','pingpong'];
    await Promise.all(names.map(async n=>{
      try { decks[n] = await getJSON(`${PACK_BASE}/cards/${n}.json`); }
      catch { decks[n] = []; }
    }));
    DBG?.event('PACK', { spaces: board.spaces?.length || 0, decks: Object.keys(decks).filter(k=>decks[k]?.length) });
  } catch (e) {
    DBG?.event('ERROR', `PACK_LOAD ${String(e)}`);
    // Fallback straight board so page still runs
    board = { packId:'uk-parliament', spaces: Array.from({length:40}, (_,i)=>({index:i,x:(i/39)*100,y:50,stage:i===0?'start':(i===39?'end':'early'),deck:'none'})) };
    decks = { early:[], commons:[], lords:[], implementation:[], pingpong:[] };
  }

  // Ensure the board image (you already have assets/board.png)
  if (boardImg) {
    if (!boardImg.getAttribute('src')) boardImg.src = 'assets/board.png';
    boardImg.alt = 'Game board';
  }

  // ---- Engine boot
  const { createEngine, makeRng } = window.LegislateEngine;
  const rng = makeRng(Date.now());
  const engine = createEngine({
    board, decks, rng,
    playerCount: Number(playerCount?.value || 4)
  });

  // restore
  const save = window.LegislateStorage?.load?.() || null;
  if (save) engine.hydrate(save);

  // ---- UI & debug wires
  const UI = window.LegislateUI;

  // Show animated dice when the engine announces the roll value
  engine.bus.on('DICE_ROLL', async ({ value, playerId, name }) => {
    DBG?.event('DICE_ROLL', { value, playerId, name });
    await UI?.showDiceRoll?.(value, 1000);
  });

  // Token rendering using calibrated percentage positions from board.json
  function renderTokens() {
    if (!Array.isArray(board.spaces) || !tokensLayer) return;
    tokensLayer.innerHTML = '';

    const spaceByIndex = new Map(board.spaces.map(s => [s.index, s]));
    const n = engine.state.players.length;

    engine.state.players.forEach((p, idx) => {
      const sp = spaceByIndex.get(p.position) || spaceByIndex.get(0);
      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      dot.style.position = 'absolute';

      // x/y are already percentages relative to the board image
      const x = (typeof sp?.x === 'number') ? sp.x : 0;
      const yBase = (typeof sp?.y === 'number') ? sp.y : 50;

      // small vertical stagger so multiple tokens on the same space are visible
      const y = yBase + (idx - (n - 1) / 2) * 3;

      dot.style.left = `calc(${x}% - .4rem)`;
      dot.style.top  = `calc(${y}% - .4rem)`;

      dot.title = `${p.name} @ ${p.position}`;
      tokensLayer.appendChild(dot);
    });
  }

  function updateBanner(){
    const p = engine.state.players[engine.state.turnIndex];
    turnBanner.textContent = `${p?.name || 'Player'}’s turn`;
  }

  // Debug hooks for full trace
  if (DBG) {
    const important = new Set([
      'TURN_BEGIN','TURN_END','MISS_TURN_CONSUMED','EXTRA_ROLL_GRANTED',
      'MOVE_STEP','LANDED','CARD_DRAWN','CARD_APPLIED'
    ]);
    engine.bus.on('*', (type, payload) => { if (important.has(type)) DBG.event('EVT ' + type, payload); });
  }

  // Render hooks
  engine.bus.on('MOVE_STEP', renderTokens);
  engine.bus.on('TURN_BEGIN', updateBanner);

  // Initial paint
  renderTokens();
  updateBanner();
  DBG?.event('BOOT_OK');

  // ---- Controls
  rollBtn?.addEventListener('click', async () => {
    DBG?.event('LOG', 'rollBtn click');
    rollBtn.disabled = true;
    await engine.takeTurn();
    rollBtn.disabled = false;
    window.LegislateStorage?.save?.(engine.serialize());
  });

  restartBtn?.addEventListener('click', () => {
    if (!confirm('Reset the game and clear the save?')) return;
    window.LegislateStorage?.clear?.();
    engine.reset();
    renderTokens();
    updateBanner();
    DBG?.event('RESET');
  });

  playerCount?.addEventListener('change', (e) => {
    const n = Number(e.target.value || 4);
    engine.setPlayerCount(n);
    renderTokens();
    updateBanner();
    window.LegislateStorage?.save?.(engine.serialize());
  });

  // Keyboard shortcut: disabled while typing
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || e.isComposing) return;
    if (e.key === 'r' || e.key === 'R') rollBtn?.click();
  });
})();