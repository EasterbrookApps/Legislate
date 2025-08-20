// board.js — v1.4 (token auto-scale + fan-out, player grid on mobile)
let Board={svg:null,img:null,tokensLayer:null,viewW:1600,viewH:1000};

function $(sel,root){ return (root||document).querySelector(sel); }
function $all(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function setupBoardSVG(){
  Board.svg=document.getElementById('board-svg');
  Board.img=document.getElementById('board-image');
  Board.tokensLayer=document.getElementById('tokens-layer');
  if(!Board.svg||!Board.img||!Board.tokensLayer) return;
  const probe=new Image(); probe.onload=()=>{
    Board.viewW=probe.naturalWidth||1600; Board.viewH=probe.naturalHeight||1000;
    Board.svg.setAttribute('viewBox',`0 0 ${Board.viewW} ${Board.viewH}`);
    Board.img.setAttribute('width',Board.viewW); Board.img.setAttribute('height',Board.viewH);
    renderTokens();
  }; probe.src=Board.img.getAttribute('href');
}

function tokenRadius(){
  const base = Math.min(Board.viewW, Board.viewH);
  const r = (base/1600)*12*1.5;
  return clamp(r, 10, 22);
}

function renderTokens(){
  const layer = Board.tokensLayer; if(!layer || !GameState.board) return;
  layer.innerHTML='';
  const counts={};
  GameState.players.forEach(p=>{
    const i=clamp(p.index,0,lastIndex());
    counts[i]=(counts[i]||0)+1;
  });
  const atIdx={};
  const R = tokenRadius();
  GameState.players.forEach(p=>{
    const i=clamp(p.index,0,lastIndex());
    const s=GameState.board.spaces[i]; if(!s) return;
    atIdx[i]=(atIdx[i]||0)+1;
    const k = atIdx[i]-1;
    const n = counts[i];
    const spread = n>1 ? R*0.9 : 0;
    const angle = (k-(n-1)/2) * (Math.PI/6);
    const dx = spread*Math.cos(angle), dy=spread*Math.sin(angle);

    const cx = (s.x/100*Board.viewW + dx).toFixed(2);
    const cy = (s.y/100*Board.viewH + dy).toFixed(2);

    const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', R.toFixed(2));
    const isActive = (GameState.players[GameState.activeIdx]===p);
    c.setAttribute('class','token '+p.color+(isActive?' active':''));
    layer.appendChild(c);
  });
}

function renderPlayersUI(){
  const container = document.getElementById('players');
  if(!container) return;
  container.innerHTML='';

  // Controls only before game starts
  if(!GameState.started){
    const controls = document.createElement('div');
    controls.className = 'actions';
    const minus = document.createElement('button'); minus.className='btn subtle'; minus.textContent='– Player';
    const plus  = document.createElement('button'); plus.className='btn subtle'; plus.id='add-player-btn'; plus.textContent='+ Player';
    minus.onclick = ()=> setPlayerCount(GameState.players.length - 1);
    plus.onclick  = ()=> setPlayerCount(GameState.players.length + 1);
    container.appendChild(controls);
    controls.appendChild(minus); controls.appendChild(plus);
    if(GameState.players.length >= GameState.maxPlayers){ plus.disabled = true; plus.classList.add('disabled'); }
  }

  // Grid on mobile (CSS handles layout)
  const list = document.createElement('div');
  list.className = 'players-grid';
  GameState.players.forEach((p,i)=>{
    const el=document.createElement('div');
    el.className='player';
    el.innerHTML = `<span class="dot" style="background:${tokenColor(p.color)}"></span>
                    <input class="player-name" data-idx="${i}" value="${p.name}" />`;
    list.appendChild(el);
  });
  container.appendChild(list);

  // Hook up name edits
  list.querySelectorAll('.player-name').forEach(inp=>{
    inp.addEventListener('focus', e=> e.target.select());
    inp.addEventListener('change', e=>{
      const i = +e.target.dataset.idx;
      GameState.players[i].name = e.target.value.trim() || ('Player ' + (i+1));
      if(i === GameState.activeIdx){
        const nameEl = document.getElementById('active-name');
        if(nameEl) nameEl.textContent = GameState.players[i].name;
      }
    });
  });

  // Active indicator in list
  const ap = GameState.players[GameState.activeIdx];
  if(ap){
    const nameEl = document.getElementById('active-name');
    const dotEl  = document.getElementById('active-color');
    if(dotEl) dotEl.style.background = tokenColor(ap.color);
    if(nameEl) nameEl.textContent = ap.name;
  }
}

window.setupBoardSVG=setupBoardSVG;
window.renderTokens=renderTokens;
window.renderPlayersUI=renderPlayersUI;
window.clamp=clamp;
