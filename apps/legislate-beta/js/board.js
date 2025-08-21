// board.js — renders player UI w/ add/remove before start (mobile layout unchanged)
function renderPlayersUI(){
  const container = document.getElementById('players');
  if(!container) return;
  container.innerHTML = '';

  // Controls (only before start)
  if(!GameState.started){
    const controls = document.createElement('div');
    controls.className = 'actions';
    const minus = document.createElement('button'); minus.className='btn subtle'; minus.textContent='– Player';
    const plus  = document.createElement('button'); plus.className='btn subtle'; plus.id='add-player-btn'; plus.textContent='+ Player';
    minus.onclick = ()=> setPlayerCount(GameState.players.length - 1);
    plus.onclick  = ()=> setPlayerCount(GameState.players.length + 1);
    container.appendChild(controls);
    controls.appendChild(minus); controls.appendChild(plus);
    // grey out at limits
    if(GameState.players.length <= 2){ minus.disabled = true; minus.classList.add('disabled'); }
    if(GameState.players.length >= GameState.maxPlayers){ plus.disabled = true; plus.classList.add('disabled'); }
  }

  // Player list (keeps your existing styling; names editable)
  const list = document.createElement('div');
  list.className = 'players-grid';
  GameState.players.forEach((p,i)=>{
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = `<span class="dot" style="background:${p.color}"></span>
                    <input class="player-name" data-idx="${i}" value="${p.name}" />`;
    list.appendChild(el);
  });
  container.appendChild(list);

  // Name edits update state + active banner
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
}

window.renderPlayersUI = renderPlayersUI;
