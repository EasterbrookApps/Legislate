// ui.js — handles UI rendering and events

function renderBoard(board, boardImg) {
  if (!boardImg) return;
  boardImg.src = board.image;
}

function renderPlayers(players, board) {
  const layer = document.getElementById("tokensLayer");
  if (!layer) return;
  layer.innerHTML = "";

  // group players by board position
  const grouped = {};
  players.forEach(p => {
    if (!grouped[p.position]) grouped[p.position] = [];
    grouped[p.position].push(p);
  });

  for (const [pos, group] of Object.entries(grouped)) {
    const space = board.spaces.find(s => s.index === Number(pos));
    if (!space) continue;

    const cx = space.x;
    const cy = space.y;

    if (group.length === 1) {
      // single token, centre it
      const p = group[0];
      const el = document.createElement("div");
      el.className = "token";
      el.style.background = p.color;
      el.style.left = `${cx}%`;
      el.style.top = `${cy}%`;
      el.title = p.name;
      layer.appendChild(el);
    } else {
      // multiple tokens on same square → fan them in a small circle
      const radius = 3; // % offset, adjust for spacing
      group.forEach((p, i) => {
        const angle = (i / group.length) * 2 * Math.PI;
        const ox = Math.cos(angle) * radius;
        const oy = Math.sin(angle) * radius;
        const el = document.createElement("div");
        el.className = "token";
        el.style.background = p.color;
        el.style.left = `${cx + ox}%`;
        el.style.top = `${cy + oy}%`;
        el.title = p.name;
        layer.appendChild(el);
      });
    }
  }
}

function renderTurnIndicator(currentPlayer) {
  const el = document.getElementById("turnIndicator");
  if (!el) return;
  el.textContent = `Turn: ${currentPlayer.name}`;
  el.style.color = currentPlayer.color;
}

function renderPlayersList(players) {
  const section = document.getElementById("playersSection");
  if (!section) return;
  section.innerHTML = "";
  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "player-row";

    const colorBox = document.createElement("span");
    colorBox.className = "player-color";
    colorBox.style.background = p.color;

    const input = document.createElement("input");
    input.type = "text";
    input.value = p.name;
    input.dataset.index = i;
    input.className = "player-name-input";

    row.appendChild(colorBox);
    row.appendChild(input);
    section.appendChild(row);
  });
}

function showModalCard(deckLabel, card, onResolve) {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal-card";

  const title = document.createElement("h2");
  title.textContent = deckLabel;

  const body = document.createElement("p");
  body.textContent = card.text;

  const btn = document.createElement("button");
  btn.textContent = "OK";
  btn.className = "button";
  btn.addEventListener("click", () => {
    root.innerHTML = "";
    onResolve();
  });

  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(btn);
  overlay.appendChild(modal);
  root.appendChild(overlay);
}

function showDiceOverlay(value) {
  const overlay = document.getElementById("diceOverlay");
  const diceEl = document.getElementById("dice");
  if (!overlay || !diceEl) return;

  overlay.hidden = false;
  diceEl.setAttribute("data-roll", value);

  // hide after animation (~2.5s)
  setTimeout(() => {
    overlay.hidden = true;
  }, 2500);
}

window.LegislateUI = {
  renderBoard,
  renderPlayers,
  renderTurnIndicator,
  renderPlayersList,
  showModalCard,
  showDiceOverlay,
};