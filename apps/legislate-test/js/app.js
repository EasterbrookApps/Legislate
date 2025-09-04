// app.js — classic wiring; toasts + dice→modal wait; dice face coercion
(function (){
  const $ = (id)=>document.getElementById(id);
  const log = (msg)=>{ const pre=$('dbg-log'); if(pre){ pre.textContent += (typeof msg==='string'?msg:JSON.stringify(msg))+'\n'; } };

  async function boot(){
    try{
      const base = './assets/packs/uk-parliament';

      const [board, commons, early, lords, pingpong, implementation] = await Promise.all([
        fetch(`${base}/board.json`).then(r=>r.json()),
        fetch(`${base}/cards/commons.json`).then(r=>r.json()),
        fetch(`${base}/cards/early.json`).then(r=>r.json()),
        fetch(`${base}/cards/lords.json`).then(r=>r.json()),
        fetch(`${base}/cards/pingpong.json`).then(r=>r.json()),
        fetch(`${base}/cards/implementation.json`).then(r=>r.json()),
      ]);

      const engine = window.LegislateEngine.createEngine({
        board,
        decks: { commons, early, lords, pingpong, implementation },
        playerCount: Number($('playerCount').value) || 4
      });

      // Expose for debug.js
      window.engine = engine;
      window.board  = board;

      // ---- Token helpers (percent coords) ----
      const tokensLayer = $('tokensLayer');
      const tokenEls = new Map();

      function ensureToken(id, color){
        if (tokenEls.has(id)) return tokenEls.get(id);
        const el = document.createElement('div');
        el.className = 'token';
        el.style.background = color;
        el.dataset.id = id;
        tokensLayer.appendChild(el);
        tokenEls.set(id, el);
        return el;
      }

      function positionToken(el, posIndex){
        const space = board.spaces.find(s=>s.index===posIndex);
        if(!space) return;
        el.style.left = space.x + '%';
        el.style.top  = space.y + '%';
      }

      // Initial tokens
      engine.state.players.forEach(p=>{
        const el = ensureToken(p.id, p.color);
        positionToken(el, p.position);
      });

      // ---- Controls ----
      $('rollBtn').addEventListener('click', ()=> engine.takeTurn());
      $('restartBtn').addEventListener('click', ()=> { engine.reset(); renderPlayers(); });
      $('playerCount').addEventListener('change', (e)=>{
        engine.setPlayerCount(Number(e.target.value)||4);
        tokensLayer.innerHTML = ''; tokenEls.clear();
        engine.state.players.forEach(p=>{
          const el = ensureToken(p.id, p.color);
          positionToken(el, p.position);
        });
        renderPlayers();
      });

      // ---- Players (inline edit; immediate) ----
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

          function applyName(){
            const v = (name.textContent || '').trim();
            if (!v) return;
            engine.state.players[i].name = v;
            if (i === engine.state.turnIndex) {
              $('turnIndicator').textContent = `${v}'s turn`;
            }
          }
          name.addEventListener('input', applyName);
          name.addEventListener('blur',  applyName);

          pill.appendChild(dot);
          pill.appendChild(name);
          root.appendChild(pill);
        });
      }
      renderPlayers();

      // ---- Board renderer (fan-out) ----
      const boardUI = window.LegislateUI.createBoardRenderer({ board });

      // ---- Events ----
      engine.bus.on('TURN_BEGIN', ({ index })=>{
        const p = engine.state.players[index];
        $('turnIndicator').textContent = `${p.name}'s turn`;

        engine.state.players.forEach(pl=>{
          const el = ensureToken(pl.id, pl.color);
          positionToken(el, pl.position);
        });

        boardUI.render(engine.state.players);
      });

      engine.bus.on('MOVE_STEP', ({ playerId, position })=>{
        const p = engine.state.players.find(x=>x.id===playerId);
        const el = ensureToken(playerId, p.color);
        positionToken(el, position);
        boardUI.render(engine.state.players);
      });

      engine.bus.on('DICE_ROLL', () => {
  const v = engine.state.lastRoll;   // always 1–6 from engine
  window.LegislateUI.showDiceRoll(v);
});

      // Friendly deck titles for modals
      const DECK_LABELS = {
        early: "Early Stages",
        commons: "House of Commons",
        implementation: "Implementation",
        lords: "House of Lords",
        pingpong: "Ping Pong",
      };

      engine.bus.on('CARD_DRAWN', async ({ deck, card })=>{
        // ✅ Wait until dice overlay is fully done before showing the card
        await window.LegislateUI.waitForDice();

        const modal = window.LegislateUI.createModal();

        if (!card){
          await modal.open({ title: 'No card', body: `<p>The ${DECK_LABELS[deck] || deck} deck is empty.</p>` });
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
        boardUI.render(engine.state.players);

        // Toasts for effects
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
      });

      engine.bus.on('EFFECT_GOTO', ({ playerId, index })=>{
        const p = engine.state.players.find(x=>x.id===playerId);
        window.LegislateUI.toast(`${p?.name || 'Player'} jumps to ${index}`, { kind: 'info', ttl: 1800 });
      });

      engine.bus.on('GAME_END', ({ name })=>{
        window.LegislateUI.toast(`${name} reached the end!`, { kind: 'success', ttl: 2600 });
      });

      // Initial turn UI
      engine.bus.emit('TURN_BEGIN', { index: engine.state.turnIndex, playerId: engine.state.players[engine.state.turnIndex].id });

      const dbg = $('dbg-log'); if (dbg) dbg.textContent += 'EVT BOOT_OK\n';
    }catch(err){
      console.error('BOOT_FAIL', err);
      const pre=$('dbg-log'); if(pre) pre.textContent += 'BOOT_FAIL '+(err && err.stack || err)+'\n';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();