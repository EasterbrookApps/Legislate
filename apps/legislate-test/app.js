// app.js — restore full debug wiring + keep modal guard; should fix 'stuck on Loading…'
(function () {
  const UI        = window.LegislateUI        || window.UI;
  const Loader    = window.LegislateLoader    || window.Loader;
  const Storage   = window.LegislateStorage   || window.Storage;
  const EngineMod = window.LegislateEngine    || window.EngineLib || window.Engine;

  const boardImg       = document.getElementById('boardImg');
  const tokensLayer    = document.getElementById('tokensLayer');
  const turnIndicator  = document.getElementById('turnIndicator');
  const playerCountSel = document.getElementById('playerCount');
  const footerAttrib   = document.getElementById('footerAttrib');
  const rollBtn        = document.getElementById('rollBtn');
  const restartBtn     = document.getElementById('restartBtn');

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

  function dbg(msg, obj){ try{ if ((new URLSearchParams(location.search).get('debug')==='1') || (localStorage.getItem('legislate.debug')==='1')) console.log('[DBG app]', msg, obj||''); }catch{} }

  function ensureNameEditors() {
    if (namesLocked || !engine) return;
    const container = document.getElementById('playersSection') || document.querySelector('.players-section');
    if (!container) return;
    if (container.querySelector('.player-name-input,[contenteditable][data-role="player-name"],.player-name[contenteditable]')) return;
    const frag = document.createDocumentFragment();
    engine.state.players.forEach(p => {
      const pill = document.createElement('div'); pill.className = 'player-pill';
      const dot = document.createElement('span'); dot.className = 'player-dot'; dot.style.background = p.color || p.colour || '#1d70b8';
      const input = document.createElement('input'); input.className = 'player-name-input'; input.setAttribute('data-player-id', p.id); input.value = p.name;
      pill.appendChild(dot); pill.appendChild(input); frag.appendChild(pill);
    });
    container.appendChild(frag);
  }

  function updateUI() {
    try {
      if (!engine) return;
      if (turnIndicator) {
        const current = engine.state.players[engine.state.turnIndex];
        (UI.setTurnIndicator || ((el, n)=> el.textContent = (n||'Player') + \"'s turn\"))(turnIndicator, current?.name || 'Player');
      }
      if (!boardUI && UI.createBoardRenderer) {
        boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);
      }
      boardUI && boardUI.renderPlayers && boardUI.renderPlayers(engine.state.players);
    } catch (e) { console.error('[UI] update failed', e); }
  }

  async function bootstrap() {
    try {
      // Log DOM presence early (via debug.js panel)
      try { window.LegislateDebug?.ensurePanel(); } catch {}

      const registry = await Loader.loadRegistry();
      const pack = (registry || []).find(p => p.id === 'uk-parliament') || (registry && registry[0]);
      if (!pack) throw new Error('No content packs found in registry');

      const { meta = {}, board: bd, decks: dx } = await Loader.loadPack(pack.id, registry);
      board = bd; decks = dx;

      (UI.setSrc || ((img, src)=> img.src = src))(boardImg, Loader.withBase(meta.boardImage || 'public/board.png'));
      (UI.setAlt || ((img, alt)=> img.alt = alt))(boardImg, meta.alt || 'UK Parliament board');
      if (footerAttrib) footerAttrib.textContent = meta.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0.';

      await waitForImage(boardImg);

      modal   = (UI.createModal && UI.createModal()) || null;
      boardUI = UI.createBoardRenderer ? UI.createBoardRenderer(boardImg, tokensLayer, board) : null;

      const saved = Storage.load();
      const initialCount = Number(playerCountSel?.value || 4);
      const factory = typeof EngineMod.createEngine === 'function' ? EngineMod.createEngine : EngineMod;
      engine = factory({ board, decks, rng: Math.random, playerCount: saved?.players?.length || initialCount, savedState: saved || null });

      // Attach debug (engine)
      try { if (window.LegislateDebug) window.LegislateDebug.attach(engine, board, decks); } catch {}

      // Initial banner
      if (turnIndicator) {
        const cur = engine.state.players[engine.state.turnIndex];
        (UI.setTurnIndicator || ((el, n)=> el.textContent = (n||'Player') + \"'s turn\"))(turnIndicator, cur?.name || 'Player');
      }

      updateUI();
      ensureNameEditors();

      function onTurnBegin(ev){ dbg('BUS TURN_BEGIN', ev); updateUI(); }
      function onMoveStep(ev){ dbg('BUS MOVE_STEP', ev); requestAnimationFrame(updateUI); }
      function onCardDrawn(ev){ dbg('BUS CARD_DRAWN', ev); }

      engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });
      engine.bus.on('TURN_BEGIN', onTurnBegin);
      engine.bus.on('MOVE_STEP',   onMoveStep);
      engine.bus.on('CARD_DRAWN',  onCardDrawn);

      window.addEventListener('resize', updateUI);
      window.addEventListener('orientationchange', () => setTimeout(updateUI, 200));

      engine.bus.on('CARD_DRAWN', async ({ deck, card }) => {
        if (!card) return;
        const title = card.title || card.name || `Card from ${deck}`;
        const body  = card.body  || card.text || '';
        try { await modal?.open?.({ title, body: typeof body === 'string' ? body : String(body) }); } catch(e) { console.warn('modal failed', e); }
      });

      if (playerCountSel) {
        dbg('Listener attach', { id:'playerCount', type:'change' });
        playerCountSel.addEventListener('change', (e) => {
          if (namesLocked) { e.preventDefault(); playerCountSel.value = String(engine.state.players.length); return; }
          const n = Math.max(2, Math.min(6, Number(playerCountSel.value) || 4));
          engine.setPlayerCount(n);
          updateUI();
          ensureNameEditors();
          Storage.save(engine.serialize());
        });
      } else dbg('Missing element', { id:'playerCount' });

      document.addEventListener('keydown', (ev) => {
        const t = ev.target;
        if (t && t.matches && (t.matches('.player-name-input') || t.matches('[contenteditable][data-role="player-name"]') || t.matches('.player-name[contenteditable]'))) {
          ev.stopPropagation();
        }
      }, true);

      document.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || !t.matches || !t.matches('.player-name-input')) return;
        if (namesLocked) { t.blur(); return; }
        const pid   = t.getAttribute('data-player-id');
        const value = (t.value || '').trimEnd();
        const p = engine.state.players.find(p => p.id === pid);
        if (p) {
          p.name = value;
          (UI.setTurnIndicator || ((el, n)=> el.textContent = (n||'Player') + \"'s turn\"))(turnIndicator, engine.state.players[engine.state.turnIndex].name);
          Storage.save(engine.serialize());
          updateUI();
        }
      });

      document.addEventListener('blur', (ev) => {
        const t = ev.target;
        if (!t || !t.matches || !(t.matches('[contenteditable][data-role="player-name"]') || t.matches('.player-name[contenteditable]'))) return;
        if (namesLocked) { t.blur(); return; }
        const pid   = t.getAttribute('data-player-id');
        const value = (t.textContent || '').trimEnd();
        const p = engine.state.players.find(p => p.id === pid);
        if (p) {
          p.name = value;
          (UI.setTurnIndicator || ((el, n)=> el.textContent = (n||'Player') + \"'s turn\"))(turnIndicator, engine.state.players[engine.state.turnIndex].name);
          Storage.save(engine.serialize());
          updateUI();
        }
      }, true);

      if (rollBtn) {
        dbg('Listener attach', { id:'rollBtn', type:'click' });
        rollBtn.addEventListener('click', async () => {
          dbg('rollBtn click');
          const r = dice();
          console.log('[roll] value', r);
          namesLocked = true;
          if (playerCountSel) playerCountSel.disabled = true;
          try { if (UI.showDiceRoll) await UI.showDiceRoll(r, 1600); } catch(e) { console.warn('dice overlay failed', e); }
          try { await modal?.open?.({ title: 'Dice roll', body: `You rolled a ${r}.` }); } catch(e) { console.warn('modal failed', e); }
          await engine.takeTurn(r);
          Storage.save(engine.serialize());
          updateUI();
        });
      } else dbg('Missing element', { id:'rollBtn' });

      if (restartBtn) {
        dbg('Listener attach', { id:'restartBtn', type:'click' });
        restartBtn.addEventListener('click', async () => {
          dbg('restartBtn click');
          const body = document.createElement('div');
          body.innerHTML = `<p>Are you sure you want to restart and scrap all these bills?</p>`;
          try { await modal?.open?.({ title: 'Play again?', body }); } catch(e) { console.warn('modal failed', e); }
          const keepNames = engine.state.players.map(p => p.name);
          engine.reset({ keepNames });
          namesLocked = false;
          if (playerCountSel) { playerCountSel.disabled = false; playerCountSel.value = String(keepNames.length); }
          Storage.clear();
          updateUI();
          ensureNameEditors();
          engine.bus.emit('TURN_BEGIN', { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex });
        });
      } else dbg('Missing element', { id:'restartBtn' });

    } catch (err) {
      console.error('[BOOT] Failed to start', err);
      try { window.LegislateDebug?.ensurePanel(); } catch {}
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();