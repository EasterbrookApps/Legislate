// engine.js — v1.4 (rotation + effects integrated)
let Engine = { busy:false, waiting:false, pending:null };
Engine.isBusy = function(){ return Engine.busy || Engine.waiting; };

Engine.afterRoll = function(n){
  if(Engine.isBusy()) return;
  GameState.started = true;
  renderPlayersUI(); // hides add controls once game starts
  const p = GameState.players[GameState.activeIdx];
  moveSteps(p, n, ()=>{
    const sp = GameState.board?.spaces?.[p.index];
    const deck = sp && sp.deck;
    if(deck && window.Cards && Cards.decks && Cards.decks[deck]){
      const card = drawFrom(deck);
      if(card){
        Engine.waiting = true;
        Engine.pending = { pid: p.id, effect: String(card.effect||'').trim() };
        showCard(deck, card);
        return;
      }
    }
    finalizeTurn();
  });
};

Engine.onCardAcknowledged = function(){
  if(!Engine.pending){ finalizeTurn(); return; }
  const { pid, effect } = Engine.pending;
  Engine.pending = null;
  applyEffect(pid, effect, ()=> finalizeTurn());
};

function moveSteps(player, steps, done){
  Engine.busy = true;
  const per = steps >= 0 ? 1 : -1;
  let remaining = Math.abs(steps);
  (function step(){
    if(remaining <= 0){
      Engine.busy = false;
      renderTokens();
      ensureTokenInView(player);
      done && done();
      return;
    }
    const nextIdx = clamp(player.index + per, 0, lastIndex());
    player.index = nextIdx;
    renderTokens();
    remaining -= 1;
    setTimeout(step, 250);
  })();
}

function applyEffect(playerId, effect, cb){
  const p = GameState.players.find(x=>x.id===playerId);
  if(!p){ cb && cb(); return; }
  Engine.waiting = false;
  const e = String(effect||'').trim().toLowerCase();
  if(!e){ cb && cb(); return; }

  if(e === 'miss_turn'){ p.skipNext = true; cb && cb(); return; }
  if(e === 'extra_roll'){ p.extraRoll = true; cb && cb(); return; }
  if(e === 'move:start'){ p.index = 0; renderTokens(); cb && cb(); return; }
  if(e === 'move:end'){ p.index = lastIndex(); renderTokens(); cb && cb(); return; }
  if(e === 'pingpong'){
    const st = stageAt(p.index);
    const prev = previousStage(st);
    const idx  = findPreviousStageIndex(p.index, prev);
    p.index = idx; renderTokens(); cb && cb(); return;
  }
  if(e.startsWith('move:') || e.startsWith('move ')){
    const parts = e.split(/[: ]/);
    let val = parseInt(parts[1], 10);
    if(!isNaN(val)){
      moveSteps(p, val, ()=> cb && cb());
      return;
    }
  }
  if(e.startsWith('move:previous:')){
    const stage = e.split(':')[2];
    const idx = findPreviousStageIndex(p.index, stage);
    p.index = idx; renderTokens(); cb && cb(); return;
  }
  if(e.startsWith('move:nearest:')){
    const stage = e.split(':')[2];
    const idx = findNearestStageIndex(p.index, stage);
    p.index = idx; renderTokens(); cb && cb(); return;
  }
  cb && cb();
}

// ---- Helpers (stage navigation) ----
function previousStage(stage){
  const order = ['start','early','commons','lords','implementation','end'];
  const i = order.indexOf(stage);
  return (i > 0 ? order[i-1] : stage);
}
function findPreviousStageIndex(fromIdx, stage){
  for(let i=fromIdx-1;i>=0;i--){
    if(GameState.board.spaces[i].stage === stage) return i;
  }
  return 0;
}
function findNearestStageIndex(fromIdx, stage){
  for(let i=fromIdx-1;i>=0;i--){
    if(GameState.board.spaces[i].stage === stage) return i;
  }
  for(let i=fromIdx+1;i<GameState.board.spaces.length;i++){
    if(GameState.board.spaces[i].stage === stage) return i;
  }
  return fromIdx;
}

// ---- Turn advancement ----
function nextActiveIdx(){
  const n = GameState.players.length;
  let i = (GameState.activeIdx + 1) % n;
  while (GameState.players[i].skipNext) {
    GameState.players[i].skipNext = false;
    i = (i + 1) % n;
  }
  return i;
}
function currentPlayer(){ return GameState.players[GameState.activeIdx]; }

function advanceTurn(){
  GameState.turns += 1;
  GameState.activeIdx = nextActiveIdx();
  const np = currentPlayer();
  const nameEl = document.getElementById('active-name');
  const dotEl  = document.getElementById('active-color');
  if(nameEl) nameEl.textContent = np.name;
  if(dotEl)  dotEl.style.background = tokenColor(np.color);
  renderTokens();
}
function finalizeTurn(){
  const p = currentPlayer();
  if(p.extraRoll){ p.extraRoll = false; return; } // same player rolls again
  advanceTurn();
}

// Ensure active token is on screen (mobile QoL)
function ensureTokenInView(player){
  const wrap = document.getElementById('board-wrap');
  const svg  = document.getElementById('board-svg');
  if(!wrap || !svg || !GameState.board) return;
  const s = GameState.board.spaces[player.index]; if(!s) return;
  const viewW = svg.viewBox.baseVal.width || 1600;
  const viewH = svg.viewBox.baseVal.height|| 1000;
  const x = (s.x/100)*viewW, y=(s.y/100)*viewH;
  const rect = svg.getBoundingClientRect();
  const absX = rect.left + (x/viewW)*rect.width;
  const absY = rect.top  + (y/viewH)*rect.height;
  const vx2 = window.innerWidth, vy2 = window.innerHeight;
  if(absX<0 || absX>vx2 || absY<0 || absY>vy2){
    window.scrollTo({top: Math.max(0, absY-200), left: Math.max(0, absX-100), behavior:'smooth'});
  }
}
