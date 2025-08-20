// effects.js — listens for card:ok and applies effects using existing globals only
(function(){
  function previousStage(stage){ const order=['start','early','commons','lords','implementation','end']; const i=order.indexOf(stage); return (i>0?order[i-1]:stage); }
  function findPreviousStageIndex(fromIdx, stage){
    if(!GameState || !GameState.board || !Array.isArray(GameState.board.spaces)) return 0;
    for(let i=fromIdx-1;i>=0;i--){ if(GameState.board.spaces[i].stage===stage) return i; } 
    return 0;
  }
  function findNearestStageIndex(fromIdx, stage){
    if(!GameState || !GameState.board || !Array.isArray(GameState.board.spaces)) return fromIdx||0;
    for(let i=fromIdx-1;i>=0;i--){ if(GameState.board.spaces[i].stage===stage) return i; }
    for(let i=fromIdx+1;i<GameState.board.spaces.length;i++){ if(GameState.board.spaces[i].stage===stage) return i; }
    return fromIdx||0;
  }

  document.addEventListener('card:ok', function(ev){
    try{
      const effectRaw = (ev.detail && ev.detail.effect) ? String(ev.detail.effect).trim() : '';
      const p = GameState.players[GameState.activeIdx];
      if(!p){ if(typeof finalizeTurn==='function') finalizeTurn(); return; }

      const e = effectRaw.toLowerCase();
      // Direct effects
      if(e === 'miss_turn'){ p.skipNext = true; if(typeof finalizeTurn==='function') finalizeTurn(); return; }
      if(e === 'extra_roll'){ p.extraRoll = true; if(typeof finalizeTurn==='function') finalizeTurn(); return; }
      if(e === 'move:start'){ p.index = 0; if(typeof renderTokens==='function') renderTokens(); if(typeof finalizeTurn==='function') finalizeTurn(); return; }
      if(e === 'move:end'){ p.index = (typeof lastIndex==='function') ? lastIndex() : (GameState.board.spaces.length-1); if(typeof renderTokens==='function') renderTokens(); if(typeof finalizeTurn==='function') finalizeTurn(); return; }
      if(e === 'pingpong'){
        const st = (typeof stageAt==='function') ? stageAt(p.index) : (GameState.board.spaces[p.index]?.stage || 'early');
        const prev = previousStage(st);
        const idx = findPreviousStageIndex(p.index, prev);
        p.index = idx; if(typeof renderTokens==='function') renderTokens(); if(typeof finalizeTurn==='function') finalizeTurn(); return;
      }

      // Move by N: accept "move:2" or "move 2" or "move:+2"/"-2"
      if(e.startsWith('move:') || e.startsWith('move ')){
        const parts = e.split(/[: ]/);
        const val = parseInt(parts[1], 10);
        if(!isNaN(val) && typeof moveSteps==='function'){
          if(typeof hideCard==='function') hideCard();
          moveSteps(p, val, function(){ if(typeof finalizeTurn==='function') finalizeTurn(); });
          return;
        }
      }

      // Stage jumps
      if(e.startsWith('move:previous:')){
        const stage = e.split(':')[2]; const idx = findPreviousStageIndex(p.index, stage);
        p.index = idx; if(typeof renderTokens==='function') renderTokens(); if(typeof finalizeTurn==='function') finalizeTurn(); return;
      }
      if(e.startsWith('move:nearest:')){
        const stage = e.split(':')[2]; const idx = findNearestStageIndex(p.index, stage);
        p.index = idx; if(typeof renderTokens==='function') renderTokens(); if(typeof finalizeTurn==='function') finalizeTurn(); return;
      }

      // Default: no-op -> continue turn flow
      if(typeof finalizeTurn==='function') finalizeTurn();
    }catch(err){
      if(typeof finalizeTurn==='function') finalizeTurn();
    }
  });
})();
