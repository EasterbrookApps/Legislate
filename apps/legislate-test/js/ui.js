// ui.js
(function(){
  const $ = (id) => document.getElementById(id);

  function setTurnIndicator(text){
    $('turnIndicator').textContent = text;
  }

  function renderPlayers(players, board){
    const wrap = $('playersSection');
    wrap.innerHTML = '';
    players.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'player-row';

      const swatch = document.createElement('span');
      swatch.className = 'player-swatch';
      swatch.style.backgroundColor = p.color;
      row.appendChild(swatch);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = p.name;
      input.dataset.id = p.id;
      row.appendChild(input);

      wrap.appendChild(row);
    });
  }

  function createBoardRenderer(board){
    const layer = $('tokensLayer');
    const coordsFor = (i) => {
      const space = board.spaces.find(s=>s.index===i);
      return { x: space?.x || 0, y: space?.y || 0 };
    };

    function ensureToken(id,color){
      let el = layer.querySelector(`[data-id="${id}"]`);
      if(!el){
        el = document.createElement('div');
        el.className = 'token';
        el.dataset.id = id;
        el.style.backgroundColor = color;
        layer.appendChild(el);
      }
      return el;
    }

    function render(players){
      // Group players by square
      const groups = new Map();
      players.forEach(p=>{
        const key = String(p.position || 0);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });

      const TAU = Math.PI * 2;
      const RADIUS_PCT = 3; // spread radius in % of board size

      for (const [key, group] of groups.entries()){
        const posIndex = Number(key);
        const { x, y } = coordsFor(posIndex);

        if (group.length === 1){
          const p = group[0];
          const t = ensureToken(p.id, p.color);
          t.style.left = x + '%';
          t.style.top  = y + '%';
          continue;
        }

        const n = group.length;
        group.forEach((p,i)=>{
          const angle = (i / n) * TAU;
          const ox = Math.cos(angle) * RADIUS_PCT;
          const oy = Math.sin(angle) * RADIUS_PCT;
          const t = ensureToken(p.id, p.color);
          t.style.left = (x + ox) + '%';
          t.style.top  = (y + oy) + '%';
        });
      }
    }

    return { render };
  }

  // --- Modal (promise-based OK) ---
  function createModal(){
    const root = $('modalRoot');
    function open({ title, body, actions }){
      return new Promise((resolve)=>{
        root.innerHTML = '';
        const back = document.createElement('div');
        back.className = 'modal-backdrop';
        back.style.display = 'flex';

        const box = document.createElement('div');
        box.className = 'modal';

        const h = document.createElement('h3');
        h.textContent = title || 'Card';

        const b = document.createElement('div');
        b.innerHTML = body || '';

        const act = document.createElement('div');
        act.className = 'modal-actions';

        (actions||[{label:'OK',value:true}]).forEach(a=>{
          const btn = document.createElement('button');
          btn.textContent = a.label;
          btn.className = 'button';
          btn.onclick = ()=>{ root.innerHTML=''; resolve(a.value); };
          act.appendChild(btn);
        });

        box.appendChild(h);
        box.appendChild(b);
        box.appendChild(act);
        back.appendChild(box);
        root.appendChild(back);
      });
    }
    return { open };
  }

  function showDiceRoll(value){
    const overlay = $('diceOverlay');
    const dice = $('dice');
    overlay.hidden = false;
    dice.className = 'dice';
    dice.classList.add(['','one','two','three','four','five','six'][value]);
    setTimeout(()=>{ overlay.hidden = true; }, 2500);
  }

  function toast(msg){
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 2000);
  }

  // Export everything
  window.LegislateUI = {
    setTurnIndicator,
    renderPlayers,
    createBoardRenderer,
    createModal,
    showDiceRoll,
    toast,
  };
})();