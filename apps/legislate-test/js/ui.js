// Step 5 — Renderer uses calibrated board.spaces with x/y percentages
window.LegislateUI = (function(){
  const byId = id => document.getElementById(id);

  function setTurnIndicator(text){
    const el = byId('turnIndicator');
    if (el) el.textContent = text;
  }

  function showDiceRoll(value, durationMs){
    const overlay = byId('diceOverlay');
    const dice    = byId('dice');
    if (!dice || !overlay) return Promise.resolve();

    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = Math.max(300, prefersReduced ? 300 : (durationMs || 1000));

    return new Promise((resolve)=>{
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
          resolve();
        }, 400);
      }, dur);
    });
  }

  function showModal({ title='Notice', html='', onOk=null }){
    const root = byId('modalRoot');
    const ttl  = byId('modalTitle');
    const body = byId('modalBody');
    const ok   = byId('modalOk');
    if (!root || !ttl || !body || !ok) return;

    ttl.textContent = title;
    body.innerHTML = html;
    root.hidden = false;
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');

    function keyBlock(e){ e.stopPropagation(); }
    root.addEventListener('keydown', keyBlock, { capture:true });

    function close(){
      root.hidden = true;
      root.style.display = 'none';
      root.setAttribute('aria-hidden', 'true');
      root.removeEventListener('keydown', keyBlock, { capture:true });
      ok.removeEventListener('click', onOkWrap);
    }
    function onOkWrap(){
      try { onOk && onOk(); } finally { close(); }
    }
    ok.addEventListener('click', onOkWrap);
  }

  function showCardModal(card){
    const title = card?.title || card?.name || 'Card';
    const body  = card?.text || card?.body || card?.description || '';
    const html = `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(body)}`;
    showModal({ title:'You landed on a card', html });
  }

  function escapeHtml(s){
    return String(s||'')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // New: renderer driven by board.spaces x/y percentages
  function createBoardRenderer(board){
    const tokensLayer = byId('tokensLayer');
    const boardImg = byId('boardImg');
    const spaces = Array.isArray(board?.spaces) ? board.spaces : [];
    let tokenMap = new Map();

    function layerRect(){
      const r = tokensLayer.getBoundingClientRect();
      const w = r.width || tokensLayer.clientWidth || 0;
      const h = r.height || tokensLayer.clientHeight || 0;
      return { width: w, height: h };
    }

    function coordForIndex(index){
      const s = spaces[index];
      if (!s){ return { x: 0, y: 0 }; }
      // x/y are percentages (0..100); support 0..1 fallback if needed
      const pctX = (s.x > 1 ? s.x : s.x * 100);
      const pctY = (s.y > 1 ? s.y : s.y * 100);
      const { width: W, height: H } = layerRect();
      return { x: (pctX/100) * W, y: (pctY/100) * H };
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
      const idx = Math.max(0, Math.min(position, spaces.length - 1));
      const p = coordForIndex(idx);
      const el = ensureToken(player);

      // Offset clumping
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
      players.forEach(p => placeToken(p, p.position || 0));
    }

    // Re-position tokens on resize/orientation changes
    const ro = ('ResizeObserver' in window) ? new ResizeObserver(()=>{
      // Re-render without clearing to avoid flicker
      (window.requestAnimationFrame||setTimeout)(()=>{
        Array.from(tokenMap.keys()).forEach(id=>{
          const p = { id, position: 0 };
        });
      },0);
    }) : null;
    if (ro) ro.observe(tokensLayer);
    window.addEventListener('resize', ()=>{ renderAll(Array.from(tokenMap.keys()).map(id=>({id, position:0}))); });
    window.addEventListener('orientationchange', ()=>{ renderAll(Array.from(tokenMap.keys()).map(id=>({id, position:0}))); });

    return { placeToken, renderAll, clearTokens };
  }

  return { setTurnIndicator, showDiceRoll, showCardModal, createBoardRenderer };
})();