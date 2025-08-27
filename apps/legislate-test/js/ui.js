// js/ui.js
// Lightweight, DOM-only UI helpers exposed on window.LegislateUI
// NOTE: keep API stable — used by app.js

(function () {
  // ---------- DOM utils ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") n.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  };

  // ---------- Simple logger hook (no-op if debug.js not loaded yet) ----------
  function log(kind, data) {
    try {
      if (window.LegislateDebug && typeof window.LegislateDebug.log === "function") {
        window.LegislateDebug.log(kind, data);
      }
    } catch (_) { /* ignore */ }
  }

  // ---------- Basic setters ----------
  function setAlt(img, text) { if (img) img.alt = text || ""; }
  function setSrc(img, src) { if (img) img.src = src; }
  function setTurnIndicator(target, text) { if (target) target.textContent = text || ""; }

  // ---------- Modal (card / alerts) ----------
  // Exposes: createModal(rootEl?) -> { open({title,body,okLabel}) : Promise<void> }
  function createModal(rootEl) {
    const host = rootEl || $("#modalRoot") || $("#modal-root") || document.body;

    // Build a single modal container that we show/hide
    const backdrop = el("div", { class: "modal-backdrop", hidden: "hidden", role: "presentation" });
    const dialog = el("div", { class: "modal", role: "dialog", "aria-modal": "true" }, [
      el("h2", { id: "ui-modal-title", class: "modal-title" }),
      el("div", { id: "ui-modal-body", class: "modal-body" }),
      el("div", { class: "modal-actions" }, [
        el("button", { id: "ui-modal-ok", class: "button" }, "OK")
      ])
    ]);
    backdrop.appendChild(dialog);
    host.appendChild(backdrop);

    const titleEl = $("#ui-modal-title", dialog);
    const bodyEl  = $("#ui-modal-body", dialog);
    const okBtn   = $("#ui-modal-ok", dialog);

    function open(opts = {}) {
      const { title = "Card", body = "", okLabel = "OK" } = opts;
      titleEl.textContent = title;
      if (typeof body === "string") {
        bodyEl.textContent = body;
      } else if (body instanceof Node) {
        bodyEl.innerHTML = "";
        bodyEl.appendChild(body);
      }
      okBtn.textContent = okLabel;
      backdrop.hidden = false;
      dialog.focus();
      return new Promise(resolve => {
        const close = () => {
          backdrop.hidden = true;
          okBtn.removeEventListener("click", onOk);
          backdrop.removeEventListener("click", onClickBackdrop);
          resolve();
        };
        const onOk = () => { log("CARD_MODAL_CLOSE", {}); close(); };
        const onClickBackdrop = (e) => { if (e.target === backdrop) close(); };
        okBtn.addEventListener("click", onOk);
        backdrop.addEventListener("click", onClickBackdrop);
      });
    }

    return { open };
  }

  // ---------- Dice overlay ----------
  // Public: showDiceRoll({value, durationMs}) -> Promise<void>
  function showDiceRoll(opts = {}) {
    const { value = 1, durationMs = 800 } = opts;
    const overlay = $("#diceOverlay");
    const dice = $("#dice");
    if (!overlay || !dice) {
      log("WARN", { msg: "dice overlay not found" });
      return Promise.resolve();
    }

    // set the face
    dice.classList.remove("show-1", "show-2", "show-3", "show-4", "show-5", "show-6", "rolling");
    dice.classList.add(`show-${Math.max(1, Math.min(6, value))}`, "rolling");

    overlay.hidden = false;
    overlay.style.display = "flex";
    log("OVERLAY", {
      hidden: overlay.hidden,
      display: overlay.style.display || "",
      vis: overlay.style.visibility || "visible",
      z: getComputedStyle(overlay).zIndex,
      pe: getComputedStyle(overlay).pointerEvents
    });

    return new Promise(res => {
      setTimeout(() => {
        dice.classList.remove("rolling");
        // small pause to let the user read the face
        setTimeout(() => {
          overlay.hidden = true;
          overlay.style.display = "none";
          log("OVERLAY", {
            hidden: overlay.hidden,
            display: overlay.style.display || "",
            vis: overlay.style.visibility || "visible",
            z: getComputedStyle(overlay).zIndex,
            pe: getComputedStyle(overlay).pointerEvents
          });
          res();
        }, 250);
      }, Math.max(200, durationMs));
    });
  }

  // ---------- Toasts (non-blocking notices) ----------
  // Minimal; CSS uses .toast fixed bottom-right
  function showToast(text, ms = 2200) {
    let box = $("#ui-toast");
    if (!box) {
      box = el("div", { id: "ui-toast", class: "toast", style: {
        position: "fixed", right: "12px", bottom: "12px",
        background: "#0b0c0c", color: "#fff", padding: "8px 12px",
        borderRadius: "8px", fontSize: "14px", zIndex: "1600",
        boxShadow: "0 6px 24px rgba(0,0,0,.25)"
      }});
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.style.opacity = "1";
    clearTimeout(box._t);
    box._t = setTimeout(() => { box.style.opacity = "0"; }, ms);
  }

  // ---------- Board & token renderer ----------
  // Exposes: createBoardRenderer(boardImgEl, tokensLayerEl, spaces)
  // API: { placeToken(playerId, index, color), clearTokens(), summary() }
  function createBoardRenderer(boardImgEl, tokensLayerEl, spaces) {
    if (!boardImgEl || !tokensLayerEl) {
      throw new Error("createBoardRenderer requires board image and tokens layer");
    }

    // token nodes keyed by playerId
    const nodes = new Map();

    // Convert a board index -> {x,y} in pixels based on image size
    function project(index) {
      const s = spaces.find(sp => sp.index === index);
      if (!s) {
        // default to start (index 0)
        const z = spaces.find(sp => sp.index === 0) || { x: 0, y: 0 };
        return { x: z.x, y: z.y };
      }
      // x,y are percentages [0..100]
      const rect = boardImgEl.getBoundingClientRect();
      const x = (s.x / 100) * rect.width;
      const y = (s.y / 100) * rect.height;
      return { x, y };
    }

    function ensureNode(id, color) {
      if (nodes.has(id)) return nodes.get(id);
      const n = el("div", { class: "token", style: {
        position: "absolute",
        width: "18px", height: "18px",
        borderRadius: "50%",
        border: "2px solid #fff",
        boxShadow: "0 2px 8px rgba(0,0,0,.35)",
        background: color || "#6f72af",
        transform: "translate(-50%, -50%)"
      }});
      n.dataset.playerId = id;
      tokensLayerEl.appendChild(n);
      nodes.set(id, n);
      return n;
    }

    function placeToken(playerId, index, color) {
      const node = ensureNode(playerId, color);
      const { x, y } = project(index);
      node.style.left = `${x}px`;
      node.style.top  = `${y}px`;
      node.style.background = color || node.style.background;
    }

    function clearTokens(keepIds = []) {
      // remove any tokens whose id is not in keepIds
      nodes.forEach((node, pid) => {
        if (!keepIds.includes(pid)) {
          node.remove();
          nodes.delete(pid);
        }
      });
    }

    function summary() {
      // helpful for debug
      const byIdx = {};
      nodes.forEach((node) => {
        const idx = node.dataset.index || "?";
        byIdx[idx] = (byIdx[idx] || 0) + 1;
      });
      return byIdx;
    }

    // keep tokens aligned on resize
    function reflowAll() {
      // find each node's intended index from dataset
      nodes.forEach((node) => {
        const idx = parseInt(node.dataset.index || "0", 10);
        const { x, y } = project(idx);
        node.style.left = `${x}px`;
        node.style.top  = `${y}px`;
      });
    }
    window.addEventListener("resize", () => requestAnimationFrame(reflowAll));

    return {
      placeToken(indexOrPlayer, indexMaybe, colorMaybe) {
        // support both signatures for backwards compat:
        // (playerId, index, color)   or   ({id,color,position})
        if (typeof indexOrPlayer === "object") {
          const p = indexOrPlayer;
          const node = ensureNode(p.id, p.color);
          node.dataset.index = String(p.position || 0);
          const { x, y } = project(p.position || 0);
          node.style.left = `${x}px`;
          node.style.top  = `${y}px`;
          node.style.background = p.color || node.style.background;
        } else {
          const playerId = indexOrPlayer;
          const index = indexMaybe || 0;
          const color = colorMaybe;
          const node = ensureNode(playerId, color);
          node.dataset.index = String(index);
          const { x, y } = project(index);
          node.style.left = `${x}px`;
          node.style.top  = `${y}px`;
          node.style.background = color || node.style.background;
        }
      },
      clearTokens,
      summary
    };
  }

  // ---------- Players list (inline name editing) ----------
  // Exposes: renderPlayers(containerEl, players, onNameChange?)
  function renderPlayers(containerEl, players, onNameChange) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    players.forEach((p) => {
      const dot = el("span", { class: "player-dot", style: {
        background: p.color || "#6f72af",
        display: "inline-block",
        width: ".8rem", height: ".8rem", borderRadius: "50%"
      }});
      const input = el("input", {
        type: "text",
        class: "player-name player-name-input",
        value: p.name || "",
        "aria-label": `Name for ${p.id}`
      });
      input.addEventListener("change", () => {
        if (typeof onNameChange === "function") onNameChange(p.id, input.value.trim());
      });
      containerEl.appendChild(
        el("span", { class: "player-pill" }, [dot, input])
      );
    });
  }

  // ---------- Export ----------
  window.LegislateUI = {
    // small helpers
    setAlt,
    setSrc,
    setTurnIndicator,
    // main UI
    createModal,
    createBoardRenderer,
    renderPlayers,
    showDiceRoll,
    showToast
  };
})();