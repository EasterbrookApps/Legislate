// state.js — v1.4
const COLORS = ['red','blue','green','yellow','purple','orange'];
const STAGE_ORDER = ['start','early','commons','lords','implementation','end'];

const GameState = {
  players: [],
  activeIdx: 0,
  board: null,
  winners: [],
  turns: 0,
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
  GameState.players = [];
  for(let i=0;i<count;i++) GameState.players.push(createPlayer(i));
  GameState.activeIdx = 0;
  GameState.winners = [];
  renderPlayersUI();
  renderTokens && renderTokens();
}

function setPlayerCount(n){
  const MIN = 2, MAX = GameState.maxPlayers;
  if(GameState.started) return; // add/remove only before start
  n = Math.max(MIN, Math.min(MAX, n));
  const cur = GameState.players.length;
  if(n > cur){
    for(let i=cur;i<n;i++) GameState.players.push(createPlayer(i));
  }else if(n < cur){
    GameState.players.length = n;
  }
  GameState.activeIdx = GameState.activeIdx % GameState.players.length;
  renderPlayersUI();
  renderTokens && renderTokens();
}

function currentPlayer(){ return GameState.players[GameState.activeIdx]; }
function lastIndex(){ return GameState.board ? (GameState.board.spaces.length - 1) : 57; }
function stageAt(index){
  if(!GameState.board || !Array.isArray(GameState.board.spaces)) return null;
  const sp = GameState.board.spaces[index];
  return sp ? sp.stage : null;
}
function tokenColor(name){ return name; }
