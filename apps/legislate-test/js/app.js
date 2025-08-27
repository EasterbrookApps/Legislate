// app.js
document.addEventListener("DOMContentLoaded", async () => {
  enableDebug();

  const board = await fetch("board.json").then((r) => r.json());
  const decks = {};
  for (const name of ["commons", "early", "implementation", "lords", "pingpong"]) {
    decks[name] = await fetch(`cards/${name}.json`).then((r) => r.json());
  }

  const playerCount = 2; // default for testing, UI updates this
  const players = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);

  Engine.init(board, decks, players);

  on("DICE_ROLL", ({ value }) => {
    Dice.show(value);
  });

  document.getElementById("roll-btn").addEventListener("click", () => {
    logEvent("LOG", "rollBtn click");
    Engine.roll();
  });

  document.getElementById("restart-btn").addEventListener("click", () => {
    location.reload();
  });

  on("CARD_DRAWN", ({ card }) => {
    UI.showCard(card);
  });

  on("CARD_APPLIED", ({ playerId, effect }) => {
    Engine.applyCardEffect(playerId, effect);
  });

  on("TURN_BEGIN", ({ playerId }) => {
    UI.updateTurnIndicator(playerId);
  });
});