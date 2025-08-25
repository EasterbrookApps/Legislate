/* Minimal, explicit-turn engine with card handshake */
window.LegislateEngine = (function () {
  function createEventBus() {
    const m = new Map();
    return {
      on(type, fn) {
        if (!m.has(type)) m.set(type, new Set());
        m.get(type).add(fn);
        return () => m.get(type)?.delete(fn);
      },
      emit(type, payload) {
        (m.get(type) || []).forEach(fn => fn(payload));
        (m.get('*') || []).forEach(fn => fn(type, payload));
      }
    };
  }

  function makeRng(seed) {
    let t = (seed >>> 0) || 0x9e3779b9;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDice(rng) {
    return () => 1 + Math.floor(rng() * 6);
  }

  function createEngine({ board, decks, rng, playerCount = 4, colors } = {}) {
    const bus = createEventBus();
    const state = {
      packId: (board && board.packId) || 'uk-parliament',
      players: [],
      turnIndex: 0,
      decks: {},
      waitingCard: null, // when a card is drawn we pause here
    };

    const endSpaceIndex =
      (board && board.spaces && [...board.spaces].reverse().find(s => s.stage === 'end')?.index) ??
      (board?.spaces?.[board.spaces.length - 1]?.index ?? 0);

    const palette = colors || ['#d4351c', '#1d70b8', '#00703c', '#6f72af', '#b58840', '#912b88'];

    function initPlayers(n) {
      const max = Math.max(2, Math.min(6, n || 4));
      state.players = [];
      for (let i = 0; i < max; i++) {
        state.players.push({
          id: 'p' + (i + 1),
          name: 'Player ' + (i + 1),
          color: palette[i % palette.length],
          pos: 0,
          skip: 0,
          extraRoll: false
        });
      }
      state.turnIndex = 0;
    }
    initPlayers(playerCount);

    function shuffle(a) {
      const arr = a ? a.slice() : [];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // Seed decks
    for (const [name, cards] of Object.entries(decks || {})) {
      state.decks[name] = shuffle(cards);
    }

    function current() { return state.players[state.turnIndex]; }
    function spaceFor(i) { return board.spaces.find(s => s.index === i) || board.spaces[0]; }

    function drawFrom(name) {
      const d = state.decks[name];
      if (!d || !d.length) return null;
      const c = d.shift();
      // recycle to bottom so deck doesn’t vanish on long sessions
      d.push(c);
      return c;
    }

    function clampPos(i) {
      if (i < 0) return 0;
      if (i > endSpaceIndex) return endSpaceIndex;
      return i;
    }

    async function moveSteps(n) {
      const p = current();
      const count = Math.abs(n);
      const step = n >= 0 ? 1 : -1;
      for (let k = 0; k < count; k++) {
        p.pos = clampPos(p.pos + step);
        bus.emit('MOVE_STEP', { playerId: p.id, position: p.pos, step: k + 1, total: count });
        await new Promise(r => setTimeout(r, 180)); // small visual cadence
      }
    }

    function applyCardEffect(card) {
      if (!card) return { applied: false };
      let applied = false;

      // Preferred string format: "move:+3", "miss_turn", "extra_roll", "pingpong"
      if (typeof card.effect === 'string' && card.effect.length) {
        const [type, arg] = card.effect.split(':');
        if (type === 'move') {
          const n = Number(arg || 0);
          current().pos = clampPos(current().pos + n);
          applied = true;
        } else if (type === 'miss_turn') {
          current().skip = (current().skip || 0) + 1;
          applied = true;
        } else if (type === 'extra_roll') {
          current().extraRoll = true;
          applied = true;
        } else if (type === 'pingpong') {
          current().pos = endSpaceIndex;
          applied = true;
        }
      }

      // Back-compat by ID if needed
      if (!applied && card.id) {
        if (card.id === 'Early04' || card.id === 'Early09') { current().pos = 0; applied = true; }
        else if (card.id === 'Implementation01') { current().pos = endSpaceIndex; applied = true; }
      }

      return { applied };
    }

    // Public method called by UI after the player presses OK on the card modal
    function resolveCard(card) {
      const { applied } = applyCardEffect(card);
      bus.emit('CARD_APPLIED', { card, applied, playerId: current().id, position: current().pos });

      // clear waiting state then finish the turn
      state.waitingCard = null;
      finishTurn();
    }

    function finishTurn() {
      const p = current();

      if (p.extraRoll) {
        p.extraRoll = false; // consume it
        // same player rolls again
        bus.emit('TURN_END', { playerId: p.id, extraRoll: true });
        bus.emit('TURN_BEGIN', { playerId: p.id, index: state.turnIndex });
        return;
      }

      // advance to next player, skipping anyone with skip>0
      let next = (state.turnIndex + 1) % state.players.length;
      let safety = state.players.length + 1;
      while (safety-- > 0) {
        const np = state.players[next];
        if (np.skip && np.skip > 0) {
          np.skip -= 1; // burn the skip
          next = (next + 1) % state.players.length;
          continue;
        }
        break;
      }
      state.turnIndex = next;
      bus.emit('TURN_END', { playerId: p.id });
      bus.emit('TURN_BEGIN', { playerId: state.players[state.turnIndex].id, index: state.turnIndex });
    }

    async function takeTurn(stepsOverride) {
      if (state.waitingCard) return; // still waiting for UI to resolve previous card
      const dice = makeDice(rng);
      const steps = Number.isFinite(Number(stepsOverride)) ? Number(stepsOverride) : dice();
      const p = current();

      bus.emit('DICE_ROLL', { playerId: p.id, value: steps, name: p.name });

      await moveSteps(steps);

      const space = spaceFor(p.pos);
      bus.emit('LANDED', { playerId: p.id, position: p.pos, space });

      if (space?.deck && space.deck !== 'none') {
        const card = drawFrom(space.deck);
        state.waitingCard = { card, deck: space.deck };
        bus.emit('CARD_DRAWN', { deck: space.deck, card, playerId: p.id, position: p.pos });
        // pause here – UI must call resolveCard(card)
        return;
      }

      finishTurn();
    }

    function setPlayerCount(n) {
      const names = state.players.map(p => p.name);
      initPlayers(n);
      state.players.forEach((p, i) => { if (names[i]) p.name = names[i]; });
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    function serialize() {
      return { packId: state.packId, players: state.players, turnIndex: state.turnIndex, decks: state.decks };
    }
    function hydrate(save) {
      if (!save) return;
      state.packId = save.packId || state.packId;
      state.players = save.players || state.players;
      state.turnIndex = (save.turnIndex != null ? save.turnIndex : state.turnIndex);
      state.decks = save.decks || state.decks;
    }
    function reset() {
      state.players.forEach(p => { p.pos = 0; p.skip = 0; p.extraRoll = false; });
      state.turnIndex = 0;
      for (const [name, cards] of Object.entries(decks || {})) state.decks[name] = shuffle(cards);
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    return {
      bus, state, takeTurn, setPlayerCount, serialize, hydrate, reset,
      resolveCard, // <— UI calls this after OK
    };
  }

  return { createEngine, makeRng, makeDice };
})();