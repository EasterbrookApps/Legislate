
const COLORS=['red','blue','green','yellow','purple','orange'];
const STAGES=['start','early','commons','lords','implementation','end'];
const STAGE_ORDER=['start','early','commons','lords','implementation','end'];
const GameState={players:[],activeIdx:0,started:false,roundStartIdx:0,finalization:false,finalizationStartIdx:null,winners:[],board:null,decks:{},deckMeta:{early:'deck-early',commons:'deck-commons',lords:'deck-lords',implementation:'deck-implementation',pingpong:'deck-pingpong'},config:{fastroll:new URLSearchParams(location.search).get('fastroll')==='1'}};
function initPlayers(count=4){ GameState.players=Array.from({length:clamp(count,2,6)}).map((_,i)=>({id:i,name:`Player ${i+1}`,color:COLORS[i],index:0,eliminated:false,skipNext:false,extraRoll:false})); GameState.activeIdx=0; GameState.roundStartIdx=0; GameState.finalization=false; GameState.finalizationStartIdx=null; GameState.winners=[];}
function setPlayerCount(n){ const prev=GameState.players.slice(0); initPlayers(n); for(let i=0;i<GameState.players.length && i<prev.length;i++){ GameState.players[i].name = prev[i].name || GameState.players[i].name; } }
function currentPlayer(){ return GameState.players[GameState.activeIdx]; }
function alivePlayers(){ return GameState.players.filter(p=>!p.eliminated); }
function nextActiveIdx(fromIdx=null){ let idx=(fromIdx===null?GameState.activeIdx:fromIdx); const n=GameState.players.length; for(let step=1;step<=n;step++){ const next=(idx+step)%n; const p=GameState.players[next]; if(!p.eliminated) return next; } return idx; }
function stageAt(index){ if(!GameState.board) return null; const sp=GameState.board.spaces[index]; return sp? sp.stage : null; }
function lastIndex(){ return GameState.board? GameState.board.spaces.length-1 : 57; }
function isCardSpace(index){ if(!GameState.board) return false; return GameState.board.decks.hasOwnProperty(String(index)); }
