// apps/legislate-test/js/app.js
// Wires Loader → Engine → UI, and handles dice + card modal handshake.
// Compatible with legacy debug.js (load debug BEFORE this file) or the newer DBG logger.

(function () {
  // ---------- Logging helpers (work with either debug.js or DBG panel) ----------
  const Logger = {
    log(kind, payload) {
      try { window.DBG && window.DBG.log && window.DBG.log(kind, payload); } catch (_) {}
      try { window.LegislateDebug && window.LegislateDebug.log && window.LegislateDebug.log(kind, payload); } catch (_) {}
    },
    info(msg, extra) {
      try { window.DBG && window.DBG.info && window.DBG.info(msg, extra); } catch (_) {}
      try { window.LegislateDebug && window.LegislateDebug.info && window.LegislateDebug.info(msg, extra); } catch (_) {}
    },
    error(msg, extra) {
      try { window.DBG && window.DBG.error && window.DBG.error(msg, extra); } catch (_) {}
      try { window.LegislateDebug && window.LegislateDebug.error && window.LegislateDebug.error(msg, extra); } catch (_) {}
      console.error('[Legislate]', msg, extra || '');
    }
  };

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);

  // Avoid rolling while typing in an input/textarea
  function isTyping() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }

  // Possessive banner without stray spaces
  function turnText(name) {
    const n = (name || 'Player').trim();
    return `${n}'s turn`;
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    // Snapshot env + DOM presence for debugging
    Logger.log('ENV', {
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      vw: window.innerWidth,
      vh: window.innerHeight,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    Logger.log('DOM', {
      rollBtn: !!$('rollBtn'),
      restartBtn: !!$('restartBtn'),
      playerCount: !!$('playerCount'),
      boardImg: !!$('boardImg'),
      tokensLayer: !!$('tokensLayer'),
      turnIndicator: !!$('turnIndicator'),
      modalRoot: !!$('modalRoot'),
      'modal-root': !!$('modal-root'),
      diceOverlay: !!$('diceOverlay'),
      dice: !!$('dice'),
      'dbg-log': !!$('dbg-log')
    });

    const errorBanner = $('error-banner');

    try {
      // ---------- Load pack ----------
      const { board, decks } = await window.LegislateLoader.loadPack('uk-parliament');
      Logger.log('PACK', {
        spaces: Array.isArray(board?.spaces) ? board.spaces.length : -1,
        decks: decks ? Object.keys(decks) : []
      });

      // ---------- Create Engine + UI ----------
      const playerCountSel = $('playerCount');
      const startCount = Number(playerCountSel?.value || 4) || 4;

      // DIAGNOSTIC: factory presence & inputs
      Logger.log('ENGINE_FACTORY', {
        hasLE: !!window.LegislateEngine,
        hasCreate: !!(window.LegislateEngine && window.LegislateEngine.createEngine)
      });

      const engine = (window.LegislateEngine && window.LegislateEngine.createEngine)
        ? window.LegislateEngine.createEngine({ board, decks, playerCount: startCount })
        : undefined;

      // Guard: surface why engine is missing before wiring any listeners
      if (!engine || !engine.bus) {
        Logger.error('ENGINE_INIT_FAIL', {
          engineType: typeof engine,
          hasBus: !!(engine && engine.bus),
          boardOk: !!(board && Array.isArray(board.spaces)),
          decksKeys: decks ? Object.keys(decks) : null
        });
        throw new Error('Engine did not initialize; see ENGINE_INIT_FAIL for details');
      }

      const modal = window.LegislateUI.createModal();
      const boardUI = window.LegislateUI.createBoardRenderer({ board });

      // Initial render
      const first = engine.state.players[0];
      window.LegislateUI.setTurnIndicator(turnText(first?.name));
      boardUI.render(engine.state.players);
      Logger.log('EVT BOOT_OK');

      // ---------- Engine → UI wiring ----------
      engine.bus.on('DICE_ROLL', async ({ value, playerId, name }) => {
        Logger.log('ROLL', { value });
        // Show dice animation (UI manages its own overlay lifecycle)
        window.LegislateUI.showDiceRoll(value, 900);
      });

      engine.bus.on('MOVE_STEP', ({ playerId, position, step, total }) => {
        const p = engine.state.players.find(x => x.id === playerId);
        if (p) p.position = position;
        boardUI.render(engine.state.players);
        Logger.log('MOVE_STEP', { playerId, position, step, total });
      });

      engine.bus.on('LANDED', ({ playerId, position, space }) => {
        Logger.log('LANDED', { playerId, position, space });
      });

      engine.bus.on('DECK_CHECK', ({ name, len }) => {
        Logger.log('DECK_CHECK', { name, len });
      });

      engine.bus.on('CARD_DRAWN', async ({ deck, card, playerId, position }) => {
        Logger.log('CARD_DRAWN', { deck, card });

        // Finite deck might be empty; if so, no modal by design
        if (!card) return;

        // Ensure dice overlay is done before showing the card
        try { await window.LegislateUI.getLastDicePromise(); } catch (_) {}
        // Short pause so dice doesn't visually overlap the card
        await new Promise(r => setTimeout(r, 200));

        await modal.open({
          title: card.title || deck,
          body: `<p>${(card.text || card.body || '').trim()}</p>`,
          actions: [{ id: 'ok', label: 'OK' }]
        });

        // Handshake back to engine so it can apply the effect and continue turn
        engine.bus.emit('CARD_RESOLVE', { card });
      });

      engine.bus.on('CARD_APPLIED', ({ card, playerId, position }) => {
        Logger.log('CARD_APPLIED', { id: card?.id, effect: card?.effect, playerId, position });
        // Re-render in case the effect moved the player
        boardUI.render(engine.state.players);
      });

      engine.bus.on('TURN_BEGIN', ({ index }) => {
        const p = engine.state.players[index];
        window.LegislateUI.setTurnIndicator(turnText(p?.name));
        Logger.log('TURN_BEGIN', { playerId: p?.id, index });
      });

      engine.bus.on('TURN_END', ({ playerId }) => {
        Logger.log('TURN_END', { playerId });
      });

      // ---------- Controls ----------
      const rollBtn = $('rollBtn');
      const restartBtn = $('restartBtn');

      if (rollBtn) {
        rollBtn.onclick = async () => {
          Logger.log('rollBtn click');
          if (isTyping()) return; // don't roll while typing in a name
          try {
            await engine.takeTurn();
          } catch (e) {
            Logger.error('ROLL_FAIL', String(e));
            if (errorBanner) {
              errorBanner.hidden = false;
              errorBanner.textContent = 'There was a problem taking a turn.';
            }
          }
        };
      }

      if (restartBtn) {
        restartBtn.onclick = () => {
          if (confirm('Restart the game?')) location.reload();
        };
      }

      if (playerCountSel) {
        playerCountSel.onchange = (e) => {
          const n = Number(e.target.value || 4) || 4;
          engine.setPlayerCount(n);
          boardUI.render(engine.state.players);
          Logger.log('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex]?.id, index: engine.state.turnIndex });
        };
      }

    } catch (err) {
      Logger.error('BOOT_FAIL', String(err));
      const errorBanner = $('error-banner');
      if (errorBanner) {
        errorBanner.hidden = false;
        errorBanner.textContent = 'There was a problem starting the game.';
      }
    }
  }
})();