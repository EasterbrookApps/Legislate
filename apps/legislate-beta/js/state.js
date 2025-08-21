// state.js — player-scaling patch (safe, no CSS/board.json changes)
const COLORS = ['red','blue','green','yellow','purple','orange'];

window.GameState = window.GameState || {
  players: [],
  activeIdx: 0,
  started: false,
  maxPlayers: 6
};

function createPlayer(i){
  return {
    id: 'p'+i,
    name: 'Player ' + (i+1),
    color: COLORS[i % COLORS.length],
    index: 0,
    skipNext: false,
    extraRoll: false
  };
}

function initPlayers(count = 4){
  const MIN = 2, MAX = GameState.maxPlayers;
  count = Math.max(MIN, Math.min(MAX, count));
  GameState.players = [];
  for(let i=0;i<count;i++) GameState.players.push(createPlayer(i));
  GameState.activeIdx = 0;
  if (typeof renderPlayersUI === 'function') renderPlayersUI();
  if (typeof renderTokens === 'function') renderTokens();
}

function setPlayerCount(n){
  if(GameState.started) return; // add/remove only before first roll
  const MIN = 2, MAX = GameState.maxPlayers;
  n = Math.max(MIN, Math.min(MAX, n));
  const cur = GameState.players.length;
  if(n > cur){
    for(let i=cur;i<n;i++) GameState.players.push(createPlayer(i));
  }else if(n < cur){
    GameState.players.length = n;
  }
  GameState.activeIdx = GameState.activeIdx % GameState.players.length;
  if (typeof renderPlayersUI === 'function') renderPlayersUI();
  if (typeof renderTokens === 'function') renderTokens();
}

window.initPlayers = initPlayers;
window.setPlayerCount = setPlayerCount;
