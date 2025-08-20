
let Admin={unlocked:false,total:58,points:[],stages:[],decks:[],lastStage:'early',lastDeck:'early',calibrating:false};

function setupAdmin(){
  $('#admin-toggle').addEventListener('click', ()=> $('#admin-panel').classList.toggle('hidden'));
  $('#admin-close').addEventListener('click', ()=> $('#admin-panel').classList.add('hidden'));
  $('#open-admin-from-error').addEventListener('click', ()=> $('#admin-panel').classList.remove('hidden'));
  $('#admin-login').addEventListener('click', onLogin);
  $('#wiz-start').addEventListener('click', startWizard);
  $('#wiz-back').addEventListener('click', backOne);
  $('#export-board').addEventListener('click', exportBoard);
  const totalInput=$('#wiz-total'); totalInput.addEventListener('change', ()=>{ const v=parseInt(totalInput.value,10); Admin.total= isNaN(v)?58 : Math.max(2, v); updateWizardUI(); });
}

function onLogin(){
  const pass=$('#admin-pass').value;
  if(pass==='legislate'){
    Admin.unlocked=true;
    $('#admin-auth').classList.add('hidden'); $('#admin-tools').classList.remove('hidden'); $('#admin-auth-msg').textContent='';
    $('#error-overlay').classList.add('hidden');
    updateWizardUI(); // collapsed until Start
  }else{
    $('#admin-auth-msg').textContent='Incorrect password';
  }
}

function startWizard(){
  Admin.calibrating=true; Admin.points=[]; Admin.stages=[]; Admin.decks=[];
  const v=parseInt($('#wiz-total').value,10); Admin.total = isNaN(v)?58:Math.max(2,v);
  $('#wiz-mini').classList.add('hidden');
  Board.markersLayer.innerHTML='';
  updateWizardUI();
  Board.svg.addEventListener('click', wizardClick);
}

function stopWizard(){
  Admin.calibrating=false;
  Board.svg.removeEventListener('click', wizardClick);
  Board.markersLayer.innerHTML=''; // clear markers after finish
  updateWizardUI();
}

function backOne(){
  if(!Admin.calibrating || Admin.points.length===0) return;
  Admin.points.pop(); Admin.stages.pop(); Admin.decks.pop();
  drawMarkers();
  updateWizardUI();
}

function wizardClick(evt){
  if(!Admin.calibrating) return;
  if(Admin.points.length>=Admin.total) return;
  const pt=Board.svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY;
  const ctm=Board.svg.getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
  const xPct=(loc.x/Board.viewW)*100, yPct=(loc.y/Board.viewH)*100;
  const k=Admin.points.length;
  Admin.points.push({index:k,x:xPct,y:yPct});
  drawMarkers();
  showMiniFor(k);
}

function showMiniFor(k){
  const mini=$('#wiz-mini'); mini.classList.remove('hidden');
  const lastS=Admin.lastStage||'early'; const lastD=Admin.lastDeck||'early';
  mini.innerHTML = `<h4>Space #${k}</h4>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
      <label style="flex:1">Stage<br/>
        <select id="mini-stage">
          <option value="start">start</option>
          <option value="early"${lastS==='early'?' selected':''}>early</option>
          <option value="commons"${lastS==='commons'?' selected':''}>commons</option>
          <option value="lords"${lastS==='lords'?' selected':''}>lords</option>
          <option value="implementation"${lastS==='implementation'?' selected':''}>implementation</option>
          <option value="end">end</option>
        </select>
      </label>
      <label style="flex:1">Deck<br/>
        <select id="mini-deck">
          <option value="none">none</option>
          <option value="early"${lastD==='early'?' selected':''}>early</option>
          <option value="commons"${lastD==='commons'?' selected':''}>commons</option>
          <option value="lords"${lastD==='lords'?' selected':''}>lords</option>
          <option value="implementation"${lastD==='implementation'?' selected':''}>implementation</option>
          <option value="pingpong"${lastD==='pingpong'?' selected':''}>pingpong</option>
        </select>
      </label>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
      <button id="mini-confirm" class="btn">Confirm & Next</button>
    </div>`;
  $('#mini-confirm').addEventListener('click', ()=>{
    const s=$('#mini-stage').value; const d=$('#mini-deck').value;
    Admin.stages[k]=s; Admin.decks[k]=d; Admin.lastStage=s; Admin.lastDeck=d;
    $('#wiz-mini').classList.add('hidden');
    updateWizardUI();
  });
}

function drawMarkers(){
  const g=Board.markersLayer; g.innerHTML='';
  const sizescale = Math.max(16, Math.min(28, (Board.viewW+Board.viewH)/140));
  for(let i=0;i<Admin.points.length;i++){
    const p=Admin.points[i];
    const color = stageToColor(Admin.stages[i] || Admin.lastStage || 'early');
    const grp=document.createElementNS('http://www.w3.org/2000/svg','g');
    grp.setAttribute('class','marker'+(i===Admin.points.length-1?' current':''));
    const cx = p.x/100*Board.viewW, cy=p.y/100*Board.viewH;
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', sizescale);
    circle.setAttribute('fill', color);
    const label=document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('x', cx); label.setAttribute('y', cy); label.textContent=String(i);
    grp.appendChild(circle); grp.appendChild(label);
    g.appendChild(grp);
  }
}

function stageToColor(stage){
  switch(stage){
    case 'early': return '#f59e0b';
    case 'commons': return '#22c55e';
    case 'lords': return '#ef4444';
    case 'implementation': return '#3b82f6';
    case 'start': return '#111';
    case 'end': return '#a855f7';
    default: return '#9ca3af';
  }
}

function updateWizardUI(){
  const placed=Admin.points.length, total=Admin.total;
  $('#wiz-progress').textContent = `${placed}/${total}`;
  $('#wiz-back').disabled = !(Admin.calibrating && placed>0);
  const prompt=$('#wiz-prompt');
  if(!Admin.calibrating){
    prompt.textContent = 'Click Start to begin.';
  }else if(placed<total){
    prompt.textContent = `Step ${placed+1} of ${total} — Click the next square (space #${placed}).`;
  }else{
    prompt.textContent = `All ${total} spaces placed. You can export now.`;
  }
  const allTagged = (Admin.stages.length===total && Admin.decks.length===total && Admin.stages.every(Boolean) && Admin.decks.every(d=>typeof d==='string'));
  $('#export-board').disabled = !(placed===total && allTagged);
}

function exportBoard(){
  const total=Admin.total;
  if(Admin.points.length!==total){ alert('Please finish calibration first.'); return; }
  if(Admin.stages.length!==total || Admin.decks.length!==total){ alert('Please set stage and deck for each space.'); return; }
  const spaces = Admin.points.map((p,i)=>({ index:i, x:+p.x, y:+p.y, stage: Admin.stages[i], deck: Admin.decks[i] }));
  const data={ asset:'assets/board.png', spaces };
  downloadJSON('board.json', data);
  stopWizard();
}
