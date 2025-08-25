// Step 2 — Engine Canonicalisation (logic only)
window.LegislateEngine = (function(){
  function delay(ms){ return new Promise(res => setTimeout(res, ms)); }
  function createBus(){
    const map = new Map();
    return {
      on(type, fn){ if(!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return ()=>map.get(type)?.delete(fn); },
      emit(type, payload){ (map.get(type)||[]).forEach(fn=>fn(payload)); (map.get('*')||[]).forEach(fn=>fn(type,payload)); }
    };
  }

  function makeRng(seed){
    let t = (seed >>> 0) || 0x12345678;
    return function(){
      // xorshift-ish
      t ^= t << 13; t ^= t >>> 17; t ^= t << 5;
      // convert to [0,1)
      return ((t >>> 0) % 0xFFFFFFFF) / 0xFFFFFFFF;
    };
  }

  function createEngine(opts){
    const bus = createBus();
    const spaces = Math.max(10, (opts && opts.spaces) || 40);
    const seed = (opts && opts.seed) || Date.now();
    const rng = makeRng(seed);
    const state = {
      spaces,
      seed,
      players: [],
      turnIndex: 0
    };

    function initPlayers(n){
      const count = Math.max(2, Math.min(6, Number(n)||4));
      state.players = [];
      for (let i=0;i<count;i++){
        state.players.push({
          id: 'p'+(i+1),
          name: 'Player '+(i+1),
          position: 0
        });
      }
      state.turnIndex = 0;
      bus.emit('TURN_BEGIN', { playerId: state.players[0].id, index: 0 });
    }

    initPlayers((opts && opts.players) || 4);

    async function takeTurn(forced){
      const active = state.players[state.turnIndex];
      if (!active) return;
      const roll = Number.isFinite(Number(forced)) ? Number(forced) : (1 + Math.floor(rng()*6));
      bus.emit('DICE_ROLL', { playerId: active.id, value: roll });

      for (let i=0;i<roll;i++){
        active.position = Math.min(active.position + 1, spaces - 1);
        bus.emit('MOVE_STEP', { playerId: active.id, position: active.position, step: i+1, total: roll });
        await delay(180);
      }

      bus.emit('LANDED', { playerId: active.id, position: active.position });
      bus.emit('TURN_END', { playerId: active.id });

      state.turnIndex = (state.turnIndex + 1) % state.players.length;
      const next = state.players[state.turnIndex];
      bus.emit('TURN_BEGIN', { playerId: next.id, index: state.turnIndex });
    }

    function setPlayerCount(n){
      initPlayers(n);
    }

    return { bus, state, takeTurn, setPlayerCount };
  }

  return { createEngine };
})();