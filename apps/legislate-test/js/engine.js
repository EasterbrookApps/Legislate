// engine.js
const Engine = (() => {
  let state = {
    spaces: [],
    decks: {},
    players: [],
    currentTurn: 0,
    skipTurns: {},
    extraRoll: null,
  };

  const init = (board, decks, players) => {
    state.spaces = board;
    state.decks = decks;
    state.players = players.map((id, i) => ({
      id,
      position: 0,
      index: i,
      finished: false,
    }));
    state.currentTurn = 0;
    state.skipTurns = {};
    state.extraRoll = null;

    logEvent("PACK", {
      spaces: board.length,
      decks: Object.keys(decks),
    });
    emit("BOOT_OK");
  };

  const currentPlayer = () => state.players[state.currentTurn];

  const nextTurn = () => {
    let p = currentPlayer();
    emit("TURN_END", { playerId: p.id });

    if (state.extraRoll === p.id) {
      state.extraRoll = null;
      emit("TURN_BEGIN", { playerId: p.id, index: p.index });
      return;
    }

    do {
      state.currentTurn = (state.currentTurn + 1) % state.players.length;
      p = currentPlayer();

      if (state.skipTurns[p.id] && state.skipTurns[p.id] > 0) {
        state.skipTurns[p.id]--;
        emit("TURN_SKIPPED", { playerId: p.id, remaining: state.skipTurns[p.id] });
        emit("TURN_END", { playerId: p.id });
      } else {
        break;
      }
    } while (true);

    emit("TURN_BEGIN", { playerId: p.id, index: p.index });
  };

  const roll = () => {
    const player = currentPlayer();
    const value = Math.floor(Math.random() * 6) + 1;
    emit("DICE_ROLL", { value, playerId: player.id, name: player.name });
    movePlayer(player, value);
  };

  const movePlayer = (player, steps) => {
    for (let i = 1; i <= steps; i++) {
      player.position = Math.min(player.position + 1, state.spaces.length - 1);
      emit("MOVE_STEP", {
        playerId: player.id,
        position: player.position,
        step: i,
        total: steps,
      });
    }

    const space = state.spaces[player.position];
    emit("LANDED", { playerId: player.id, position: player.position, space });

    if (space.deck && state.decks[space.deck]?.length > 0) {
      const card = state.decks[space.deck].shift();
      emit("DECK_CHECK", { name: space.deck, len: state.decks[space.deck].length });
      emit("CARD_DRAWN", { deck: space.deck, card });
    } else {
      nextTurn();
    }
  };

  const applyCardEffect = (playerId, effect) => {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || !effect) return;

    if (effect.startsWith("move:")) {
      const delta = parseInt(effect.split(":")[1], 10);
      player.position = Math.max(0, Math.min(state.spaces.length - 1, player.position + delta));
      emit("MOVE_STEP", { playerId: player.id, position: player.position, step: delta, total: delta });
      const space = state.spaces[player.position];
      emit("LANDED", { playerId: player.id, position: player.position, space });
    } else if (effect.startsWith("goto:")) {
      const target = parseInt(effect.split(":")[1], 10);
      player.position = target;
      emit("MOVE_STEP", { playerId: player.id, position: player.position, step: target, total: target });
      const space = state.spaces[player.position];
      emit("LANDED", { playerId: player.id, position: player.position, space });
    } else if (effect === "miss_turn") {
      state.skipTurns[player.id] = (state.skipTurns[player.id] || 0) + 1;
      emit("TURN_SKIPPED", { playerId: player.id, remaining: state.skipTurns[player.id] });
    } else if (effect === "extra_roll") {
      state.extraRoll = player.id;
      emit("EFFECT_EXTRA_ROLL", { playerId: player.id });
    }

    nextTurn();
  };

  return { init, roll, applyCardEffect, nextTurn };
})();