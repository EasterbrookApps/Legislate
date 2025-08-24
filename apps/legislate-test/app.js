// app.js — wired for Loader.loadRegistry / Loader.loadPack and renderPlayers
(function () {
  const UI        = window.LegislateUI        || window.UI;
  const Loader    = window.LegislateLoader    || window.Loader;
  const Storage   = window.LegislateStorage   || window.Storage;
  const EngineLib = window.LegislateEngine    || window.EngineLib || window.Engine;

  if (!UI || !Loader || !Storage || !EngineLib) {
    console.error('[BOOT] Missing core libraries', {
      hasUI: !!UI, hasLoader: !!Loader, hasStorage: !!Storage, hasEngine: !!EngineLib
    });
  }

  // --- element refs (robust to legacy IDs) ---
  const boardImg       = document.getElementById('board-img');
  const tokensLayer    = document.getElementById('tokens-layer');
  const turnIndicator  = document.getElementById('turn-indicator');
  const playerCountSel = document.getElementById('player-count');
  const footerAttrib   =
    document.getElementById('footer-attribution') ||
    document.getElementById('footer-attrib'); // legacy id
  const rollBtn        = document.getElementById('roll-btn');
  const restartBtn     = document.getElementById('restart-btn');

  // --- helpers ---
  function waitForImage(img) {
    return new Promise((resolve) => {
      if (!img) return resolve();
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.addEventListener('load',  () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }
  function dice() { return 1 + Math.floor(Math.random() * 6); }

  let engine, board, decks, modal, boardUI;
  let namesLocked = false;

  async function bootstrap() {
    try {
      // 1) Load registry and select content pack (prefer UK, else first)
      const registry = await Loader.loadRegistry();
      const wantId = 'uk-parliament';
      const pack = (registry || []).find(p => p.id === wantId) || (registry && registry[0]);
      if (!pack) throw new Error('No content packs found in registry');

      // 2) Load meta / board / decks
      const loaded = await Loader.loadPack(pack.id, registry);
      const meta = loaded.meta || {};
      board = loaded.board;
      decks = loaded.decks;

      // 3) Wire assets & attribution (guard footer)
      UI.setSrc(boardImg, Loader.withBase(meta.boardImage || 'public/board.png'));
      UI.setAlt(boardImg, meta.alt || 'UK Parliament board');
      if (footerAttrib) {
        footerAttrib.textContent =
          meta.attribution ||
          'Contains public sector information licensed under the Open Government Licence v3.0.';
      }

      // Ensure board dimensions before first placement
      await waitForImage(boardImg);

      // 4) UI pieces
      modal  = UI.createModal();
      boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);

      // 5) Engine (restore save if present)
      const saved = Storage.load();
      const initialCount = Number(playerCountSel?.value || 4);
      const engineFactory = typeof EngineLib.createEngine === 'function'
        ? (opts) => EngineLib.createEngine(opts)
        : (opts) => EngineLib(opts);
      engine = engineFactory({
        board,
        decks,
        rng: Math.random,
        playerCount: saved?.players?.length || initialCount,
        savedState: saved || null
      });

      // 6) Debug attach (feature-flagged)
      try {
        const on = (new URLSearchParams(location.search).get('debug') === '1') ||
                   (localStorage.getItem('legislate.debug') === '1');
        if (on && window.LegislateDebug) window.LegislateDebug.attach(engine, board, decks);
      } catch (e) { console.warn('debug attach failed', e); }

      // 7) Initial render & start turn
      updateUI();
      engine.bus.emit('TURN_BEGIN', {
        playerId: engine.state.players[engine.state.turnIndex].id,
        index:    engine.state.turnIndex
      });

      // 8) Event wiring
      engine.bus.on('TURN_BEGIN', () => updateUI());
      engine.bus.on('MOVE_STEP',   () => updateUI());
      window.addEventListener('resize', () => updateUI());

      // 9) Player count (editable before first roll only)
      if (playerCountSel) {
        playerCountSel.addEventListener('change', (e) => {
          if (namesLocked) { e.preventDefault(); playerCountSel.value = String(engine.state.players.length); return; }
          const n = Math.max(2, Math.min(6, Number(playerCountSel.value) || 4));
          engine.setPlayerCount(n);
          updateUI();
          Storage.save(engine.serialize());
        });
      }

      // 10) Name inputs: prevent shortcuts while typing; update banner pre-roll
      document.addEventListener('keydown', (ev) => {
        const t = ev.target;
        if (t && t.matches && t.matches('.player-name-input')) ev.stopPropagation();
      }, true);
      document.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || !t.matches || !t.matches('.player-name-input')) return;
        if (namesLocked) { t.blur(); return; }
        const pid   = t.getAttribute('data-player-id');
        const value = (t.value || '').trimEnd();
        const p = engine.state.players.find(p => p.id === pid);
        if (p) {
          p.name = value;
          UI.setTurnIndicator(turnIndicator, engine.state.players[engine.state.turnIndex].name);
          Storage.save(engine.serialize());
          updateUI();
        }
      });

      // 11) Roll turn
      rollBtn?.addEventListener('click', async () => {
        const r = dice();
        namesLocked = true;
        if (playerCountSel) playerCountSel.disabled = true;
        if (UI.showDiceRoll) await UI.showDiceRoll(r, 1800);
        await modal.open({ title: 'Dice roll', body: `You rolled a ${r}.` });
        await engine.takeTurn(r);           // step-by-step move in engine
        Storage.save(engine.serialize());
        updateUI();
      });

      // 12) Restart (confirmation; keep names)
      restartBtn?.addEventListener('click', async () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>Are you sure you want to restart and scrap all these bills?</p>`;
        await modal.open({ title: 'Play again?', body });
        if (confirm('Restart the game and keep player names?')) {
          const keepNames = engine.state.players.map(p => p.name);
          engine.reset({ keepNames });
          namesLocked = false;
          if (playerCountSel) { playerCountSel.disabled = false; playerCountSel.value = String(keepNames.length); }
          Storage.clear();
          updateUI();
          engine.bus.emit('TURN_BEGIN', {
            playerId: engine.state.players[engine.state.turnIndex].id,
            index:    engine.state.turnIndex
          });
        }
      });

    } catch (err) {
      console.error('[BOOT] Failed to start', err);
      const errBox = document.getElementById('error-box');
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = 'There\'s a problem loading the game. Please refresh.';
      }
    }
  }

  function updateUI() {
    try {
      if (!engine || !boardUI) return;
      const current = engine.state.players[engine.state.turnIndex];
      UI.setTurnIndicator(turnIndicator, current?.name || 'Player');
      boardUI.renderPlayers(engine.state.players);
    } catch (e) {
      console.error('[UI] update failed', e);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();