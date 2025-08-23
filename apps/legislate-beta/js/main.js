
window.addEventListener('DOMContentLoaded', async ()=>{
  setupBoardSVG(); setupAdmin(); setupDice(); initPlayers(4); renderPlayersUI();
  await loadBoardConfig(); await loadDecks();
  renderTokens();
});
