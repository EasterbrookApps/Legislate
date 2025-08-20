
let Dice={overlay:null,bigDie:null,resultEl:null,rolling:false};
function setupDice(){
  Dice.overlay=$('#dice-overlay'); Dice.bigDie=$('#big-die'); Dice.resultEl=$('#die-result');
  $('#roll-btn-header').addEventListener('click', onRollClicked);
  // document.addEventListener('keydown', (e)=>{ if(e.code==='Space' || e.key==='r' || e.key==='R'){ onRollClicked(); } });
  $('#card-ok').addEventListener('click', ()=>{ hideCard(); Engine.onCardAcknowledged(); });
  $('#restart-btn').addEventListener('click', ()=> location.reload());
}
function onRollClicked(){
  if(Dice.rolling) return; if(!Board.calibrated||!GameState.board) return; if(Engine.isBusy && Engine.isBusy()) return;
  Dice.rolling=true; const fast=GameState.config.fastroll; const duration=fast?200:1600;
  Dice.overlay.classList.remove('hidden'); Dice.bigDie.className='die big'; Dice.resultEl.textContent='';
  const start=performance.now(); function anim(t){ const elapsed=t-start; const face=1+Math.floor(Math.random()*6); Dice.bigDie.className='die big p'+face;
    if(elapsed<duration){ requestAnimationFrame(anim); } else { const result=1+Math.floor(Math.random()*6); Dice.bigDie.className='die big p'+result; Dice.resultEl.textContent=`Rolled ${result}`;
      setTimeout(()=>{ Dice.overlay.classList.add('hidden'); Dice.rolling=false; if(Engine.afterRoll) Engine.afterRoll(result); }, fast?50:250); } }
  requestAnimationFrame(anim);
}
