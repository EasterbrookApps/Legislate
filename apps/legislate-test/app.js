// app.js — mobile-stable repaint + dual-mode name editors + bus diagnostics (console)
(function () {
  const UI        = window.LegislateUI        || window.UI;
  const Loader    = window.LegislateLoader    || window.Loader;
  const Storage   = window.LegislateStorage   || window.Storage;
  const EngineMod = window.LegislateEngine    || window.EngineLib || window.Engine;

  if (!UI || !Loader || !Storage || !EngineMod) {
    console.error('[BOOT] Missing core libraries', {
      hasUI: !!UI, hasLoader: !!Loader, hasStorage: !!Storage, hasEngine: !!EngineMod
    });
  }

  // DOM refs (camelCase IDs per your index.html)
  const boardImg       = document.getElementById('boardImg');
  const tokensLayer    = document.getElementById('tokensLayer');
  const turnIndicator  = document.getElementById('turnIndicator');
  const playerCountSel = document.getElementById('playerCount');
  const footerAttrib   = document.getElementById('footerAttrib');
  const rollBtn        = document.getElementById('rollBtn');
  const restartBtn     = document.getElementById('restartBtn');

  // helpers
  function waitForImage(img) {
    return new Promise((resolve) => {
      if (!img) return resolve();
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.addEventListener('load',  () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }
  const dice = () => 1 + Math.floor(Math.random() * 6);

  let engine, board, decks, modal, boardUI;
  let namesLocked = false;

  // Build simple name editor row if the template doesn't provide one (pre-roll only)
  function ensureNameEditors() {
    if (namesLocked || !engine) return;

    const container =
      document.getElementById('playersSection') ||
      document.querySelector('.players-section');

    if (!container) return;

    // If inputs OR contenteditable already exist, leave them (supports both styles)
    if (container.querySelector('.player-name-input,[contenteditable][data-role="player-name"],.player-name[contenteditable]')) {
      return;
    }

    // Render minimal editors for each player (pre-roll only)
    const frag = document.createDocumentFragment();
    engine.state.players.forEach(p => {
      const pill = document.createElement('div');
      pill.className = 'player-pill';

      const dot = document.createElement('span');
      dot.className = 'player-dot';
      dot.style.background = p.color || p.colour || '#1d70b8';

      const input = document.createElement('input');
      input.className = 'player-name-input';
      input.setAttribute('data-player-id', p.id);
      input.value = p.name;

      pill.appendChild(dot);
      pill.appendChild(input);
      frag.appendChild(pill);
    });

    container.appendChild(frag);
  }

  async function bootstrap() {
    try {
      // Content
      const registry = await Loader.loadRegistry();
      const pack = (registry || []).find(p => p.id === 'uk-parliament') || (registry && registry[0]);
      if (!pack) throw new Error('No content packs found in registry');

      const { meta = {}, board: bd, decks: dx } = await Loader.loadPack(pack.id, registry);
      board = bd; decks = dx;

      // Assets
      UI.setSrc(boardImg, Loader.withBase(meta.boardImage || 'public/board.png'));
      UI.setAlt(boardImg, meta.alt || 'UK Parliament board');
      if (footerAttrib) {
        footerAttrib.textContent =
          meta.attribution ||
          'Contains public sector information licensed under the Open Government Licence v3.0.';
      }

      await waitForImage(boardImg);

      // UI + engine
      modal   = UI.createModal();
      boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);

      const saved = Storage.load();
      const initialCount = Number(playerCountSel?.value || 4);
      const factory = typeof EngineMod.createEngine === 'function' ? EngineMod.createEngine : EngineMod;
      engine = factory({
        board,
        decks,
        rng: Math.random,
        playerCount: saved?.players?.length || initialCount,
        savedState: saved || null
      });

      // Immediate banner clear
      if (turnIndicator) {
        const cur = engine.state.players[engine.state.turnIndex];
        UI.setTurnIndicator(turnIndicator, cur?.name || 'Player');
      }

      // Optional debug attach
      try {
        const on = (new URLSearchParams(location.search).get('debug') === '1') ||
                   (localStorage.getItem('legislate.debug') === '1');
        if (on && window.LegislateDebug) window.LegislateDebug.attach(engine, board, decks);
      } catch (_) {}

      // Initial render and editors
      updateUI();
      ensureNameEditors();

      // Named handlers to ensure they persist on mobile Safari
      function onTurnBegin(ev)  { console.log('[bus] TURN_BEGIN', ev); updateUI(); }
      function onMoveStep(ev)   { console.log('[bus] MOVE_STEP', ev); requestAnimationFrame(updateUI); }
      function onCardDrawn(ev)  { console.log('[bus] CARD_DRAWN', ev); }

      // Start first turn & wire events
      engine.bus.emit('TURN_BEGIN', {
        playerId: engine.state.players[engine.state.turnIndex].id,
        index:    engine.state.turnIndex
      });
      engine.bus.on('TURN_BEGIN', onTurnBegin);
      engine.bus.on('MOVE_STEP',   onMoveStep);
      engine.bus.on('CARD_DRAWN',  onCardDrawn);

      // Wildcard log (so we see events even if the debug panel is off)
      if (engine.bus.on) {
        try { engine.bus.on('*', (type, payload) => console.log('[bus:*]', type, payload)); } catch (_) {}
      }

      // Resize/orientation reflow — repaint tokens
      window.addEventListener('resize', updateUI);
      window.addEventListener('orientationchange', () => setTimeout(updateUI, 200));

      // Show card modals when a card is drawn
      engine.bus.on('CARD_DRAWN', async ({ deck, card }) => {
        if (!card) return;
        const title = card.title || card.name || `Card from ${deck}`;
        const body  = card.body  || card.text || '';
        try {
          await modal.open({ title, body: typeof body === 'string' ? body : String(body) });
        } catch (_) {}
      });

      // Player count (pre-roll only)
      if (playerCountSel) {
        playerCountSel.addEventListener('change', (e) => {
          if (namesLocked) { e.preventDefault(); playerCountSel.value = String(engine.state.players.length); return; }
          const n = Math.max(2, Math.min(6, Number(playerCountSel.value) || 4));
          engine.setPlayerCount(n);
          updateUI();
          ensureNameEditors();
          Storage.save(engine.serialize());
        });
      }

      // Name editing: prevent shortcuts in both modes (input / contenteditable)
      document.addEventListener('keydown', (ev) => {
        const t = ev.target;
        if (t && t.matches && (t.matches('.player-name-input') || t.matches('[contenteditable][data-role="player-name"]') || t.matches('.player-name[contenteditable]'))) {
          ev.stopPropagation();
        }
      }, true);

      // Inputs
      document.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || !t.matches || !t.matches('.player-name-input')) return;
        if (namesLocked) { t.blur(); return; }
        const pid   = t.getAttribute('data-player-id');
        const value = (t.value || '').trimEnd();
        const p = engine.state.players.find(p => p.id === pid);
        if (p) {
          p.name = value;
          UI.setTurnIndicator(turnIndicator, engine.state.players[engine.state.turnIndex].name);
          Storage.save(engine.serialize());
          updateUI();
        }
      });

      // Contenteditable spans: either [data-role="player-name"] or .player-name[contenteditable]
      document.addEventListener('blur', (ev) => {
        const t = ev.target;
        if (!t || !t.matches || !(t.matches('[contenteditable][data-role="player-name"]') || t.matches('.player-name[contenteditable]'))) return;
        if (namesLocked) { t.blur(); return; }
        const pid   = t.getAttribute('data-player-id');
        const value = (t.textContent || '').trimEnd();
        const p = engine.state.players.find(p => p.id === pid);
        if (p) {
          p.name = value;
          UI.setTurnIndicator(turnIndicator, engine.state.players[engine.state.turnIndex].name);
          Storage.save(engine.serialize());
          updateUI();
        }
      }, true);

      // Roll
      rollBtn?.addEventListener('click', async () => {
        const r = dice();
        console.log('[roll] value', r);
        namesLocked = true;
        if (playerCountSel) playerCountSel.disabled = true;
        if (UI.showDiceRoll) await UI.showDiceRoll(r, 1600);
        await modal.open({ title: 'Dice roll', body: `You rolled a ${r}.` });
        await engine.takeTurn(r);
        console.log('[roll] complete');
        Storage.save(engine.serialize());
        updateUI();
      });

      // Restart
      restartBtn?.addEventListener('click', async () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>Are you sure you want to restart and scrap all these bills?</p>`;
        await modal.open({ title: 'Play again?', body });
        if (confirm('Restart the game and keep player names?')) {
          const keepNames = engine.state.players.map(p => p.name);
          engine.reset({ keepNames });
          namesLocked = false;
          if (playerCountSel) { playerCountSel.disabled = false; playerCountSel.value = String(keepNames.length); }
          Storage.clear();
          updateUI();
          ensureNameEditors();
          engine.bus.emit('TURN_BEGIN', {
            playerId: engine.state.players[engine.state.turnIndex].id,
            index:    engine.state.turnIndex
          });
        }
      });

    } catch (err) {
      console.error('[BOOT] Failed to start', err);
      const errBox = document.getElementById('error-box');
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = 'There\'s a problem loading the game. Please refresh.';
      }
    }
  }

  function updateUI() {
    try {
      if (!engine || !boardUI) return;
      const current = engine.state.players[engine.state.turnIndex];
      UI.setTurnIndicator(turnIndicator, current?.name || 'Player');
      boardUI.renderPlayers(engine.state.players);
    } catch (e) {
      console.error('[UI] update failed', e);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();