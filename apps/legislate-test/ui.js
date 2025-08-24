
window.LegislateUI = (function(){
  function setAlt(i,a){ i.setAttribute('alt', a||''); }
  function setSrc(i,s){ i.src = s; }
  function setTurnIndicator(el,name){ const txt = `${name}'s turn`; el.textContent = txt.replace(/\s+'s/, "'s"); }

  function createModal(rootId){
    const root = document.getElementById(rootId);
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const ok = document.getElementById('modalOk');
    let resolver = null;
    ok.addEventListener('click', ()=>{ close(); resolver && resolver(); });
    function open(opts){
      title.textContent = (opts && opts.title) || 'Notice';
      body.textContent = (opts && opts.body) || '';
      root.hidden = false; root.setAttribute('aria-hidden','false'); ok.focus();
      return new Promise(res=>{ resolver = res; });
    }
    function close(){ root.hidden = true; root.setAttribute('aria-hidden','true'); resolver = null; }
    return { open, close };
  }

  function createBoardRenderer(imgEl, tokensLayer, board){
    const Config = { tokenBaseFactor: 0.018, tokenMin: 8, tokenMax: 18, overlapRadiusFactor: 1.2 };
    function measure(){ const r = imgEl.getBoundingClientRect(); return { w: r.width, h: r.height }; }
    function tokenRadius(n){ const w = measure().w; const density = [1,1,1,0.95,0.9,0.85,0.8][n]||0.8; const r = Math.round(w*Config.tokenBaseFactor*density); return Math.max(Config.tokenMin, Math.min(Config.tokenMax, r)); }
    function placeTokens(players){
      const m = measure(), w = m.w, h = m.h; const r = tokenRadius(players.length);
      tokensLayer.innerHTML = '';
      const by = new Map();
      for (const p of players){ const k = p.position; if(!by.has(k)) by.set(k, []); by.get(k).push(p); }
      for (const [idx, group] of by.entries()){
        const space = board.spaces.find(s=>s.index===Number(idx)); if(!space) continue;
        const cx = (space.x/100)*w, cy = (space.y/100)*h;
        const count = group.length;
        for (let i=0;i<count;i++){
          const p = group[i];
          const angle = (Math.PI*2*i)/Math.max(1,count);
          const rad = r*Config.overlapRadiusFactor*(count>1?1:0);
          const x = cx + Math.cos(angle)*rad, y = cy + Math.sin(angle)*rad;
          const div = document.createElement('div');
          div.className = 'token';
          div.style.cssText = `position:absolute;transform:translate(-50%,-50%);left:${x}px;top:${y}px;width:${r*2}px;height:${r*2}px;border-radius:50%;border:2px solid #0b0c0c;background:${p.color}`;
          div.title = `${p.name} @ ${idx}`;
          tokensLayer.appendChild(div);
        }
      }
    }
    window.addEventListener('resize', ()=>{ tokensLayer.innerHTML = ''; });
    return { placeTokens, tokenRadius };
  }

  function renderPlayers(container, players, { editable=false, locked=false, onEditName=()=>{} } = {}){
    container.innerHTML = '';
    for (const p of players){
      const pill = document.createElement('div'); pill.className = 'player-pill';
      const dot = document.createElement('span'); dot.className = 'player-dot'; dot.style.background = p.color; pill.appendChild(dot);
      if (editable){
        const input = document.createElement('input');
        input.type = 'text'; input.value = p.name; input.className = 'player-name';
        input.size = Math.max(8, Math.min(24, p.name.length));
        input.setAttribute('aria-label', `Edit name for ${p.name}`);
        if (locked) input.setAttribute('disabled', 'disabled');
        input.addEventListener('input', ()=>{
          onEditName(p.id, input.value);
          input.size = Math.max(8, Math.min(24, (input.value||'').length || 1));
        });
        input.addEventListener('keydown', (e)=>{
          if (e.key === ' ' || e.key === 'Enter'){ e.stopPropagation(); }
        });
        pill.appendChild(input);
      } else {
        const span = document.createElement('span'); span.textContent = p.name; pill.appendChild(span);
      }
      container.appendChild(pill);
    }
  }

  return { setAlt, setSrc, setTurnIndicator, createModal, createBoardRenderer, renderPlayers, showDiceRoll };
})();


  function showDiceRoll(value, durationMs){
    return new Promise((resolve)=>{
      const overlay = document.getElementById('diceOverlay');
      const dice = document.getElementById('dice');
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dur = prefersReduced ? 300 : (durationMs||1600);
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden','false');
      dice.className = 'dice rolling';
      const tempTimer = setInterval(()=>{
        const r = 1 + Math.floor(Math.random()*6);
        dice.className = 'dice rolling show-' + r;
      }, 120);
      setTimeout(()=>{
        clearInterval(tempTimer);
        dice.className = 'dice show-' + value;
        setTimeout(()=>{
          overlay.hidden = true;
          overlay.setAttribute('aria-hidden','true');
          resolve();
        }, 450);
      }, dur);
    });
  }

  return { setAlt, setSrc, setTurnIndicator, createModal, createBoardRenderer, renderPlayers, showDiceRoll };
