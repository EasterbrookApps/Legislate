/* app.js — wire engine events to UI (cards queued after dice; end-game modal) */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const log = (...args) => { try { window.LegislateDebug?.log(...args); } catch {} };

  const rollBtn = $('#rollBtn');
  const restartBtn = $('#restartBtn');
  const playerCountSel = $('#playerCount');

  const App = (window.LegislateApp = window.LegislateApp || {});
  let engine = App.engine;

  let diceActive = false;
  const cardQueue = [];

  function showCardAfterDice(card) {
    const open = () => {
      window.LegislateUI?.openCard?.(card, () => {
        // After user confirms, ask engine to apply effect (defensive)
        let applied = false;
        try {
          if (typeof engine.applyCard === 'function') { engine.applyCard(card); applied = true; }
          else if (typeof engine.resolveCard === 'function') { engine.resolveCard(card); applied = true; }
        } catch {}
        if (!applied) {
          // Last resort: emit a signal the engine might listen to
          try { engine.bus.emit('UI_CARD_CONFIRMED', { card }); } catch {}
        }
      });
    };
    if (diceActive) cardQueue.push(open); else open();
  }

  async function boot() {
    try {
      const pack = await window.LegislateLoader.loadPack('uk-parliament');
      log('PACK', { spaces: pack.board.spaces.length, decks: Object.keys(pack.decks) });

      engine = window.LegislateEngine.createEngine({
        board: pack.board,
        decks: pack.decks,
        playerCount: Number(playerCountSel?.value || 4)
      });
      App.engine = engine;

      // turn banner + immediate render
      engine.bus.on('TURN_BEGIN', ({ playerId, index }) => {
        const p = engine.state.players[index];
        const name = p?.name || `Player ${index + 1}`;
        try { window.LegislateUI?.setTurnIndicator?.(`${name}’s turn`); } catch {}
        try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
        log('TURN_BEGIN', { playerId, index });
      });

      engine.bus.on('MOVE_STEP', (e) => {
        try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
        log('MOVE_STEP', e);
      });

      // dice overlay & gating
      engine.bus.on('DICE_ROLL', ({ value, playerId, name }) => {
        diceActive = true;
        try { window.LegislateUI?.showDiceRoll?.(value); } catch {}
        log('DICE_ROLL', { value, playerId, name });
      });
      // listen to UI's DICE_DONE log by polling a tiny timeout; or simply clear after 1.4s
      // we prefer listening to the debug hook to be precise:
      const origLog = log;
      window.LegislateDebug = window.LegislateDebug || { log: () => {} };
      const prevDbg = window.LegislateDebug.log;
      window.LegislateDebug.log = function (type, payload) {
        try { prevDbg?.call(window.LegislateDebug, type, payload); } catch {}
        if (type === 'DICE_DONE') {
          diceActive = false;
          // flush queue
          while (cardQueue.length) cardQueue.shift()();
        }
        try { origLog(type, payload); } catch {}
      };

      engine.bus.on('LANDED', (e) => log('LANDED', e));
      engine.bus.on('DECK_CHECK', (e) => log('DECK_CHECK', e));

      // === cards ===
      engine.bus.on('CARD_DRAWN', ({ deck, card }) => {
        log('CARD_DRAWN', { deck, card });
        showCardAfterDice(card);
      });
      engine.bus.on('CARD_APPLIED', (e) => log('CARD_APPLIED', e));

      // skips / extra roll toasts (unchanged)
      engine.bus.on('TURN_SKIPPED', ({ playerId, remaining }) => {
        try { window.LegislateUI?.toast?.('⏭️ Turn skipped'); } catch {}
        log('TURN_SKIPPED', { playerId, remaining });
      });
      engine.bus.on('EFFECT_EXTRA_ROLL', ({ playerId }) => {
        try { window.LegislateUI?.toast?.('🎲 Extra roll!'); } catch {}
        log('EFFECT_EXTRA_ROLL', { playerId });
      });

      // === end-game UI (unchanged from previous) ===
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

      engine.bus.on('GAME_OVER', ({ podium, totalPlayers }) => {
        log('GAME_OVER', { podium, totalPlayers });
        const disableRoll = (on) => {
          if (!rollBtn) return;
          rollBtn.disabled = !!on;
          rollBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
        };
        disableRoll(true);
        window.LegislateUI?.openGameOver?.(
          podium,
          totalPlayers,
          () => {
            try { engine.reset(); } catch {}
            try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
            const p0 = engine.state.players[engine.state.turnIndex];
            try { window.LegislateUI?.setTurnIndicator?.(`${p0?.name || 'Player 1'}’s turn`); } catch {}
          },
          () => { disableRoll(false); }
        );
      });

      // initial banner/tokens
      const p0 = engine.state.players[engine.state.turnIndex];
      try { window.LegislateUI?.setTurnIndicator?.(`${p0?.name || 'Player 1'}’s turn`); } catch {}
      try { window.LegislateUI?.renderPlayers?.(engine.state.players, engine.state, pack.board); } catch {}
      log('EVT BOOT_OK', '');

      // controls
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

  boot();
})();