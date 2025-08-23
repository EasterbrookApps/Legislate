
let Admin={unlocked:false,clicks:[],stages:[],decks:[],total:58,activeStep:0};
function setupAdmin(){
  $('#admin-toggle').addEventListener('click', ()=> $('#admin-panel').classList.toggle('hidden'));
  $('#admin-close').addEventListener('click', ()=> $('#admin-panel').classList.add('hidden'));
  $('#open-admin-from-error').addEventListener('click', ()=> $('#admin-panel').classList.remove('hidden'));
  $('#admin-login').addEventListener('click', ()=>{
    if($('#admin-pass').value==='legislate'){ $('#admin-auth').classList.add('hidden'); $('#admin-tools').classList.remove('hidden'); }
    else $('#admin-auth-msg').textContent='Incorrect password';
  });
  $('#wiz-start').addEventListener('click', startWizard);
  $('#wiz-back').addEventListener('click', backWizard);
  $('#wiz-finish').addEventListener('click', finishWizard);
  $('#export-board').addEventListener('click', exportBoard);
  $('#wiz-total').addEventListener('change', ()=> Admin.total = Math.max(2, parseInt($('#wiz-total').value,10)||58));
  Admin.total = Math.max(2, parseInt($('#wiz-total').value,10)||58);
  // click capture on svg
  $('#board-svg').addEventListener('click', onBoardClick);
}
function startWizard(){ Admin.clicks=[]; Admin.stages=[]; Admin.decks=[]; Admin.activeStep=0; updateWizStatus(); $('#wiz-editor').classList.remove('hidden'); }
function backWizard(){
  if(Admin.activeStep>0){ Admin.activeStep--; Admin.clicks.pop(); Admin.stages.pop(); Admin.decks.pop(); updateWizStatus(); renderMarkers(); }
}
function finishWizard(){ if(Admin.clicks.length===Admin.total){ $('#export-board').disabled=false; $('#wiz-status').textContent='Complete. You can export now.'; } }
function onBoardClick(evt){
  if($('#admin-tools').classList.contains('hidden')) return;
  if(Admin.clicks.length>=Admin.total) return;
  const pt=$('#board-svg').createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY;
  const ctm=$('#board-svg').getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
  const xPct=loc.x/($('#board-image').width.baseVal.value)*100;
  const yPct=loc.y/($('#board-image').height.baseVal.value)*100;
  // show inline editor defaults
  const lastStage=Admin.stages[Admin.stages.length-1]||'early'; const lastDeck=Admin.decks[Admin.decks.length-1]||'none';
  $('#wiz-editor').innerHTML = `<b>Step ${Admin.activeStep} of ${Admin.total}</b><div style="display:flex;gap:8px;margin:8px 0;">
      <label>Stage <select id="wiz-stage">
        <option ${lastStage==='start'?'selected':''} value="start">start</option>
        <option ${lastStage==='early'?'selected':''} value="early">early</option>
        <option ${lastStage==='commons'?'selected':''} value="commons">commons</option>
        <option ${lastStage==='lords'?'selected':''} value="lords">lords</option>
        <option ${lastStage==='implementation'?'selected':''} value="implementation">implementation</option>
        <option ${lastStage==='end'?'selected':''} value="end">end</option>
      </select></label>
      <label>Deck <select id="wiz-deck">
        <option ${lastDeck==='none'?'selected':''} value="none">none</option>
        <option ${lastDeck==='early'?'selected':''} value="early">early</option>
        <option ${lastDeck==='commons'?'selected':''} value="commons">commons</option>
        <option ${lastDeck==='lords'?'selected':''} value="lords">lords</option>
        <option ${lastDeck==='implementation'?'selected':''} value="implementation">implementation</option>
        <option ${lastDeck==='pingpong'?'selected':''} value="pingpong">pingpong</option>
      </select></label>
      <button id="wiz-confirm" class="btn">Confirm & Next</button>
    </div>`;
  $('#wiz-confirm').onclick = ()=>{
    Admin.clicks.push({index:Admin.activeStep, x:xPct, y:yPct});
    Admin.stages.push($('#wiz-stage').value);
    Admin.decks.push($('#wiz-deck').value);
    Admin.activeStep++; updateWizStatus(); renderMarkers();
    if(Admin.activeStep>=Admin.total){ finishWizard(); }
  };
}
function updateWizStatus(){ $('#wiz-status').textContent=`Placed ${Admin.clicks.length}/${Admin.total}`; }
function renderMarkers(){
  const layer=document.getElementById('active-ring-layer'); layer.innerHTML='';
  for(let i=0;i<Admin.clicks.length;i++){
    const c=Admin.clicks[i]; const col=cStage(Admin.stages[i]);
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', c.x/100*$('#board-image').width.baseVal.value);
    circle.setAttribute('cy', c.y/100*$('#board-image').height.baseVal.value);
    circle.setAttribute('r', 16);
    circle.setAttribute('fill', col); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '3'); circle.setAttribute('opacity','0.85');
    layer.appendChild(circle);
    const text=document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', c.x/100*$('#board-image').width.baseVal.value);
    text.setAttribute('y', c.y/100*$('#board-image').height.baseVal.value+5);
    text.setAttribute('text-anchor','middle'); text.setAttribute('font-size','14'); text.setAttribute('font-weight','700'); text.setAttribute('fill','#111'); text.textContent=String(i);
    layer.appendChild(text);
  }
}
function cStage(stage){ return stage==='early'?'#f59e0b':stage==='commons'?'#22c55e':stage==='lords'?'#ef4444':stage==='implementation'?'#3b82f6':'#a855f7'; }
function exportBoard(){
  if(Admin.clicks.length!==Admin.total){ alert('Finish calibration first'); return; }
  const spaces=[];
  for(let i=0;i<Admin.total;i++){ spaces.push({ index:i, x:+Admin.clicks[i].x, y:+Admin.clicks[i].y, stage: Admin.stages[i], deck: Admin.decks[i] }); }
  const data={ asset:'assets/board.png', spaces };
  downloadJSON('board.json', data);
}
