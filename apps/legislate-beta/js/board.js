
let Board={svg:null,img:null,tokensLayer:null,activeRingLayer:null,viewW:1600,viewH:1000};
async function loadBoardConfig(){
  try{ const res=await fetch('assets/board.json?c='+Date.now()); if(!res.ok) throw new Error('missing'); const data=await res.json(); validateBoard(data); GameState.board=data; }
  catch(e){ console.warn('board.json missing or invalid'); GameState.board=null; }
}
function validateBoard(data){
  if(!data || !Array.isArray(data.spaces) || data.spaces.length<2) throw new Error('invalid');
  if(!data.asset) data.asset='assets/board.png';
  // normalize decks map if per-space deck exists
  if(!data.decks){ data.decks={}; }
  data.spaces.forEach(sp=>{ if(sp.deck && sp.deck!=='none'){ data.decks[String(sp.index)]=sp.deck; } });
}
function setupBoardSVG(){
  Board.svg=$('#board-svg'); Board.img=$('#board-image'); Board.tokensLayer=$('#tokens-layer'); Board.activeRingLayer=$('#active-ring-layer');
  const probe=new Image(); probe.onload=()=>{ Board.viewW=probe.naturalWidth||1600; Board.viewH=probe.naturalHeight||1000;
    Board.svg.setAttribute('viewBox',`0 0 ${Board.viewW} ${Board.viewH}`);
    Board.img.setAttribute('width',Board.viewW); Board.img.setAttribute('height',Board.viewH);
    renderTokens(); }; probe.src=Board.img.getAttribute('href');
}
function tokenColor(c){return c==='red'?'#ef4444':c==='blue'?'#3b82f6':c==='green'?'#22c55e':c==='yellow'?'#f59e0b':c==='purple'?'#a855f7':c==='orange'?'#f97316':'#111';}
function renderTokens(){
  Board.tokensLayer.innerHTML='';
  const offsets={}; GameState.players.forEach(p=>{ if(p.eliminated) return; const idx=clamp(p.index,0,lastIndex()); offsets[idx]=(offsets[idx]||0)+1; });
  const perIndexCount={};
  GameState.players.forEach(p=>{
    const idx=clamp(p.index,0,lastIndex()); const s=GameState.board && GameState.board.spaces[idx]; if(!s) return;
    perIndexCount[idx]=(perIndexCount[idx]||0)+1; const countAt=offsets[idx]; const k=perIndexCount[idx]-1; const r=countAt>1?14:0; const angle=(k-(countAt-1)/2)*(Math.PI/10); const dx=r*Math.cos(angle), dy=r*Math.sin(angle);
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',(s.x/100*Board.viewW+dx).toFixed(2)); c.setAttribute('cy',(s.y/100*Board.viewH+dy).toFixed(2)); c.setAttribute('r',14);
    c.setAttribute('class',`token ${p.color}`); c.setAttribute('data-player',p.id); Board.tokensLayer.appendChild(c);
  });
  const ap=currentPlayer(); $('#active-name').textContent=ap.name; $('#active-color').style.background=tokenColor(ap.color);
}
window.addEventListener('resize', ()=> renderTokens());
