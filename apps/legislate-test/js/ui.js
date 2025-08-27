// ui.js – last confirmed working version

export function setupUI({ state, send, on }) {
  const rollBtn = document.getElementById("roll-btn-header");
  const restartBtn = document.getElementById("restart-btn");
  const playersContainer = document.getElementById("players");
  const turnIndicator = document.getElementById("turn-indicator");
  const activeName = document.getElementById("active-name");
  const activeColor = document.getElementById("active-color");
  const dbgLog = document.getElementById("dbg-log");

  // Dice overlay
  const diceOverlay = document.getElementById("dice-overlay");
  const dice = document.getElementById("dice");

  // Modal root
  const modalRoot = document.getElementById("modalRoot");

  // Log helper
  function log(msg) {
    if (dbgLog) {
      const line = document.createElement("div");
      line.textContent = msg;
      dbgLog.appendChild(line);
    }
  }

  // Render players
  function renderPlayers() {
    playersContainer.innerHTML = "";
    state.players.forEach((p) => {
      const span = document.createElement("span");
      span.className = "player-name";
      span.contentEditable = true;
      span.textContent = p.name;
      span.style.color = p.color;
      span.addEventListener("input", () => {
        p.name = span.textContent;
        if (p.id === state.activePlayerId) {
          activeName.textContent = p.name;
        }
      });
      playersContainer.appendChild(span);
    });
  }

  // Turn indicator
  function updateTurnIndicator() {
    const active = state.players.find((p) => p.id === state.activePlayerId);
    if (active) {
      activeName.textContent = active.name;
      activeColor.style.background = active.color;
    }
  }

  // Dice rendering
  function showDice(value) {
    dice.className = "dice show-" + value;
  }

  // Modal helper
  function showModal(card, onClose) {
    modalRoot.innerHTML = `
      <div class="modal">
        <div class="modal-content">
          <p>${card.text}</p>
          <button id="modal-ok">OK</button>
        </div>
      </div>
    `;
    modalRoot.style.display = "block";
    document.getElementById("modal-ok").onclick = () => {
      modalRoot.style.display = "none";
      onClose();
    };
  }

  // Events
  rollBtn.addEventListener("click", () => {
    send("ROLL");
    log("rollBtn click");
  });

  restartBtn.addEventListener("click", () => {
    send("RESTART");
  });

  on("TURN_BEGIN", () => {
    updateTurnIndicator();
  });

  on("PLAYER_UPDATE", () => {
    renderPlayers();
    updateTurnIndicator();
  });

  on("DICE_ROLL", ({ value }) => {
    diceOverlay.style.display = "flex";
    showDice(value);
  });

  on("DICE_DONE", () => {
    diceOverlay.style.display = "none";
  });

  on("CARD_MODAL_OPEN", ({ card, onClose }) => {
    showModal(card, onClose);
  });

  // Initial render
  renderPlayers();
  updateTurnIndicator();
}