
let Engine={busy:false,pendingEffect:null,waitingForCardOk:false}; function isBusy(){ return Engine.busy||Engine.waitingForCardOk;} Engine.isBusy=isBusy;
function startGame(){ renderPlayersUI(); renderTokens(); }
function renderPlayersUI(){
  const container=$('#players'); container.innerHTML='';
  GameState.players.forEach((p,i)=>{
    const el=document.createElement('div'); el.className='player';
    const dot=document.createElement('span'); dot.className='dot'; dot.style.background=tokenColor(p.color);
    const input=document.createElement('input'); input.value=p.name; input.addEventListener('input',()=>{ p.name=input.value; if(i===GameState.activeIdx){ $('#active-name').textContent=p.name||`Player ${i+1}`; }});
    el.appendChild(dot); el.appendChild(input); container.appendChild(el);
  });
}
function afterRoll(n){
  const p=currentPlayer(); if(p.eliminated){ advanceTurn(); return; }
  moveSteps(p, n, ()=>{
    if(p.index>=lastIndex()){ markFinished(p); endOrContinueRound(); return; }
    if(isCardSpace(p.index)){
      const deckId=GameState.board.spaces[p.index].deck || GameState.board.decks[String(p.index)];
      const card=drawFrom(deckId);
      if(card){ Engine.waitingForCardOk=true; showCard(deckId, card); Engine.pendingEffect={playerId:p.id, effect: card.effect||null}; return; }
    }
    finalizeTurn();
  });
}
function onCardAcknowledged(){ Engine.waitingForCardOk=false; if(Engine.pendingEffect){ applyEffect(Engine.pendingEffect.effect, Engine.pendingEffect.playerId); Engine.pendingEffect=null; } else { finalizeTurn(); } }
function finalizeTurn(){ const p=currentPlayer(); if(p.extraRoll){ p.extraRoll=false; return; } advanceTurn(); }
function advanceTurn(){
  let next=nextActiveIdx(); let cycles=0;
  while(cycles<GameState.players.length){
    const np=GameState.players[next]; GameState.activeIdx=next; $('#active-name').textContent=np.name; $('#active-color').style.background=tokenColor(np.color); renderTokens();
    if(np.eliminated){ next=nextActiveIdx(next); cycles++; continue; }
    if(np.skipNext){ Engine.waitingForCardOk=true; showCard('pingpong', {text:`${np.name} misses this turn.`}); Engine.pendingEffect={playerId:np.id, effect:'consume_skip'}; return; }
    break;
  }
}
function moveSteps(player, steps, onDone){
  Engine.busy=true; const forward=steps>=0; const per=forward?1:-1; let remaining=Math.abs(steps);
  function step(){ if(remaining<=0){ Engine.busy=false; renderTokens(); onDone&&onDone(); return; }
    const nextIdx=Math.max(0, Math.min(lastIndex(), player.index+per));
    const prevStage=stageAt(player.index); player.index=nextIdx; const newStage=stageAt(player.index);
    if(!forward && prevStage!==newStage){ const snapIdx=boundarySnapIndex(newStage); player.index=snapIdx; remaining=0; }
    else { remaining-=1; }
    renderTokens(); setTimeout(step, 250); }
  step();
}
function boundarySnapIndex(stage){ const spaces=GameState.board.spaces; let last=0; for(let i=0;i<spaces.length;i++){ if(spaces[i].stage===stage) last=i; } return last; }
function applyEffect(effect, playerId){
  const p=GameState.players.find(x=>x.id===playerId); if(!p){ finalizeTurn(); return; } if(!effect){ finalizeTurn(); return; }
  if(effect==='consume_skip'){ p.skipNext=false; hideCard(); advanceTurn(); return; }
  if(effect.startsWith('move:')){
    if(effect==='move:start'){ p.index=0; renderTokens(); hideCard(); finalizeTurn(); return; }
    if(effect==='move:end'){ p.index=lastIndex(); renderTokens(); hideCard(); markFinished(p); endOrContinueRound(); return; }
    if(effect.startsWith('move:previous:')){ const stage=effect.split(':')[2]; const idx=findPreviousStageIndex(p.index, stage); p.index=idx; renderTokens(); hideCard(); finalizeTurn(); return; }
    if(effect.startsWith('move:nearest:')){ const stage=effect.split(':')[2]; const idx=findNearestStageIndex(p.index, stage); p.index=idx; renderTokens(); hideCard(); finalizeTurn(); return; }
    const val=parseInt(effect.split(':')[1],10); hideCard(); moveSteps(p, val, finalizeTurn); return;
  }
  switch(effect){
    case 'miss_turn': p.skipNext=true; hideCard(); finalizeTurn(); break;
    case 'extra_roll': p.extraRoll=true; hideCard(); break;
    case 'pingpong': const st=stageAt(p.index); if(st==='lords'){ p.index=findBoundaryFor('commons','lords').fromStageLast; }
                     else { const prev=previousStage(st); const bounds=findBoundaryFor(prev, st); p.index=bounds.fromStageLast; }
                     renderTokens(); hideCard(); finalizeTurn(); break;
    case 'eliminate': p.eliminated=true; renderTokens(); hideCard(); if(alivePlayers().length<=1){ GameState.winners=alivePlayers().map(pp=>pp.id); showWinners(); } else { finalizeTurn(); } break;
    default: hideCard(); finalizeTurn();
  }
}
function previousStage(stage){ const i=STAGE_ORDER.indexOf(stage); return i>0? STAGE_ORDER[i-1]:stage; }
function findBoundaryFor(fromStage,toStage){ const spaces=GameState.board.spaces; let fromLast=0,toFirst=spaces.length-1; for(let i=0;i<spaces.length;i++){ if(spaces[i].stage===fromStage) fromLast=i; if(toFirst===spaces.length-1 && spaces[i].stage===toStage) toFirst=i; } return {fromStageLast:fromLast,toStageFirst:toFirst}; }
function findPreviousStageIndex(fromIdx,stage){ for(let i=fromIdx-1;i>=0;i--){ if(GameState.board.spaces[i].stage===stage) return i;} return 0; }
function findNearestStageIndex(fromIdx,stage){ for(let i=fromIdx-1;i>=0;i--){ if(GameState.board.spaces[i].stage===stage) return i;} for(let i=fromIdx+1;i<GameState.board.spaces.length;i++){ if(GameState.board.spaces[i].stage===stage) return i;} return fromIdx; }
function markFinished(p){ if(!GameState.winners.includes(p.id)){ GameState.winners.push(p.id);} }
function endOrContinueRound(){ if(!GameState.finalization){ GameState.finalization=true; GameState.finalizationStartIdx=nextActiveIdx(GameState.activeIdx); finalizeTurn(); return; }
  const nextIdx=nextActiveIdx(GameState.activeIdx); if(nextIdx===GameState.finalizationStartIdx){ showWinners(); } else { finalizeTurn(); } }
function showWinners(){ Engine.busy=true; const overlay=$('#error-overlay'); overlay.classList.remove('hidden'); const names=GameState.winners.map(id=>GameState.players.find(p=>p.id===id)?.name||'Player').join(', ');
  overlay.innerHTML=`<div class="card"><h2>🏆 ${names} ${GameState.winners.length>1?'win!':'wins!'}</h2><button id="restart-btn" class="btn">Restart</button></div>`;
  $('#restart-btn').addEventListener('click', ()=>{ location.reload(); });
}
