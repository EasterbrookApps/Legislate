// ui.js — players list with inline editing, board tokens, modal, dice, toast
window.LegislateUI = (function () {
  const $ = (id)=>document.getElementById(id);

  function setTurnIndicator(name){
    const el = $('turnIndicator');
    const n = (name||'Player').toString().trim();
    if (el) el.textContent = n;
  }

  // --- Players pill list (inline editing, non-blocking)
  function renderPlayers(players){
    const root = $('playersSection');
    if (!root) return;
    root.innerHTML = '';
    players.forEach(p=>{
      const pill = document.createElement('span');
      pill.className = 'player-pill';

      const dot = document.createElement('span');
      dot.className = 'player-dot';
      dot.style.background = p.color;

      const name = document.createElement('span');
      name.className = 'player-name';
      name.contentEditable = 'true';
      name.spellcheck = false;
      name.textContent = p.name;

      // update name on input (same object reference from engine.state.players)
      name.addEventListener('input', ()=>{
        const v = name.textContent.trim();
        if (v) p.name = v;
      });

      pill.append(dot, name);
      root.appendChild(pill);
    });
  }

  // --- Board tokens renderer
  function createBoardRenderer({ board }){
    const layer = $('tokensLayer');
    const tokens = new Map();

    function ensureToken(pid, color){
      let t = tokens.get(pid);
      if (!t){
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
      return sp ? { x: sp.x, y: sp.y } : { x: 0, y: 0 };
    }

    function render(players){
      // --- FIX: remove tokens for players that no longer exist
      const liveIds = new Set(players.map(p=>p.id));
      for (const [pid, el] of Array.from(tokens.entries())){
        if (!liveIds.has(pid)){
          el.remove();
          tokens.delete(pid);
        }
      }

      // Ensure/update tokens for current players
      players.forEach(p=>{
        const t = ensureToken(p.id, p.color);
        const {x,y} = coordsFor(p.position||0);
        t.style.left = x + '%';
        t.style.top  = y + '%';
      });
    }

    return { render };
  }

  // --- Modal (promise-based OK)
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

        const ok = document.createElement('button');
        ok.className = 'button';
        ok.textContent = (actions?.[0]?.label) || 'OK';
        ok.addEventListener('click', ()=>{ back.remove(); resolve(); });

        act.appendChild(ok);
        box.append(h,b,act);
        back.appendChild(box);
        root.appendChild(back);
      });
    }
    return { open };
  }

  // --- Dice overlay returns a Promise so callers can await completion
  let diceTimer = null;
  function showDiceRoll(value, ms=900){
    const overlay = $('diceOverlay');
    const dice = $('dice');
    if(!overlay || !dice) return Promise.resolve();

    return new Promise((resolve)=>{
      overlay.hidden = false;
      dice.className = 'dice rolling show-'+(value||1);
      clearTimeout(diceTimer);
      diceTimer = setTimeout(()=>{
        dice.className = 'dice show-'+(value||1);
        setTimeout(()=>{ overlay.hidden = true; resolve(); }, 250);
      }, ms);
    });
  }

  // --- Non-blocking toast (inline styles; no CSS edits)
  function ensureToastRoot(){
    let root = $('toastRoot');
    if (!root){
      root = document.createElement('div');
      root.id = 'toastRoot';
      root.setAttribute('aria-live','polite');
      root.style.position = 'fixed';
      root.style.left = '50%';
      root.style.bottom = '16px';
      root.style.transform = 'translateX(-50%)';
      root.style.zIndex = '1600';
      root.style.pointerEvents = 'none';
      document.body.appendChild(root);
    }
    return root;
  }
  function toast(message, ms=1800){
    const root = ensureToastRoot();
    const el = document.createElement('div');
    el.textContent = message;
    el.style.pointerEvents = 'none';
    el.style.background = 'rgba(0,0,0,0.85)';
    el.style.color = '#fff';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '999px';
    el.style.marginTop = '6px';
    el.style.fontSize = '14px';
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,.35)';
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s ease, transform .2s ease';
    el.style.transform = 'translateY(4px)';
    root.appendChild(el);
    requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(4px)'; setTimeout(()=>el.remove(), 220); }, ms);
  }

  return { setTurnIndicator, renderPlayers, createBoardRenderer, createModal, showDiceRoll, toast };
})();
