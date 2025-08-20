
let Admin={unlocked:false,calibrating:false,clicks:[],stages:[],deckmap:{}};
function setupAdmin(){
  $('#admin-toggle').addEventListener('click', ()=> $('#admin-panel').classList.toggle('hidden'));
  $('#admin-close').addEventListener('click', ()=> $('#admin-panel').classList.add('hidden'));
  $('#admin-login').addEventListener('click', ()=>{ const pass=$('#admin-pass').value; if(pass==='legislate'){ Admin.unlocked=true; $('#admin-auth').classList.add('hidden'); $('#admin-tools').classList.remove('hidden'); $('#admin-auth-msg').textContent=''; populateStageTable(); populateDeckmapTable(); } else { $('#admin-auth-msg').textContent='Incorrect password'; }});
  $('#calib-start').addEventListener('click', startCalibration); $('#calib-stop').addEventListener('click', stopCalibration); $('#export-board').addEventListener('click', exportBoard);
  $('#open-admin-from-error').addEventListener('click', ()=> $('#admin-panel').classList.remove('hidden'));
}
function startCalibration(){ Admin.calibrating=true; Admin.clicks=[]; $('#calib-status').textContent='Click 58 spaces in order.'; Board.crosshairsLayer.style.display='block'; Board.svg.addEventListener('click', onBoardClickCalibrate); renderCrosshairs(); }
function stopCalibration(){ Admin.calibrating=false; Board.crosshairsLayer.style.display='none'; Board.svg.removeEventListener('click', onBoardClickCalibrate); $('#calib-status').textContent=`Captured ${Admin.clicks.length} points.`; }
function onBoardClickCalibrate(evt){ const pt=Board.svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY; const ctm=Board.svg.getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
  const xPct=(loc.x/Board.viewW)*100, yPct=(loc.y/Board.viewH)*100;
  if(Admin.clicks.length<58){ Admin.clicks.push({index:Admin.clicks.length, x:xPct, y:yPct, stage:'early'}); $('#calib-status').textContent=`Captured ${Admin.clicks.length}/58`; renderCrosshairs();
    if(Admin.clicks.length===58){ stopCalibration(); if(Admin.stages.length!==58){ Admin.stages=Admin.clicks.map(c=>c.stage);} populateStageTable(); } } }
function renderCrosshairs(){ const g=Board.crosshairsLayer; g.innerHTML=''; Admin.clicks.forEach((p)=>{ const gh=document.createElementNS('http://www.w3.org/2000/svg','g'); gh.setAttribute('class','crosshair');
  const lh=document.createElementNS('http://www.w3.org/2000/svg','line'); const lv=document.createElementNS('http://www.w3.org/2000/svg','line'); const circ=document.createElementNS('http://www.w3.org/2000/svg','circle');
  lh.setAttribute('x1', p.x/100*Board.viewW-8); lh.setAttribute('x2', p.x/100*Board.viewW+8); lh.setAttribute('y1', p.y/100*Board.viewH); lh.setAttribute('y2', p.y/100*Board.viewH);
  lv.setAttribute('y1', p.y/100*Board.viewH-8); lv.setAttribute('y2', p.y/100*Board.viewH+8); lv.setAttribute('x1', p.x/100*Board.viewW); lv.setAttribute('x2', p.x/100*Board.viewW);
  circ.setAttribute('cx', p.x/100*Board.viewW); circ.setAttribute('cy', p.y/100*Board.viewH); circ.setAttribute('r', 6); gh.appendChild(lh); gh.appendChild(lv); gh.appendChild(circ); g.appendChild(gh); }); }
function populateStageTable(){ const div=$('#stage-table'); if(Admin.clicks.length!==58 && (!GameState.board||!GameState.board.spaces||GameState.board.spaces.length!==58)){ div.innerHTML='<div class="muted">Calibrate first to capture 58 spaces.</div>'; return; }
  const spaces=Admin.clicks.length===58? Admin.clicks : GameState.board.spaces; if(Admin.stages.length!==58){ Admin.stages=spaces.map(s=> s.stage||'early'); }
  const options=['start','early','commons','lords','implementation','end']; let html='<table style="width:100%"><tr><th>#</th><th>Stage</th></tr>';
  for(let i=0;i<58;i++){ html+=`<tr><td>${i}</td><td><select data-idx="${i}">`+options.map(o=>`<option value="${o}" ${Admin.stages[i]===o?'selected':''}>${o}</option>`).join('')+`</select></td></tr>`;}
  html+='</table>'; div.innerHTML=html; $all('select[data-idx]',div).forEach(sel=>{ sel.addEventListener('change', ()=>{ Admin.stages[parseInt(sel.getAttribute('data-idx'))]=sel.value; }); }); }
function populateDeckmapTable(){ const div=$('#deckmap-table'); const decks=['none','early','commons','lords','implementation','pingpong'];
  if(!Admin.deckmap||Object.keys(Admin.deckmap).length===0){ if(GameState.board&&GameState.board.decks){ Admin.deckmap={...GameState.board.decks}; } else { Admin.deckmap={}; } }
  let html='<table style="width:100%"><tr><th>#</th><th>Draws From</th></tr>'; for(let i=0;i<58;i++){ const cur=Admin.deckmap[String(i)]||'none';
    html+=`<tr><td>${i}</td><td><select data-di="${i}">`+decks.map(d=>`<option value="${d}" ${cur===d?'selected':''}>${d}</option>`).join('')+`</select></td></tr>`; } html+='</table>';
  div.innerHTML=html; $all('select[data-di]',div).forEach(sel=>{ sel.addEventListener('change', ()=>{ const idx=sel.getAttribute('data-di'); const val=sel.value; if(val==='none') delete Admin.deckmap[idx]; else Admin.deckmap[idx]=val; }); }); }
function exportBoard(){ let spaces; if(Admin.clicks.length===58){ spaces=Admin.clicks.map((c,i)=>({index:i,x:+c.x,y:+c.y,stage:Admin.stages[i]||'early'})); }
  else if(GameState.board&&GameState.board.spaces&&GameState.board.spaces.length===58){ spaces=GameState.board.spaces.map(s=>({...s})); }
  else{ alert('Please calibrate first (58 points).'); return; }
  const data={ asset:'assets/board.png', spaces:spaces, decks: Admin.deckmap||{} }; downloadJSON('board.json', data);
}
