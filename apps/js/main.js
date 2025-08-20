
window.addEventListener('DOMContentLoaded', async ()=>{
  setupBoardSVG(); setupAdmin(); setupDice(); initPlayers(4); renderPlayersUI();
  await loadBoardConfig(); await loadDecks();
  setInterval(()=>{ const f=1+Math.floor(Math.random()*6); $('#floating-die').className='die floating p'+f; }, 8000);
  startGame();
});
