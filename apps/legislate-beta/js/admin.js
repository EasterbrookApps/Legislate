
let Admin={unlocked:false,calibrating:false,clicks:[],stages:[],deckmap:{},selectedIndex:0,walkMode:false};

function setupAdmin(){
  $('#admin-toggle').addEventListener('click', ()=> $('#admin-panel').classList.toggle('hidden'));
  $('#admin-close').addEventListener('click', ()=> $('#admin-panel').classList.add('hidden'));
  $('#admin-login').addEventListener('click', onAdminLogin);
  $('#calib-start').addEventListener('click', startCalibration);
  $('#calib-stop').addEventListener('click', stopCalibration);
  $('#export-board').addEventListener('click', exportBoard);
  $('#open-admin-from-error').addEventListener('click', ()=> $('#admin-panel').classList.remove('hidden'));
  // Mapping controls
  $('#walk-mode').addEventListener('change', (e)=>{ Admin.walkMode = e.target.checked; ensureMiniEditorVisible(); });
  $('#walk-prev').addEventListener('click', ()=> { stepTo(Math.max(0, Admin.selectedIndex-1)); });
  $('#walk-next').addEventListener('click', ()=> { stepTo(Math.min(57, Admin.selectedIndex+1)); });

  // Click board to edit nearest
  Board.svg.addEventListener('click', (evt)=>{
    if(Admin.calibrating) return;
    if($('#admin-tools').classList.contains('hidden')) return;
    const src = currentSpacesSource();
    if(!src) return;
    const pt = Board.svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY;
    const ctm=Board.svg.getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
    // find nearest
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
    // Hide config overlay if visible
    $('#error-overlay').classList.add('hidden');
    // Initialize mapping UI
    loadExistingToAdminMemory();
    updateProgress();
    ensureMiniEditorVisible();
  }else{
    $('#admin-auth-msg').textContent='Incorrect password';
  }
}

function loadExistingToAdminMemory(){
  const src = currentSpacesSource();
  if(!src && GameState.board && GameState.board.spaces){
    // Use board spaces as source (read-only positions)
  }
  // Seed stages from board if not present
  if(GameState.board && GameState.board.spaces && Admin.stages.length!==58){
    Admin.stages = GameState.board.spaces.map(s => s.stage || 'early');
  }else if(Admin.clicks.length===58 && Admin.stages.length!==58){
    Admin.stages = Admin.clicks.map(c => c.stage || 'early');
  }
  // Seed deckmap from combined or deck map
  if(GameState.board && GameState.board.spaces){
    Admin.deckmap = {};
    GameState.board.spaces.forEach(sp => {
      if(sp.deck && sp.deck!=='none') Admin.deckmap[String(sp.index)] = sp.deck;
    });
    // Fallback to legacy decks map
    if(Object.keys(Admin.deckmap).length===0 && GameState.board.decks){
      Admin.deckmap = {...GameState.board.decks};
    }
  }
}

function currentSpacesSource(){
  if(Admin.clicks.length===58) return Admin.clicks;
  if(GameState.board && GameState.board.spaces && GameState.board.spaces.length===58) return GameState.board.spaces;
  return null;
}

function startCalibration(){
  Admin.calibrating=true; Admin.clicks=[]; $('#calib-status').textContent='Click 58 spaces in order.';
  Board.crosshairsLayer.style.display='block'; Board.svg.addEventListener('click', onBoardClickCalibrate); renderCrosshairs();
}

function stopCalibration(){
  Admin.calibrating=false; Board.crosshairsLayer.style.display='none'; Board.svg.removeEventListener('click', onBoardClickCalibrate);
  $('#calib-status').textContent=`Captured ${Admin.clicks.length} points.`;
  if(Admin.clicks.length===58){
    Admin.stages = Admin.clicks.map(c => c.stage || 'early');
    Admin.selectedIndex = 0;
    updateProgress(); ensureMiniEditorVisible();
  }
}

function onBoardClickCalibrate(evt){
  const pt=Board.svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY; const ctm=Board.svg.getScreenCTM().inverse(); const loc=pt.matrixTransform(ctm);
  const xPct=(loc.x/Board.viewW)*100, yPct=(loc.y/Board.viewH)*100;
  if(Admin.clicks.length<58){
    Admin.clicks.push({index:Admin.clicks.length, x:xPct, y:yPct, stage:'early'});
    $('#calib-status').textContent=`Captured ${Admin.clicks.length}/58`; renderCrosshairs();
    if(Admin.clicks.length===58){ stopCalibration(); }
  }
}

function renderCrosshairs(){ const g=Board.crosshairsLayer; g.innerHTML=''; Admin.clicks.forEach((p)=>{ const gh=document.createElementNS('http://www.w3.org/2000/svg','g'); gh.setAttribute('class','crosshair');
  const lh=document.createElementNS('http://www.w3.org/2000/svg','line'); const lv=document.createElementNS('http://www.w3.org/2000/svg','line'); const circ=document.createElementNS('http://www.w3.org/2000/svg','circle');
  lh.setAttribute('x1', p.x/100*Board.viewW-8); lh.setAttribute('x2', p.x/100*Board.viewW+8); lh.setAttribute('y1', p.y/100*Board.viewH); lh.setAttribute('y2', p.y/100*Board.viewH);
  lv.setAttribute('y1', p.y/100*Board.viewH-8); lv.setAttribute('y2', p.y/100*Board.viewH+8); lv.setAttribute('x1', p.x/100*Board.viewW); lv.setAttribute('x2', p.x/100*Board.viewW);
  circ.setAttribute('cx', p.x/100*Board.viewW); circ.setAttribute('cy', p.y/100*Board.viewH); circ.setAttribute('r', 6); gh.appendChild(lh); gh.appendChild(lv); gh.appendChild(circ); g.appendChild(gh); }); }

function ensureMiniEditorVisible(){
  const mini=$('#mini-editor');
  const src=currentSpacesSource();
  if(!src){ mini.classList.add('hidden'); return; }
  mini.classList.remove('hidden');
  renderMiniEditor(Admin.selectedIndex);
}

function renderMiniEditor(i){
  const mini=$('#mini-editor'); const src=currentSpacesSource(); if(!src){ mini.classList.add('hidden'); return; }
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
  // Highlight ring on board
  drawActiveRing(i);
  // Wire actions
  $('#mini-prev').addEventListener('click', ()=> stepTo(Math.max(0,i-1)));
  $('#mini-next').addEventListener('click', ()=> stepTo(Math.min(57,i+1)));
  $('#mini-save').addEventListener('click', ()=> saveEditor(i, false));
  $('#mini-savenext').addEventListener('click', ()=> saveEditor(i, true));
  $('#mini-set0').addEventListener('click', ()=> setAsZero(i));
}

function selectIndex(i){ Admin.selectedIndex=i; ensureMiniEditorVisible(); }

function saveEditor(i, andNext){
  const ns=$('#mini-stage').value; const nd=$('#mini-deck').value;
  Admin.stages[i]=ns; if(nd==='none') delete Admin.deckmap[String(i)]; else Admin.deckmap[String(i)]=nd;
  updateProgress();
  if(andNext){ stepTo(Math.min(57, i+1)); } else { renderMiniEditor(i); }
}

function stepTo(i){ Admin.selectedIndex=i; renderMiniEditor(i); }

function updateProgress(){
  // Count spaces that have stage + deck set
  let total=58, complete=0;
  for(let i=0;i<58;i++){
    const st = Admin.stages[i];
    const dk = Admin.deckmap[String(i)];
    if(st && typeof st==='string' && dk && dk!=='none') complete++;
  }
  const pct = Math.round(100*complete/total);
  const bar = $('#progress-bar'); const label=$('#progress-label');
  label.textContent = `${complete}/58 complete`;
  bar.style.setProperty('--w', pct+'%');
  bar.style.position='relative';
  bar.style.setProperty('background-size', pct+'% 100%');
  bar.style.setProperty('overflow', 'hidden');
  // Set width via ::after by data attr
  bar.setAttribute('data-fill', pct);
  bar.querySelector ? null : null;
  bar.style.setProperty('--pct', pct);
  // Colour bands
  bar.setAttribute('data-level', pct<34 ? 'red' : (pct<67 ? 'yellow' : 'green'));
  // Enable export only when 58/58
  const canExport = (complete===total);
  $('#export-board').disabled = !canExport;
  // Also update board preview ring
  drawActiveRing(Admin.selectedIndex);
}

function setAsZero(i){
  // Only possible when we have Admin.clicks (fresh calibration). Rotate clicks so i becomes 0.
  if(Admin.clicks.length!==58){ alert('Set as 0 is available after a fresh calibration.'); return; }
  const a = Admin.clicks.slice(i).concat(Admin.clicks.slice(0,i));
  Admin.clicks = a.map((c, idx)=> ({...c, index: idx}));
  // Rotate stages and deckmap to match
  const s = Admin.stages.slice(i).concat(Admin.stages.slice(0,i));
  Admin.stages = s;
  const newDeck = {};
  for(let k=0;k<58;k++){
    const oldIdx = (i + k) % 58;
    const val = Admin.deckmap[String(oldIdx)];
    if(val) newDeck[String(k)] = val;
  }
  Admin.deckmap = newDeck;
  Admin.selectedIndex = 0;
  renderCrosshairs();
  renderMiniEditor(0);
  updateProgress();
}

function exportBoard(){
  const src = currentSpacesSource();
  if(!src || src.length!==58){ alert('Please calibrate first (58 points).'); return; }
  // Build combined spaces with deck per space
  const spaces = src.map((c,i)=>({ index:i, x:+c.x, y:+c.y, stage: Admin.stages[i] || 'early', deck: (Admin.deckmap[String(i)] || 'none') }));
  const data={ asset:'assets/board.png', spaces: spaces };
  downloadJSON('board.json', data);
}
