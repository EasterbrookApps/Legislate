
const COLORS=['red','blue','green','yellow','purple','orange'];
const STAGES=['start','early','commons','lords','implementation','end'];
const STAGE_ORDER=['start','early','commons','lords','implementation','end'];
const GameState={players:[],activeIdx:0,board:null,winners:[],config:{fastroll:new URLSearchParams(location.search).get('fastroll')==='1'}};
function initPlayers(count=4){ GameState.players=Array.from({length:clamp(count,2,6)}).map((_,i)=>({id:i,name:`Player ${i+1}`,color:COLORS[i],index:0,eliminated:false,skipNext:false,extraRoll:false})); GameState.activeIdx=0; GameState.winners=[];}
function currentPlayer(){ return GameState.players[GameState.activeIdx]; }
function lastIndex(){ return GameState.board? GameState.board.spaces.length-1 : 57; }
function stageAt(index){ if(!GameState.board) return null; const sp=GameState.board.spaces[index]; return sp? sp.stage : null; }
