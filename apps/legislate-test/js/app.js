// apps/legislate-test/js/app.js
// Safe wiring: Loader → Engine → UI, with early-guarded engine creation.
// Works with legacy debug.js (load debug BEFORE this file).

(function () {
  // ---------- Logging helpers ----------
  const Logger = {
    log(kind, payload) {
      try { window.DBG?.log?.(kind, payload); } catch {}
      try { window.LegislateDebug?.log?.(kind, payload); } catch {}
    },
    info(kind, payload) {
      try { window.DBG?.info?.(kind, payload); } catch {}
      try { window.LegislateDebug?.info?.(kind, payload); } catch {}
    },
    error(kind, payload) {
      try { window.DBG?.error?.(kind, payload); } catch {}
      try { window.LegislateDebug?.error?.(kind, payload); } catch {}
      console.error('[Legislate]', kind, payload || '');
    }
  };

  const $ = (id) => document.getElementById(id);
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  function isTyping() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }
  function turnText(name) {
    const n = (name || 'Player').trim();
    return `${n}'s turn`;
  }

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    // Env + DOM snapshot
    Logger.log('INFO', '[debug enabled]');
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
      // 1) Load content
      const { board, decks } = await window.LegislateLoader.loadPack('uk-parliament');
      Logger.log('PACK', {
        spaces: Array.isArray(board?.spaces) ? board.spaces.length : -1,
        decks: decks ? Object.keys(decks) : []
      });

      // 2) Create engine (guarded)
      const playerCountSel = $('playerCount');
      const startCount = Number(playerCountSel?.value || 4) || 4;

      const engine = createEngineSafely({ board, decks, playerCount: startCount });
      if (!engine) {
        throw new Error('Engine did not initialize; see ENGINE_INIT_FAIL above');
      }

      // 3) UI facades
      const modal = window.LegislateUI.createModal();
      const boardUI = window.LegislateUI.createBoardRenderer({ board });

      // 4) Initial render
      const first = engine.state.players[0];
      window.LegislateUI.setTurnIndicator(turnText(first?.name));
      boardUI.render(engine.state.players);
      Logger.log('EVT BOOT_OK');

      // 5) Engine → UI wiring (safe now: engine is guaranteed valid)
      engine.bus.on('DICE_ROLL', async ({ value }) => {
        Logger.log('ROLL', { value });
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

      engine.bus.on('CARD_DRAWN', async ({ deck, card }) => {
        Logger.log('CARD_DRAWN', { deck, card });
        if (!card) return; // finite deck empty => no modal

        // Ensure dice overlay has fully finished
        try { await window.LegislateUI.getLastDicePromise(); } catch {}
        await delay(200); // small visual gap

        await modal.open({
          title: card.title || deck,
          body: `<p>${(card.text || card.body || '').trim()}</p>`,
          actions: [{ id: 'ok', label: 'OK' }]
        });

        // Let engine continue
        engine.bus.emit('CARD_RESOLVE', { card });
      });

      engine.bus.on('CARD_APPLIED', ({ card, playerId, position }) => {
        Logger.log('CARD_APPLIED', { id: card?.id, effect: card?.effect, playerId, position });
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

      // 6) Controls
      $('rollBtn')?.addEventListener('click', async () => {
        Logger.log('rollBtn click');
        if (isTyping()) return;
        try { await engine.takeTurn(); }
        catch (e) {
          Logger.error('ROLL_FAIL', String(e));
          if (errorBanner) {
            errorBanner.hidden = false;
            errorBanner.textContent = 'There was a problem taking a turn.';
          }
        }
      });

      $('restartBtn')?.addEventListener('click', () => {
        if (confirm('Restart the game?')) location.reload();
      });

      playerCountSel?.addEventListener('change', (e) => {
        const n = Number(e.target.value || 4) || 4;
        engine.setPlayerCount(n);
        boardUI.render(engine.state.players);
        Logger.log('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex]?.id, index: engine.state.turnIndex });
      });

    } catch (err) {
      Logger.error('BOOT_FAIL', String(err));
      if (errorBanner) {
        errorBanner.hidden = false;
        errorBanner.textContent = 'There was a problem starting the game.';
      }
    }
  }

  // ---- Isolated, guarded engine creation to prevent early engine.bus usage ----
  function createEngineSafely({ board, decks, playerCount }) {
    Logger.log('ENGINE_FACTORY', {
      hasLE: !!window.LegislateEngine,
      hasCreate: !!(window.LegislateEngine && window.LegislateEngine.createEngine)
    });

    try {
      if (!window.LegislateEngine?.createEngine) {
        Logger.error('ENGINE_INIT_FAIL', { reason: 'createEngine missing' });
        return null;
      }
      const engine = window.LegislateEngine.createEngine({ board, decks, playerCount });
      if (!engine || !engine.bus) {
        Logger.error('ENGINE_INIT_FAIL', {
          engineType: typeof engine,
          hasBus: !!(engine && engine.bus),
          boardOk: !!(board && Array.isArray(board.spaces)),
          decksKeys: decks ? Object.keys(decks) : null
        });
        return null;
      }
      return engine;
    } catch (e) {
      Logger.error('ENGINE_CREATE_THROW', { message: e?.message || String(e) });
      return null;
    }
  }
})();