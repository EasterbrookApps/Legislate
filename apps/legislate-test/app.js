// app.js — stable wiring: MOVE_STEP repaint + dual-mode name editing (input or contenteditable)
(function () {
  const UI        = window.LegislateUI        || window.UI;
  const Loader    = window.LegislateLoader    || window.Loader;
  const Storage   = window.LegislateStorage   || window.Storage;
  const EngineMod = window.LegislateEngine    || window.EngineLib || window.Engine;

  if (!UI || !Loader || !Storage || !EngineMod) {
    console.error('[BOOT] Missing core libraries', {
      hasUI: !!UI, hasLoader: !!Loader, hasStorage: !!Storage, hasEngine: !!EngineMod
    });
  }

  // DOM refs (match your index.html camelCase IDs)
  const boardImg       = document.getElementById('boardImg');
  const tokensLayer    = document.getElementById('tokensLayer');
  const turnIndicator  = document.getElementById('turnIndicator');
  const playerCountSel = document.getElementById('playerCount');
  const footerAttrib   = document.getElementById('footerAttrib');
  const rollBtn        = document.getElementById('rollBtn');
  const restartBtn     = document.getElementById('restartBtn');

  // helpers
  function waitForImage(img) {
    return new Promise((resolve) => {
      if (!img) return resolve();
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.addEventListener('load',  () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }
  const dice = () => 1 + Math.floor(Math.random() * 6);

  let engine, board, decks, modal, boardUI;
  let namesLocked = false;

  async function bootstrap() {
    try {
      // Content
      const registry = await Loader.loadRegistry();
      const pack = (registry || []).find(p => p.id === 'uk-parliament') || (registry && registry[0]);
      if (!pack) throw new Error('No content packs found in registry');

      const { meta = {}, board: bd, decks: dx } = await Loader.loadPack(pack.id, registry);
      board = bd; decks = dx;

      // Assets
      UI.setSrc(boardImg, Loader.withBase(meta.boardImage || 'public/board.png'));
      UI.setAlt(boardImg, meta.alt || 'UK Parliament board');
      if (footerAttrib) {
        footerAttrib.textContent =
          meta.attribution ||
          'Contains public sector information licensed under the Open Government Licence v3.0.';
      }

      await waitForImage(boardImg);

      // UI + engine
      modal   = UI.createModal();
      boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);

      const saved = Storage.load();
      const initialCount = Number(playerCountSel?.value || 4);
      const factory = typeof EngineMod.createEngine === 'function' ? EngineMod.createEngine : EngineMod;
      engine = factory({
        board,
        decks,
        rng: Math.random,
        playerCount: saved?.players?.length || initialCount,
        savedState: saved || null
      });

      // Clear "Loading…" immediately
      if (turnIndicator) {
        const cur = engine.state.players[engine.state.turnIndex];
        UI.setTurnIndicator(turnIndicator, cur?.name || 'Player');
      }

      // Debug (optional)
      try {
        const on = (new URLSearchParams(location.search).get('debug') === '1') ||
                   (localStorage.getItem('legislate.debug') === '1');
        if (on && window.LegislateDebug) window.LegislateDebug.attach(engine, board, decks);
      } catch (_) {}

      // Initial render
      updateUI();

      // Named handlers so they can't be GC'd or overwritten
      function onTurnBegin() { updateUI(); }
      function onMoveStep()  { updateUI(); }

      // Start first turn & wire events
      engine.bus.emit('TURN_BEGIN', {
        playerId: engine.state.players[engine.state.turnIndex].id,
        index:    engine.state.turnIndex
      });
      engine.bus.on('TURN_BEGIN', onTurnBegin);
      engine.bus.on('MOVE_STEP',   onMoveStep);
      window.addEventListener('resize', updateUI);

      // Show card modals when a card is drawn
      engine.bus.on('CARD_DRAWN', async ({ deck, card }) => {
        if (!card) return;
        const title = card.title || card.name || `Card from ${deck}`;
        const body  = card.body  || card.text || '';
        try {
          await modal.open({ title, body: typeof body === 'string' ? body : String(body) });
        } catch (_) {}
      });

      // Player count (pre-roll only)
      if (playerCountSel) {
        playerCountSel.addEventListener('change', (e) => {
          if (namesLocked) { e.preventDefault(); playerCountSel.value = String(engine.state.players.length); return; }
          const n = Math.max(2, Math.min(6, Number(playerCountSel.value) || 4));
          engine.setPlayerCount(n);
          updateUI();
          Storage.save(engine.serialize());
        });
      }

      // ----- Dual-mode name editing -----
      // A) INPUT elements with class .player-name-input
      document.addEventListener('keydown', (ev) => {
        const t = ev.target;
        if (t && t.matches && (t.matches('.player-name-input') || t.matches('[contenteditable][data-role="player-name"]'))) {
          ev.stopPropagation(); // prevent keyboard shortcuts while typing
        }
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

      // B) CONTENTEDITABLE spans: [contenteditable][data-role="player-name"]
      document.addEventListener('blur', (ev) => {
        const t = ev.target;
        if (!t || !t.matches || !t.matches('[contenteditable][data-role="player-name"]')) return;
        if (namesLocked) { t.blur(); return; }
        const pid   = t.getAttribute('data-player-id');
        const value = (t.textContent || '').trimEnd();
        const p = engine.state.players.find(p => p.id === pid);
        if (p) {
          p.name = value;
          UI.setTurnIndicator(turnIndicator, engine.state.players[engine.state.turnIndex].name);
          Storage.save(engine.serialize());
          updateUI();
        }
      }, true);

      // Roll
      rollBtn?.addEventListener('click', async () => {
        const r = dice();
        namesLocked = true;
        if (playerCountSel) playerCountSel.disabled = true;
        if (UI.showDiceRoll) await UI.showDiceRoll(r, 1600);
        await modal.open({ title: 'Dice roll', body: `You rolled a ${r}.` });
        await engine.takeTurn(r); // engine emits MOVE_STEP, LANDED, next TURN_BEGIN
        Storage.save(engine.serialize());
        updateUI();
      });

      // Restart
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