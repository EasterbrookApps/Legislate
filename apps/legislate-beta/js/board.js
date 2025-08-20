
let Board={svg:null,img:null,tokensLayer:null,crosshairsLayer:null,viewW:1600,viewH:1000,calibrated:false};
async function loadBoardConfig(){
  try{ const res=await fetch('data/board.json?cache='+Date.now()); if(!res.ok) throw new Error('Missing board.json'); const data=await res.json(); validateBoard(data); GameState.board=data; Board.calibrated=true; $('#error-overlay').classList.add('hidden'); }
  catch(e){ console.warn('Board config error:', e.message); GameState.board=null; Board.calibrated=false; $('#error-overlay').classList.remove('hidden'); }
}
function validateBoard(data){
  if(!data || !Array.isArray(data.spaces) || data.spaces.length!==58) throw new Error('Invalid spaces');
  data.spaces.forEach((s,i)=>{ if(typeof s.index!=='number'||typeof s.x!=='number'||typeof s.y!=='number'||!s.stage) throw new Error('Bad space '+i); if(s.index!==i) throw new Error('Indices must be 0..57'); });
  if(!data.decks||typeof data.decks!=='object') data.decks={}; if(!data.asset) data.asset='assets/board.png';
}
function setupBoardSVG(){
  Board.svg=$('#board-svg'); Board.img=$('#board-image'); Board.tokensLayer=$('#tokens-layer'); Board.crosshairsLayer=$('#calibration-crosshairs');
  const probe=new Image(); probe.onload=()=>{ Board.viewW=probe.naturalWidth||1600; Board.viewH=probe.naturalHeight||1000;
    Board.svg.setAttribute('viewBox',`0 0 ${Board.viewW} ${Board.viewH}`);
    Board.img.setAttribute('width',Board.viewW); Board.img.setAttribute('height',Board.viewH);
    renderTokens(); }; probe.src=Board.img.getAttribute('href');
}
function renderTokens(){
  Board.tokensLayer.innerHTML='';
  const offsets={}; GameState.players.forEach(p=>{ if(p.eliminated) return; const idx=clamp(p.index,0,lastIndex()); offsets[idx]=(offsets[idx]||0)+1; });
  const perIndexCount={};
  GameState.players.forEach(p=>{
    const idx=clamp(p.index,0,lastIndex()); const s=GameState.board && GameState.board.spaces[idx]; if(!s) return;
    perIndexCount[idx]=(perIndexCount[idx]||0)+1; const countAt=offsets[idx]; const k=perIndexCount[idx]-1; const r=countAt>1?10:0; const angle=(k-(countAt-1)/2)*(Math.PI/12); const dx=r*Math.cos(angle), dy=r*Math.sin(angle);
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',(s.x/100*Board.viewW+dx).toFixed(2)); c.setAttribute('cy',(s.y/100*Board.viewH+dy).toFixed(2)); c.setAttribute('r',10);
    c.setAttribute('class',`token ${p.color}`+(p.eliminated?' eliminated':'')); c.setAttribute('data-player',p.id); Board.tokensLayer.appendChild(c);
  });
  const ap=GameState.players[GameState.activeIdx]; $('#active-color').style.background=tokenColor(ap.color); $('#active-name').textContent=ap.name;
}
function tokenColor(c){return c==='red'?'#ef4444':c==='blue'?'#3b82f6':c==='green'?'#22c55e':c==='yellow'?'#f59e0b':c==='purple'?'#a855f7':c==='orange'?'#f97316':'#111';}
window.addEventListener('resize', ()=> renderTokens());
