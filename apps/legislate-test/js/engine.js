// js/engine.js
window.LegislateEngine = (function () {
  // simple pub/sub ------------------------------------------------------
  function bus() {
    const m = new Map();
    return {
      on(t, fn) { if (!m.has(t)) m.set(t, new Set()); m.get(t).add(fn); return () => m.get(t)?.delete(fn); },
      emit(t, p) { (m.get(t) || []).forEach(fn => fn(p)); (m.get('*') || []).forEach(fn => fn(t, p)); }
    };
  }

  // engine factory ------------------------------------------------------
  function createEngine({ board, decks, rng, playerCount = 4, colors } = {}) {
    const ev = bus();
    const state = {
      players: [],
      turnIndex: 0,
      decks: {},
      board,
    };

    const palette = colors || ['#d4351c', '#1d70b8', '#00703c', '#6f72af', '#b58840', '#912b88'];
    function initPlayers(n) {
      const count = Math.max(2, Math.min(6, n || 4));
      state.players = [];
      for (let i = 0; i < count; i++) {
        state.players.push({ id: 'p' + (i + 1), name: `Player ${i + 1}`, color: palette[i % palette.length], pos: 0 });
      }
      state.turnIndex = 0;
    }
    initPlayers(playerCount);

    // deck helpers
    function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
    for (const [k, v] of Object.entries(decks || {})) state.decks[k] = shuffle(v);

    // card pause plumbing
    let pendingResolver = null;
    function resumeCard() { if (pendingResolver) { pendingResolver(); pendingResolver = null; } }

    // main turn ----------------------------------------------------------
    async function takeTurn(stepsOverride) {
      const active = state.players[state.turnIndex];
      const steps = Number.isFinite(+stepsOverride) ? +stepsOverride : (1 + Math.floor((rng || Math.random)() * 6));
      ev.emit('DICE_ROLL', { playerId: active.id, name: active.name, value: steps });

      for (let i = 0; i < steps; i++) {
        active.pos = Math.min(active.pos + 1, state.board.spaces.length - 1);
        ev.emit('MOVE_STEP', { playerId: active.id, position: active.pos, step: i + 1, total: steps });
        await new Promise(r => setTimeout(r, 180)); // small pacing delay
      }

      const space = state.board.spaces[active.pos];
      ev.emit('LANDED', { playerId: active.id, position: active.pos, space });

      // If there is a deck, draw and PAUSE here
      if (space && space.deck && space.deck !== 'none' && state.decks[space.deck]?.length) {
        const card = state.decks[space.deck].shift();
        ev.emit('CARD_DRAWN', { playerId: active.id, deck: space.deck, card });

        await new Promise(res => { pendingResolver = res; }); // wait for UI OK

        // Apply a few simple effects (extend as needed)
        applyCardEffect(active, card, state);
      }

      // next turn
      ev.emit('TURN_END', { playerId: active.id });
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
      ev.emit('TURN_BEGIN', { playerId: state.players[state.turnIndex].id, index: state.turnIndex });
    }

    function applyCardEffect(player, card, state) {
      if (!card) return;
      if (typeof card.effect === 'string') {
        const [kind, arg] = card.effect.split(':');
        if (kind === 'move') {
          const n = parseInt(arg || '0', 10);
          player.pos = Math.max(0, Math.min(player.pos + n, state.board.spaces.length - 1));
        } else if (kind === 'miss_turn') {
          player.skip = (player.skip || 0) + 1; // (not enforced here; keep for future)
        } else if (kind === 'extra_roll') {
          // could set a flag; for now we let normal play continue
        }
      }
    }

    function setPlayerCount(n) { const names = state.players.map(p => p.name); initPlayers(n); state.players.forEach((p, i) => names[i] && (p.name = names[i])); ev.emit('TURN_BEGIN', { playerId: state.players[state.turnIndex].id, index: state.turnIndex }); }

    return {
      bus: ev, state,
      takeTurn, setPlayerCount,
      resumeCard, // <- called by UI after OK is pressed
    };
  }

  return { createEngine };
})();