
(function(){
  const LS_PATH = 'legislate_svg_path_v1';
  const LEGACY_KEYS = ['legislate_path_v1','legislate:path58'];
  const TOKEN_COLORS = ['#ef4444','#22c55e','#3b82f6','#eab308'];
  const $ = s => document.querySelector(s);
  const on = (el, ev, fn) => el.addEventListener(ev, fn);

  const state = {
    path: [],
    board: { w:0, h:0, href:'board.png' },
    calibrating: false,
    idx: 0,
    players: 2,
    turn: 0,
    pos: [0,0,0,0],
  };

  // --- Modal ---
  function showModal(title, body, onOk){
    $('#modal-title').textContent = title||'Notice';
    $('#modal-body').textContent = body||'';
    const m = $('#modal');
    m.setAttribute('aria-hidden','false');
    const ok = $('#modal-ok');
    const handler = ()=>{ m.setAttribute('aria-hidden','true'); ok.removeEventListener('click', handler); onOk && onOk(); };
    ok.addEventListener('click', handler);
  }

  // --- Read legacy path if exists (compat) ---
  function tryLoadLegacyPath(nw, nh){
    for(const k of LEGACY_KEYS){
      try{
        const raw = localStorage.getItem(k);
        if(!raw) continue;
        const pts = JSON.parse(raw);
        if(!Array.isArray(pts) || !pts.length) continue;
        // Heuristic: % vs px
        const maxVal = pts.reduce((m,p)=>Math.max(m, p && p.length>=2 ? Math.max(p[0],p[1]) : 0), 0);
        const isPercent = maxVal <= 100.0001;
        if(isPercent){
          // Map % -> native pixels directly (works if path was set against image aspect)
          state.path = pts.map(([x,y])=>[ Math.round(x/100*nw), Math.round(y/100*nh) ]);
        }else{
          // Assume px in container space; best-effort scale to native by proportion
          // (If this looks off, please import a real path-native.json)
          const cw = $('.board-host').clientWidth || nw;
          const ch = Math.max($('.board-host').clientHeight || nh, 1);
          const sx = nw / cw, sy = nh / ch;
          state.path = pts.map(([x,y])=>[ Math.round(x*sx), Math.round(y*sy) ]);
        }
        return true;
      }catch{}
    }
    return false;
  }

  // --- Storage ---
  function loadSavedPath(){ try{ const s = localStorage.getItem(LS_PATH); if(s) state.path = JSON.parse(s); }catch{} }
  function savePath(){ try{ localStorage.setItem(LS_PATH, JSON.stringify(state.path)); }catch{} }

  // --- SVG ---
  function buildSVG(nw, nh){
    const host = $('.board-host'); host.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class','board');
    svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');

    const img = document.createElementNS(svgNS,'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink','href', state.board.href);
    img.setAttribute('href', state.board.href);
    img.setAttribute('x','0'); img.setAttribute('y','0');
    img.setAttribute('width', nw); img.setAttribute('height', nh);
    svg.appendChild(img);

    for(let i=0;i<4;i++){
      const g = document.createElementNS(svgNS,'g');
      g.setAttribute('id', `tok${i}`);
      const c = document.createElementNS(svgNS,'circle');
      c.setAttribute('r', Math.max(10, Math.floor(Math.min(nw,nh)*0.014)));
      c.setAttribute('fill', TOKEN_COLORS[i]);
      c.setAttribute('cx','0'); c.setAttribute('cy','0');
      g.appendChild(c);
      svg.appendChild(g);
    }

    const cross = document.createElementNS(svgNS,'g');
    cross.setAttribute('class','cross');
    cross.setAttribute('id','cross');
    const h = document.createElementNS(svgNS,'line');
    const v = document.createElementNS(svgNS,'line');
    cross.appendChild(h); cross.appendChild(v);
    svg.appendChild(cross);

    // click to calibrate
    on(svg,'click',(e)=>{
      if(!state.calibrating) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      setPathPoint(state.idx, [Math.round(loc.x), Math.round(loc.y)]);
      render();
    });

    host.appendChild(svg);
  }

  function setPathPoint(i, xy){
    if(i<0) return;
    if(i>=state.path.length){ for(let k=state.path.length;k<=i;k++) state.path[k]=[0,0]; }
    state.path[i]=xy; savePath();
  }

  function visiblePlayers(){ return Math.max(2, Math.min(4, parseInt(document.querySelector('input[name=\"players\"]:checked')?.value||'2',10))); }

  function placeAllTokens(){
    const n = state.players = visiblePlayers();
    for(let i=0;i<4;i++){
      const g = document.getElementById(`tok${i}`);
      if(i<n){ g.style.display=''; moveTokenToIndex(i, state.pos[i]||0); }
      else { g.style.display='none'; }
    }
  }

  function moveTokenToIndex(player, i){
    const n = state.players;
    if(player >= n) return;
    state.pos[player] = Math.max(0, Math.min(i, state.path.length-1));
    const g = document.getElementById(`tok${player}`);
    const p = state.path[state.pos[player]] || [0,0];
    g.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
  }

  function animateSteps(player, steps, cb){
    if(steps<=0){ cb&&cb(); return; }
    const target = Math.min(state.path.length-1, (state.pos[player]||0)+steps);
    const tick = ()=>{
      const next = (state.pos[player]||0)+1;
      moveTokenToIndex(player, next);
      if(next>=target){ cb&&cb(); return; }
      setTimeout(tick, 200);
    };
    tick();
  }

  function render(){
    document.getElementById('idx').textContent = String(state.idx);
    document.getElementById('len').textContent = String(state.path.length);
    // crosshair
    const p = state.path[state.idx] || [0,0];
    const h = document.getElementById('cross').children[0];
    const v = document.getElementById('cross').children[1];
    h.setAttribute('x1',0); h.setAttribute('y1',p[1]); h.setAttribute('x2',state.board.w); h.setAttribute('y2',p[1]);
    v.setAttribute('x1',p[0]); v.setAttribute('y1',0); v.setAttribute('x2',p[0]); v.setAttribute('y2',state.board.h);
    placeAllTokens();
    document.getElementById('turn').textContent = `Turn: Player ${state.turn+1}`;
  }

  function loadBoard(){
    const img = new Image();
    img.onload = function(){
      state.board.w = img.naturalWidth; state.board.h = img.naturalHeight;
      buildSVG(state.board.w, state.board.h);

      // Prefer saved native path; else try legacy compat
      loadSavedPath();
      if(!state.path.length){ tryLoadLegacyPath(state.board.w, state.board.h); }
      if(!state.path.length){
        // start with a couple of demo points so it's not empty
        state.path = [[40,40],[120,40],[200,40],[280,40],[360,40]];
      }

      render();
    };
    img.onerror = function(){ document.querySelector('.board-host').innerHTML='<div class="err">Failed to load board.png</div>'; };
    img.src = state.board.href;
  }

  function roll(){
    if(state.path.length<2){ showModal('Path needed','Import or set your path first.',()=>{}); return; }
    const n = Math.floor(Math.random()*6)+1; document.getElementById('dice').textContent=String(n);
    const p = state.turn; animateSteps(p, n, ()=>{ state.turn = (state.turn+1) % state.players; document.getElementById('turn').textContent = `Turn: Player ${state.turn+1}`; });
  }

  function bind(){
    on(document.getElementById('btn-calib'),'click', ()=>{
      state.calibrating = !state.calibrating;
      document.getElementById('btn-calib').textContent = state.calibrating ? 'Calibrating…' : 'Calibrate';
    });
    on(document.getElementById('btn-prev'),'click', ()=>{ state.idx = Math.max(0, state.idx-1); render(); });
    on(document.getElementById('btn-next'),'click', ()=>{ state.idx = Math.min(state.path.length, state.idx+1); render(); });
    on(document.getElementById('btn-step'),'click', ()=> animateSteps(state.turn, 1));
    on(document.getElementById('btn-roll'),'click', roll);
    // players change
    document.querySelectorAll('input[name=\"players\"]').forEach(r=> on(r,'change', ()=>{ state.turn=0; placeAllTokens(); }));
    // IO
    on(document.getElementById('btn-export'),'click', ()=>{
      const blob = new Blob([JSON.stringify(state.path,null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='path-native.json'; a.click();
    });
    on(document.getElementById('btn-import'),'click', ()=> document.getElementById('file-import').click());
    on(document.getElementById('file-import'),'change', (e)=>{
      const f = e.target.files[0]; if(!f) return;
      const rdr = new FileReader();
      rdr.onload = ()=>{ try{ const arr = JSON.parse(rdr.result);
        if(Array.isArray(arr)){ state.path = arr; state.idx=0; state.pos=[0,0,0,0]; savePath(); render(); } }catch{ showModal('Import failed','Could not parse JSON.',()=>{}); } };
      rdr.readAsText(f);
    });
    on(document.getElementById('btn-reset'),'click', ()=>{
      if(confirm('Clear saved SVG path?')){ localStorage.removeItem(LS_PATH); state.path=[]; state.idx=0; state.pos=[0,0,0,0]; render(); }
    });
  }

  bind();
  loadBoard();
})();