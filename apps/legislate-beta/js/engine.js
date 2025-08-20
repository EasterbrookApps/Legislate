// engine.js — Clean rules integration (no shims), v1.2-pro
// Assumes GameState, renderTokens(), lastIndex(), stageAt(), nextActiveIdx(), currentPlayer() exist.
// Effects supported: move:+N/-N, miss_turn, extra_roll, move:start, move:end, move:previous:<stage>, move:nearest:<stage>, pingpong.

let Engine = { busy:false, waiting:false, pending:null };
Engine.isBusy = function(){ return Engine.busy || Engine.waiting; };

Engine.afterRoll = function(n){
  if(Engine.isBusy()) return;
  const p = GameState.players[GameState.activeIdx];
  moveSteps(p, n, ()=>{
    // On landing: check for card
    const sp = GameState.board?.spaces?.[p.index];
    const deck = sp && sp.deck;
    if(deck && window.Cards && Cards.decks && Cards.decks[deck]){
      const card = drawFrom(deck);
      if(card){
        Engine.waiting = true;
        Engine.pending = { pid: p.id, effect: String(card.effect||'').trim() };
        showCard(deck, card);  // blocks progression until OK
        return;
      }
    }
    finalizeTurn();
  });
};

Engine.onCardAcknowledged = function(){
  // Called by cards.js when OK is pressed
  if(!Engine.pending){ finalizeTurn(); return; }
  const { pid, effect } = Engine.pending;
  Engine.pending = null;
  applyEffect(pid, effect, ()=>{ finalizeTurn(); });
};

function moveSteps(player, steps, done){
  Engine.busy = true;
  const per = steps >= 0 ? 1 : -1;
  let remaining = Math.abs(steps);
  function step(){
    if(remaining <= 0){
      Engine.busy = false;
      renderTokens();
      done && done();
      return;
    }
    const nextIdx = clamp(player.index + per, 0, lastIndex());
    player.index = nextIdx;
    renderTokens();
    remaining -= 1;
    setTimeout(step, 250); // board-game cadence
  }
  step();
}

function applyEffect(playerId, effect, cb){
  const p = GameState.players.find(x=>x.id===playerId);
  if(!p){ cb && cb(); return; }
  Engine.waiting = false; // we are resolving a card now

  const e = String(effect||'').trim().toLowerCase();
  if(!e){ cb && cb(); return; }

  // Direct flags
  if(e === 'miss_turn'){ p.skipNext = true; cb && cb(); return; }
  if(e === 'extra_roll'){ p.extraRoll = true; cb && cb(); return; }

  // Absolute jumps
  if(e === 'move:start'){ p.index = 0; renderTokens(); cb && cb(); return; }
  if(e === 'move:end'){ p.index = lastIndex(); renderTokens(); cb && cb(); return; }

  // Ping-pong back to previous stage boundary
  if(e === 'pingpong'){
    const st = stageAt(p.index);
    const prev = previousStage(st);
    const idx  = findPreviousStageIndex(p.index, prev);
    p.index = idx; renderTokens(); cb && cb(); return;
  }

  // Relative moves: accept "move:2" or "move 2" or +/- forms
  if(e.startsWith('move:') || e.startsWith('move ')){
    const parts = e.split(/[: ]/);
    let val = parseInt(parts[1], 10);
    if(!isNaN(val)){
      moveSteps(p, val, ()=> cb && cb());
      return;
    }
  }

  // Stage-directed moves
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

  // Default: no-op
  cb && cb();
}

// ---- Helpers (stage navigation) ----
function previousStage(stage){
  const order = ['start','early','commons','lords','implementation','end'];
  const i = order.indexOf(stage);
  return (i > 0 ? order[i-1] : stage);
}

function findPreviousStageIndex(fromIdx, stage){
  for(let i = fromIdx-1; i >= 0; i--){
    if(GameState.board.spaces[i].stage === stage) return i;
  }
  return 0;
}

function findNearestStageIndex(fromIdx, stage){
  for(let i = fromIdx-1; i >= 0; i--){
    if(GameState.board.spaces[i].stage === stage) return i;
  }
  for(let i = fromIdx+1; i < GameState.board.spaces.length; i++){
    if(GameState.board.spaces[i].stage === stage) return i;
  }
  return fromIdx;
}

// ---- Turn advancement ----
function finalizeTurn(){
  const p = currentPlayer();
  if(p.extraRoll){ p.extraRoll = false; return; } // same player rolls again
  if(p.skipNext){ p.skipNext = false; advanceTurn(); return; }
  advanceTurn();
}

function advanceTurn(){
  GameState.activeIdx = nextActiveIdx();
  const np = currentPlayer();
  const nameEl = document.getElementById('active-name');
  const dotEl  = document.getElementById('active-color');
  if(nameEl) nameEl.textContent = np.name;
  if(dotEl)  dotEl.style.background = tokenColor(np.color);
  renderTokens();
}
