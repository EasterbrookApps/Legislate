
let Admin={unlocked:false,calibrating:false,clicks:[],stages:[],deckmap:{},selectedIndex:0,walkMode:false,totalSpaces:58};

function setupAdmin(){
  $('#admin-toggle').addEventListener('click', ()=> $('#admin-panel').classList.toggle('hidden'));
  $('#admin-close').addEventListener('click', ()=> $('#admin-panel').classList.add('hidden'));
  $('#admin-login').addEventListener('click', onAdminLogin);
  $('#calib-start').addEventListener('click', startCalibration);
  $('#calib-stop').addEventListener('click', stopCalibration);
  $('#calib-back').addEventListener('click', backCalibrationPoint);
  $('#export-board').addEventListener('click', exportBoard);
  $('#open-admin-from-error').addEventListener('click', ()=> $('#admin-panel').classList.remove('hidden'));
  // Mapping controls
  $('#walk-mode').addEventListener('change', (e)=>{ Admin.walkMode = e.target.checked; ensureMiniEditorVisible(); });
  $('#walk-prev').addEventListener('click', ()=> { stepTo(Math.max(0, Admin.selectedIndex-1)); });
  $('#walk-next').addEventListener('click', ()=> { stepTo(Math.min((currentSpacesSource()?.length||Admin.totalSpaces)-1, Admin.selectedIndex+1)); });
  const ts=$('#total-spaces'); if(ts){ ts.addEventListener('change', ()=>{ const v=parseInt(ts.value,10)||58; Admin.totalSpaces=Math.max(2, v); updateProgress(); }); Admin.totalSpaces=parseInt(ts.value,10)||58; }

  // Click board to edit nearest
  Board.svg.addEventListener('click', (evt)=>{
    if(Admin.calibrating) return;
    if($('#admin-tools').classList.contains('hidden')) return;
    const src = currentSpacesSource();
    if(!src) return;
    const pt = Board.svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY;
    const ctm=Board.svg.getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
    // find nearest among available points
    let best={i:-1,d2:1e12};
    for(let i=0;i<src.length;i++){
      const sx=src[i].x/100*Board.viewW, sy=src[i].y/100*Board.viewH;
      const dx=sx-loc.x, dy=sy-loc.y; const d2=dx*dx+dy*dy;
      if(d2<best.d2){ best={i,d2}; }
    }
    if(best.i>=0){ selectIndex(best.i); }
  });
}

function onAdminLogin(){
  const pass=$('#admin-pass').value;
  if(pass==='legislate'){
    Admin.unlocked=true;
    $('#admin-auth').classList.add('hidden'); $('#admin-tools').classList.remove('hidden'); $('#admin-auth-msg').textContent='';
    $('#error-overlay').classList.add('hidden');
    loadExistingToAdminMemory();
    updateProgress();
    ensureMiniEditorVisible();
  }else{
    $('#admin-auth-msg').textContent='Incorrect password';
  }
}

function loadExistingToAdminMemory(){
  if(GameState.board && GameState.board.spaces){
    // Seed stages from existing board
    Admin.stages = GameState.board.spaces.map(s => s.stage || 'early');
    Admin.deckmap = {};
    GameState.board.spaces.forEach(sp => { if(sp.deck && sp.deck!=='none') Admin.deckmap[String(sp.index)] = sp.deck; });
    if(Object.keys(Admin.deckmap).length===0 && GameState.board.decks){ Admin.deckmap = {...GameState.board.decks}; }
    Admin.totalSpaces = GameState.board.spaces.length;
    const ts=$('#total-spaces'); if(ts){ ts.value=String(Admin.totalSpaces); }
  }
}

function currentSpacesSource(){
  if(Admin.clicks.length>0) return Admin.clicks;  // allow partial calibration
  if(GameState.board && GameState.board.spaces) return GameState.board.spaces;
  return null;
}

function startCalibration(){
  Admin.calibrating=true; Admin.clicks=[]; $('#calib-status').textContent='Click spaces in order.';
  Board.crosshairsLayer.style.display='block'; Board.svg.addEventListener('click', onBoardClickCalibrate); renderCrosshairs(); updateProgress();
}

