// Step 3 — UI helpers: roll acknowledgement modal + existing renderer
window.LegislateUI = (function(){
  const byId = id => document.getElementById(id);

  function setTurnIndicator(text){
    const el = byId('turnIndicator');
    if (el) el.textContent = text;
  }

  function showDiceRoll(value, durationMs){
    const overlay = byId('diceOverlay');
    const dice    = byId('dice');
    if (!dice || !overlay) return;
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = Math.max(300, prefersReduced ? 300 : (durationMs || 1000));

    overlay.hidden = false;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden','false');

    dice.className = 'dice rolling';
    const anim = setInterval(()=>{
      const r = 1 + Math.floor(Math.random()*6);
      dice.className = 'dice rolling show-' + r;
    }, 120);

    setTimeout(()=>{
      clearInterval(anim);
      dice.className = 'dice show-' + (value || 1);
      setTimeout(()=>{
        overlay.hidden = true;
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden','true');
      }, 400);
    }, dur);
  }

  // --- Modal helpers ---
  function showRollModal(text){
    const root = byId('modalRoot');
    const title = byId('modalTitle');
    const body = byId('modalBody');
    const ok = byId('modalOk');
    if (!root || !title || !body || !ok) return;

    title.textContent = 'Dice Roll';
    body.textContent = text;
    root.hidden = false;
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');

    // Prevent keyboard shortcuts while modal is open
    function keyBlock(e){ e.stopPropagation(); }
    root.addEventListener('keydown', keyBlock, { capture:true });

    function close(){
      root.hidden = true;
      root.style.display = 'none';
      root.setAttribute('aria-hidden', 'true');
      root.removeEventListener('keydown', keyBlock, { capture:true });
      ok.removeEventListener('click', close);
    }
    ok.addEventListener('click', close);
  }

  function dismissModal(){
    const root = byId('modalRoot');
    if (!root) return;
    root.hidden = true;
    root.style.display = 'none';
    root.setAttribute('aria-hidden','true');
  }

  // --- Board renderer (same as Step 2.2) ---
  function createBoardRenderer(totalSpaces){
    const tokensLayer = byId('tokensLayer');
    const boardImg = byId('boardImg');
    let tokenMap = new Map();
    let path = [];
    let lastW = 0, lastH = 0;

    function layerRect(){
      const r = tokensLayer.getBoundingClientRect();
      return { width: r.width || tokensLayer.clientWidth, height: r.height || tokensLayer.clientHeight };
    }

    function computePath(n){
      const { width: W, height: H } = layerRect();
      lastW = W; lastH = H;
      const inset = Math.floor(Math.min(W,H) * 0.06);
      const left = inset, top = inset, right = W - inset, bottom = H - inset;

      const perim = 2*((right-left) + (bottom-top));
      n = Math.max(10, n);
      const step = perim / n;

      const pts = [];
      let x = left, y = top, dir = 0;
      let remaining = step;
      function push(){ pts.push({x, y}); }
      push();
      for(let i=1;i<n;i++){
        while (remaining > 0){
          let move;
          if (dir===0) move = Math.min(remaining, right - x);
          else if (dir===1) move = Math.min(remaining, bottom - y);
          else if (dir===2) move = Math.min(remaining, x - left);
          else move = Math.min(remaining, y - top);

          if (move <= 0){ dir = (dir + 1) % 4; continue; }

          if (dir===0) x += move;
          else if (dir===1) y += move;
          else if (dir===2) x -= move;
          else y -= move;

          remaining -= move;

          if (remaining === 0){ push(); remaining = step; break; }
        }
      }
      return pts;
    }

    function ensurePathUpToDate(){
      const { width: W, height: H } = layerRect();
      if (!path.length || Math.abs(W-lastW)>0.5 || Math.abs(H-lastH)>0.5){
        path = computePath(totalSpaces);
      }
    }

    function clearTokens(){
      if (tokensLayer) tokensLayer.innerHTML = '';
      tokenMap = new Map();
    }

    function ensureToken(player){
      let el = tokenMap.get(player.id);
      if (!el){
        el = document.createElement('div');
        el.className = 'token';
        el.dataset.player = player.id;
        const palette = ['#d4351c','#1d70b8','#00703c','#6f72af','#b58840','#912b88'];
        el.style.background = palette[ (parseInt(player.id.slice(1),10)-1) % palette.length ];
        tokensLayer.appendChild(el);
        tokenMap.set(player.id, el);
      }
      return el;
    }

    function placeToken(player, position){
      if (!boardImg.complete){
        boardImg.addEventListener('load', ()=> placeToken(player, position), { once:true });
        return;
      }
      ensurePathUpToDate();
      const idx = Math.max(0, Math.min(position, path.length - 1));
      const p = path[idx];

      const el = ensureToken(player);

      // Offset if multiple tokens land on same spot
      const siblingsSame = Array.from(tokenMap.values()).filter(e => {
        const tx = parseFloat(e.style.getPropertyValue('--tx') || '0');
        const ty = parseFloat(e.style.getPropertyValue('--ty') || '0');
        return Math.abs(tx - p.x) < 2 && Math.abs(ty - p.y) < 2;
      }).length;
      const offset = (siblingsSame % 3) * 6;

      const bx = p.x + (siblingsSame? offset:0);
      const by = p.y + (siblingsSame? offset:0);

      el.style.setProperty('--tx', bx);
      el.style.setProperty('--ty', by);
      el.style.transform = `translate3d(${bx}px, ${by}px, 0)`;
    }

    function renderAll(players){
      if (!players || !players.length) return;
      clearTokens();
      ensurePathUpToDate();
      players.forEach(p => placeToken(p, p.position || 0));
    }

    const ro = ('ResizeObserver' in window) ? new ResizeObserver(()=>{ path = []; }) : null;
    if (ro) ro.observe(tokensLayer);
    window.addEventListener('resize', ()=>{ path=[]; });
    window.addEventListener('orientationchange', ()=>{ path=[]; });

    return { placeToken, renderAll, clearTokens };
  }

  return { setTurnIndicator, showDiceRoll, showRollModal, dismissModal, createBoardRenderer };
})(); 