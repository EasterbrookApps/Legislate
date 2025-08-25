// Step 4 — Engine with board/decks and basic card effects
window.LegislateEngine = (function(){
  function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }
  function createEventBus(){
    const map = new Map();
    return {
      on(type, fn){ if(!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return ()=>map.get(type)?.delete(fn); },
      emit(type, payload){ (map.get(type)||[]).forEach(fn=>fn(payload)); (map.get('*')||[]).forEach(fn=>fn(type,payload)); }
    };
  }

  function createEngine({ board, decks, players=4, spaces } = {}){
    const bus = createEventBus();
    const state = {
      spaces: board?.spaces?.length ?? spaces ?? 40,
      players: [],
      turnIndex: 0,
      decks: {},
      board: board || { spaces: Array.from({length: spaces ?? 40}, (_,i)=>({index:i,deck:'none'})) }
    };

    if (decks){
      for (const [name, list] of Object.entries(decks)){
        state.decks[name] = Array.isArray(list) ? list.slice() : [];
      }
    }

    function initPlayers(n){
      const count = Math.max(2, Math.min(6, Number(n)||4));
      const palette = ['#d4351c','#1d70b8','#00703c','#6f72af','#b58840','#912b88'];
      state.players = [];
      for (let i=0;i<count;i++){
        state.players.push({
          id:`p${i+1}`,
          name:`Player ${i+1}`,
          color:palette[i%palette.length],
          position:0,
          skip:0,
          extraRoll:false
        });
      }
      state.turnIndex = 0;
    }
    initPlayers(players);

    const endIndex = state.spaces - 1;
    const dice = () => 1 + Math.floor(Math.random()*6);
    function current(){ return state.players[state.turnIndex]; }
    function nextTurn(){ state.turnIndex = (state.turnIndex+1) % state.players.length; bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex }); }

    function drawCard(deckName){
      const d = state.decks[deckName];
      if (!d || d.length === 0) return null;
      const card = d.shift();
      state.decks[deckName] = d;
      return card;
    }

    function applyEffect(card, p){
      if (!card) return;
      const eff = card.effect || '';
      if (typeof eff === 'string' && eff.length){
        const [type, arg] = eff.split(':');
        switch(type){
          case 'move': {
            const n = Number(arg||0);
            p.position = Math.max(0, Math.min(endIndex, p.position + n));
            break;
          }
          case 'miss_turn': { p.skip = (p.skip||0)+1; break; }
          case 'extra_roll': { p.extraRoll = true; break; }
          case 'pingpong': { p.position = endIndex; break; }
        }
      }
    }

    async function takeTurn(){
      const p = current();
      if (p.skip && p.skip > 0){
        p.skip -= 1;
        bus.emit('TURN_END', { playerId:p.id, skipped:true });
        nextTurn();
        return;
      }
      const roll = dice();
      bus.emit('DICE_ROLL', { value: roll, playerId: p.id });

      for (let i=0;i<roll;i++){
        p.position = Math.min(endIndex, p.position + 1);
        bus.emit('MOVE_STEP', { playerId: p.id, position: p.position, step:i+1, total: roll });
        await delay(180);
      }
      bus.emit('LANDED', { playerId: p.id, position: p.position });

      const space = state.board.spaces[p.position];
      if (space && space.deck && space.deck !== 'none'){
        const card = drawCard(space.deck);
        bus.emit('CARD_DRAWN', { deck: space.deck, card, playerId: p.id, position: p.position });
        if (card){
          applyEffect(card, p);
          bus.emit('CARD_APPLIED', { deck: space.deck, card, playerId: p.id, position: p.position });
        }
      }

      if (p.position >= endIndex){
        bus.emit('GAME_WIN', { playerId: p.id, name: p.name });
      }

      if (p.extraRoll){
        p.extraRoll = false;
        bus.emit('TURN_END', { playerId: p.id, extra:true });
        bus.emit('TURN_BEGIN', { playerId: p.id, index: state.turnIndex });
      } else {
        bus.emit('TURN_END', { playerId: p.id });
        nextTurn();
      }
    }

    function setPlayerCount(n){
      const names = state.players.map(p=>p.name);
      initPlayers(n);
      state.players.forEach((p,i)=>{ if(names[i]) p.name = names[i]; });
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    return { bus, state, takeTurn, setPlayerCount, endIndex };
  }

  return { createEngine };
})();