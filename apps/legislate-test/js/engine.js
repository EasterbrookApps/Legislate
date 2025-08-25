// engine.js — game rules & event bus
(function(){
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function createBus(){
    const map = new Map();
    return {
      on(type, fn){
        if(!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
        return () => map.get(type)?.delete(fn);
      },
      emit(type, payload){
        (map.get(type) || []).forEach(fn => fn(payload));
        (map.get('*') || []).forEach(fn => fn(type, payload));
      }
    };
  }

  function makeRng(seed){
    let t = (seed >>> 0) || 0xA5F1C9D7;
    return function(){
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dice(rng){ return 1 + Math.floor(rng()*6); }

  function createEngine({ board, decks, playerCount=4, seed=Date.now(), stepDelay=180 } = {}){
    const bus = createBus();
    const rng = makeRng(seed);

    const state = {
      players: [],
      turnIndex: 0,
      decks: {},
      endIndex: Array.isArray(board?.spaces) && board.spaces.length
        ? (board.spaces.slice().reverse().find(s => s.stage === 'end')?.index ?? board.spaces[board.spaces.length-1].index ?? board.spaces.length-1)
        : 39
    };

    // shuffle decks
    function shuffle(arr){
      const a = (arr||[]).slice();
      for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
      return a;
    }
    if (decks){
      Object.keys(decks).forEach(k => state.decks[k] = shuffle(decks[k]));
    }

    const palette = ['#d4351c','#1d70b8','#00703c','#6f72af','#b58840','#912b88'];

    function initPlayers(n){
      const count = Math.max(2, Math.min(6, Number(n)||4));
      state.players = [];
      for(let i=0;i<count;i++){
        state.players.push({ id:'p'+(i+1), name:'Player '+(i+1), color:palette[i%palette.length], position:0, skip:0, extra:false });
      }
      state.turnIndex = 0;
    }
    initPlayers(playerCount);

    function current(){ return state.players[state.turnIndex]; }
    function spaceFor(idx){ return board.spaces.find(s => s.index === idx) || null; }

    function drawFrom(deckName){
      const deck = state.decks[deckName];
      if(!deck || deck.length===0) return null;
      return deck.shift();
    }

    function applyCardEffect(card, player){
      if(!card) return;
      const eff = typeof card.effect === 'string' ? card.effect : '';
      const [kind, raw] = eff.split(':');
      const n = Number(raw);

      switch(kind){
        case 'move': {
          const steps = Number.isFinite(n) ? n : 0;
          player.position = Math.max(0, Math.min(state.endIndex, player.position + steps));
          break;
        }
        case 'back': {
          const steps = Number.isFinite(n) ? -Math.abs(n) : 0;
          player.position = Math.max(0, Math.min(state.endIndex, player.position + steps));
          break;
        }
        case 'goto': {
          const dest = Number.isFinite(n) ? n : 0;
          player.position = Math.max(0, Math.min(state.endIndex, dest));
          break;
        }
        case 'miss_turn': {
          player.skip = (player.skip||0) + 1;
          break;
        }
        case 'extra_roll': {
          player.extra = true;
          break;
        }
        case 'pingpong': {
          player.position = state.endIndex;
          break;
        }
        default: {
          // Legacy by id fallbacks (optional)
          if (card.id === 'Implementation01') player.position = state.endIndex;
          if (card.id === 'Early04' || card.id === 'Early09') player.position = 0;
        }
      }
    }

    async function moveSteps(count){
      const p = current();
      const steps = Math.abs(Number(count)||0);
      for(let i=1;i<=steps;i++){
        p.position = Math.min(state.endIndex, p.position+1);
        bus.emit('MOVE_STEP', { playerId:p.id, position:p.position, step:i, total:steps });
        await sleep(stepDelay);
      }
    }

    async function takeTurn(){
      const p = current();
      if (p.skip && p.skip > 0){
        p.skip -= 1;
        bus.emit('TURN_SKIPPED', { playerId:p.id, remaining:p.skip });
        endTurn(false);
        return;
      }

      const value = dice(rng);
      bus.emit('DICE_ROLL', { value, playerId:p.id, name:p.name });

      await moveSteps(value);

      const landed = spaceFor(p.position);
      bus.emit('LANDED', { playerId:p.id, position:p.position, space: landed });

      if (landed?.deck && landed.deck !== 'none'){
        const card = drawFrom(landed.deck);
        bus.emit('CARD_DRAWN', { deck: landed.deck, card });
        // Wait for UI to acknowledge before applying effect
        let resolver;
        const done = new Promise(res => resolver = res);
        const off = bus.on('CARD_RESOLVE', payload => {
          if (payload?.card?.id === card?.id) { off(); resolver(); }
        });
        await done;
        applyCardEffect(card, p);
        bus.emit('CARD_APPLIED', { card, playerId:p.id, position:p.position });
      }

      const takeExtra = p.extra;
      p.extra = false;
      endTurn(takeExtra);
    }

    function endTurn(hasExtra){
      if (!hasExtra){
        state.turnIndex = (state.turnIndex + 1) % state.players.length;
      }
      bus.emit('TURN_END', { playerId: current().id });
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    function setPlayerCount(n){
      const names = state.players.map(p=>p.name);
      initPlayers(n);
      state.players.forEach((p,i)=>{ if(names[i]) p.name = names[i]; });
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    return { bus, state, takeTurn, setPlayerCount, makeRng, dice };
  }

  window.LegislateEngine = { createEngine, makeRng, dice };
})();
