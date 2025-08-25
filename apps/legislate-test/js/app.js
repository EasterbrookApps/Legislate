(function(){
  const UI = window.LegislateUI;
  const Engine = window.LegislateEngine;
  const Loader = window.LegislateLoader;
  const DBG = window.LegislateDebug; // if present

  // --- Ensure the token layer tracks the rendered image box exactly
  function syncTokenLayerToImage() {
    const img = document.getElementById('boardImg');
    const layer = document.getElementById('tokensLayer');
    if (!img || !layer) return;
    // Position the layer exactly over the image’s client box
    const rect = img.getBoundingClientRect();
    const parentRect = img.parentElement.getBoundingClientRect();
    layer.style.left = (rect.left - parentRect.left) + 'px';
    layer.style.top  = (rect.top  - parentRect.top)  + 'px';
    layer.style.width  = rect.width + 'px';
    layer.style.height = rect.height + 'px';
  }

  // Re-run whenever layout may change
  function installOverlaySync(){
    const img = document.getElementById('boardImg');
    if (img){
      if (img.complete) syncTokenLayerToImage();
      img.addEventListener('load', syncTokenLayerToImage);
    }
    window.addEventListener('resize', syncTokenLayerToImage);
  }

  async function boot(){
    try{
      DBG && DBG.info('booting');

      // 1) Load pack (assumes you already set the src for board image)
      const packId = 'uk-parliament';
      const { board, decks } = await Loader.loadPack(packId);

      // 2) Engine + UI
      const rng = Engine.makeRng(Date.now());
      const engine = Engine.createEngine({ board, decks, rng, playerCount: 4 });

      const modal = UI.createModal();
      const boardUI = UI.createBoardRenderer({ board });

      // 3) Keep overlay pinned to the image
      installOverlaySync();

      // 4) Initial render
      UI.setTurnIndicator(`Player 1's turn`);
      boardUI.render(engine.state.players);

      // 5) Wire bus -> UI
      engine.bus.on('MOVE_STEP', ({ playerId, position }) => {
        // update and redraw
        const p = engine.state.players.find(x => x.id === playerId);
        if (p) p.pos = position;
        boardUI.render(engine.state.players);
      });

      engine.bus.on('TURN_BEGIN', ({ index }) => {
        const p = engine.state.players[index];
        UI.setTurnIndicator(`${p.name || `Player ${index+1}`}'s turn`);
      });

      engine.bus.on('DICE_ROLL', async ({ value }) => {
        await UI.showDiceRoll(value);
      });

      // 6) Controls
      document.getElementById('rollBtn').onclick = async () => {
        await engine.takeTurn(); // engine emits steps; UI re-renders
      };

      document.getElementById('playerCount').onchange = (e) => {
        const n = Number(e.target.value || 4);
        engine.setPlayerCount(n);
        boardUI.render(engine.state.players);
      };

      document.getElementById('restartBtn').onclick = async () => {
        if (confirm('Restart the game? This will clear progress.')) {
          engine.reset();
          boardUI.render(engine.state.players);
        }
      };

      DBG && DBG.emit('BOOT_OK');
    }catch(err){
      console.error(err);
      DBG && DBG.error('BOOT_FAIL', { error: String(err) });
      const root = document.getElementById('main') || document.body;
      const div = document.createElement('div');
      Object.assign(div.style, {background:'#fff0f0',border:'1px solid #d4351c',padding:'1rem',margin:'1rem 0'});
      div.innerHTML = `<strong>There was a problem loading the game</strong><br><code>${String(err)}</code>`;
      root.prepend(div);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();