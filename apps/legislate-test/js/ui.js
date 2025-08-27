// ui.js
const UI = (() => {
  const modalRoot = document.getElementById("modalRoot");
  const turnIndicator = document.getElementById("turn-indicator");
  const playersEl = document.getElementById("players");
  const tokensLayer = document.getElementById("tokensLayer");
  const toastRoot = document.getElementById("toast-root");

  const tokens = {};

  const initPlayers = (players) => {
    playersEl.innerHTML = "";
    players.forEach((id, i) => {
      const div = document.createElement("div");
      div.className = "player";
      div.dataset.id = id;
      div.innerHTML = `<span contenteditable="true" class="player-name">Player ${i + 1}</span>`;
      playersEl.appendChild(div);

      const token = document.createElement("div");
      token.className = `token token-${i}`;
      tokensLayer.appendChild(token);
      tokens[id] = token;
    });
  };

  const updateTurnIndicator = (playerId) => {
    const nameEl = playersEl.querySelector(`[data-id="${playerId}"] .player-name`);
    const activeName = nameEl ? nameEl.innerText : playerId;
    turnIndicator.innerHTML = `<span class="player-dot"></span> ${activeName}'s turn`;
  };

  const showCard = (card) => {
    modalRoot.innerHTML = `
      <div class="modal">
        <p>${card.text}</p>
        <button id="card-ok">OK</button>
      </div>
    `;
    modalRoot.style.display = "block";

    document.getElementById("card-ok").onclick = () => {
      modalRoot.style.display = "none";
      emit("CARD_APPLIED", { id: card.id, effect: card.effect, playerId: Engine.currentPlayer().id, position: Engine.currentPlayer().position });
    };
    emit("CARD_MODAL_OPEN", { id: card.id, effect: card.effect });
  };

  const moveToken = (playerId, position) => {
    const token = tokens[playerId];
    const space = Engine.state.spaces[position];
    if (token && space) {
      token.style.left = space.x + "%";
      token.style.top = space.y + "%";
    }
  };

  const toast = (msg) => {
    const div = document.createElement("div");
    div.className = "toast";
    div.innerText = msg;
    toastRoot.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  };

  on("TURN_SKIPPED", ({ playerId }) => {
    toast(`${playerId} misses a turn!`);
  });

  on("EFFECT_EXTRA_ROLL", ({ playerId }) => {
    toast(`${playerId} gets an extra roll!`);
  });

  return { initPlayers, updateTurnIndicator, showCard, moveToken, toast };
})();