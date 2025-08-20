
const COLORS=['red','blue','green','yellow','purple','orange'];
const GameState={players:[],activeIdx:0,board:null,decks:{},config:{}};
function initPlayers(count=4){ GameState.players=Array.from({length:clamp(count,2,6)}).map((_,i)=>({id:i,name:`Player ${i+1}`,color:COLORS[i],index:0,eliminated:false,skipNext:false,extraRoll:false})); GameState.activeIdx=0;}
function currentPlayer(){ return GameState.players[GameState.activeIdx]; }
function lastIndex(){ return GameState.board? GameState.board.spaces.length-1 : 57; }
function stageAt(index){ if(!GameState.board) return null; const sp=GameState.board.spaces[index]; return sp? sp.stage : null; }
function isCardSpace(index){ if(!GameState.board) return false; const sp=GameState.board.spaces[index]; return sp && sp.deck && sp.deck!=='none'; }
