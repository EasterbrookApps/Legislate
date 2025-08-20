
let Engine={busy:false,waiting:false,pending:null}; function isBusy(){return Engine.busy||Engine.waiting;}
Engine.isBusy=isBusy;
function startGame(){ renderPlayersUI(); renderTokens(); }
function renderPlayersUI(){
  const c=$('#players'); c.innerHTML='';
  GameState.players.forEach((p,i)=>{ const el=document.createElement('span'); el.className='player';
    const dot=document.createElement('span'); dot.className='player-dot'; dot.style.background = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#f97316'][i];
    const name=document.createElement('span'); name.textContent=p.name; el.appendChild(dot); el.appendChild(name); c.appendChild(el); });
}
function afterRoll(n){
  const p=currentPlayer();
  moveSteps(p, n, ()=>{
    if(p.index>=lastIndex()){ showWinners([p]); return; }
    if(isCardSpace(p.index)){ const deckId=GameState.board.spaces[p.index].deck; const card=drawFrom(deckId)||{text:'—',effect:null}; Engine.waiting=true; showCard(deckId, card); Engine.pending={playerId:p.id, effect:card.effect}; return; }
    finalizeTurn();
  });
}
function onCardAcknowledged(){ Engine.waiting=false; if(Engine.pending){ applyEffect(Engine.pending.effect, Engine.pending.playerId); Engine.pending=null; } else finalizeTurn(); }
function moveSteps(player, steps, done){
  Engine.busy=true; const per=steps>=0?1:-1; let left=Math.abs(steps);
  const tick=()=>{ if(left<=0){ Engine.busy=false; renderTokens(); done&&done(); return; }
    player.index = clamp(player.index+per, 0, lastIndex()); left--; renderTokens(); setTimeout(tick, 220); };
  tick();
}
function applyEffect(effect, playerId){ const p=GameState.players.find(x=>x.id===playerId); if(!effect){ finalizeTurn(); return; }
  if(effect==='miss_turn'){ p.skipNext=true; finalizeTurn(); return; }
  if(effect==='extra_roll'){ p.extraRoll=true; finalizeTurn(); return; }
  if(effect && effect.startsWith('move:')){ const v=parseInt(effect.split(':')[1],10)||0; moveSteps(p,v,finalizeTurn); return; }
  finalizeTurn();
}
function finalizeTurn(){ const p=currentPlayer(); if(p.extraRoll){ p.extraRoll=false; return; } GameState.activeIdx=(GameState.activeIdx+1)%GameState.players.length; renderTokens(); }
function showWinners(ws){ alert('Winner: '+ws.map(w=>GameState.players.find(p=>p.id===w.id)?.name||'Player').join(', ')); }
