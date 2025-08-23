// Minimal but polished-ish editor core (drag, resize, grid snap, export/import)
(function(){
  const grid = document.getElementById('grid');
  const inspector = document.getElementById('inspector-content');
  const components = document.querySelectorAll('.component');
  const state = {
    breakpoint: 'desktop',
    frames: { desktop:[], tablet:[], mobile:[] },
    theme: { colors:{bg:'#ffffff',accent:'#000000',text:'#111111'}, radii:{panel:10}, fonts:{heading:'Inter', body:'Inter'}, shadow:true }
  };

  function snap(x, y){
    const rect = grid.getBoundingClientRect();
    const cols = 12;
    const gx = rect.width / cols;
    const snappedX = Math.round((x - rect.left) / gx) * gx;
    const snappedY = Math.round((y - rect.top) / 10) * 10;
    return { x: Math.max(0,Math.min(snappedX, rect.width-80)), y: Math.max(0,Math.min(snappedY, rect.height-40)) };
  }

  function createFrame(type){
    const frame = document.createElement('div');
    frame.className='frame';
    frame.dataset.type=type;
    frame.style.left='20px'; frame.style.top='20px'; frame.style.width='220px'; frame.style.height='120px';
    frame.innerHTML = '<div class="title">'+type+'</div><div class="handle"></div>';
    grid.appendChild(frame);
    wireFrame(frame);
    selectFrame(frame);
    pushState();
  }

  function wireFrame(frame){
    let dragging=false, resizing=false, sx=0, sy=0, sl=0, st=0, sw=0, sh=0;
    frame.addEventListener('mousedown', e=>{
      if(e.target.classList.contains('handle')){ resizing=true; } else { dragging=true; }
      sx=e.clientX; sy=e.clientY;
      const r=frame.getBoundingClientRect();
      const gr=grid.getBoundingClientRect();
      sl=r.left-gr.left; st=r.top-gr.top; sw=r.width; sh=r.height;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e=>{
      if(!(dragging||resizing)) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(dragging){
        const p = snap(sl+dx + grid.getBoundingClientRect().left, st+dy + grid.getBoundingClientRect().top);
        frame.style.left = p.x+'px'; frame.style.top = p.y+'px';
      }else{
        frame.style.width = Math.max(120, sw+dx)+'px';
        frame.style.height= Math.max(80, sh+dy)+'px';
      }
    });
    document.addEventListener('mouseup', ()=>{
      if(dragging||resizing){ dragging=resizing=false; pushState(); }
    });
    frame.addEventListener('click', ()=> selectFrame(frame));
  }

  function selectFrame(frame){
    inspector.innerHTML = '<div><b>Type:</b> '+frame.dataset.type+'</div>'+
      '<label>Left <input type="number" id="prop-left" value="'+parseInt(frame.style.left)+'"/></label>'+
      '<label>Top <input type="number" id="prop-top" value="'+parseInt(frame.style.top)+'"/></label>'+
      '<label>Width <input type="number" id="prop-width" value="'+parseInt(frame.style.width)+'"/></label>'+
      '<label>Height <input type="number" id="prop-height" value="'+parseInt(frame.style.height)+'"/></label>';
    ['left','top','width','height'].forEach(k=>{
      inspector.querySelector('#prop-'+k).addEventListener('input', ev=>{
        frame.style[k]= parseInt(ev.target.value||0)+'px';
        pushState();
      });
    });
  }

  function pushState(){
    const frames = Array.from(grid.querySelectorAll('.frame')).map(f=>({
      type:f.dataset.type,
      left:parseInt(f.style.left), top:parseInt(f.style.top),
      width:parseInt(f.style.width), height:parseInt(f.style.height)
    }));
    state.frames[state.breakpoint]=frames;
  }

  // components drag-create
  components.forEach(c=> c.addEventListener('click', ()=> createFrame(c.dataset.type)));

  // Breakpoint buttons
  document.getElementById('break-desktop').onclick=()=> switchBP('desktop');
  document.getElementById('break-tablet').onclick=()=> switchBP('tablet');
  document.getElementById('break-mobile').onclick=()=> switchBP('mobile');
  function switchBP(bp){
    state.breakpoint=bp;
    // clear grid
    grid.querySelectorAll('.frame').forEach(n=>n.remove());
    (state.frames[bp]||[]).forEach(f=>{
      const el=document.createElement('div');
      el.className='frame';
      el.dataset.type=f.type;
      el.style.left=f.left+'px'; el.style.top=f.top+'px'; el.style.width=f.width+'px'; el.style.height=f.height+'px';
      el.innerHTML='<div class="title">'+f.type+'</div><div class="handle"></div>';
      grid.appendChild(el); wireFrame(el);
    });
  }

  // Export / Import
  document.getElementById('export').onclick = ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ui-layout.json'; a.click();
  };
  document.getElementById('import').onclick = async ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
    inp.onchange = async ()=>{
      const file = inp.files[0]; const txt = await file.text();
      try{ const obj = JSON.parse(txt); Object.assign(state, obj); switchBP(state.breakpoint||'desktop'); }
      catch(e){ alert('Invalid JSON'); }
    };
    inp.click();
  };

  // Try load current config if present relative to game path
  fetch('../data/ui/ui-layout.json', {cache:'no-store'}).then(r=> r.ok ? r.json(): null).then(obj=>{
    if(obj){ Object.assign(state, obj); }
    switchBP(state.breakpoint||'desktop');
  }).catch(()=> switchBP('desktop'));
})();
