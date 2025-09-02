// engine.js — simple, stable engine with step-by-step movement + deck draw
window.LegislateEngine = (function(){
  function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }
  function createEventBus(){
    const map = new Map();
    return {
      on(type, fn){ if(!map.has(type)) map.set(type,new Set()); map.get(type).add(fn); return ()=>map.get(type)?.delete(fn); },
      emit(type, payload){ (map.get(type)||[]).forEach(fn=>fn(payload)); (map.get('*')||[]).forEach(fn=>fn(type,payload)); }
    };
  }
  function makeRng(seed){ let t=seed>>>0; return function(){ t+=0x6D2B79F5; let r=Math.imul(t^(t>>>15),1|t); r^=r+Math.imul(r^(r>>>7),61|r); return ((r^(r>>>14))>>>0)/4294967296; }; }
  function dice(rng){ return 1 + Math.floor(rng()*6); }

  function createEngine({ board, decks, rng = makeRng(Date.now()), playerCount=4, colors } = {}){
    const bus = createEventBus();
    const state = { players: [], turnIndex: 0, decks: {}, lastRoll: 0 };
    const endIndex = (board.spaces.slice().reverse().find(s=>s.stage==='end') || board.spaces[board.spaces.length-1]).index;

    const palette = colors || ['#d4351c','#1d70b8','#00703c','#6f72af','#b58840','#912b88'];
    function initPlayers(n){
      const max = Math.max(2, Math.min(6, n||4));
      state.players = [];
      for (let i=0; i<max; i++){
        state.players.push({ id:'p'+(i+1), name:'Player '+(i+1), color:palette[i%palette.length], position:0, skip:0, extraRoll:false });
      }
      state.turnIndex = 0;
    }
    initPlayers(playerCount);

    for (const [name, cards] of Object.entries(decks||{})){ state.decks[name] = cards.slice(); }

    function current(){ return state.players[state.turnIndex]; }
    function spaceFor(i){ return board.spaces.find(s=>s.index===i) || null; }
    function drawFrom(name){ const d=state.decks[name]; if(!d||!d.length) return null; const c=d.shift(); return c; }

    function applyCard(card){
  if (!card) return;

  if (typeof card.effect === 'string' && card.effect.length){
    const [type, arg] = card.effect.split(':');

    if (type === 'move'){
      const n = Number(arg || 0);
      const p = current();
      let i = p.position + n;
      if (i < 0) i = 0;
      if (i > endIndex) i = endIndex;
      p.position = i;

    } else if (type === 'miss_turn'){
      current().skip = (current().skip || 0) + 1;

    } else if (type === 'extra_roll'){
      current().extraRoll = true;

    } else if (type === 'goto'){
      const p = current();
      let i = Number(arg || 0);
      if (i < 0) i = 0;
      if (i > endIndex) i = endIndex;
      p.position = i;
      // Optional: this keeps our debug stream informative without changing behaviour
      bus.emit('EFFECT_GOTO', { playerId: p.id, index: i });
    }
  }
}

    async function moveSteps(n){
      const p=current(); const step=n>=0?1:-1; const count=Math.abs(n);
      for (let k=0;k<count;k++){
        p.position += step;
        if(p.position<0)p.position=0;
        if(p.position>endIndex)p.position=endIndex;
        bus.emit('MOVE_STEP',{playerId:p.id,position:p.position,step:k+1,total:count});
        await delay(180);
      }
    }

    async function takeTurn(){
      const p=current();
      if (p.skip>0){ p.skip--; endTurn(false); return; }

      const roll = dice(rng);
      state.lastRoll = roll;
      bus.emit('DICE_ROLL',{ value: roll, playerId: p.id, name: p.name });
      await moveSteps(roll);

      const space = spaceFor(p.position);
      bus.emit('LANDED',{ playerId:p.id, position:p.position, space });

      let card = null;
      if (space && space.deck && space.deck !== 'none'){
        const d = state.decks[space.deck] || [];
        bus.emit('DECK_CHECK',{ name: space.deck, len: d.length });
        card = drawFrom(space.deck);
        bus.emit('CARD_DRAWN',{ deck: space.deck, card });
        if (card){
          await new Promise(res=>{
            const off = bus.on('CARD_RESOLVE', ()=>{ off(); res(); });
          });
          applyCard(card);
          bus.emit('CARD_APPLIED',{ card, playerId:p.id, position:p.position });
        }
      }
      endTurn(p.extraRoll);
      p.extraRoll = false;
    }

    function endTurn(extra) {
  // If the current player has an extra roll, keep turn ownership.
  if (extra === true) {
    bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    return;
  }

  // Advance until we find a player with no pending skip.
  // Hard cap at players.length to avoid accidental infinite loops.
  var max = state.players.length || 0;
  var hops = 0;

  while (hops < max) {
    // Move to next player
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    var p = current();

    if (p.skip > 0) {
      // Consume one skip and notify listeners
      p.skip -= 1;
      bus.emit('MISS_TURN', { playerId: p.id, name: p.name, remaining: p.skip });

      // Fire DOM event for UI toast (only if available)
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('effect:miss_turn', {
            detail: { playerId: p.id, playerName: p.name, remaining: p.skip }
          }));
        } catch (_err) { /* ignore if CustomEvent unsupported */ }
      }

      // Continue loop to evaluate the next player
      hops += 1;
      continue;
    }

    // Found an eligible player; begin their turn.
    bus.emit('TURN_BEGIN', { playerId: p.id, index: state.turnIndex });
    return;
  }

  // Fallback: if we consumed skips on everyone, start with whoever we landed on.
  bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
}


    // Found an eligible player: begin their turn
    bus.emit('TURN_BEGIN', { playerId: p.id, index: state.turnIndex });
    return;
  }

  // If we somehow looped all players (all had skip>0 and were consumed),
  // start the turn for whoever we landed on.
  bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
}

    function setPlayerCount(n){
      const names = state.players.map(p=>p.name);
      initPlayers(n);
      state.players.forEach((p,i)=>{ if(names[i]) p.name = names[i]; });
      bus.emit('TURN_BEGIN',{ playerId: current().id, index: state.turnIndex });
    }

    function reset(){
      state.players.forEach(p=>{p.position=0;p.skip=0;p.extraRoll=false;});
      state.turnIndex=0;
      for (const [name,cards] of Object.entries(decks||{})){ state.decks[name]=cards.slice(); }
      bus.emit('TURN_BEGIN',{ playerId: current().id, index: state.turnIndex });
    }

    return { bus, state, endIndex, takeTurn, setPlayerCount, reset };
  }

  return { createEngine, makeRng };
})();