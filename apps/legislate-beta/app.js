
(function(){
  const LS_PATH = 'legislate_svg_path_v1';
  const TOKEN_COLORS = ['#ef4444','#22c55e','#3b82f6','#eab308']; // red, green, blue, amber
  const $ = s => document.querySelector(s);
  const on = (el, ev, fn) => el.addEventListener(ev, fn);

  const state = {
    path: [],
    board: { w:0, h:0, href:'board.png' },
    calibrating: false,
    idx: 0,
    players: 2,
    turn: 0, // 0..players-1
    pos: [], // per-player index along path
  };

  // --- Storage helpers ---
  function loadSavedPath(){
    try{ const s = localStorage.getItem(LS_PATH); if(s) state.path = JSON.parse(s); }catch{}
  }
  function savePath(){ try{ localStorage.setItem(LS_PATH, JSON.stringify(state.path)); }catch{} }

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

  // --- SVG board ---
  function buildSVG(nw, nh){
    const host = $('.board-host'); host.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class','board');
    svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');

    const img = document.createElementNS(svgNS, 'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink','href', state.board.href);
    img.setAttribute('href', state.board.href);
    img.setAttribute('x','0'); img.setAttribute('y','0');
    img.setAttribute('width', nw); img.setAttribute('height', nh);
    svg.appendChild(img);

    // Tokens (up to 4)
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

    // Crosshair for calibration
    const cross = document.createElementNS(svgNS,'g');
    cross.setAttribute('class','cross');
    cross.setAttribute('id','cross');
    const h = document.createElementNS(svgNS,'line');
    const v = document.createElementNS(svgNS,'line');
    cross.appendChild(h); cross.appendChild(v);
    svg.appendChild(cross);

    // Click to set path point in calibration mode
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
    state.path[i]=xy;
    savePath();
  }

  function moveTokenToIndex(player, i){
    if(player >= state.players) return; // hide unused players
    state.pos[player] = Math.max(0, Math.min(i, state.path.length-1));
    const g = $(`#tok${player}`);
    const p = state.path[state.pos[player]] || [0,0];
    g.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
  }

  function placeAllTokens(){
    for(let i=0;i<4;i++){
      const g = $(`#tok${i}`);
      if(i < state.players){ g.style.display=''; moveTokenToIndex(i, 0); }
      else { g.style.display='none'; }
    }
  }

  function animateSteps(player, steps, cb){
    if(steps<=0){ cb&&cb(); return; }
    const target = Math.min(state.path.length-1, (state.pos[player]||0) + steps);
    const tick = ()=>{
      const next = (state.pos[player]||0) + 1;
      moveTokenToIndex(player, next);
      if(next >= target){ cb&&cb(); return; }
      setTimeout(tick, 200);
    };
    tick();
  }

  function render(){
    $('#idx').textContent = String(state.idx);
    $('#len').textContent = String(state.path.length);
    // crosshair
    const p = state.path[state.idx] || [0,0];
    const h = $('#cross').children[0];
    const v = $('#cross').children[1];
    h.setAttribute('x1',0); h.setAttribute('y1',p[1]); h.setAttribute('x2',state.board.w); h.setAttribute('y2',p[1]);
    v.setAttribute('x1',p[0]); v.setAttribute('y1',0); v.setAttribute('x2',p[0]); v.setAttribute('y2',state.board.h);
    // tokens
    placeAllTokens();
    $('#turn').textContent = `Turn: Player ${state.turn+1}`;
  }

  function loadBoard(){
    const img = new Image();
    img.onload = function(){
      state.board.w = img.naturalWidth;
      state.board.h = img.naturalHeight;
      buildSVG(state.board.w, state.board.h);
      render();
    };
    img.onerror = function(){ $('.board-host').innerHTML = '<div class="err">Failed to load board.png</div>'; };
    img.src = state.board.href;
  }

  function getSelectedPlayers(){
    const v = document.querySelector('input[name="players"]:checked')?.value || '2';
    return Math.max(2, Math.min(4, parseInt(v,10)||2));
  }

  // --- Game flow ---
  function startGame(){
    state.players = getSelectedPlayers();
    state.turn = 0;
    state.pos = Array(state.players).fill(0);
    $('#setup').style.display = 'none';
    render();
    showModal('Start', `Game started with ${state.players} players. Player 1 begins.`, ()=>{});
  }

  function roll(){
    if(state.path.length < 2){ showModal('Path needed','Please import or set your path first.',()=>{}); return; }
    const n = Math.floor(Math.random()*6)+1;
    $('#dice').textContent = String(n);
    const player = state.turn;
    animateSteps(player, n, ()=>{
      // End of turn
      state.turn = (state.turn + 1) % state.players;
      $('#turn').textContent = `Turn: Player ${state.turn+1}`;
    });
  }

  // --- Bind UI ---
  function bind(){
    on($('#btn-start'),'click', startGame);
    on($('#btn-calib'),'click', ()=>{
      state.calibrating = !state.calibrating;
      $('#btn-calib').textContent = state.calibrating ? 'Calibrating…' : 'Calibrate';
    });
    on($('#btn-prev'),'click', ()=>{ state.idx = Math.max(0, state.idx-1); render(); });
    on($('#btn-next'),'click', ()=>{ state.idx = Math.min(state.path.length, state.idx+1); render(); });
    on($('#btn-export'),'click', ()=>{
      const blob = new Blob([JSON.stringify(state.path,null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'path-native.json'; a.click();
    });
    on($('#btn-import'),'click', ()=> $('#file-import').click());
    on($('#file-import'),'change', (e)=>{
      const f = e.target.files[0]; if(!f) return;
      const rdr = new FileReader();
      rdr.onload = ()=>{ try{ const arr = JSON.parse(rdr.result);
        if(Array.isArray(arr)){ state.path = arr; state.idx=0; state.pos = Array(state.players).fill(0); savePath(); render(); } }catch{} };
      rdr.readAsText(f);
    });
    on($('#btn-reset'),'click', ()=>{ if(confirm('Clear saved SVG path?')){ localStorage.removeItem(LS_PATH); state.path=[]; state.idx=0; state.pos=Array(state.players).fill(0); render(); }});
    on($('#btn-roll'),'click', roll);
    on($('#btn-step'),'click', ()=> animateSteps(state.turn, 1));
  }

  // Init
  loadSavedPath();
  bind();
  loadBoard();
})();