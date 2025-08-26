// engine.js — core game engine
window.LegislateEngine = (function () {
  function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  function createEventBus() {
    const map = new Map();
    return {
      on(type, fn) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
        return () => map.get(type)?.delete(fn);
      },
      emit(type, payload) {
        (map.get(type) || []).forEach(fn => fn(payload));
        (map.get('*') || []).forEach(fn => fn(type, payload));
      }
    };
  }

  function createEngine({ board, decks, rng, playerCount = 4, colors } = {}) {
    const bus = createEventBus();
    const state = {
      packId: board.packId || 'uk-parliament',
      players: [],
      turnIndex: 0,
      decks: {}
    };
    const endIndex =
      (board.spaces.slice().reverse().find(s => s.stage === 'end') ||
        board.spaces[board.spaces.length - 1]).index;

    const palette = colors || [
      '#d4351c', '#1d70b8', '#00703c',
      '#6f72af', '#b58840', '#912b88'
    ];

    function initPlayers(n) {
      const max = Math.max(2, Math.min(6, n || 4));
      state.players = [];
      for (let i = 0; i < max; i++) {
        state.players.push({
          id: 'p' + (i + 1),
          name: 'Player ' + (i + 1),
          color: palette[i % palette.length],
          position: 0,
          skip: 0,
          extraRoll: false
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
    for (const [name, cards] of Object.entries(decks || {})) {
      state.decks[name] = shuffle(cards);
    }

    function current() {
      return state.players[state.turnIndex];
    }
    function spaceFor(i) {
      return board.spaces.find(s => s.index === i) || null;
    }
    function drawFrom(name) {
      const d = state.decks[name];
      if (!d || !d.length) return null;
      const c = d.shift();
      state.decks[name] = d;
      return c;
    }

    function applyCard(card) {
      if (!card) return;
      let applied = false;
      if (typeof card.effect === 'string' && card.effect.length) {
        const [type, arg] = card.effect.split(':');
        if (type === 'move') {
          const n = Number(arg || 0);
          const p = current();
          let i = p.position + n;
          if (i < 0) i = 0;
          if (i > endIndex) i = endIndex;
          p.position = i;
          applied = true;
        } else if (type === 'miss_turn') {
          current().skip = (current().skip || 0) + 1;
          applied = true;
        } else if (type === 'extra_roll') {
          current().extraRoll = true;
          applied = true;
        } else if (type === 'pingpong') {
          current().position = endIndex;
          applied = true;
        }
      }
      if (!applied) {
        const id = card.id || '';
        if (id === 'Early04' || id === 'Early09') {
          current().position = 0;
        } else if (id === 'Implementation01') {
          current().position = endIndex;
        }
      }
    }

    async function moveSteps(n) {
      const p = current();
      const step = n >= 0 ? 1 : -1;
      const count = Math.abs(n);
      for (let k = 0; k < count; k++) {
        p.position += step;
        if (p.position < 0) p.position = 0;
        if (p.position > endIndex) p.position = endIndex;
        bus.emit('MOVE_STEP', { playerId: p.id, position: p.position, step: k + 1, total: count });
        await delay(180);
      }
    }

    async function takeTurn(stepsOverride) {
      const active = current();

      // skip turn?
      if (active.skip && active.skip > 0) {
        active.skip--;
        bus.emit('TURN_SKIPPED', { playerId: active.id, remaining: active.skip });
        state.turnIndex = (state.turnIndex + 1) % state.players.length;
        bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
        return;
      }

      const steps = Number.isFinite(Number(stepsOverride))
        ? Number(stepsOverride)
        : 1 + Math.floor(rng() * 6);

      bus.emit('DICE_ROLL', { playerId: active.id, value: steps });
      await moveSteps(steps);

      const space = spaceFor(active.position);
      bus.emit('LANDED', { playerId: active.id, position: active.position, space });

      if (space?.deck && space.deck !== 'none') {
        const card = drawFrom(space.deck);
        if (card) {
          bus.emit('CARD_DRAWN', { deck: space.deck, card });
          applyCard(card);
          if (active.extraRoll) {
            bus.emit('EFFECT_EXTRA_ROLL', { playerId: active.id });
            active.extraRoll = false;
            bus.emit('TURN_BEGIN', { playerId: active.id, index: state.turnIndex });
            return;
          }
        }
      }

      bus.emit('TURN_END', { playerId: active.id });
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    function setPlayerCount(n) {
      const names = state.players.map(p => p.name);
      initPlayers(n);
      state.players.forEach((p, i) => {
        if (names[i]) p.name = names[i];
      });
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    function serialize() {
      return {
        packId: state.packId,
        players: state.players,
        turnIndex: state.turnIndex,
        decks: state.decks
      };
    }

    function hydrate(save) {
      if (!save) return;
      state.packId = save.packId || state.packId;
      state.players = save.players || state.players;
      state.turnIndex =
        save.turnIndex != null ? save.turnIndex : state.turnIndex;
      state.decks = save.decks || state.decks;
    }

    function reset() {
      state.players.forEach(p => {
        p.position = 0;
        p.skip = 0;
        p.extraRoll = false;
      });
      state.turnIndex = 0;
      for (const [name, cards] of Object.entries(decks || {})) {
        state.decks[name] = shuffle(cards);
      }
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    return { bus, state, endIndex, takeTurn, setPlayerCount, serialize, hydrate, reset };
  }

  function makeRng(seed) {
    let t = seed >>> 0;
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

  return { createEngine, makeRng, makeDice };
})();