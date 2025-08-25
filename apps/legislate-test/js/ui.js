// js/ui.js — DOM helpers, modal + dice overlay, tokens & banner
window.LegislateUI = (function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Basic helpers
  function setAlt(sel, text){ const el=$(sel); if(el) el.alt=text; }
  function setSrc(sel, src){ const el=$(sel); if(el) el.src=src; }
  function setTurnIndicator(text){ const el=$("#turnIndicator"); if(el) el.textContent=text; }

  // --- Modal (cards) ---
  function createModal(){
    const host = $("#modalRoot");
    if (!host) throw new Error("modalRoot missing");

    // Build once
    let backdrop = host.querySelector(".modal-backdrop");
    if (!backdrop){
      backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('role','dialog');
      backdrop.setAttribute('aria-modal','true');
      backdrop.hidden = true;

      const box = document.createElement('div');
      box.className = 'modal';
      box.innerHTML = `
        <h2 id="modalTitle"></h2>
        <div id="modalBody"></div>
        <div class="modal-actions">
          <button id="modalOk" class="button">OK</button>
        </div>
      `;
      backdrop.appendChild(box);
      host.appendChild(backdrop);
    }

    const titleEl = backdrop.querySelector('#modalTitle');
    const bodyEl  = backdrop.querySelector('#modalBody');
    const okBtn   = backdrop.querySelector('#modalOk');

    function open({title='', body='', onOk}={}){
      titleEl.textContent = title;
      if (typeof body === 'string') { bodyEl.textContent = body; }
      else { bodyEl.innerHTML = ''; bodyEl.appendChild(body); }

      backdrop.hidden = false;
      backdrop.style.display = 'flex';
      document.body.style.overflow = 'hidden'; // prevent background scroll

      okBtn.onclick = () => {
        close();
        if (typeof onOk === 'function') onOk();
      };
    }
    function close(){
      backdrop.style.display = 'none';
      backdrop.hidden = true;
      document.body.style.overflow = '';
    }

    return { open, close, backdrop };
  }

  // --- Dice overlay ---
  function showDiceRoll(value, durationMs){
    const overlay = $("#diceOverlay");
    const dice = $("#dice");
    if (!overlay || !dice) return Promise.resolve();

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = prefersReduced ? 300 : (durationMs || 1000);

    // Ensure faces exist (1..6)
    if (!dice.querySelector('.face.one')){
      dice.innerHTML = `
        <div class="face one"></div>
        <div class="face two"></div>
        <div class="face three"></div>
        <div class="face four"></div>
        <div class="face five"></div>
        <div class="face six"></div>
      `;
    }

    // Start
    overlay.hidden = false;
    overlay.style.display = 'flex';
    dice.className = 'dice rolling show-1';

    let temp = null;
    if (!prefersReduced){
      temp = setInterval(()=>{
        const v = 1 + Math.floor(Math.random()*6);
        dice.className = 'dice rolling show-' + v;
      }, 120);
    }

    return new Promise(resolve=>{
      setTimeout(()=>{
        if (temp) clearInterval(temp);
        dice.className = 'dice show-' + (value || 1);
        setTimeout(()=>{
          overlay.style.display = 'none';
          overlay.hidden = true;
          resolve();
        }, 450);
      }, dur);
    });
  }

  // --- Tokens & players (minimal scaffolding that existing app.js expects) ---
  function createBoardRenderer(boardImgEl, tokensLayerEl){
    // Return an object with a placeTokens API used by app.js
    function placeTokens(players){
      // naive render: place small dots at top-left; app.js computes proper coords
      tokensLayerEl.innerHTML = '';
      players.forEach(p=>{
        const dot = document.createElement('div');
        dot.className = 'player-dot';
        dot.style.background = p.color || '#666';
        dot.style.position = 'absolute';
        dot.style.width = '.9rem';
        dot.style.height = '.9rem';
        dot.style.borderRadius = '50%';
        // app.js should set p._x, p._y (percentages) — fallback top-left
        const x = (p._x ?? 2);
        const y = (p._y ?? 2);
        dot.style.left = x + '%';
        dot.style.top = y + '%';
        tokensLayerEl.appendChild(dot);
      });
    }
    return { placeTokens };
  }

  function renderPlayers(container, players){
    container.innerHTML = '';
    players.forEach(p=>{
      const pill = document.createElement('span');
      pill.className = 'player-pill';
      pill.innerHTML = `
        <span class="player-dot" style="background:${p.color || '#666'}"></span>
        <span class="player-name" contenteditable="true" data-id="${p.id}" aria-label="Edit player name">${p.name}</span>
      `;
      container.appendChild(pill);
    });
  }

  return {
    setAlt, setSrc, setTurnIndicator,
    createModal, createBoardRenderer, renderPlayers,
    showDiceRoll
  };
})();