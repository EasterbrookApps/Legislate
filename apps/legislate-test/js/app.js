// app.js — UI + glue for Legislate?!
(function(){
  const $ = id => document.getElementById(id);

  const deckLabels = {
    early: "Early Stages",
    commons: "House of Commons",
    lords: "House of Lords",
    pingpong: "Ping Pong",
    final: "Final Stage"
  };

  const engine = window.LegislateEngine.createEngine({
    board: window.boardData,
    decks: window.deckData,
    playerCount: 4,
  });

  // ---------------- Players UI ----------------
  function renderPlayers(){
    const wrap = $('playersSection');
    wrap.innerHTML = '';
    engine.state.players.forEach((p,i)=>{
      const pill = document.createElement('div');
      pill.className = 'player-pill';

      const dot = document.createElement('div');
      dot.className = 'player-dot';
      dot.style.background = p.color;
      pill.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'player-name';
      name.contentEditable = true;
      name.textContent = p.name;

      name.addEventListener('blur', ()=>{
        const v = name.textContent.trim();
        if (!v) return;

        // update engine state
        engine.state.players[i].name = v;

        // refresh pills immediately
        renderPlayers();

        // update current turn if needed
        if (i === engine.state.turnIndex) {
          $('turnIndicator').textContent = `${v}'s turn`;
        }
      });

      pill.appendChild(name);
      wrap.appendChild(pill);
    });
  }

  renderPlayers();

  // ---------------- Turn Indicator ----------------
  engine.bus.on('TURN_BEGIN', ({ playerId, index })=>{
    const p = engine.state.players[index];
    $('turnIndicator').textContent = `${p.name}'s turn`;
  });

  // ---------------- Dice ----------------
  $('rollBtn').addEventListener('click', ()=>{ engine.takeTurn(); });
  $('restartBtn').addEventListener('click', ()=>{ engine.reset(); renderPlayers(); });

  engine.bus.on('DICE_ROLL', ({ value, playerId })=>{
    const overlay = $('diceOverlay');
    const dice = overlay.querySelector('.dice');
    dice.className = 'dice rolling';
    overlay.removeAttribute('hidden');

    setTimeout(()=>{
      dice.className = `dice show-${value}`;
      setTimeout(()=> overlay.setAttribute('hidden',''), 1200);
    }, 900);
  });

  // ---------------- Moves ----------------
  engine.bus.on('MOVE_STEP', ({ playerId, position })=>{
    const token = document.getElementById('token-'+playerId);
    const sp = window.boardData.spaces.find(s=>s.index===position);
    if (token && sp){
      token.style.left = (sp.x*100)+'%';
      token.style.top  = (sp.y*100)+'%';
    }
  });

  // ---------------- Cards ----------------
  engine.bus.on('CARD_DRAWN', ({ deck, card })=>{
    if (!card) return;

    const modalRoot = $('modalRoot');
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>${deckLabels[deck] || deck}</h2>
          <p>${card.text || ''}</p>
          <button id="cardOkBtn" class="button button--primary">OK</button>
        </div>
      </div>
    `;

    modalRoot.querySelector('#cardOkBtn').addEventListener('click', ()=>{
      modalRoot.innerHTML = '';
      engine.bus.emit('CARD_RESOLVE');
    });
  });

  // ---------------- Skips / Extra Rolls ----------------
  engine.bus.on('MISS_TURN', ({ playerId, name })=>{
    console.log(`${name} misses a turn`);
    // hook for toast UI if desired
  });

})();