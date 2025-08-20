
window.addEventListener('DOMContentLoaded', async ()=>{
  setupBoardSVG(); setupAdmin(); setupDice(); initPlayers(4);
  await loadBoardConfig(); await loadDecks(); startGame();
  setInterval(()=>{ const f=1+Math.floor(Math.random()*6); $('#floating-die').className='die floating p'+f; }, 8000);
});
