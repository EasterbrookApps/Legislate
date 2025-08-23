import { createEventBus } from './eventBus.js';
import { registerDefaultEffects } from './effects.js';

export function createEngine({ board, decks, rng }) {
  const bus = createEventBus();

  const state = {
    packId: board.packId || 'uk-parliament',
    players: [
      { id: 'p1', name: 'Player 1', color: '#d4351c', position: 0 },
      { id: 'p2', name: 'Player 2', color: '#1d70b8', position: 0 },
    ],
    turnIndex: 0,
    direction: 1,
    decks: {}, // shuffled arrays per deck
    extra: {},
  };

  // Determine end index
  const endIndex = (() => {
    const lastEnd = [...board.spaces].reverse().find(s => s.stage === 'end');
    if (lastEnd) return lastEnd.index;
    return board.spaces[board.spaces.length - 1].index;
  })();

  // Shuffle decks deterministically
  function shuffle(a) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  for (const [name, cards] of Object.entries(decks)) {
    state.decks[name] = shuffle(cards);
  }

  // Effects registry
  const effects = new Map();
  registerDefaultEffects(effects);

  function currentPlayer() { return state.players[state.turnIndex]; }

  function emit(type, data) { bus.emit(type, data); }

  function drawFrom(deckName) {
    const deck = state.decks[deckName];
    if (!deck || deck.length === 0) return null;
    const card = deck.shift();
    state.decks[deckName] = deck; // consume
    return card;
  }

  function applyCard(card) {
    if (!card) return;
    // effect may be string like "move:2" etc
    let applied = false;
    if (typeof card.effect === 'string' && card.effect.length > 0) {
      const [type, ...params] = card.effect.split(':');
      const handler = effects.get(type);
      if (handler) { handler(ctx(), currentPlayer(), params[0]); applied = true; }
    }
    if (!applied) {
      const special = effects.get('__special__');
      if (special) special(ctx(), currentPlayer(), card);
    }
  }

  function moveSteps(steps) {
    const p = currentPlayer();
    for (let k=0; k<Math.abs(steps); k++) {
      p.position += Math.sign(steps);
      if (p.position < 0) p.position = 0;
      if (p.position > endIndex) { p.position = endIndex; break; }
      emit('MOVE_STEP', { playerId: p.id, to: p.position });
    }
  }

  function spaceFor(i) { return board.spaces.find(s => s.index === i) || null; }

  function takeTurn(roll) {
    const p = currentPlayer();

    if (p.skip && p.skip > 0) {
      p.skip -= 1;
      emit('TURN_SKIPPED', { playerId: p.id });
      return endTurn(false);
    }

    emit('DICE_ROLL', { playerId: p.id, roll });
    moveSteps(roll);

    const landed = spaceFor(p.position);
    emit('LANDED', { playerId: p.id, space: landed });

    if (p.position === endIndex) {
      const winners = [p];
      emit('GAME_END', { winners });
      return; // UI handles restart
    }

    if (landed && landed.deck && landed.deck !== 'none') {
      const card = drawFrom(landed.deck);
      emit('CARD_DRAWN', { deck: landed.deck, card });
      applyCard(card);
    }

    // Post-card checks
    if (p.position === endIndex) {
      const winners = [p];
      emit('GAME_END', { winners });
      return;
    }

    const extra = !!p.extraRoll;
    p.extraRoll = false;
    endTurn(extra);
  }

  function endTurn(extraRoll) {
    if (!extraRoll) {
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
    }
    emit('TURN_BEGIN', { playerId: currentPlayer().id, index: state.turnIndex });
  }

  function setPlayers(count) {
    const defaults = [
      { id: 'p1', name: 'Player 1', color: '#d4351c', position: 0 },
      { id: 'p2', name: 'Player 2', color: '#1d70b8', position: 0 },
      { id: 'p3', name: 'Player 3', color: '#00703c', position: 0 },
      { id: 'p4', name: 'Player 4', color: '#6f72af', position: 0 },
      { id: 'p5', name: 'Player 5', color: '#b58840', position: 0 },
      { id: 'p6', name: 'Player 6', color: '#912b88', position: 0 },
    ];
    state.players = defaults.slice(0, Math.min(6, Math.max(2, count))).map(p => ({...p, position: 0, skip:0, extraRoll:false}));
    state.turnIndex = 0;
  }

  function ctx() {
    return { endIndex, board, state };
  }

  function serialize() {
    return {
      packId: state.packId,
      players: state.players,
      turnIndex: state.turnIndex,
      decks: state.decks,
    };
  }

  function hydrate(save) {
    if (!save) return;
    state.packId = save.packId || state.packId;
    state.players = save.players || state.players;
    state.turnIndex = save.turnIndex ?? state.turnIndex;
    state.decks = save.decks || state.decks;
  }


  function reset() {
    // Reset positions/flags but keep player names & colours
    // Reshuffle decks deterministically with current RNG
    function shuffle(a) {
      const arr = a.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    for (const p of state.players) {
      p.position = 0;
      p.skip = 0;
      p.extraRoll = false;
    }
    state.turnIndex = 0;
    for (const [name, cards] of Object.entries(decks)) {
      state.decks[name] = shuffle(cards);
    }
    emit('TURN_BEGIN', { playerId: currentPlayer().id, index: state.turnIndex });
  }

  return { bus, state, endIndex, setPlayers, takeTurn, serialize, hydrate, reset };

}
