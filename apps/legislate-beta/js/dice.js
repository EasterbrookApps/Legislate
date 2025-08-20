
let Dice={floatingBtn:null,overlay:null,bigDie:null,resultEl:null,rolling:false};
function setupDice(){
  Dice.floatingBtn=$('#floating-die'); Dice.overlay=$('#dice-overlay'); Dice.bigDie=$('#big-die'); Dice.resultEl=$('#die-result');
  const headerBtn=$('#roll-btn-header'); if(headerBtn) headerBtn.addEventListener('click', onRollClicked);
  if(Dice.floatingBtn) Dice.floatingBtn.addEventListener('click', onRollClicked);
  document.addEventListener('keydown', e=>{ if(e.code==='Space'||e.key==='r'||e.key==='R') onRollClicked(); });
  $('#card-ok').addEventListener('click', ()=>{ hideCard(); Engine.onCardAcknowledged(); });
}
function faceClass(n){ return 'p'+clamp(n,1,6); }
function onRollClicked(){
  if(Dice.rolling) return; if(!GameState.board) return; if(Engine.isBusy()) return; Dice.rolling=true;
  Dice.overlay.classList.remove('hidden'); Dice.bigDie.className='die big p1'; Dice.resultEl.textContent='';
  const start=performance.now(), dur=2500;
  function anim(t){ const elapsed=t-start; const face=1+Math.floor(Math.random()*6); Dice.bigDie.className='die big '+faceClass(face);
    if(elapsed<dur){ requestAnimationFrame(anim); } else { const result=1+Math.floor(Math.random()*6); Dice.bigDie.className='die big '+faceClass(result); Dice.resultEl.textContent=`Rolled a ${result}`;
      setTimeout(()=>{ Dice.overlay.classList.add('hidden'); Dice.rolling=false; Engine.afterRoll(result); }, 350); } }
  requestAnimationFrame(anim);
}
