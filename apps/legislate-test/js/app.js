// app.js — main entry point
(function(){
  const { createEngine, makeRng } = window.LegislateEngine;
  const rng = makeRng(Date.now());

  let engine;

  async function boot(){
    try {
      const pack = await window.LegislateLoader.loadPack("uk-parliament");
      window.LegislateDebug.log("PACK", { spaces: pack.board.spaces.length, decks: Object.keys(pack.decks) });

      engine = createEngine({ board: pack.board, decks: pack.decks, rng });
      if (!engine || !engine.bus) throw new Error("Engine did not initialise properly");

      window.LegislateDebug.log("ENGINE_FACTORY", { hasLE: !!window.LegislateEngine, hasCreate: !!createEngine });

      bindUI(engine);
      engine.bus.emit("TURN_BEGIN", { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });
      window.LegislateDebug.log("BOOT_OK");
    } catch (err) {
      console.error("Boot failed", err);
      window.LegislateDebug.log("BOOT_FAIL", err);
      document.getElementById("turnIndicator").textContent = "Error loading game.";
    }
  }

  function bindUI(engine){
    const rollBtn = document.getElementById("rollBtn");
    const restartBtn = document.getElementById("restartBtn");
    const playerCount = document.getElementById("playerCount");

    rollBtn.addEventListener("click", ()=>{
      window.LegislateDebug.log("rollBtn click");
      engine.takeTurn();
    });
    restartBtn.addEventListener("click", ()=>{
      engine.reset();
    });
    playerCount.addEventListener("change", e=>{
      engine.setPlayerCount(parseInt(e.target.value,10));
    });

    engine.bus.on("DICE_ROLL", ev=> window.LegislateUI.showDiceRoll(ev.value));
    engine.bus.on("MOVE_STEP", ev=> window.LegislateUI.moveToken(ev.playerId, ev.position));
    engine.bus.on("LANDED", ev=> window.LegislateUI.handleLanded(ev, engine));
    engine.bus.on("TURN_BEGIN", ev=> window.LegislateUI.setTurnIndicator(ev, engine));
  }

  boot();
})();