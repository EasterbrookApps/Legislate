// app.js — guard modal errors so turns always continue
(function () {
  const UI        = window.LegislateUI        || window.UI;
  const Loader    = window.LegislateLoader    || window.Loader;
  const Storage   = window.LegislateStorage   || window.Storage;
  const EngineMod = window.LegislateEngine    || window.EngineLib || window.Engine;

  const boardImg       = document.getElementById('boardImg');
  const tokensLayer    = document.getElementById('tokensLayer');
  const turnIndicator  = document.getElementById('turnIndicator');
  const playerCountSel = document.getElementById('playerCount');
  const footerAttrib   = document.getElementById('footerAttrib');
  const rollBtn        = document.getElementById('rollBtn');
  const restartBtn     = document.getElementById('restartBtn');

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

  function updateUI() {
    try {
      if (!engine) return;
      if (turnIndicator) {
        const current = engine.state.players[engine.state.turnIndex];
        (UI.setTurnIndicator || ((el, n)=> el.textContent = (n||'Player') + \"'s turn\"))(turnIndicator, current?.name || 'Player');
      }
      if (!boardUI && UI.createBoardRenderer) {
        boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);
      }
      boardUI && boardUI.renderPlayers && boardUI.renderPlayers(engine.state.players);
    } catch (e) { console.error('[UI] update failed', e); }
  }

  async function bootstrap() {
    try {
      const registry = await Loader.loadRegistry();
      const pack = (registry || []).find(p => p.id === 'uk-parliament') || (registry && registry[0]);
      if (!pack) throw new Error('No content packs found in registry');

      const { meta = {}, board: bd, decks: dx } = await Loader.loadPack(pack.id, registry);
      board = bd; decks = dx;

      (UI.setSrc || ((img, src)=> img.src = src))(boardImg, Loader.withBase(meta.boardImage || 'public/board.png'));
      (UI.setAlt || ((img, alt)=> img.alt = alt))(boardImg, meta.alt || 'UK Parliament board');
      if (footerAttrib) footerAttrib.textContent = meta.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0.';

      await waitForImage(boardImg);

      modal   = (UI.createModal && UI.createModal()) || null;
      boardUI = UI.createBoardRenderer ? UI.createBoardRenderer(boardImg, tokensLayer, board) : null;

      const saved = Storage.load();
      const initialCount = Number(playerCountSel?.value || 4);
      const factory = typeof EngineMod.createEngine === 'function' ? EngineMod.createEngine : EngineMod;
      engine = factory({ board, decks, rng: Math.random, playerCount: saved?.players?.length || initialCount, savedState: saved || null });

      engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });
      engine.bus.on('MOVE_STEP',   () => requestAnimationFrame(updateUI));
      engine.bus.on('TURN_BEGIN',  updateUI);

      window.addEventListener('resize', updateUI);
      window.addEventListener('orientationchange', () => setTimeout(updateUI, 200));

      if (rollBtn) rollBtn.addEventListener('click', async () => {
        const r = dice();
        if (playerCountSel) playerCountSel.disabled = true;
        namesLocked = true;
        try { if (UI.showDiceRoll) await UI.showDiceRoll(r, 1600); } catch(e) { console.warn('dice overlay failed', e); }
        try { await modal?.open?.({ title: 'Dice roll', body: `You rolled a ${r}.` }); } catch(e) { console.warn('modal failed', e); }
        await engine.takeTurn(r);
        Storage.save(engine.serialize());
        updateUI();
      });

      if (restartBtn) restartBtn.addEventListener('click', async () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>Are you sure you want to restart and scrap all these bills?</p>`;
        try { await modal?.open?.({ title: 'Play again?', body }); } catch(e) { console.warn('modal failed', e); }
        const keepNames = engine.state.players.map(p => p.name);
        engine.reset({ keepNames });
        namesLocked = false;
        if (playerCountSel) { playerCountSel.disabled = false; playerCountSel.value = String(keepNames.length); }
        Storage.clear();
        updateUI();
        engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });
      });

      updateUI();

    } catch (err) {
      console.error('[BOOT] Failed to start', err);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();