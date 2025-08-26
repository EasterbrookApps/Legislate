// engine.js — core engine: movement, cards, skip/extra-roll, and end-game flow
window.LegislateEngine = (function () {
  function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

  function createEventBus() {
    const map = new Map();
    return {
      on(type, fn) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
        return () => map.get(type)?.delete(fn);
      },
      emit(type, payload) {
        (map.get(type) || []).forEach(fn => fn(payload));
        (map.get('*') || []).forEach(fn => fn(type, payload));
      }
    };
  }

  function makeRng(seed) {
    let t = (seed >>> 0) || (Date.now() >>> 0);
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createEngine({ board, decks, rng = makeRng(Date.now()), playerCount = 4, colors } = {}) {
    const bus = createEventBus();

    const state = {
      players: [],
      turnIndex: 0,
      decks: {},
      finishedOrder: [], // playerIds in finish order
      gameOver: false
    };

    const endIndex =
      (board.spaces.slice().reverse().find(s => s.stage === 'end') ||
        board.spaces[board.spaces.length - 1]).index;

    const palette = colors || ['#d4351c','#1d70b8','#00703c','#6f72af','#b58840','#912b88'];

    function initPlayers(n) {
      const max = Math.max(2, Math.min(6, n || 4));
      state.players = [];
      for (let i = 0; i < max; i++) {
        state.players.push({
          id: 'p' + (i + 1),
          name: 'Player ' + (i + 1),
          color: palette[i % palette.length],
          position: 0,
          skip: 0,
          extraRoll: false,
          finished: false,
          place: null
        });
      }
      state.turnIndex = 0;
      state.finishedOrder = [];
      state.gameOver = false;
    }
    initPlayers(playerCount);

    // shuffle-copy per deck
    function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
    for (const [name, cards] of Object.entries(decks||{})) state.decks[name] = shuffle(cards);

    function current(){ return state.players[state.turnIndex]; }
    function spaceFor(i){ return board.spaces.find(s=>s.index===i) || null; }
    function drawFrom(name){ const d=state.decks[name]; if(!d||!d.length) return null; const c=d.shift(); state.decks[name]=d; return c; }

    function applyCard(card){
      if (!card) return;
      let applied=false;

      if (typeof card.effect === 'string') {
        const eff = card.effect.trim();
        if (eff) {
          const [type, arg] = eff.split(':');

          if (type === 'move') {
            const n = Number(arg || 0);
            const p = current();
            let i = p.position + n;
            // legacy behaviour for move: clamp within 0..endIndex
            if (i < 0) i = 0;
            if (i > endIndex) i = endIndex;
            p.position = i;
            applied = true;

          } else if (type === 'miss_turn') {
            current().skip = (current().skip || 0) + 1;
            applied = true;

          } else if (type === 'extra_roll') {
            current().extraRoll = true;
            applied = true;

          } else if (type === 'pingpong') {
            // kept for compatibility (acts like goto:endIndex)
            current().position = endIndex;
            applied = true;

          } else if (type === 'goto') {
            // NEW: goto:<index> — absolute index, no clamping (per product decision)
            const idx = Number(arg);
            if (Number.isFinite(idx)) {
              current().position = idx;
              applied = true;
              // Optional visibility for designers if the current board has no such index
              if (!spaceFor(idx)) {
                bus.emit('WARN_GOTO_INVALID', { target: idx });
              }
            }
          }
        }
      }

      // No ID-based fallbacks — behaviour must be explicit in card JSON now.
    }

    async function moveSteps(n){
      const p=current(); const step=n>=0?1:-1; const count=Math.abs(n);
      for (let k=0;k<count;k++){
        p.position += step;
        if (p.position<0) p.position=0;
        if (p.position> endIndex) p.position=endIndex;
        bus.emit('MOVE_STEP',{ playerId:p.id, position:p.position, step:k+1, total:count });
        await delay(180);
      }
    }

    // --- End-game helpers
    function finishThreshold() {
      const total = state.players.length;
      if (total <= 2) return 1;  // 2 players → 1 finisher
      if (total === 3) return 2; // 3 players → 2 finishers
      return 3;                  // 4+ players → 3 finishers
    }

    function maybeMarkFinished(p){
      if (p.finished) return false;
      const sp = spaceFor(p.position);
      if (sp && sp.stage === 'end'){
        p.finished = true;
        p.place = state.finishedOrder.length + 1;
        state.finishedOrder.push(p.id);
        bus.emit('GAME_PLACE', { playerId: p.id, place: p.place, name: p.name });
        return true;
      }
      return false;
    }

    function maybeGameOver(){
      if (state.gameOver) return true;
      const threshold = finishThreshold();
      const finishers = state.finishedOrder.length;
      const allFinished = state.players.every(pp => pp.finished);
      if (finishers >= threshold || allFinished){
        state.gameOver = true;
        const podium = state.finishedOrder
          .slice(0, Math.max(threshold, finishers))
          .map((pid, idx)=>{
            const pl = state.players.find(pp=>pp.id===pid);
            return { playerId: pid, name: pl?.name || ('Player ' + (idx+1)), place: (idx+1) };
          });
        bus.emit('GAME_OVER', { podium, totalPlayers: state.players.length });
        return true;
      }
      return false;
    }

    function advanceToNextActive(startIndex){
      let idx = startIndex;
      const total = state.players.length;
      for (let i=0;i<total;i++){
        const p = state.players[idx];
        if (!p.finished) return idx;
        idx = (idx + 1) % total;
      }
      return startIndex;
    }

    async function takeTurn(){
      if (state.gameOver) return;

      state.turnIndex = advanceToNextActive(state.turnIndex);
      const p = current();
      if (p.finished){
        if (maybeGameOver()) return;
        return;
      }

      if (p.skip > 0) {
  p.skip--;
  bus.emit('TURN_SKIPPED', { playerId: p.id, name: p.name, remaining: p.skip });

  // Properly end this turn and advance to the next active player
  bus.emit('TURN_END', { playerId: p.id });
  state.turnIndex = advanceToNextActive((state.turnIndex + 1) % state.players.length);
  if (!state.gameOver) {
    bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
  }
  return;
}
      const roll = 1 + Math.floor(rng()*6);
      bus.emit('DICE_ROLL', { value: roll, playerId: p.id, name: p.name });
      await moveSteps(roll);

      bus.emit('LANDED', { playerId: p.id, position: p.position, space: spaceFor(p.position) });

      const justFinishedOnMove = maybeMarkFinished(p);
      if (justFinishedOnMove && maybeGameOver()) return;

      const space = spaceFor(p.position);
      if (space && space.deck && space.deck !== 'none'){
        const d = state.decks[space.deck] || [];
        bus.emit('DECK_CHECK', { name: space.deck, len: d.length });
        const card = drawFrom(space.deck);
        if (card){
          bus.emit('CARD_DRAWN', { deck: space.deck, card });
          await new Promise(res => {
            const off = bus.on('CARD_RESOLVE', () => { off(); res(); });
          });
          applyCard(card);
          bus.emit('CARD_APPLIED', { card, playerId:p.id, position:p.position });

          const justFinishedOnCard = maybeMarkFinished(p);
          if (justFinishedOnCard && maybeGameOver()) return;

          if (p.extraRoll){
            bus.emit('EFFECT_EXTRA_ROLL', { playerId: p.id, name: p.name });
            p.extraRoll = false;
            if (!state.gameOver) {
              bus.emit('TURN_BEGIN', { playerId: p.id, index: state.turnIndex });
            }
            return;
          }
        }
      }

      bus.emit('TURN_END', { playerId: p.id });
      state.turnIndex = advanceToNextActive((state.turnIndex + 1) % state.players.length);
      if (!state.gameOver){
        bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
      }
    }

    function setPlayerCount(n){
      const names = state.players.map(p=>p.name);
      initPlayers(n);
      state.players.forEach((p,i)=>{ if(names[i]) p.name = names[i]; });
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    function reset(){
      state.players.forEach(p=>{ p.position=0; p.skip=0; p.extraRoll=false; p.finished=false; p.place=null; });
      state.turnIndex=0;
      state.finishedOrder = [];
      state.gameOver = false;
      for (const [name,cards] of Object.entries(decks||{})) state.decks[name]=cards.slice();
      bus.emit('TURN_BEGIN', { playerId: current().id, index: state.turnIndex });
    }

    return { bus, state, endIndex, takeTurn, setPlayerCount, reset, makeRng };
  }

  return { createEngine, makeRng };
})();