function stopCalibration(){
  Admin.calibrating=false; Board.crosshairsLayer.style.display='none'; Board.svg.removeEventListener('click', onBoardClickCalibrate);
  $('#calib-status').textContent=`Captured ${Admin.clicks.length}/${Admin.totalSpaces}`;
  if(Admin.clicks.length>0){ Admin.selectedIndex = Math.min(Admin.selectedIndex, Admin.clicks.length-1); ensureMiniEditorVisible(); updateProgress(); }
}

function backCalibrationPoint(){
  if(Admin.clicks.length>0){
    Admin.clicks.pop();
    $('#calib-status').textContent=`Captured ${Admin.clicks.length}/${Admin.totalSpaces}`;
    renderCrosshairs(); ensureMiniEditorVisible(); updateProgress();
  }
}

function onBoardClickCalibrate(evt){
  const pt=Board.svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY; const ctm=Board.svg.getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
  const xPct=(loc.x/Board.viewW)*100, yPct=(loc.y/Board.viewH)*100;
  if(Admin.clicks.length>=Admin.totalSpaces){ $('#calib-status').textContent=`Reached ${Admin.totalSpaces} spaces.`; return; }
  Admin.clicks.push({index:Admin.clicks.length, x:xPct, y:yPct, stage:'early'});
  $('#calib-status').textContent=`Captured ${Admin.clicks.length}/${Admin.totalSpaces}`;
  renderCrosshairs(); ensureMiniEditorVisible(); updateProgress();
}

function renderCrosshairs(){ const g=Board.crosshairsLayer; g.innerHTML=''; Admin.clicks.forEach((p)=>{ const gh=document.createElementNS('http://www.w3.org/2000/svg','g'); gh.setAttribute('class','crosshair');
  const lh=document.createElementNS('http://www.w3.org/2000/svg','line'); const lv=document.createElementNS('http://www.w3.org/2000/svg','line'); const circ=document.createElementNS('http://www.w3.org/2000/svg','circle');
  lh.setAttribute('x1', p.x/100*Board.viewW-8); lh.setAttribute('x2', p.x/100*Board.viewW+8); lh.setAttribute('y1', p.y/100*Board.viewH); lh.setAttribute('y2', p.y/100*Board.viewH);
  lv.setAttribute('y1', p.y/100*Board.viewH-8); lv.setAttribute('y2', p.y/100*Board.viewH+8); lv.setAttribute('x1', p.x/100*Board.viewW); lv.setAttribute('x2', p.x/100*Board.viewW);
  circ.setAttribute('cx', p.x/100*Board.viewW); circ.setAttribute('cy', p.y/100*Board.viewH); circ.setAttribute('r', 6); gh.appendChild(lh); gh.appendChild(lv); gh.appendChild(circ); g.appendChild(gh); }); }

function ensureMiniEditorVisible(){
  const mini=$('#mini-editor'); const src=currentSpacesSource(); if(!src){ mini.classList.add('hidden'); return; }
  if(Admin.selectedIndex >= src.length) Admin.selectedIndex = Math.max(0, src.length-1);
  mini.classList.remove('hidden');
  renderMiniEditor(Admin.selectedIndex);
}

