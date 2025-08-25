// js/engine.js
// Core game engine: state, turn flow, card effects.
// Exposes: window.LegislateEngine = { createEngine, makeRng, makeDice }

window.LegislateEngine = (function () {
  // -------------------------------
  // Utilities
  // -------------------------------
  function createBus() {
    const map = new Map();
    return {
      on(type, fn) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
        return () => map.get(type)?.delete(fn);
      },
      emit(type, payload) {
        const set = map.get(type);
        if (set) set.forEach((fn) => fn(payload));
        const wild = map.get('*');
        if (wild) wild.forEach((fn) => fn(type, payload));
      },
    };
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function makeRng(seed) {
    let t = (seed >>> 0) || 0x12345678;
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

  // -------------------------------
  // Engine factory
  // -------------------------------
  function createEngine({ board, decks, rng = Math.random, playerCount = 4, colors } = {}) {
    const bus = createBus();

    // derive finish index
    const endIndex =
      (board.spaces.slice().reverse().find((s) => s.stage === 'end') || board.spaces[board.spaces.length - 1]).index;

    // initialise state
    const palette =
      colors || ['#d4351c', '#1d70b8', '#00703c', '#6f72af', '#b58840', '#912b88', '#6c757d', '#e76f51'];

    const state = {
      packId: board.packId || 'uk-parliament',
      players: [],
      turnIndex: 0,
      decks: {}, // name -> queue (array)
    };

    function initPlayers(n) {
      const m = Math.max(2, Math.min(6, Number(n) || 4));
      state.players = [];
      for (let i = 0; i < m; i++) {
        state.players.push({
          id: 'p' + (i + 1),
          name: 'Player ' + (i + 1),
          color: palette[i % palette.length],
          position: 0,
          skip: 0,        // turns to skip
          extraRoll: false, // grant one extra roll after resolving a card
        });
      }
      state.turnIndex = 0;
    }
    initPlayers(playerCount);

    function shuffle(a) {
      const arr = a.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    // prime decks
    if (decks) {
      for (const [name, cards] of Object.entries(decks)) {
        state.decks[name] = shuffle(cards);
      }
    }

    // helpers
    const current = () => state.players[state.turnIndex];
    const spaceFor = (i) => board.spaces.find((s) => s.index === i) || null;

    function drawFrom(deckName) {
      const d = state.decks[deckName];
      if (!d || !d.length) return null;
      const c = d.shift();
      state.decks[deckName] = d;
      return c;
    }

    // -------------------------------
    // Card effect application
    // -------------------------------
    function applyCard(card) {
      if (!card) return null;

      let applied = null;
      const me = current();

      if (typeof card.effect === 'string' && card.effect) {
        const [type, argRaw] = card.effect.split(':');
        const arg = Number(argRaw || 0);

        switch (type) {
          case 'move': {
            let next = me.position + arg;
            if (next < 0) next = 0;
            if (next > endIndex) next = endIndex;
            me.position = next;
            applied = { type: 'move', arg };
            break;
          }
          case 'miss_turn': {
            me.skip = (me.skip || 0) + 1;
            applied = { type: 'miss_turn' };
            break;
          }
          case 'extra_roll': {
            me.extraRoll = true;
            applied = { type: 'extra_roll' };
            break;
          }
          case 'pingpong': {
            me.position = endIndex;
            applied = { type: 'pingpong' };
            break;
          }
          default:
            // unknown effect string
            applied = { type: 'unknown', raw: card.effect };
        }
      } else {
        // ID-based specials (legacy)
        const id = card.id || '';
        if (id === 'Early04' || id === 'Early09') {
          me.position = 0;
          applied = { type: 'move', arg: -Infinity };
        } else if (id === 'Implementation01') {
          me.position = endIndex;
          applied = { type: 'move', arg: +Infinity };
        }
      }

      return applied;
    }

    // -------------------------------
    // Turn flow
    // -------------------------------
    async function moveSteps(count) {
      const me = current();
      const step = count >= 0 ? 1 : -1;
      const total = Math.abs(count);
      for (let i = 0; i < total; i++) {
        me.position += step;
        if (me.position < 0) me.position = 0;
        if (me.position > endIndex) me.position = endIndex;
        bus.emit('MOVE_STEP', { playerId: me.id, position: me.position, step: i + 1, total });
        await wait(180); // small pacing so you can see tokens move
      }
    }

    async function takeTurn(stepsOverride) {
      // 0) consume "miss a turn" *before* any roll
      let me = current();
      if (me.skip && me.skip > 0) {
        me.skip -= 1;
        bus.emit('MISS_TURN_CONSUMED', { playerId: me.id, remaining: me.skip });
        // advance immediately to next player
        state.turnIndex = (state.turnIndex + 1) % state.players.length;
        bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
        return;
      }

      // 1) roll
      const dice = makeDice(rng);
      const steps = Number.isFinite(Number(stepsOverride)) ? Number(stepsOverride) : dice();
      bus.emit('DICE_ROLL', { playerId: me.id, name: me.name, value: steps });

      // 2) move piece-by-piece
      await moveSteps(steps);

      // 3) landed - resolve space
      const landed = spaceFor(me.position);
      bus.emit('LANDED', { playerId: me.id, position: me.position, space: landed });

      // 4) draw/resolve card if required
      let applied = null;
      if (landed && landed.deck && landed.deck !== 'none') {
        const card = drawFrom(landed.deck);
        bus.emit('CARD_DRAWN', { deck: landed.deck, card });
        applied = applyCard(card);
        if (applied) bus.emit('CARD_APPLIED', { playerId: me.id, result: applied, card });
      }

      // 5) end or extra roll?
      me = current(); // re-resolve in case position/flags changed
      if (me.extraRoll) {
        // consume the extra roll but keep the same active player
        me.extraRoll = false;
        bus.emit('EXTRA_ROLL_GRANTED', { playerId: me.id });
        // do NOT advance turn index; just announce same player again
        bus.emit('TURN_BEGIN', { playerId: me.id, index: state.turnIndex });
        return;
      }

      // normal turn end -> advance to next player
      bus.emit('TURN_END', { playerId: me.id });
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    // -------------------------------
    // Public API
    // -------------------------------
    function setPlayerCount(n) {
      const names = state.players.map((p) => p.name);
      initPlayers(n);
      state.players.forEach((p, i) => (p.name = names[i] || p.name));
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }
    function serialize() {
      return {
        packId: state.packId,
        players: state.players.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          position: p.position,
          skip: p.skip || 0,
          extraRoll: !!p.extraRoll,
        })),
        turnIndex: state.turnIndex,
        decks: state.decks,
      };
    }
    function hydrate(save) {
      if (!save) return;
      if (Array.isArray(save.players)) state.players = save.players;
      if (typeof save.turnIndex === 'number') state.turnIndex = save.turnIndex;
      if (save.decks) state.decks = save.decks;
      if (save.packId) state.packId = save.packId;
    }
    function reset() {
      state.players.forEach((p) => {
        p.position = 0;
        p.skip = 0;
        p.extraRoll = false;
      });
      state.turnIndex = 0;
      if (decks) {
        for (const [name, cards] of Object.entries(decks)) state.decks[name] = shuffle(cards);
      }
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    return { bus, state, endIndex, takeTurn, setPlayerCount, serialize, hydrate, reset };
  }

  return { createEngine, makeRng, makeDice };
})();