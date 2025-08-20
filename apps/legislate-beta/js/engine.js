
let Engine={busy:false,waiting:false};
Engine.isBusy = ()=> Engine.busy || Engine.waiting;
Engine.afterRoll = function(n){
  const p=GameState.players[GameState.activeIdx];
  moveSteps(p, n, ()=>{
    if(p.index>=lastIndex()){ showWinners([p]); return; }
    const sp = GameState.board.spaces[p.index];
    if(sp && sp.deck && sp.deck!=='none'){
      const card = drawFrom(sp.deck);
      if(card){ Engine.waiting=true; showCard(sp.deck, card); Engine._pending={p,card}; return; }
    }
    advanceTurn();
  });
}
Engine.onCardAcknowledged = function(){
  Engine.waiting=false;
  const {p, card} = Engine._pending || {};
  if(p && card && card.effect){ applyEffect(p, card.effect, ()=>advanceTurn()); }
  else advanceTurn();
  Engine._pending=null;
}
function moveSteps(player, steps, done){
  Engine.busy=true; let remaining=steps;
  function step(){ if(remaining<=0){ Engine.busy=false; renderTokens(); done&&done(); return; }
    player.index = clamp(player.index+1, 0, lastIndex()); renderTokens(); remaining--; setTimeout(step, 220); }
  step();
}
function applyEffect(player, effect, cb){
  if(effect==='miss_turn'){ player.skipNext=true; return cb(); }
  if(effect==='extra_roll'){ player.extraRoll=true; return cb(); }
  if(effect.startsWith('move:')){ const n=parseInt(effect.split(':')[1],10); player.index=clamp(player.index+n,0,lastIndex()); renderTokens(); return cb(); }
  cb();
}
function advanceTurn(){
  const p=currentPlayer();
  if(p.extraRoll){ p.extraRoll=false; return; } // stays same player; next roll uses same activeIdx
  GameState.activeIdx = (GameState.activeIdx+1) % GameState.players.length;
  renderTokens();
}
function showWinners(w){ const overlay=$('#error-overlay'); overlay.classList.remove('hidden'); const names=w.map(x=>x.name).join(', ');
  overlay.innerHTML=`<div class="card"><h2>🏆 ${names} wins!</h2><button id="restart-btn2" class="btn">Restart</button></div>`;
  $('#restart-btn2').addEventListener('click', ()=> location.reload());
}
