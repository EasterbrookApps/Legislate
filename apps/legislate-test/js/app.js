(function(){
  const UI = window.LegislateUI;
  const Engine = window.LegislateEngine;
  const Loader = window.LegislateLoader;
  const DBG = window.LegislateDebug;

  function syncTokenLayerToImage() {
    const img = document.getElementById('boardImg');
    const layer = document.getElementById('tokensLayer');
    if (!img || !layer) return;
    const rect = img.getBoundingClientRect();
    const parentRect = img.parentElement.getBoundingClientRect();
    layer.style.left = (rect.left - parentRect.left) + 'px';
    layer.style.top  = (rect.top  - parentRect.top)  + 'px';
    layer.style.width  = rect.width + 'px';
    layer.style.height = rect.height + 'px';
  }
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
      DBG && DBG.info('boot start');

      // Load current pack
      const packId = 'uk-parliament';
      const { board, decks } = await Loader.loadPack(packId);

      // Engine
      const rng = Engine.makeRng(Date.now());
      const engine = Engine.createEngine({ board, decks, rng, playerCount: 4 });

      // UI helpers
      const modal = UI.createModal();
      const boardUI = UI.createBoardRenderer({ board });

      installOverlaySync();
      UI.setTurnIndicator(`Player 1's turn`);
      boardUI.render(engine.state.players);

      // EVENTS -> UI
      engine.bus.on('MOVE_STEP', ({ playerId, position }) => {
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

      // Show card, wait for OK, then resolve
      engine.bus.on('CARD_DRAWN', async ({ deck, card, playerId }) => {
        const title = card.title || `Card from ${deck}`;
        const body  = card.body  || (card.text || '');
        await modal.open({
          title,
          body: `<p>${body}</p>`,
          actions: [{ id: 'ok', label: 'OK' }]
        });
        engine.resolveCard(card);
      });

      engine.bus.on('CARD_APPLIED', () => {
        // redraw if position changed due to effect
        boardUI.render(engine.state.players);
      });

      // CONTROLS
      document.getElementById('rollBtn').onclick = async () => {
        DBG && DBG.log('rollBtn click');
        await engine.takeTurn();
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