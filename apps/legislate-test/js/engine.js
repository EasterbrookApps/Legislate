// engine.js – last confirmed working version

export function setupEngine({ state, send, on }) {
  let playerIndex = 0;
  let skipTurns = {};

  function nextTurn() {
    playerIndex = (playerIndex + 1) % state.players.length;
    const next = state.players[playerIndex];
    if (skipTurns[next.id] && skipTurns[next.id] > 0) {
      skipTurns[next.id]--;
      send("TURN_SKIPPED", { playerId: next.id, remaining: skipTurns[next.id] });
      send("TURN_END", { playerId: next.id });
      nextTurn();
      return;
    }
    state.activePlayerId = next.id;
    send("TURN_BEGIN", { playerId: next.id, index: playerIndex });
  }

  on("ROLL", () => {
    const roll = Math.floor(Math.random() * 6) + 1;
    send("DICE_ROLL", { value: roll });
    let steps = 0;
    const player = state.players[playerIndex];
    function step() {
      steps++;
      player.position++;
      send("MOVE_STEP", {
        playerId: player.id,
        position: player.position,
        step: steps,
        total: roll,
      });
      if (steps < roll) {
        setTimeout(step, 200);
      } else {
        send("LANDED", {
          playerId: player.id,
          position: player.position,
          space: state.spaces[player.position],
        });
        send("DICE_DONE", { value: roll });
      }
    }
    step();
  });

  on("CARD_APPLIED", ({ effect, playerId }) => {
    const player = state.players.find((p) => p.id === playerId);

    if (effect.startsWith("move:")) {
      const offset = parseInt(effect.split(":")[1], 10);
      player.position += offset;
      send("MOVE_STEP", {
        playerId: player.id,
        position: player.position,
        step: offset,
        total: offset,
      });
    }

    if (effect.startsWith("goto:")) {
      const target = parseInt(effect.split(":")[1], 10);
      player.position = target;
      send("MOVE_STEP", {
        playerId: player.id,
        position: player.position,
        step: target,
        total: target,
      });
    }

    if (effect === "miss_turn") {
      skipTurns[playerId] = (skipTurns[playerId] || 0) + 1;
      send("EFFECT_MISS_TURN", { playerId });
    }

    if (effect === "extra_roll") {
      send("EFFECT_EXTRA_ROLL", { playerId });
      // Player immediately goes again
      state.activePlayerId = player.id;
      send("TURN_BEGIN", { playerId: player.id, index: playerIndex });
      return;
    }

    send("TURN_END", { playerId });
    nextTurn();
  });

  on("RESTART", () => {
    playerIndex = 0;
    skipTurns = {};
    state.players.forEach((p, i) => {
      p.position = 0;
      send("PLAYER_UPDATE", { playerId: p.id, position: 0 });
    });
    state.activePlayerId = state.players[0].id;
    send("TURN_BEGIN", { playerId: state.players[0].id, index: 0 });
  });

  // Boot
  state.players = [
    { id: "p1", name: "Player 1", color: "red", position: 0 },
    { id: "p2", name: "Player 2", color: "blue", position: 0 },
  ];
  state.activePlayerId = state.players[0].id;
  send("PLAYER_UPDATE", {});
  send("TURN_BEGIN", { playerId: state.players[0].id, index: 0 });
}