// app.js — minimal boot; UI owns all wiring
(function () {
  const $ = (id) => document.getElementById(id);

  async function boot() {
    try {
      const pack = './assets/packs/uk-parliament';

      const [board, commons, early, lords, pingpong, implementation] = await Promise.all([
        fetch(`${pack}/board.json`).then(r => r.json()),
        fetch(`${pack}/cards/commons.json`).then(r => r.json()),
        fetch(`${pack}/cards/early.json`).then(r => r.json()),
        fetch(`${pack}/cards/lords.json`).then(r => r.json()),
        fetch(`${pack}/cards/pingpong.json`).then(r => r.json()),
        fetch(`${pack}/cards/implementation.json`).then(r => r.json()),
      ]);

      const engine = window.LegislateEngine.createEngine({
        board,
        decks: { commons, early, lords, pingpong, implementation },
        playerCount: Number($('playerCount').value) || 4,
      });

      // Expose for debug.js and manual inspection
      window.engine = engine;
      window.board = board;

      // UI takes over from here (wires events, toasts, dice, tokens, etc.)
      window.LegislateUI.create({
        board,
        engine,
        playersSection: $('playersSection'),
        tokensLayer: $('tokensLayer'),
        turnIndicator: $('turnIndicator'),
        rollBtn: $('rollBtn'),
        restartBtn: $('restartBtn'),
        playerCountSelect: $('playerCount'),
        modalRoot: $('modalRoot'),
        diceOverlay: $('diceOverlay'),
      });

      console.log('[EVT] BOOT_OK');
      const dbg = $('dbg-log');
      if (dbg) dbg.textContent += 'EVT BOOT_OK\n';
    } catch (err) {
      console.error('BOOT_FAIL', err);
      const dbg = document.getElementById('dbg-log');
      if (dbg) dbg.textContent += 'BOOT_FAIL ' + (err && err.stack || err) + '\n';
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();