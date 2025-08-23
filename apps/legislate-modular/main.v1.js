import { loadRegistry, loadPack, withBase } from './adapters/loader.js';
import { createBoardRenderer } from './adapters/ui/boardRenderer.js';
import { createModal } from './adapters/ui/cardsModal.js';
import { setAlt, setSrc, setTurnIndicator, renderPlayers } from './adapters/ui/misc.js';
import { wireRoll } from './adapters/ui/dice.js';
import { wireRestart } from './adapters/restart.js';
import { mulberry32, makeDice } from './core/rng.js';
import { createEngine } from './core/engine.js';
import { saveGame, loadGame, clearSave } from './adapters/storage.js';

const $ = (id)=>document.getElementById(id);

async function bootstrap(){
  const registry = await loadRegistry();
  const url = new URL(location.href);
  const packParam = url.searchParams.get('pack');
  const packId = packParam || registry[0].id;
  const { meta, board, decks } = await loadPack(packId, registry);

  const boardImg=$('board-img'); const tokensLayer=$('tokens-layer'); const modal=createModal();
  const turnIndicator=$('turn-indicator'); const playersContainer=$('players');
  const rollBtn=$('roll-btn'); const restartBtn=$('restart-btn'); const footerAttrib=$('footer-attrib');

  setAlt(boardImg, meta.alt); setSrc(boardImg, withBase(meta.boardImage));
  footerAttrib.textContent = meta.attribution || 'Contains public sector information licensed under the Open Government Licence v3.0.';

  const seed = Math.floor(Math.random()*2**31); const rng=mulberry32(seed); const dice=makeDice(rng);
  const engine=createEngine({ board, decks, rng });
  const boardUI=createBoardRenderer({ imgEl: boardImg, tokensLayer, board });

  let namesLocked=false;
  const saved = loadGame();
  if (saved && saved.packId === engine.state.packId) {
    if (confirm('Resume your previous game?')) engine.hydrate(saved); else clearSave();
  }

  function onEditName(id,value){ const p=engine.state.players.find(pp=>pp.id===id); if(p){ p.name=value; saveGame({ ...engine.serialize(), packId }); updateUI(); } }

  function updateUI(){
    const activePlayer=engine.state.players[engine.state.turnIndex];
    renderPlayers(playersContainer, engine.state.players, activePlayer.id, { editable: true, onEdit: onEditName, locked: namesLocked });
    setTurnIndicator(turnIndicator, activePlayer.name);
    boardUI.placeTokens(engine.state.players);
  }

  engine.bus.on('TURN_BEGIN', updateUI);
  engine.bus.on('MOVE_STEP', updateUI);
  engine.bus.on('CARD_DRAWN', async ({deck, card})=>{ if(!card) return; await modal.open({ title: `Card: ${deck}`, body: card.text || '' }); updateUI(); });
  engine.bus.on('TURN_SKIPPED', async ({playerId})=>{ await modal.open({ title: 'Turn skipped', body: 'You miss a turn.' }); });
  engine.bus.on('GAME_END', async ({ winners })=>{
    const names = winners.map(w=>w.name).join(', ');
    await modal.open({ title: 'We have a winner!', body: `${names} reached the end. Play again?` });
    namesLocked=false; engine.reset(); saveGame({ ...engine.serialize(), packId }); updateUI();
  });

  wireRoll(rollBtn, async ()=>{
    const roll = dice();
    namesLocked = true;
    await modal.open({ title: 'Dice roll', body: `You rolled a ${roll}.` });
    engine.takeTurn(roll);
    saveGame({ ...engine.serialize(), packId });
    updateUI();
  });

  wireRestart(restartBtn, ()=>{ namesLocked=false; engine.reset(); saveGame({ ...engine.serialize(), packId }); updateUI(); }, true);

  engine.bus.emit('TURN_BEGIN', {}); updateUI();
}
bootstrap().catch(err=>{
  console.error(err);
  const main=document.getElementById('main')||document.body;
  const div=document.createElement('div'); div.style.padding='1rem'; div.style.background='#f3f2f1'; div.style.border='2px solid #d4351c';
  div.innerHTML='<h2>There\'s a problem loading the game</h2><p>Please check the content pack files and try again.</p>';
  main.prepend(div);
});