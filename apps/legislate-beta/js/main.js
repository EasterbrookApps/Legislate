
window.addEventListener('DOMContentLoaded', async ()=>{
  setupBoardSVG(); initPlayers(4); await loadBoardConfig(); await loadDecks(); setupDice(); startGame();
  $('#restart').addEventListener('click', ()=> location.reload());
});
