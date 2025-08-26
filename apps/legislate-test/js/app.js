/* app.js — wire engine events to UI; add end-game toasts/modal with 2P rule */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const log = (...args) => { try { window.LegislateDebug?.log(...args); } catch {} };

  // Expect these to exist from your current boot:
  //  - window.LegislateEngine.createEngine(...)
  //  - window.LegislateLoader.loadPack(...)
  //  - window.LegislateUI (renderPlayers, showDiceRoll, createModal, setTurnIndicator, etc.)

  const rollBtn = $('#rollBtn');
  const restartBtn = $('#restartBtn');
  const playerCountSel = $('#playerCount');

  // Keep a reference to expose engine for other modules (debug, etc.)
  const App = (window.LegislateApp = window.LegislateApp || {});
  let engine = App.engine;

  async function boot() {
    try {
      const pack = await window.LegislateLoader.loadPack('uk-parliament'); // uses your current loader pathing
      log('PACK', { spaces: pack.board.spaces.length, decks: Object.keys(pack.decks) });

      engine = window.LegislateEngine.createEngine({
        board: pack.board,
        decks: pack.decks,
        playerCount: Number(playerCountSel?.value || 4)
      });
      App.engine = engine;

      // --- Core existing wiring (minimal; assumes UI already has these methods) ---
      // Turn banner
      engine.bus.on('TURN_BEGIN', ({ playerId, index }) => {
        const p = engine.state.players[index];
        const name = p?.name || `Player ${index + 1}`;
        try { window.LegislateUI?.setTurnIndicator?.(`${name}’s turn`); } catch {}
        log('TURN_BEGIN', { playerId, index });
        // Render tokens immediately on turn begin to keep in sync
        try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
      });

      // Movement render
      engine.bus.on('MOVE_STEP', (e) => {
        try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
        log('MOVE_STEP', e);
      });

      // Dice overlay (already implemented elsewhere)
      engine.bus.on('DICE_ROLL', ({ value, playerId, name }) => {
        try { window.LegislateUI?.showDiceRoll?.(value); } catch {}
        log('DICE_ROLL', { value, playerId, name });
      });

      engine.bus.on('LANDED', (e) => log('LANDED', e));
      engine.bus.on('DECK_CHECK', (e) => log('DECK_CHECK', e));
      engine.bus.on('CARD_DRAWN', ({ deck, card }) => {
        log('CARD_DRAWN', { deck, card });
        // Defer UI open to your existing card modal flow in UI; nothing to do here.
      });
      engine.bus.on('CARD_APPLIED', (e) => log('CARD_APPLIED', e));
      engine.bus.on('TURN_END', (e) => log('TURN_END', e));
      engine.bus.on('TURN_SKIPPED', ({ playerId, remaining }) => {
        // UI toast for skip already exists in your build; keep as-is
        try { window.LegislateUI?.toast?.('⏭️ Turn skipped'); } catch {}
        log('TURN_SKIPPED', { playerId, remaining });
      });
      engine.bus.on('EFFECT_EXTRA_ROLL', ({ playerId }) => {
        try { window.LegislateUI?.toast?.('🎲 Extra roll!'); } catch {}
        log('EFFECT_EXTRA_ROLL', { playerId });
      });

      // --- NEW: end-game UI wiring ---

      // 1) GAME_PLACE → toast only when total players >= 3 (suppress for 2-player games)
      engine.bus.on('GAME_PLACE', ({ playerId, place }) => {
        const total = engine.state.players.length;
        if (total >= 3) {
          const pl = engine.state.players.find(p => p.id === playerId);
          const name = pl?.name || `Player`;
          const label = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
          try { window.LegislateUI?.toast?.(`🏁 ${name} finishes ${label}!`); } catch {}
        }
        log('GAME_PLACE', { playerId, place });
      });

      // 2) GAME_OVER → open modal, disable roll while open; “Play again” does a hard reset.
      engine.bus.on('GAME_OVER', ({ podium, totalPlayers }) => {
        log('GAME_OVER', { podium, totalPlayers });

        // Disable roll while modal visible
        const disableRoll = (on) => {
          if (!rollBtn) return;
          rollBtn.disabled = !!on;
          rollBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
        };
        disableRoll(true);

        window.LegislateUI?.openGameOver?.(
          podium,
          totalPlayers,
          // onPlayAgain:
          () => {
            try { engine.reset(); } catch {}
            // After reset, update tokens & banner
            try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
            try {
              const p0 = engine.state.players[engine.state.turnIndex];
              window.LegislateUI?.setTurnIndicator?.(`${p0?.name || 'Player 1'}’s turn`);
            } catch {}
          },
          // onClose:
          () => {
            disableRoll(false);
          }
        );
      });

      // Initial render/banner
      const p0 = engine.state.players[engine.state.turnIndex];
      try { window.LegislateUI?.setTurnIndicator?.(`${p0?.name || 'Player 1'}’s turn`); } catch {}
      try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
      log('EVT BOOT_OK', '');

      // --- Controls ---
      rollBtn?.addEventListener('click', () => {
        log('LOG', 'rollBtn click');
        engine.takeTurn();
      });

      restartBtn?.addEventListener('click', () => {
        try { engine.reset(); } catch {}
        try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
        const pX = engine.state.players[engine.state.turnIndex];
        try { window.LegislateUI?.setTurnIndicator?.(`${pX?.name || 'Player 1'}’s turn`); } catch {}
      });

      playerCountSel?.addEventListener('change', (e) => {
        const n = Number(e.target.value || 4);
        try { engine.setPlayerCount(n); } catch {}
        try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
        const pX = engine.state.players[engine.state.turnIndex];
        try { window.LegislateUI?.setTurnIndicator?.(`${pX?.name || 'Player 1'}’s turn`); } catch {}
      });

    } catch (err) {
      log('BOOT_FAIL', String(err));
      // Minimal visible banner if your debug panel is hidden
      const banner = document.createElement('div');
      banner.style.position = 'fixed';
      banner.style.insetInline = '0';
      banner.style.top = '0';
      banner.style.background = '#d4351c';
      banner.style.color = '#fff';
      banner.style.padding = '.5rem .75rem';
      banner.style.zIndex = '2000';
      banner.textContent = 'There was an error initialising the game.';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 4000);
    }
  }

  // Boot now
  boot();
})();