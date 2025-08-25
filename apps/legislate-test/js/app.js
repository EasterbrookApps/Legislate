// js/app.js
(async function(){
  const DBG = window.DBG || { event(){}, log(){}, error(){} };

  // DOM -----------------------------------------------------------------
  const rollBtn = document.getElementById('rollBtn');
  const restartBtn = document.getElementById('restartBtn');
  const playerCountSel = document.getElementById('playerCount');
  const boardImg = document.getElementById('boardImg');
  const tokensLayer = document.getElementById('tokensLayer');
  const turnIndicator = document.getElementById('turnIndicator');

  // Utilities -----------------------------------------------------------
  function setTurnBanner(name){ turnIndicator.textContent = `${name}’s turn`; }

  function renderTokens(state){
    tokensLayer.innerHTML = '';
    state.players.forEach(p => {
      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      // board coordinates are in %
      const sp = state.board.spaces[p.pos] || state.board.spaces[0];
      dot.style.position = 'absolute';
      dot.style.left = `calc(${sp.x}% - .4rem)`;
      dot.style.top  = `calc(${sp.y}% - .4rem)`;
      dot.style.width = '.8rem'; dot.style.height = '.8rem';
      dot.style.borderRadius = '50%';
      dot.title = `${p.name} @ ${p.pos}`;
      tokensLayer.appendChild(dot);
    });
  }

  function showCardModal(deckName, card){
    return new Promise(resolve=>{
      // minimal modal UI using existing #modalRoot structure
      const root = document.getElementById('modalRoot') || document.getElementById('modal-root');
      root.removeAttribute('hidden');
      root.style.display = 'block';
      root.style.zIndex = 1500;

      // build simple content
      root.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <h2 style="margin-top:0">${deckName.toUpperCase()} card</h2>
          <p style="white-space:pre-wrap">${card?.title || card?.text || 'Card drawn.'}</p>
          <div class="modal-actions">
            <button id="modalOk" class="button">OK</button>
          </div>
        </div>
      `;

      const onOk = () => {
        root.style.display = 'none';
        root.setAttribute('hidden', 'true');
        resolve();
      };
      root.querySelector('#modalOk').addEventListener('click', onOk, { once:true });
    });
  }

  try{
    // Load pack ---------------------------------------------------------
    const { board, decks } = await window.LegislateLoader.loadPack();
    DBG.event('PACK_READY', { spaces: board.spaces.length, decks: Object.keys(decks).filter(k => (decks[k]||[]).length) });

    // Boot engine -------------------------------------------------------
    const engine = window.LegislateEngine.createEngine({ board, decks });
    window.__engine = engine; // for debugging

    engine.bus.on('TURN_BEGIN', ({ playerId, index }) => {
      const p = engine.state.players[index];
      setTurnBanner(p.name);
      renderTokens(engine.state);
      DBG.event('TURN_BEGIN', { playerId, index });
      rollBtn.disabled = false;
    });

    engine.bus.on('MOVE_STEP', payload => {
      DBG.event('MOVE_STEP', payload);
      renderTokens(engine.state);
    });

    engine.bus.on('DICE_ROLL', payload => {
      DBG.event('DICE_ROLL', payload);
      rollBtn.disabled = true; // prevent double rolls
    });

    engine.bus.on('LANDED', payload => {
      DBG.event('LANDED', { playerId: payload.playerId, position: payload.position });
    });

    // NEW: show card, wait for OK, then resume engine (apply effect)
    engine.bus.on('CARD_DRAWN', async ({ playerId, deck, card }) => {
      DBG.event('CARD_DRAWN', { deck, id: card?.id });
      await showCardModal(deck, card);   // wait for OK
      engine.resumeCard();               // continue turn, apply effect, then end
    });

    engine.bus.on('TURN_END', ({ playerId }) => {
      DBG.event('TURN_END', { playerId });
    });

    // Controls ----------------------------------------------------------
    rollBtn.addEventListener('click', () => {
      DBG.event('LOG', 'rollBtn click');
      rollBtn.disabled = true;
      engine.takeTurn();
    });

    restartBtn.addEventListener('click', () => {
      location.reload();
    });

    playerCountSel.addEventListener('change', () => {
      const n = parseInt(playerCountSel.value, 10);
      engine.setPlayerCount(n);
      renderTokens(engine.state);
    });

    // First banner & tokens
    setTurnBanner(engine.state.players[engine.state.turnIndex].name);
    renderTokens(engine.state);

    DBG.event('BOOT_OK');
  } catch (err){
    (window.DBG || console).error('BOOT_FAIL', err);
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;background:#d4351c;color:#fff;padding:.5rem 1rem;z-index:3000';
    bar.textContent = `Boot failed: ${err && err.message || err}`;
    document.body.appendChild(bar);
  }
})();