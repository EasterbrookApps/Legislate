// multiplayer-app.js — thin socket client reusing stable UI
(function(){
  const $ = (id)=>document.getElementById(id);
  const log = (m)=>{ const pre=$('dbg-log'); if(pre) pre.textContent += m+'\n'; console.log(m); };

  let ws = null;
  let board = null;
  const base = '../legislate/assets/packs/uk-parliament';

  // Token helpers
  const tokensLayer = $('tokensLayer');
  const tokenEls = new Map();
  function ensureToken(id, color){
    if (tokenEls.has(id)) return tokenEls.get(id);
    const el = document.createElement('div');
    el.className = 'token';
    el.dataset.id = id;
    el.style.background = color || '#000';
    tokensLayer.appendChild(el);
    tokenEls.set(id, el);
    return el;
  }
  function positionToken(el, posIndex){
    const space = board?.spaces?.find(s=>s.index===posIndex);
    if (!space) return;
    el.style.left = space.x + '%';
    el.style.top  = space.y + '%';
  }

  function renderPlayers(state){
    const root = $('playersSection'); if (!root) return;
    root.innerHTML = '';
    state.players.forEach((p,i)=>{
      const pill = document.createElement('div'); pill.className='player-pill';
      const dot  = document.createElement('div'); dot.className='player-dot'; dot.style.background=p.color;
      const name = document.createElement('span'); name.className='player-name'; name.contentEditable='true'; name.textContent=p.name;
      name.addEventListener('blur', ()=>{
        const v = (name.textContent||'').trim(); if(!v) return;
        ws?.send(JSON.stringify({ type:'RENAME', index:i, name:v }));
      });
      pill.appendChild(dot); pill.appendChild(name);
      root.appendChild(pill);
    });
  }

  // Single board renderer instance
  const boardUI = (window.LegislateUI && window.LegislateUI.createBoardRenderer)
    ? window.LegislateUI.createBoardRenderer({ board: null })
    : { render: ()=>{} };

  function handleServerEvent(msg, stateRef){
    const { type, payload } = msg;

    if (type === 'TURN_BEGIN') {
      const p = stateRef.players[payload.index];
      $('turnIndicator').textContent = `${p.name}'s turn`;
      stateRef.players.forEach(pl=>{
        const el = ensureToken(pl.id, pl.color);
        positionToken(el, pl.position);
      });
      boardUI.render(stateRef.players);
      return;
    }

    if (type === 'DICE_ROLL') {
      window.LegislateUI.showDiceRoll(Number(payload.value) || 1);
      return;
    }

    if (type === 'MOVE_STEP') {
      const p = stateRef.players.find(x=>x.id===payload.playerId) || { color:'#000' };
      const el = ensureToken(payload.playerId, p.color);
      positionToken(el, payload.position);
      if (p) p.position = payload.position;
      boardUI.render(stateRef.players);
      return;
    }

    if (type === 'CARD_DRAWN') {
      (async () => {
        await window.LegislateUI.waitForDice();
        const modal = window.LegislateUI.createModal();
        const DECK_LABELS = {
          early: "Early Stages",
          commons: "House of Commons",
          implementation: "Implementation",
          lords: "House of Lords",
          pingpong: "Ping Pong",
        };
        if (!payload.card) {
          await modal.open({ title: 'No card', body: `<p>The ${DECK_LABELS[payload.deck] || payload.deck} deck is empty.</p>` });
          ws?.send(JSON.stringify({ type:'RESOLVE_CARD' }));
          return;
        }
        await modal.open({
          title: payload.card.title || (DECK_LABELS[payload.deck] || payload.deck),
          body: `<p>${(payload.card.text||'').trim()}</p>`
        });
        ws?.send(JSON.stringify({ type:'RESOLVE_CARD' }));
      })();
      return;
    }

    if (type === 'CARD_APPLIED') {
      const p = stateRef.players.find(x=>x.id===payload.playerId);
      if (p) {
        p.position = payload.position ?? p.position;
        const el = ensureToken(p.id, p.color);
        positionToken(el, p.position);
        boardUI.render(stateRef.players);
        if (payload.card && typeof payload.card.effect === 'string') {
          const [effect] = payload.card.effect.split(':');
          if (effect === 'extra_roll') window.LegislateUI.toast(`${p.name} gets an extra roll`, { kind:'success' });
          if (effect === 'miss_turn') window.LegislateUI.toast(`${p.name} will miss their next turn`, { kind:'info' });
        }
      }
      return;
    }

    if (type === 'MISS_TURN') {
      window.LegislateUI.toast(`${payload.name} misses a turn`, { kind:'info' });
      return;
    }

    if (type === 'EFFECT_GOTO') {
      window.LegislateUI.toast(`Jump to ${payload.index}`, { kind:'info', ttl:1800 });
      return;
    }

    if (type === 'GAME_END') {
      window.LegislateUI.toast(`${payload.name} reached the end!`, { kind:'success', ttl:2600 });
      return;
    }

    if (type === 'PLAYER_RENAMED') {
      stateRef.players[payload.index].name = payload.name;
      renderPlayers(stateRef);
      return;
    }
  }

  async function connectAndJoin(roomCode, playerCount){
    board = await fetch(`${base}/board.json`).then(r=>r.json());
    if (boardUI && boardUI.setBoard) boardUI.setBoard(board);

    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/game';
    ws = new WebSocket(wsUrl);

    let engineState = null;

    ws.addEventListener('open', ()=>{
      ws.send(JSON.stringify({ type:'JOIN', roomCode, playerCount: Number(playerCount)||4 }));
      $('turnIndicator').textContent = `Joined room ${roomCode}`;
    });

    ws.addEventListener('message', (ev)=>{
      const msg = JSON.parse(ev.data);
      if (msg.type === 'JOIN_OK') {
        engineState = msg.payload.state;
        renderPlayers(engineState);
        engineState.players.forEach(pl=>{
          const el = ensureToken(pl.id, pl.color);
          positionToken(el, pl.position);
        });
        return;
      }
      if (!engineState) return;
      handleServerEvent(msg, engineState);
    });

    ws.addEventListener('close', ()=>{ $('turnIndicator').textContent = 'Disconnected'; });
  }

  $('joinBtn').addEventListener('click', ()=>{
    const code = ($('#roomCode').value || '').trim().toUpperCase();
    if (!code) return;
    connectAndJoin(code, $('#playerCount').value);
  });

  $('rollBtn').addEventListener('click', ()=>{ ws?.send(JSON.stringify({ type:'ROLL' })); });
  $('restartBtn').addEventListener('click', ()=>{ ws?.send(JSON.stringify({ type:'RESET' })); });
})();