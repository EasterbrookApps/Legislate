// apps/legislate-test/js/engine.js
// Complete engine: event bus, turns, movement, finite-deck draw, OK-to-apply handshake.

(function () {
  // --- tiny async helper ---
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // --- minimal event bus ---
  function createBus() {
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

  // --- RNG + die roll ---
  function makeRng(seed) {
    let t = (seed >>> 0) || 0xA5F1C9D7;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rollDie(rng) { return 1 + Math.floor(rng() * 6); }

  // --- Engine factory ---
  function createEngine({ board, decks, playerCount = 4, seed = Date.now(), stepDelay = 160 } = {}) {
    if (!board || !Array.isArray(board.spaces)) {
      throw new Error('Engine requires board.spaces[]');
    }

    const bus = createBus();

    // Mirror emits to debug panel if present (no-op otherwise)
    if (!bus.__dbgWrapped) {
      const raw = bus.emit.bind(bus);
      bus.emit = (t, p) => { try { window.DBG?.log('EVT ' + t, p); } catch { } return raw(t, p); };
      bus.__dbgWrapped = true;
    }

    const rng = makeRng(seed);

    // Compute final/end index (prefer a space tagged stage:'end'; otherwise last space index)
    const endIndex = (() => {
      const s = board.spaces;
      const tagged = s.slice().reverse().find(sp => sp && sp.stage === 'end');
      if (tagged && Number.isFinite(tagged.index)) return tagged.index;
      const last = s[s.length - 1];
      return Number.isFinite(last?.index) ? last.index : (s.length - 1);
    })();

    const state = {
      players: [],
      turnIndex: 0,
      decks: {},     // finite decks (seeded below)
      endIndex
    };

    // Seed players
    const palette = ['#d4351c', '#1d70b8', '#00703c', '#6f72af', '#b58840', '#912b88'];
    function initPlayers(n) {
      const c = Math.max(2, Math.min(6, Number(n) || 4));
      state.players.length = 0;
      for (let i = 0; i < c; i++) {
        state.players.push({
          id: 'p' + (i + 1),
          name: 'Player ' + (i + 1),
          color: palette[i % palette.length],
          position: 0,
          skip: 0,
          extra: false
        });
      }
      state.turnIndex = 0;
    }
    initPlayers(playerCount);

    // --- Seed finite decks from input (no refills, no shuffle here) ---
    state.decks = {};
    if (decks && typeof decks === 'object') {
      for (const [name, cards] of Object.entries(decks)) {
        state.decks[name] = Array.isArray(cards) ? cards.slice() : [];
      }
    }

    // --- helpers ---
    function current() { return state.players[state.turnIndex]; }
    function spaceFor(idx) { return board.spaces.find(s => s.index === idx) || null; }

    // Consume a card from a named deck (finite)
    function drawFrom(deckName) {
      const d = state.decks[deckName];
      if (!Array.isArray(d) || d.length === 0) return null;
      return d.shift();
    }

    // Apply a card's effect to a player (finite, simple verbs)
    function applyCardEffect(card, p) {
      if (!card) return;
      const eff = String(card.effect || '').trim();
      const [kind, raw] = eff.split(':');
      const n = Number(raw);

      switch (kind) {
        case 'move': {
          const steps = Number.isFinite(n) ? n : 0;
          p.position = Math.max(0, Math.min(state.endIndex, p.position + steps));
          break;
        }
        case 'miss_turn': {
          p.skip = (p.skip || 0) + 1;
          break;
        }
        case 'extra_roll': {
          p.extra = true;
          break;
        }
        case 'pingpong': {
          p.position = state.endIndex;
          break;
        }
        case 'goto': {
          const dest = Number.isFinite(n) ? n : p.position;
          p.position = Math.max(0, Math.min(state.endIndex, dest));
          break;
        }
        case 'back': {
          const steps = Number.isFinite(n) ? Math.abs(n) : 0;
          p.position = Math.max(0, Math.min(state.endIndex, p.position - steps));
          break;
        }
        default: {
          // Legacy fallbacks by id (for older card sets)
          const id = card.id || '';
          if (id === 'Early04' || id === 'Early09') p.position = 0;
          if (id === 'Implementation01') p.position = state.endIndex;
        }
      }
    }

    // Move forward step-by-step (1 tile per tick)
    async function stepMove(count) {
      const p = current();
      const steps = Math.abs(Number(count) || 0);
      for (let i = 1; i <= steps; i++) {
        p.position = Math.min(state.endIndex, p.position + 1);
        bus.emit('MOVE_STEP', { playerId: p.id, position: p.position, step: i, total: steps });
        await sleep(stepDelay);
      }
    }

    // Take one turn: roll → move → land → (maybe draw card) → end/next
    async function takeTurn() {
      const p = current();

      // Handle "miss a turn"
      if (p.skip && p.skip > 0) {
        p.skip -= 1;
        bus.emit('TURN_SKIPPED', { playerId: p.id, remaining: p.skip });
        return endTurn(false);
      }

      // Roll
      const value = rollDie(rng);
      bus.emit('DICE_ROLL', { value, playerId: p.id, name: p.name });

      // Move
      await stepMove(value);

      // Land
      const space = spaceFor(p.position);
      bus.emit('LANDED', { playerId: p.id, position: p.position, space });

      // Draw from deck (finite) if present
      if (space?.deck && space.deck !== 'none') {
        const name = space.deck; // must match board string exactly (e.g., "early")
        const deck = state.decks[name];
        bus.emit('DECK_CHECK', { name, len: Array.isArray(deck) ? deck.length : -1 });

        if (Array.isArray(deck) && deck.length > 0) {
          const card = drawFrom(name); // consume top card
          bus.emit('CARD_DRAWN', { deck: name, card });

          // Wait for UI "OK" → CARD_RESOLVE { card }
          await new Promise(resolve => {
            const off = bus.on('CARD_RESOLVE', ({ card: ack }) => {
              if (!ack || !card || ack.id !== card.id) return;
              off(); resolve();
            });
          });

          // Apply & signal
          applyCardEffect(card, p);
          bus.emit('CARD_APPLIED', { card, playerId: p.id, position: p.position });
        } else {
          // Finite deck empty; no draw this time (design choice). We still continue the turn.
          bus.emit('CARD_DRAWN', { deck: name, card: null });
        }
      }

      // End / maybe extra
      const again = !!p.extra;
      p.extra = false;
      endTurn(again);
    }

    function endTurn(extra) {
      if (!extra) {
        state.turnIndex = (state.turnIndex + 1) % state.players.length;
      }
      const cur = current();
      bus.emit('TURN_END', { playerId: cur.id });
      bus.emit('TURN_BEGIN', { playerId: cur.id, index: state.turnIndex });
    }

    function setPlayerCount(n) {
      const prevNames = state.players.map(p => p.name);
      initPlayers(n);
      state.players.forEach((p, i) => { if (prevNames[i]) p.name = prevNames[i]; });
      const cur = current();
      bus.emit('TURN_BEGIN', { playerId: cur.id, index: state.turnIndex });
    }

    return { bus, state, takeTurn, setPlayerCount };
  }

  // Public API
  window.LegislateEngine = { createEngine, makeRng, rollDie };
})();