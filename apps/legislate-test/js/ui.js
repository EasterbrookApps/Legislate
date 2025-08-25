// Step 2 — UI token rendering & simple board path
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

  function createBoardRenderer(totalSpaces){
    const tokensLayer = byId('tokensLayer');
    const boardImg = byId('boardImg');
    const tokenMap = new Map(); // playerId -> el
    let path = [];

    function computePath(n){
      // Perimeter path around the board image bounds (clockwise)
      const rect = boardImg.getBoundingClientRect();
      const W = rect.width || boardImg.clientWidth || 800;
      const H = rect.height || boardImg.clientHeight || 600;
      const inset = Math.floor(Math.min(W,H) * 0.06);
      const left = inset, top = inset, right = W - inset, bottom = H - inset;

      // Build four edges, approx equal distribution
      const perim = 2*((right-left) + (bottom-top));
      n = Math.max(10, n);
      const step = perim / n;

      const pts = [];
      let x = left, y = top, dir = 0; // 0:right,1:down,2:left,3:up
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

          if (move <= 0){
            // turn corner
            dir = (dir + 1) % 4;
            continue;
          }

          if (dir===0) x += move;
          else if (dir===1) y += move;
          else if (dir===2) x -= move;
          else y -= move;

          remaining -= move;

          if (remaining === 0){
            push();
            remaining = step;
            break;
          }
        }
      }
      return pts;
    }

    function ensureToken(player){
      let el = tokenMap.get(player.id);
      if (!el){
        el = document.createElement('div');
        el.className = 'token';
        el.setAttribute('data-player', player.id);
        // simple color palette
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
      if (!path.length) path = computePath(totalSpaces);
      const idx = Math.max(0, Math.min(position, path.length - 1));
      const p = path[idx];

      const el = ensureToken(player);
      const layerRect = tokensLayer.getBoundingClientRect();
      const bx = p.x - layerRect.left;
      const by = p.y - layerRect.top;

      // slight offset if multiple tokens on same space
      const siblingsSame = Array.from(tokenMap.values()).filter(e => {
        const tx = parseFloat(e.style.getPropertyValue('--tx') || '0');
        const ty = parseFloat(e.style.getPropertyValue('--ty') || '0');
        return Math.abs(tx - bx) < 2 && Math.abs(ty - by) < 2;
      }).length;
      const offset = (siblingsSame % 3) * 6;

      el.style.setProperty('--tx', bx + (siblingsSame? offset:0));
      el.style.setProperty('--ty', by + (siblingsSame? offset:0));
      el.style.transform = `translate3d(${bx + (siblingsSame? offset:0)}px, ${by + (siblingsSame? offset:0)}px, 0)`;
    }

    function renderAll(players){
      if (!players || !players.length) return;
      if (!path.length) path = computePath(totalSpaces);
      players.forEach(p => placeToken(p, p.position || 0));
    }

    function relayout(){
      path = []; // force recompute
      // Re-place all tokens
      const els = Array.from(tokenMap.keys());
      els.forEach(id => {
        const player = { id, position: parseInt(byId('turnIndicator').getAttribute('data-pos-'+id) || '0',10) };
        // we don't store per-player pos here; app will re-render on demand in practice
      });
    }

    window.addEventListener('resize', ()=>{ path=[]; });
    window.addEventListener('orientationchange', ()=>{ path=[]; });

    return { placeToken, renderAll, relayout };
  }

  return { setTurnIndicator, showDiceRoll, createBoardRenderer };
})();