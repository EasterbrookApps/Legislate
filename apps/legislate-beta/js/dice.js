
let Dice={floatingBtn:null,overlay:null,bigDie:null,resultEl:null,rolling:false};
function setupDice(){
  Dice.floatingBtn=$('#floating-die'); Dice.overlay=$('#dice-overlay'); Dice.bigDie=$('#big-die'); Dice.resultEl=$('#die-result');
  Dice.floatingBtn.addEventListener('click', onRollClicked); $('#card-ok').addEventListener('click', ()=>{ hideCard(); Engine.onCardAcknowledged(); });
}
async function onRollClicked(){
  if(Dice.rolling) return; if(!Board.calibrated||!GameState.board) return; if(Engine.isBusy()) return; Dice.rolling=true;
  const fast=GameState.config.fastroll; const duration=fast?200:2500; Dice.overlay.classList.remove('hidden'); Dice.bigDie.className='die big'; Dice.resultEl.textContent='';
  const start=performance.now(); function anim(t){ const elapsed=t-start; const face=1+Math.floor(Math.random()*6); Dice.bigDie.className='die big p'+face;
    if(elapsed<duration){ requestAnimationFrame(anim); } else { const result=1+Math.floor(Math.random()*6); Dice.bigDie.className='die big p'+result; Dice.resultEl.textContent=`Rolled a ${result}`;
      setTimeout(()=>{ Dice.overlay.classList.add('hidden'); Dice.rolling=false; Engine.afterRoll(result); }, fast?50:350); } }
  requestAnimationFrame(anim);
}
