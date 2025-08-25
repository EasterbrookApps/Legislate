// Boots the pack, wires engine <-> UI, ensures card modal waits for dice to finish.
// Token layer relies on CSS to match the image (no JS pixel sizing).
(function(){
  const UI     = window.LegislateUI;
  const Loader = window.LegislateLoader;
  const Engine = window.LegislateEngine;
  const DBG    = window.LegislateDebug;

  async function boot(){
    try{
      DBG && DBG.info('BOOT start');

      // Load the UK pack from assets/packs/uk-parliament/
      Loader.withBase('assets/packs');
      const { board, decks } = await Loader.loadPack('uk-parliament');
      DBG && DBG.event('PACK', { spaces: board.spaces?.length || 0, decks: Object.fromEntries(Object.entries(decks).map(([k,v])=>[k, v.length])) });

      // Ensure the board image is set (your HTML should already point to assets/board.png)
      const img = document.getElementById('boardImg');
      if (img && !img.getAttribute('src')) img.src = 'assets/board.png';

      // Engine
      const rng = Engine.makeRng(Date.now());
      const engine = Engine.createEngine({ board, decks, rng, playerCount: 4 });

      // UI helpers
      const modal = UI.createModal();
      const boardUI = UI.createBoardRenderer({ board });

      // Initial paint
      UI.setTurnIndicator(`Player 1's turn`);
      boardUI.render(engine.state.players);
      DBG && DBG.event('BOOT_OK');

      // ----- Engine -> UI events -----
      engine.bus.on('DICE_ROLL', async ({ value, playerId, name }) => {
        DBG && DBG.event('DICE_ROLL', { value, playerId, name });
        // Launch dice animation and keep the promise so CARD_DRAWN can wait on it
        UI.showDiceRoll(value, 1000);
      });

      engine.bus.on('MOVE_STEP', ({ playerId, position, step, total }) => {
        const p = engine.state.players.find(x => x.id === playerId);
        if (p) p.pos = position;
        boardUI.render(engine.state.players);
        DBG && DBG.event('MOVE_STEP', { playerId, position, step, total });
      });

      engine.bus.on('TURN_BEGIN', ({ index, playerId }) => {
        const p = engine.state.players[index];
        UI.setTurnIndicator(`${p.name || `Player ${index+1}`}'s turn`);
        DBG && DBG.event('TURN_BEGIN', { index, playerId });
      });

      engine.bus.on('LANDED', ({ playerId, position, space }) => {
        DBG && DBG.event('LANDED', { playerId, position, deck: space?.deck || 'none' });
      });

      // Show the card only AFTER dice animation finishes + a short extra pause
      engine.bus.on('CARD_DRAWN', async ({ deck, card, playerId, position }) => {
        DBG && DBG.event('CARD_DRAWN', { deck, id: card?.id, effect: card?.effect || null });
        if (!card) { engine.resolveCard(null); return; }

        // wait for the active dice animation to fully complete first
        try { await UI.getLastDicePromise(); } catch {}
        // small extra pause so the transition feels natural
        await new Promise(r => setTimeout(r, 200));

        const title = card.title || `Card: ${deck}`;
        const text  = card.body || card.text || '(No text)';
        await modal.open({
          title,
          body: `<p>${text}</p>`,
          actions: [{ id: 'ok', label: 'OK' }]
        });
        engine.resolveCard(card);
      });

      engine.bus.on('CARD_APPLIED', ({ card, applied, playerId, position }) => {
        boardUI.render(engine.state.players);
        DBG && DBG.event('CARD_APPLIED', { id: card?.id, effect: card?.effect || null, applied, playerId, position });
      });

      // ----- Controls -----
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
        if (!confirm('Restart the game? This will clear progress.')) return;
        engine.reset();
        boardUI.render(engine.state.players);
        DBG && DBG.event('RESET');
      };

    }catch(err){
      console.error(err);
      const root = document.getElementById('main') || document.body;
      const div = document.createElement('div');
      Object.assign(div.style, {background:'#fff0f0',border:'1px solid #d4351c',padding:'1rem',margin:'1rem 0'});
      div.innerHTML = `<strong>There was a problem loading the game</strong><br><code>${String(err)}</code>`;
      root.prepend(div);
      window.LegislateDebug?.error('BOOT_FAIL', String(err));
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();