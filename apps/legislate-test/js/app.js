// app.js
(function (){
  // Human-friendly deck titles
  const DECK_LABELS = {
    early: "Early Stages",
    commons: "House of Commons",
    implementation: "Implementation",
    lords: "House of Lords",
    pingpong: "Ping Pong",
  };

  const $ = (id)=>document.getElementById(id);
  const $$ = (sel,el=document)=>Array.from(el.querySelectorAll(sel));
  const log = (msg)=>{ const pre=$('dbg-log'); if(pre){ pre.textContent += (typeof msg==='string'?msg:JSON.stringify(msg,null,2))+'\n'; } };

  // Simple modal helper that returns a promise
  const modal = {
    open({ title='', body='', actions }){
      return new Promise((resolve)=>{
        const root = $('modalRoot');
        if (!root) return resolve();
        root.innerHTML = `
          <div class="modal-backdrop">
            <div class="modal">
              <h2>${title}</h2>
              <div class="modal-body">${body}</div>
              <div class="modal-actions">
                <button id="modalOk" class="button button--primary">OK</button>
              </div>
            </div>
          </div>
        `;
        $('modalOk').addEventListener('click', ()=>{ root.innerHTML=''; resolve(); });
      });
    }
  };

  // Dice overlay API used by listeners (kept compatible with ui.css)
  let diceTimer = 0;
  async function showDiceRoll(value, ms=900){
    const overlay = $('diceOverlay');
    const dice = $('dice');
    if(!overlay || !dice) return;
    overlay.hidden = false;
    dice.className = 'dice rolling';
    clearTimeout(diceTimer);
    diceTimer = setTimeout(()=>{
      dice.className = 'dice show-'+(value||1);
      setTimeout(()=>{ overlay.hidden = true; }, 250);
    }, ms);
  }
  // expose through UI object without smashing other exports
  window.LegislateUI = Object.assign({}, window.LegislateUI, { showDiceRoll });

  // Load assets and boot engine
  async function boot(){
    const packUrl = 'assets/packs/uk-parliament';
    const [board, commons, early, lords, pingpong, implementation] = await Promise.all([
      fetch(`${packUrl}/board.json`).then(r=>r.json()),
      fetch(`${packUrl}/cards/commons.json`).then(r=>r.json()),
      fetch(`${packUrl}/cards/early.json`).then(r=>r.json()),
      fetch(`${packUrl}/cards/lords.json`).then(r=>r.json()),
      fetch(`${packUrl}/cards/pingpong.json`).then(r=>r.json()),
      fetch(`${packUrl}/cards/implementation.json`).then(r=>r.json()),
    ]);

    const engine = window.LegislateEngine.createEngine({
      board,
      decks: { commons, early, lords, pingpong, implementation },
      playerCount: Number($('playerCount').value) || 4
    });

    // ----- Tokens -----
    const tokensLayer = $('tokensLayer');
    const tokenEls = new Map();

    function ensureToken(id, color){
      if (tokenEls.has(id)) return tokenEls.get(id);
      const el = document.createElement('div');
      el.className = 'token';
      el.style.background = color;
      el.setAttribute('data-id', id);
      tokensLayer.appendChild(el);
      tokenEls.set(id, el);
      return el;
    }

    function positionToken(el, posIndex){
      const space = board.spaces.find(s=>s.index===posIndex);
      if(!space) return;
      // board.json uses percent coordinates (0..100)
      el.style.left = (space.x) + '%';
      el.style.top  = (space.y) + '%';
    }

    // Initial tokens
    engine.state.players.forEach(p=>{
      const el = ensureToken(p.id, p.color);
      positionToken(el, p.position);
    });

    // ----- Controls -----
    $('rollBtn').addEventListener('click', ()=> engine.takeTurn());
    $('restartBtn').addEventListener('click', ()=> { engine.reset(); renderPlayers(); });

    $('playerCount').addEventListener('change', (e)=>{
      engine.setPlayerCount(Number(e.target.value)||4);
      // Rebuild tokens for new players
      tokensLayer.innerHTML = ''; tokenEls.clear();
      engine.state.players.forEach(p=>{
        const el = ensureToken(p.id, p.color);
        positionToken(el, p.position);
      });
      renderPlayers();
    });

    // ----- Players: pills with inline name editor -----
    function renderPlayers(){
      const root = $('playersSection');
      root.innerHTML = '';
      engine.state.players.forEach((p,i)=>{
        const pill = document.createElement('div');
        pill.className = 'player-pill';

        const dot = document.createElement('div');
        dot.className = 'player-dot';
        dot.style.background = p.color;

        const name = document.createElement('span');
        name.className = 'player-name';
        name.contentEditable = 'true';
        name.textContent = p.name;

        // Immediate state update + turn label refresh
        function applyName(){
          const v = (name.textContent || '').trim();
          if (!v) return;
          engine.state.players[i].name = v;
          if (i === engine.state.turnIndex) {
            $('turnIndicator').textContent = `${v}'s turn`;
          }
        }
        name.addEventListener('input', applyName);
        name.addEventListener('blur', applyName);

        pill.appendChild(dot);
        pill.appendChild(name);
        root.appendChild(pill);
      });
    }
    renderPlayers();

    // ----- Board renderer with fan-out in ui.js -----
    const boardUI = window.LegislateUI.createBoardRenderer({ board });

    // ----- Events -----
    engine.bus.on('TURN_BEGIN', ({ index })=>{
      const p = engine.state.players[index];
      $('turnIndicator').textContent = `${p.name}'s turn`;

      // Re-position all tokens (keep aligned on turn)
      engine.state.players.forEach(pl=>{
        const el = ensureToken(pl.id, pl.color);
        positionToken(el, pl.position);
      });

      // Render via board UI (handles fan-out)
      if (boardUI && boardUI.render) {
        boardUI.render(engine.state.players);
      }
    });

    engine.bus.on('MOVE_STEP', ({ playerId, position })=>{
      const p = engine.state.players.find(x=>x.id===playerId);
      const el = ensureToken(playerId, p.color);
      positionToken(el, position);

      if (boardUI && boardUI.render) {
        boardUI.render(engine.state.players);
      }
    });

    engine.bus.on('DICE_ROLL', ({ value })=>{
      window.LegislateUI.showDiceRoll(value, 900);
    });

    engine.bus.on('LANDED', ({ playerId, position, space })=>{
      log({LANDED:{playerId,position,space}});
    });

    engine.bus.on('DECK_CHECK', ({ name, len })=>{
      log(`Deck ${name} has ${len} cards left`);
    });

    engine.bus.on('CARD_DRAWN', async ({ deck, card })=>{
      log({CARD_DRAWN:{deck,card}});
      if (!card){
        await modal.open({
          title: 'No card',
          body: `<p>The ${DECK_LABELS[deck] || deck} deck is empty.</p>`
        });
        engine.bus.emit('CARD_RESOLVE');
        return;
      }

      await modal.open({
        title: (card.title || (DECK_LABELS[deck] || deck)),
        body: `<p>${(card.text||'').trim()}</p>`
      });

      engine.bus.emit('CARD_RESOLVE');
    });

    engine.bus.on('CARD_APPLIED', ({ card, playerId })=>{
      const p = engine.state.players.find(x=>x.id===playerId);
      const el = ensureToken(playerId, p.color);
      positionToken(el, p.position);

      if (boardUI && boardUI.render) {
        boardUI.render(engine.state.players);
      }

      // --- Toasts for card effects ---
      if (card && typeof card.effect === 'string') {
        const [type] = card.effect.split(':');
        if (type === 'extra_roll') {
          window.LegislateUI.toast(`${p?.name || 'Player'} gets an extra roll`, { kind: 'success' });
        }
        if (type === 'miss_turn') {
          window.LegislateUI.toast(`${p?.name || 'Player'} will miss their next turn`, { kind: 'info' });
        }
      }
    });

    engine.bus.on('MISS_TURN', ({ name })=>{
      window.LegislateUI.toast(`${name} misses a turn`, { kind: 'info' });
      log(`MISS_TURN: ${name}`);
    });

    engine.bus.on('EFFECT_GOTO', ({ playerId, index })=>{
      const p = engine.state.players.find(x=>x.id===playerId);
      window.LegislateUI.toast(`${p?.name || 'Player'} jumps to ${index}`, { kind: 'info', ttl: 1800 });
    });

    engine.bus.on('GAME_END', ({ name })=>{
      window.LegislateUI.toast(`${name} reached the end!`, { kind: 'success', ttl: 2600 });
      // You can also show a modal here if you want a blocking message.
    });

    // Keep tokens aligned on resize/scroll
    const alignAll = ()=> engine.state.players.forEach(pl=>{
      const el = ensureToken(pl.id, pl.color);
      positionToken(el, pl.position);
    });
    window.addEventListener('resize', ()=>{ alignAll(); boardUI.render(engine.state.players); });
    window.addEventListener('scroll', ()=>{ alignAll(); boardUI.render(engine.state.players); });

    // Initial turn UI
    engine.bus.emit('TURN_BEGIN', { index: engine.state.turnIndex, playerId: engine.state.players[engine.state.turnIndex].id });

    log('EVT BOOT_OK');
  }

  boot().catch(err=>{
    console.error('BOOT_FAIL', err);
    const pre=$('dbg-log'); if(pre) pre.textContent += 'BOOT_FAIL '+ (err && err.stack || err);
  });
})();