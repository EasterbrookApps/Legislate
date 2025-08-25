// ui.js — DOM rendering, modals, dice overlay, debug hooks
(function(){
  const SEL = {
    boardImg: '#boardImg',
    tokensLayer: '#tokensLayer',
    turnIndicator: '#turnIndicator',
    playerCount: '#playerCount',
    rollBtn: '#rollBtn',
    restartBtn: '#restartBtn',
    modalRoot: '#modalRoot',
    diceOverlay: '#diceOverlay',
    dice: '#dice'
  };

  function $(sel){ return document.querySelector(sel); }

  function emitDBG(kind, payload){
    try{ window.DBG && window.DBG.log && window.DBG.log(kind, payload); }catch(e){}
  }

  function setTurnIndicator(txt){ const el = $(SEL.turnIndicator); if (el) el.textContent = txt; }

  function createModal(){
    const root = $(SEL.modalRoot);
    const title = root.querySelector('#modalTitle');
    const body = root.querySelector('#modalBody');
    const okBtn = root.querySelector('#modalOk');
    function open({ titleText, bodyHtml, onOk }){
      title.textContent = titleText || 'Notice';
      body.innerHTML = bodyHtml || '';
      root.hidden = false;
      root.setAttribute('aria-hidden','false');
      okBtn.onclick = () => {
        try{ onOk && onOk(); }finally{
          root.hidden = true;
          root.setAttribute('aria-hidden','true');
        }
      };
    }
    function close(){
      root.hidden = true;
      root.setAttribute('aria-hidden','true');
    }
    return { open, close };
  }

  async function showDiceRoll(value, durationMs){
    const overlay = $(SEL.diceOverlay);
    const dice = $(SEL.dice);
    overlay.style.display = 'flex';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden','false');
    dice.className = 'dice rolling show-'+value;
    emitDBG('OVERLAY', describeOverlay(overlay));
    await new Promise(res => setTimeout(res, durationMs || 800));
    dice.className = 'dice show-'+value;
    await new Promise(res => setTimeout(res, 450));
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden','true');
    overlay.style.display = 'none';
    emitDBG('OVERLAY', describeOverlay(overlay));
  }

  function describeOverlay(overlay){
    const cs = getComputedStyle(overlay);
    return {
      hidden: overlay.hidden,
      display: cs.display,
      vis: cs.visibility,
      z: cs.zIndex || 'auto',
      pe: cs.pointerEvents || 'auto'
    };
  }

  function createBoardRenderer(board, engine){
    const layer = $(SEL.tokensLayer);
    const img = $(SEL.boardImg);
    layer.innerHTML = '';

    // one DOM node per player
    const nodes = new Map();

    function ensureNode(p){
      if(nodes.has(p.id)) return nodes.get(p.id);
      const el = document.createElement('div');
      el.className = 'player-dot';
      el.style.background = p.color;
      el.setAttribute('aria-label', p.name);
      el.style.position = 'absolute';
      el.style.width = '1rem'; el.style.height = '1rem';
      el.style.borderRadius = '50%';
      el.style.transform = 'translate(-50%, -50%)'; // center on point
      layer.appendChild(el);
      nodes.set(p.id, el);
      return el;
    }

    function place(p){
      const space = board.spaces.find(s => s.index === p.position);
      if (!space) return;
      const x = (space.x/100) * img.clientWidth;
      const y = (space.y/100) * img.clientHeight;
      const el = ensureNode(p);
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
    }

    function drawAll(){
      (engine.state.players||[]).forEach(place);
      emitDBG('TOKENS', { summary: summarize() });
    }

    function summarize(){
      const map = new Map();
      (engine.state.players||[]).forEach(p => map.set(p.position, (map.get(p.position)||0)+1));
      return Array.from(map.entries()).map(([index,count]) => ({ index, count }));
    }

    // wire to engine
    engine.bus.on('TURN_BEGIN', ({playerId,index}) => {
      const p = engine.state.players[index];
      setTurnIndicator(`${p.name}’s turn`);
      drawAll();
      emitDBG('TURN_BEGIN', { playerId, index });
    });
    engine.bus.on('MOVE_STEP', ev => {
      const p = engine.state.players.find(p=>p.id===ev.playerId);
      place(p);
      emitDBG('MOVE_STEP', ev);
    });
    engine.bus.on('LANDED', ev => emitDBG('LANDED', ev));

    return { drawAll, place };
  }

  window.LegislateUI = { createModal, createBoardRenderer, showDiceRoll, setTurnIndicator };
})();
