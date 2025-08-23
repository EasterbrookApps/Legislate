
let Board={svg:null,img:null,tokensLayer:null,activeRingLayer:null,viewW:1600,viewH:1000,calibrated:false};
async function loadBoardConfig(){
  try{ const res=await fetch('assets/board.json?cache='+Date.now()); if(!res.ok) throw new Error('Missing'); const data=await res.json(); validateBoard(data); GameState.board=data; Board.calibrated=true; $('#error-overlay').classList.add('hidden'); }
  catch(e){ console.warn('Board config error:', e.message); GameState.board=null; Board.calibrated=false; $('#error-overlay').classList.remove('hidden'); }
}
function validateBoard(data){
  if(!data || !Array.isArray(data.spaces) || data.spaces.length<2) throw new Error('Invalid spaces');
  if(!data.asset) data.asset='assets/board.png';
}
function setupBoardSVG(){
  Board.svg=$('#board-svg'); Board.img=$('#board-image'); Board.tokensLayer=$('#tokens-layer'); Board.activeRingLayer=$('#active-ring-layer');
  const probe=new Image(); probe.onload=()=>{ Board.viewW=probe.naturalWidth||1600; Board.viewH=probe.naturalHeight||1000; Board.svg.setAttribute('viewBox',`0 0 ${Board.viewW} ${Board.viewH}`); Board.img.setAttribute('width',Board.viewW); Board.img.setAttribute('height',Board.viewH); renderTokens(); }; probe.src=Board.img.getAttribute('href');
}
function renderPlayersUI(){
  const container=$('#players'); container.innerHTML='';
  GameState.players.forEach((p,i)=>{ const el=document.createElement('div'); el.className='player';
    const dot=document.createElement('span'); dot.className='dot'; dot.style.background=tokenColor(p.color);
    const input=document.createElement('input'); input.value=p.name; input.addEventListener('input',()=>{ p.name=input.value; if(i===GameState.activeIdx){ $('#active-name').textContent=p.name||`Player ${i+1}`; }});
    el.appendChild(dot); el.appendChild(input); container.appendChild(el); });
}
function tokenColor(c){return c==='red'?'#ef4444':c==='blue'?'#3b82f6':c==='green'?'#22c55e':c==='yellow'?'#f59e0b':c==='purple'?'#a855f7':c==='orange'?'#f97316':'#111';}
function renderTokens(){
  Board.tokensLayer.innerHTML='';
  const countByIndex={};
  GameState.players.forEach(p=>{ const idx=clamp(p.index,0,lastIndex()); countByIndex[idx]=(countByIndex[idx]||0)+1; });
  const stackIndex={};
  GameState.players.forEach(p=>{
    const idx=clamp(p.index,0,lastIndex()); const s=GameState.board && GameState.board.spaces[idx]; if(!s) return;
    stackIndex[idx]=(stackIndex[idx]||0)+1; const k=stackIndex[idx]-1; const total=countByIndex[idx];
    const spread = total>1 ? 16 : 0; const angle=(k-(total-1)/2)*(Math.PI/10); const dx=spread*Math.cos(angle), dy=spread*Math.sin(angle);
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',(s.x/100*Board.viewW+dx).toFixed(2)); c.setAttribute('cy',(s.y/100*Board.viewH+dy).toFixed(2)); c.setAttribute('r',14);
    c.setAttribute('class',`token ${p.color}`); Board.tokensLayer.appendChild(c);
  });
  const ap=GameState.players[GameState.activeIdx]; $('#active-color').style.background=tokenColor(ap.color); $('#active-name').textContent=ap.name;
}
window.addEventListener('resize', ()=> renderTokens());
