// ui.js — board renderer, dice, modal, names
window.LegislateUI = (function(){
  const $ = (id)=>document.getElementById(id);

  function setTurnIndicator(txt){
    const el=$('turnIndicator'); if(el) el.textContent = txt;
  }

  function renderPlayers(players){
    const root = $('playersSection'); if(!root) return;
    root.innerHTML = '';
    players.forEach(p=>{
      const pill = document.createElement('span');
      pill.className = 'player-pill';
      const dot = document.createElement('span');
      dot.className = 'player-dot'; dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'player-name'; name.contentEditable = 'true'; name.textContent = p.name;
      name.addEventListener('input', ()=>{ p.name = name.textContent.trim() || p.name; });
      pill.append(dot, name);
      root.appendChild(pill);
    });
  }

  function placeToken(el, xPct, yPct){
    el.style.left = xPct + '%';
    el.style.top = yPct + '%';
  }

  function createBoardRenderer({ board }){
    const layer = $('tokensLayer');
    const tokens = new Map();
    function ensureToken(pid, color){
      let t = tokens.get(pid);
      if(!t){
        t = document.createElement('div');
        t.className = 'token';
        t.setAttribute('aria-hidden','true');
        layer.appendChild(t);
        tokens.set(pid, t);
      }
      t.style.background = color;
      return t;
    }
    function coordsFor(index){
      const sp = board.spaces.find(s=>s.index===index);
      if(!sp) return {x:0,y:0};
      return { x: sp.x, y: sp.y };
    }
    function render(players){
      players.forEach(p=>{
        const t = ensureToken(p.id, p.color);
        const {x,y} = coordsFor(p.position||0);
        placeToken(t, x, y);
      });
    }
    return { render };
  }

  // --- Modal (promise-based) ---
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
        const h = document.createElement('h3'); h.textContent = title || 'Card';
        const b = document.createElement('div'); b.innerHTML = body || '';
        const act = document.createElement('div'); act.className = 'modal-actions';
        const ok = document.createElement('button'); ok.className='button'; ok.textContent = (actions?.[0]?.label)||'OK';
        ok.addEventListener('click', ()=>{ back.remove(); resolve(); });
        act.appendChild(ok);
        box.append(h,b,act);
        back.appendChild(box);
        root.appendChild(back);
      });
    }
    return { open };
  }

  // --- Dice overlay returns a Promise so callers can wait for it to finish ---
  let diceTimer = null;
  function showDiceRoll(value, ms=900){
    const overlay = $('diceOverlay');
    const dice = $('dice');
    if(!overlay || !dice) return Promise.resolve(); // nothing to do

    return new Promise((resolve)=>{
      overlay.hidden = false;
      dice.className = 'dice rolling show-'+(value||1);
      clearTimeout(diceTimer);
      // roll animation
      diceTimer = setTimeout(()=>{
        dice.className = 'dice show-'+(value||1);
        // short settle, then hide
        setTimeout(()=>{
          overlay.hidden = true;
          resolve(); // signal to app.js that dice is fully done
        }, 250);
      }, ms);
    });
  }

  return { setTurnIndicator, createBoardRenderer, renderPlayers, createModal, showDiceRoll };
})();