// app.js — wire engine and UI
(function () {
  const debug = window.LegislateDebug;
  const UI = window.LegislateUI;
  const LE = window.LegislateEngine;

  let engine;
  let modal;

  async function boot(pack) {
    const rng = LE.makeRng(Date.now());
    engine = LE.createEngine({ board: pack.board, decks: pack.decks, rng });
    modal = UI.createModal();

    engine.bus.on('TURN_BEGIN', ({ playerId, index }) => {
      const player = engine.state.players[index];
      UI.setTurnIndicator(player);
    });

    engine.bus.on('DICE_ROLL', ({ value }) => {
      UI.showDiceRoll(value);
    });

    engine.bus.on('CARD_DRAWN', ({ card }) => {
      modal.show(`<p>${card.text}</p>`);
    });

    engine.bus.on('TURN_SKIPPED', ({ playerId }) => {
      const p = engine.state.players.find(pp => pp.id === playerId);
      UI.toast(`${p.name}'s turn is skipped`);
    });

    engine.bus.on('EFFECT_EXTRA_ROLL', ({ playerId }) => {
      const p = engine.state.players.find(pp => pp.id === playerId);
      UI.toast(`${p.name} gets an extra roll!`);
    });

    document.getElementById('rollBtn').addEventListener('click', () => {
      engine.takeTurn();
    });
    document.getElementById('restartBtn').addEventListener('click', () => {
      engine.reset();
    });

    engine.reset();
  }

  fetch('./content/packs/uk-parliament/board.json')
    .then(r => r.json())
    .then(board =>
      Promise.all([
        fetch('./content/packs/uk-parliament/commons.json').then(r => r.json()),
        fetch('./content/packs/uk-parliament/early.json').then(r => r.json()),
        fetch('./content/packs/uk-parliament/implementation.json').then(r => r.json()),
        fetch('./content/packs/uk-parliament/lords.json').then(r => r.json()),
        fetch('./content/packs/uk-parliament/pingpong.json').then(r => r.json())
      ]).then(([commons, early, implementation, lords, pingpong]) => ({
        board,
        decks: { commons, early, implementation, lords, pingpong }
      }))
    )
    .then(pack => boot(pack));
})();