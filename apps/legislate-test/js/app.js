// app.js — main orchestration (UI wiring, engine hookup, etc.)
(function(){
  const $ = id => document.getElementById(id);

  async function boot(){
    try {
      const [board, commons, early, lords, pingpong, implementation] = await Promise.all([
        fetch('./assets/packs/uk-parliament/board.json').then(r=>r.json()),
        fetch('./cards/commons.json').then(r=>r.json()),
        fetch('./cards/early.json').then(r=>r.json()),
        fetch('./cards/lords.json').then(r=>r.json()),
        fetch('./cards/pingpong.json').then(r=>r.json()),
        fetch('./cards/implementation.json').then(r=>r.json()),
      ]);

      const engine = window.LegislateEngine.createEngine({
        board,
        decks: { commons, early, lords, pingpong, implementation },
        playerCount: Number($('playerCount').value) || 4,
      });

      // 🔧 Fix: expose for debug.js (and optional use elsewhere)
      window.engine = engine;
      window.board = board;

      const ui = window.LegislateUI.create({
        board,
        engine,
        root: document.body,
        playersSection: $('playersSection'),
        tokensLayer: $('tokensLayer'),
        turnIndicator: $('turnIndicator'),
        rollBtn: $('rollBtn'),
        restartBtn: $('restartBtn'),
        playerCountSelect: $('playerCount'),
        modalRoot: $('modalRoot'),
        diceOverlay: $('diceOverlay'),
      });

      // --- Toast wiring ---
      engine.bus.on('MISS_TURN', ({ name }) => {
        window.LegislateUI.toast(`${name} misses a turn`, { kind: 'info' });
      });

      engine.bus.on('CARD_APPLIED', ({ card, playerId }) => {
        if (!card || typeof card.effect !== 'string') return;
        const [type] = card.effect.split(':');
        const p = engine.state.players.find(x => x.id === playerId);

        if (type === 'extra_roll') {
          window.LegislateUI.toast(`${p?.name || 'Player'} gets an extra roll`, { kind: 'success' });
        }
        if (type === 'miss_turn') {
          window.LegislateUI.toast(`${p?.name || 'Player'} will miss their next turn`, { kind: 'info' });
        }
      });

      engine.bus.on('EFFECT_GOTO', ({ playerId, index }) => {
        const p = engine.state.players.find(x => x.id === playerId);
        window.LegislateUI.toast(`${p?.name || 'Player'} jumps to ${index}`, { kind: 'info', ttl: 1800 });
      });

      engine.bus.on('GAME_END', ({ name }) => {
        window.LegislateUI.toast(`${name} reached the end!`, { kind: 'success', ttl: 2600 });
      });

      console.log('[EVT] BOOT_OK');
    } catch (err) {
      console.error('BOOT_FAIL', err);
      $('dbg-log').textContent = 'BOOT_FAIL ' + err;
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();