function renderMiniEditor(i){
  const mini=$('#mini-editor'); const src=currentSpacesSource(); if(!src || i<0 || i>=src.length){ mini.classList.add('hidden'); return; }
  const decks=['none','early','commons','lords','implementation','pingpong']; const options=['start','early','commons','lords','implementation','end'];
  const stg=(Admin.stages[i]||'early'); const curDeck=(Admin.deckmap[String(i)]||'none');
  mini.innerHTML = `<h4>Editing space #${i}</h4>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
      <label style="flex:1">Stage<br/>
        <select id="mini-stage">` + options.map(o=> `<option value="${o}" ${stg===o?'selected':''}>${o}</option>`).join('') + `</select>
      </label>
      <label style="flex:1">Deck<br/>
        <select id="mini-deck">` + decks.map(d=> `<option value="${d}" ${curDeck===d?'selected':''}>${d}</option>`).join('') + `</select>
      </label>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
      <button id="mini-set0" class="btn subtle">Set as 0</button>
      <button id="mini-prev" class="btn subtle">◀ Prev</button>
      <button id="mini-save" class="btn">Save</button>
      <button id="mini-savenext" class="btn">Save & Next ▶</button>
      <button id="mini-next" class="btn subtle">Next ▶</button>
    </div>`;
  drawActiveRing(i);
  $('#mini-prev').addEventListener('click', ()=> stepTo(Math.max(0,i-1)));
  $('#mini-next').addEventListener('click', ()=> stepTo(Math.min((currentSpacesSource()?.length||Admin.totalSpaces)-1,i+1)));
  $('#mini-save').addEventListener('click', ()=> saveEditor(i, false));
  $('#mini-savenext').addEventListener('click', ()=> saveEditor(i, true));
  $('#mini-set0').addEventListener('click', ()=> setAsZero(i));
}

function selectIndex(i){ Admin.selectedIndex=i; ensureMiniEditorVisible(); }

function saveEditor(i, andNext){
  const ns=$('#mini-stage').value; const nd=$('#mini-deck').value;
  Admin.stages[i]=ns; if(nd==='none') delete Admin.deckmap[String(i)]; else Admin.deckmap[String(i)]=nd;
  updateProgress();
  if(andNext){ stepTo(Math.min((currentSpacesSource()?.length||Admin.totalSpaces)-1, i+1)); } else { renderMiniEditor(i); }
}

function stepTo(i){ Admin.selectedIndex=i; renderMiniEditor(i); }

function updateProgress(){
  const available = currentSpacesSource(); const cap = available ? available.length : 0; let complete=0; const total = Admin.totalSpaces||58;
  for(let i=0;i<cap;i++){ const st=Admin.stages[i]; const dk=Admin.deckmap[String(i)]; if(st && typeof st==='string' && dk && dk!=='none') complete++; }
  const pct = total? Math.round(100*complete/total) : 0;
  const bar = $('#progress-bar'); const label=$('#progress-label');
  label.textContent = `${complete}/${total} complete`;
  bar.setAttribute('data-level', pct<34 ? 'red' : (pct<67 ? 'yellow' : 'green'));
  bar.style.setProperty('--pct', pct+'%');
  $('#export-board').disabled = !(cap===total && complete===total);
  drawActiveRing(Admin.selectedIndex);
}

function setAsZero(i){
  if(Admin.clicks.length===0){ alert('Set as 0 is available after you start calibration.'); return; }
  const cap = Admin.clicks.length;
  const a = Admin.clicks.slice(i).concat(Admin.clicks.slice(0,i));
  for(let k=0;k<a.length;k++){ a[k].index=k; }
  Admin.clicks = a;
  const s = Admin.stages.slice(i, i+cap).concat(Admin.stages.slice(0, i));
  Admin.stages = s.concat(Admin.stages.slice(cap));
  const newDeck = {};
  for(let k=0;k<cap;k++){
    const oldIdx = (i + k) % cap;
    const val = Admin.deckmap[String(oldIdx)];
    if(val) newDeck[String(k)] = val;
  }
  Admin.deckmap = newDeck;
  Admin.selectedIndex = 0;
  renderCrosshairs(); renderMiniEditor(0); updateProgress();
}

function exportBoard(){
  const src = currentSpacesSource(); const total=Admin.totalSpaces||58;
  if(!src || src.length!==total){ alert(`Please calibrate first (${total} points).`); return; }
  const spaces = src.slice(0,total).map((c,i)=>({ index:i, x:+c.x, y:+c.y, stage: Admin.stages[i] || 'early', deck: (Admin.deckmap[String(i)] || 'none') }));
  const data={ asset:'assets/board.png', spaces: spaces };
  downloadJSON('board.json', data);
}
