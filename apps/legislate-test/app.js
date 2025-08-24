
(function(){
  const DEBUG = true;
  function waitForImage(img){
    return new Promise((resolve)=>{
      if (!img) return resolve();
      if (img.complete && img.naturalWidth>0) return resolve();
      img.addEventListener('load', ()=> resolve(), { once:true });
      img.addEventListener('error', ()=> resolve(), { once:true });
    });
  }
  const $ = (id)=> document.getElementById(id);

  const Storage = window.LegislateStorage;
  const Loader = window.LegislateLoader;
  const UI = window.LegislateUI;
  const EngineLib = window.LegislateEngine;

  const playerCountSel = $('playerCount');
  const rollBtn = $('rollBtn');
  const restartBtn = $('restartBtn');
  const boardImg = $('boardImg');
  const tokensLayer = $('tokensLayer');
  const playersContainer = $('players');
  const turnIndicator = $('turnIndicator');
  const footerAttrib = $('footerAttrib');
  const modal = UI.createModal('modalRoot');

  let namesLocked = false;
  let dice, engine, board;

  function friendlyError(){
    const main = $('main');
    const div = document.createElement('div');
    div.style.padding='1rem'; div.style.background='#f3f2f1'; div.style.border='2px solid #d4351c'; div.style.marginTop='1rem';
    div.innerHTML = '<h2>There\'s a problem loading the game</h2><p>Please check the content files and try again.</p>';
    main.prepend(div);
  }

  function updateUI(boardUI){
    const active = engine.state.players[engine.state.turnIndex];
    UI.renderPlayers(playersContainer, engine.state.players, {
      editable: true,
      locked: namesLocked,
      onEditName: (id, value)=>{
        const p = engine.state.players.find(pp=>pp.id===id);
        if (p){ p.name = value; Storage.save(engine.serialize()); UI.setTurnIndicator(turnIndicator, engine.state.players[engine.state.turnIndex].name); }
      }
    });
    UI.setTurnIndicator(turnIndicator, active.name);
    boardUI.placeTokens(engine.state.players);
  }

  async function bootstrap(){
    try{
      const registry = await Loader.loadRegistry();
      const packId = (new URL(location.href)).searchParams.get('pack') || registry[0].id;
      const payload = await Loader.loadPack(packId, registry);
      const meta = payload.meta; board = payload.board; const decks = payload.decks;

      UI.setAlt(boardImg, meta.alt);
      UI.setSrc(boardImg, Loader.withBase(meta.boardImage));
      footerAttrib.textContent = meta.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0.';

      // Wait for board image to size before any token placement
      await waitForImage(boardImg);

      const seed = Math.floor(Math.random()*Math.pow(2,31));
      const rng = EngineLib.makeRng(seed);
      dice = EngineLib.makeDice(rng);

      const saved = Storage.load();
      const startCount = (saved && saved.players) ? Math.min(6, Math.max(2, saved.players.length)) : 4;
      playerCountSel.value = String(startCount);

      engine = EngineLib.createEngine({ board, decks, rng, playerCount: Number(playerCountSel.value) });
      const boardUI = UI.createBoardRenderer(boardImg, tokensLayer, board);

      // Ensure tokens render after image dimensions are known
      boardImg.addEventListener('load', ()=> updateUI(boardUI));
      if (boardImg.complete) { updateUI(boardUI); }

      if (saved && saved.packId === engine.state.packId){
        if (confirm('Resume your previous game?')){
          engine.hydrate(saved);
          namesLocked = true;
          playerCountSel.disabled = true;
        } else {
          Storage.clear();
        }
      }

      engine.bus.on('TURN_BEGIN', ()=> updateUI(boardUI));
      engine.bus.on('MOVE_STEP', ()=> updateUI(boardUI));
      engine.bus.on('CARD_DRAWN', async ({deck, card})=>{
        if (!card) return;
        await modal.open({ title: `Card: ${deck}`, body: card.text || '' });
        updateUI(boardUI);
      });
      engine.bus.on('TURN_SKIPPED', async ()=>{
        await modal.open({ title: 'Turn skipped', body: 'You miss a turn.' });
      });
      engine.bus.on('GAME_END', async ({ winners })=>{
        const names = winners.map(w=>w.name).join(', ');
        await modal.open({ title: 'We have a winner!', body: `${names} reached the end. Play again?` });
        namesLocked = false;
        engine.reset();
        Storage.save(engine.serialize());
        playerCountSel.disabled = false;
        updateUI(boardUI);
      });

      playerCountSel.addEventListener('change', ()=>{
        if (namesLocked){ playerCountSel.value = String(engine.state.players.length); return; }
        engine.setPlayerCount(Number(playerCountSel.value));
        Storage.save(engine.serialize());
        updateUI(boardUI);
      });

      rollBtn.addEventListener('click', async ()=>{
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === 'INPUT' && activeEl.classList.contains('player-name')) return;
        const r = dice();
        if (DEBUG) console.log('[ROLL]', r);
        namesLocked = true;
        playerCountSel.disabled = true;
        await UI.showDiceRoll(r, 1800);
        await modal.open({ title: 'Dice roll', body: `You rolled a ${r}.` });
        await engine.takeTurn(r);
        if (DEBUG) console.log('[STATE after turn]', JSON.stringify(engine.state.players.map(p=>({id:p.id,name:p.name,pos:p.position}))))
        Storage.save(engine.serialize());
        updateUI(boardUI);
      });
      rollBtn.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); rollBtn.click(); }
      });

      restartBtn.addEventListener('click', ()=>{
        const msg = 'Do you really want to scrap all these bills and start again?';
        if (confirm(msg)){
          const n = engine.state.players.length;
          namesLocked = false;
          engine = EngineLib.createEngine({ board, decks, rng, playerCount: n });
          Storage.save(engine.serialize());
          playerCountSel.disabled = false;
          playerCountSel.value = String(n);
          const boardUI2 = UI.createBoardRenderer(boardImg, tokensLayer, board);
          engine.bus.on('TURN_BEGIN', ()=> updateUI(boardUI2));
          engine.bus.on('MOVE_STEP', ()=> updateUI(boardUI2));
          engine.bus.on('CARD_DRAWN', async ({deck, card})=>{
            if (!card) return;
            await modal.open({ title: `Card: ${deck}`, body: card.text || '' });
            updateUI(boardUI2);
          });
          engine.bus.on('TURN_SKIPPED', async ()=>{
            await modal.open({ title: 'Turn skipped', body: 'You miss a turn.' });
          });
          engine.bus.on('GAME_END', async ({ winners })=>{
            const names = winners.map(w=>w.name).join(', ');
            await modal.open({ title: 'We have a winner!', body: `${names} reached the end. Play again?` });
            namesLocked = false; engine.reset(); Storage.save(engine.serialize()); playerCountSel.disabled = false; updateUI(boardUI2);
          });
          engine.bus.emit('TURN_BEGIN', {});
          updateUI(boardUI2);
        }
      });

      updateUI(boardUI);
      engine.bus.emit('TURN_BEGIN', {});
      updateUI(boardUI);
    } catch (err){
      console.error(err);
      friendlyError();
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
