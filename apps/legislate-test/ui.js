/* ui.js */
window.LegislateUI = (function () {
  // --- small helpers ---
  function $(sel, root = document) { return root.querySelector(sel); }

  // --- required API: basic setters ---
  function setAlt(img, alt)   { if (img) img.alt = alt || ""; }
  function setSrc(img, src)   { if (img) img.src = src || ""; }

  // e.g. "Alice's turn" (trims trailing spaces before the apostrophe)
  function setTurnIndicator(el, name) {
    if (!el) return;
    const cleaned = (name || "").replace(/\s+$/, "");
    el.textContent = `${cleaned}'s turn`;
  }

  // --- Modal (OK-only) ---
  // Assumes a <div id="modal-root"> exists in index.html (we add it if missing)
  function createModal() {
    let root = $("#modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "modal-root";
      document.body.appendChild(root);
    }

    // lazy init structure once
    if (!root._wired) {
      root._wired = true;
      Object.assign(root.style, {
        position: "fixed",
        inset: "0",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.55)",
        zIndex: 1500
      });

      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "modal-title");
      Object.assign(dialog.style, {
        minWidth: "min(92vw, 480px)",
        maxWidth: "92vw",
        background: "#fff",
        border: "1px solid #b1b4b6",
        borderRadius: "8px",
        boxShadow: "0 6px 24px rgba(0,0,0,.25)"
      });

      const header = document.createElement("div");
      Object.assign(header.style, { padding: "12px 16px", borderBottom: "1px solid #e5e5e5" });

      const title = document.createElement("h2");
      title.id = "modal-title";
      Object.assign(title.style, { margin: 0, fontSize: "1.1rem" });
      header.appendChild(title);

      const body = document.createElement("div");
      Object.assign(body.style, { padding: "12px 16px", lineHeight: "1.45" });

      const actions = document.createElement("div");
      Object.assign(actions.style, { padding: "12px 16px", borderTop: "1px solid #e5e5e5", textAlign: "right" });

      const ok = document.createElement("button");
      ok.textContent = "OK";
      ok.className = "btn";
      Object.assign(ok.style, {
        padding: ".5rem 1rem",
        borderRadius: "4px",
        border: "1px solid #1d70b8",
        background: "#1d70b8",
        color: "#fff",
        cursor: "pointer"
      });
      actions.appendChild(ok);

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(actions);
      root.appendChild(dialog);

      root._els = { dialog, title, body, ok };
    }

    // focus trap (very light)
    function trapFocus(e) {
      if (e.key !== "Tab") return;
      const focusables = root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const f = Array.from(focusables);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    async function open({ title, body }) {
      const { dialog, ok } = root._els;
      root._els.title.textContent = title || "";
      if (typeof body === "string") root._els.body.innerHTML = body;
      else { root._els.body.innerHTML = ""; root._els.body.appendChild(body); }

      root.style.display = "flex";
      document.addEventListener("keydown", trapFocus);
      // initial focus
      setTimeout(() => ok.focus(), 0);

      return new Promise((resolve) => {
        function close() {
          root.style.display = "none";
          ok.removeEventListener("click", onClick);
          document.removeEventListener("keydown", trapFocus);
          resolve();
        }
        function onClick() { close(); }
        ok.addEventListener("click", onClick);
      });
    }

    return { open };
  }

  // --- Board renderer / token placement ---
  function createBoardRenderer(boardImg, tokensLayer, board) {
    // Ensure the tokens layer is positioned over the board
    if (tokensLayer && getComputedStyle(tokensLayer).position === "static") {
      tokensLayer.style.position = "absolute";
      tokensLayer.style.inset = "0";
      tokensLayer.style.pointerEvents = "none";
    }

    function renderPlayers(players) {
      if (!boardImg || !tokensLayer || !board || !Array.isArray(board.spaces)) return;

      const rect = boardImg.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      tokensLayer.innerHTML = "";

      // group by board index
      const by = new Map();
      for (const p of players) {
        const k = Number(p.position) || 0;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(p);
      }

      for (const [idx, group] of by.entries()) {
        const space = board.spaces.find(s => Number(s.index) === Number(idx));
        if (!space) continue;

        const cx = (Number(space.x) / 100) * w;
        const cy = (Number(space.y) / 100) * h;

        // token radius relative to board
        const r = Math.max(6, Math.min(18, Math.round(Math.min(w, h) / 30)));
        const ring = Math.max(0, group.length - 1);

        group.forEach((pl, i) => {
          const angle = ring ? (i / ring) * Math.PI * 2 : 0;
          const x = cx + (ring ? r * 0.8 * Math.cos(angle) : 0);
          const y = cy + (ring ? r * 0.8 * Math.sin(angle) : 0);

          const dot = document.createElement("div");
          dot.className = "player-dot";
          Object.assign(dot.style, {
            position: "absolute",
            left: `${x - r}px`,
            top: `${y - r}px`,
            width: `${r * 2}px`,
            height: `${r * 2}px`,
            borderRadius: "50%",
            background: pl.colour || "#1d70b8",
            border: "2px solid #fff",
            boxShadow: "0 1px 6px rgba(0,0,0,.25)",
            pointerEvents: "none"
          });
          dot.title = pl.name || "";
          tokensLayer.appendChild(dot);
        });
      }

      // optional: let debug panel know a placement happened
      if (window.LegislateDebug && window.LegislateDebug.tokensPlaced) {
        try {
          const summary = [...by.entries()].map(([k, v]) => ({ index: Number(k), count: v.length }));
          window.LegislateDebug.tokensPlaced({ summary });
        } catch { /* no-op */ }
      }
    }

    return { renderPlayers };
  }

  // convenience no-op (API completeness)
  function renderPlayers() {}

  // --- Full-screen dice overlay (uses #diceOverlay + #dice in index.html) ---
  function showDiceRoll(value, durationMs) {
    return new Promise((resolve) => {
      const overlay = $("#diceOverlay");
      const dice = $("#dice");
      if (!overlay || !dice) {
        // graceful fallback
        alert(`You rolled a ${value}.`);
        return resolve();
      }
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dur = prefersReduced ? 300 : (durationMs || 1600);

      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      dice.className = "dice rolling";

      const tempTimer = setInterval(() => {
        const r = 1 + Math.floor(Math.random() * 6);
        dice.className = "dice rolling show-" + r;
      }, 120);

      setTimeout(() => {
        clearInterval(tempTimer);
        dice.className = "dice show-" + value;
        setTimeout(() => {
          overlay.hidden = true;
          overlay.setAttribute("aria-hidden", "true");
          resolve();
        }, 450);
      }, dur);
    });
  }

  // --- public API ---
  return {
    setAlt,
    setSrc,
    setTurnIndicator,
    createModal,
    createBoardRenderer,
    renderPlayers,
    showDiceRoll
  };
})();