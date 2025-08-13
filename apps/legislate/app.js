
// Legislate calibration patch (58-space)
// Replaces /apps/legislate/app.js and bakes in your calibration.
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'https://esm.sh/react@18.3.1/jsx-runtime'
const { useState, useEffect } = React;

const BOARD_SIZE = 58;
const LS_PATH = 'legislate:path58';
const LS_STAGES = 'legislate:stages58';

// === Your calibrated data ===
const DEFAULT_PATH = [[13.045454545454547, 87.45454545454545], [21.136363636363637, 73], [27.227272727272727, 64.72727272727272], [36.04545454545455, 65.54545454545455], [47.77272727272727, 67.45454545454545], [42.04545454545455, 73.0909090909091], [43.86363636363637, 79.54545454545455], [38.68181818181819, 90.9090909090909], [48.77272727272727, 91.0909090909091], [59.409090909090914, 84], [60.22727272727273, 92.9090909090909], [69.04545454545455, 95.9090909090909], [71.04545454545455, 88.18181818181819], [65.77272727272727, 79.27272727272727], [86.13636363636363, 84.9090909090909], [79.31818181818183, 74.90909090909092], [79.13636363636364, 70.27272727272728], [75.31818181818181, 65.63636363636364], [63.13636363636363, 58.909090909090914], [72.68181818181819, 49.36363636363637], [78.22727272727272, 51.90909090909091], [82.5909090909091, 57.54545454545455], [89.5909090909091, 66.54545454545455], [91.95454545454545, 54.18181818181819], [89.95454545454545, 49.27272727272727], [92.5, 41.36363636363637], [85.22727272727273, 33.81818181818182], [79.68181818181819, 38.09090909090909], [73.77272727272727, 38.27272727272727], [62.5, 34.18181818181818], [67.86363636363636, 27.636363636363637], [70.5, 19.18181818181818], [75.86363636363636, 22.454545454545453], [85.4090909090909, 26.272727272727277], [89.5, 18.181818181818183], [90.04545454545455, 7.454545454545454], [77.22727272727272, 8.363636363636363], [68.77272727272728, 6.454545454545454], [58.59090909090909, 6.454545454545454], [53.22727272727272, 7.454545454545454], [50.227272727272734, 13.363636363636363], [49.04545454545455, 19], [52.5, 25.636363636363633], [51.68181818181819, 31], [44.95454545454545, 38.63636363636363], [37.86363636363637, 28.72727272727273], [35.86363636363637, 19.545454545454547], [33.59090909090909, 11.363636363636363], [26.77272727272727, 7.363636363636364], [17.31818181818182, 7.727272727272727], [12.136363636363637, 12.909090909090908], [8.409090909090908, 20.272727272727273], [10.681818181818182, 29.454545454545457], [20.31818181818182, 32.81818181818182], [30.954545454545457, 36.36363636363637], [33.59090909090909, 45.09090909090909], [32.22727272727273, 54.63636363636364], [13.681818181818182, 47.090909090909086], [97.80000000000001, 30]];
const DEFAULT_STAGES = [null, null, "early", null, "early", "early", null, "early", null, "early", null, "early", null, "early", "early", null, "early", null, null, null, "commons", null, "commons", null, "commons", null, null, "commons", null, null, null, "lords", null, "lords", null, "lords", null, null, null, "lords", null, "lords", null, "lords", null, null, "implementation", null, "implementation", null, "implementation", null, "implementation", null, "implementation", null, "implementation", "implementation", null];

// Stage labels/colours
const STAGE_LABEL = {
  early: 'Early stages',
  commons: 'Commons',
  lords: 'Lords',
  implementation: 'Implementation',
};
const STAGE_COLOR = {
  early: '#ff9f43',
  commons: '#18d18c',
  lords: '#ff6b6b',
  implementation: '#58a6ff',
};

(function seedIfMissing(){
  try {
    if(!localStorage.getItem(LS_PATH)) localStorage.setItem(LS_PATH, JSON.stringify(DEFAULT_PATH));
    if(!localStorage.getItem(LS_STAGES)) localStorage.setItem(LS_STAGES, JSON.stringify(DEFAULT_STAGES));
  } catch(_) {}
})();

function loadPath(){ try{ const s=localStorage.getItem(LS_PATH); if(s) return JSON.parse(s); }catch{} return DEFAULT_PATH; }
function loadStages(){ try{ const s=localStorage.getItem(LS_STAGES); if(s) return JSON.parse(s); }catch{} return DEFAULT_STAGES; }
function savePath(a){ try{ localStorage.setItem(LS_PATH, JSON.stringify(a)); }catch{} }
function saveStages(a){ try{ localStorage.setItem(LS_STAGES, JSON.stringify(a)); }catch{} }

const DECKS = {
  early: [
    { title:'Scope rethink', text:'Refocus policy intent.\nMiss a turn.', effect:{ type:'skip_next', count:1 } },
    { title:'Stakeholder discovery', text:'Valuable external input.\nAdvance 2.', effect:{ type:'move', delta:2 } },
    { title:'Cross-gov alignment', text:'Resolve overlaps early.\nRoll again.', effect:{ type:'extra_roll' } },
  ],
  commons: [
    { title:'Opposition day', text:'Parliamentary time squeezed.\nGo back 2.', effect:{ type:'move', delta:-2 } },
    { title:'Committee evidence', text:'Constructive recommendations.\nAdvance 3.', effect:{ type:'move', delta:3 } },
    { title:'Programme motion', text:'Business managers assist.\nJump to next Commons square.', effect:{ type:'jump_next_stage', stage:'commons' } },
  ],
  lords: [
    { title:'Amendment marshalled', text:'Complex amendments tabled.\nGo back 1.', effect:{ type:'move', delta:-1 } },
    { title:'Constructive scrutiny', text:'Debate improves drafting.\nAdvance 2.', effect:{ type:'move', delta:2 } },
    { title:'Ping-pong prospect', text:'Prepare for exchanges.\nMiss a turn.', effect:{ type:'skip_next', count:1 } },
  ],
  implementation: [
    { title:'Commencement SIs', text:'Phased start dates.\nAdvance 2.', effect:{ type:'move', delta:2 } },
    { title:'Guidance published', text:'Delivery partners ready.\nRoll again.', effect:{ type:'extra_roll' } },
    { title:'Judicial review risk', text:'Proceed carefully.\nGo back 2.', effect:{ type:'move', delta:-2 } },
  ]
};

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function drawFrom(deck){ const card=deck[0]; const rest=deck.slice(1).concat([card]); return [card,rest]; }

function createState(players, path = loadPath(), stages = loadStages()){
  return {
    players,
    path,
    stages,
    turn: 0,
    dice: 0,
    rolling: false,
    positions: players.map(()=>0),
    skips: players.map(()=>0),
    winner: null,
    decks: JSON.parse(JSON.stringify(DECKS)),
    lastCard: null,
    log: [],
    extraRoll:false,
    started:false,
  };
}

const COLORS = ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'];
function defaultPlayers(n){ return Array.from({length:n}, (_,i)=>({ name:`Player ${i+1}`, color: COLORS[i%COLORS.length] })); }

function applyEffect(effect, s){
  if(!effect) return s;
  let out = {...s};
  switch(effect.type){
    case 'move': {
      const d = Number(effect.delta||0);
      out.positions[out.turn] = clamp(out.positions[out.turn] + d, 0, BOARD_SIZE);
      out.log = [`Effect: move ${d>0?'+':''}${d}.`, ...out.log];
      break;
    }
    case 'skip_next': {
      const c = Number(effect.count||1);
      out.skips[out.turn] += c;
      out.log = [`Effect: miss ${c} turn${c>1?'s':''}.`, ...out.log];
      break;
    }
    case 'extra_roll': {
      out.extraRoll = true;
      out.log = [`Effect: extra roll.`, ...out.log];
      break;
    }
    case 'jump_next_stage': {
      const target = effect.stage;
      const here = out.positions[out.turn];
      let j = here+1;
      while(j<=BOARD_SIZE && out.stages[j]!==target) j++;
      if(j<=BOARD_SIZE){
        out.positions[out.turn] = j;
        out.log = [`Effect: jump to next ${target} stage at ${j}.`, ...out.log];
      }
      break;
    }
  }
  return out;
}

function SetupPanel({playerCount, setPlayerCount, players, setPlayers, onStart}){
  return _jsxs('div', { className:'card', children:[
    _jsx('h2', { className:'h', children:'Players & Setup'}),
    _jsxs('div', { className:'setup-row', children:[
      _jsx('label', { children:'Number of players (2–6): '}),
      _jsx('input', { type:'number', min:2, max:6, value:playerCount, className:'input', style:{width:80}, onChange:e=>{
        const n = Math.max(2, Math.min(6, Number(e.target.value)||2));
        setPlayerCount(n);
        setPlayers(p=>{
          const copy = [...p];
          if(copy.length < n){
            const extras = Array.from({length:n-copy.length}, (_,i)=>({ name:`Player ${copy.length+i+1}`, color: ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'][(copy.length+i)%6] }));
            return copy.concat(extras);
          }
          return copy.slice(0,n);
        });
      }})
    ]}),
    players.map((p,i)=>_jsxs('div',{className:'setup-row', children:[
      _jsx('span', { className:'color-dot', style:{background:p.color} }),
      _jsx('input', { className:'input', placeholder:`Player ${i+1}`, style:{flex:1}, value:p.name, onChange:e=>{
        const v = e.target.value;
        setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, name:v} : pp));
      }}),
      _jsx('input', { type:'color', value:p.color, onChange:e=>{
        const v = e.target.value;
        setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, color:v} : pp));
      }}),
    ]}, i)),
    _jsxs('div', { className:'setup-row', children:[
      _jsx('button', { className:'cta', onClick:onStart, children:'Start game' }),
      _jsx('span', { className:'small', children:'Tip: names can be blank; tokens show P1/P2… if empty.'})
    ]})
  ]})
}

function PlayerSidebar({state, onRoll, onReset}){
  const me = state.players[state.turn];
  const label = me.name || `P${state.turn+1}`;
  return _jsxs('div', { className:'card', children:[
    _jsx('h2', { className:'h', children:'Current turn'}),
    _jsxs('div', { className:'playercard', children:[
      _jsxs('div', { className:'name', children:[
        _jsx('span', { className:'color-dot', style:{background:me.color}}),
        _jsx('span', { children: label }),
      ]}),
      state.winner==null ? _jsx('span', { className:'turnarrow', children:'➡️' }) : _jsx(_Fragment, {})
    ]}),
    _jsxs('div', { style:{display:'flex', gap:10, alignItems:'center', marginTop:12}, children:[
      _jsxs('div', { className:`dice ${state.rolling?'rolling':''}`, children:[ state.dice || '–' ]}),
      _jsx('button', { onClick:onRoll, disabled:state.winner!=null, children: state.winner!=null ? 'Game over' : 'Roll 🎲' }),
      _jsx('button', { className:'secondary', onClick:onReset, children:'Reset' }),
    ]}),
    state.lastCard && _jsxs(_Fragment, { children:[
      _jsx('div', { style:{height:10}}),
      _jsxs('div', { className:'card', style:{background:'#0b1320', border:'1px solid #20304a'}, children:[
        _jsx('div', { style:{display:'flex', alignItems:'center', gap:8, fontWeight:800}, children:_jsxs('span', { className:'stage-chip', children:[ _jsx('span', { className:'color-dot', style:{background: STAGE_COLOR[state.lastCard.stage]} }), STAGE_LABEL[state.lastCard.stage] ]}) }),
        _jsx('div', { className:'small', style:{marginTop:6, whiteSpace:'pre-wrap'}, children: state.lastCard.text })
      ]})
    ]}),
    _jsx('h3', { className:'h', style:{marginTop:16}, children:'Players'}),
    _jsx('div', { className:'playerlist', children:
      state.players.map((p,i)=> _jsxs('div', { className:'playercard', children:[
        _jsxs('div', { className:'name', children:[ _jsx('span', { className:'color-dot', style:{background:p.color} }), (p.name || `P${i+1}`) ] }),
        _jsxs('div', { className:'small', children:['Pos: ', state.positions[i]] })
      ]}, i))
    }),
    state.winner!=null && _jsxs('p', { className:'small', style:{marginTop:12}, children:['🏆 ', (state.players[state.winner].name||`P${state.winner+1}`), ' wins!'] }),
    _jsx('hr', {}),
    _jsx('p', { className:'small', children:'Board image © authors of Legislate?!, OGL v3.0. This web adaptation is unofficial.' })
  ]})
}

// Calibration
function useCalibration(state, setState, setPathPoint, setStageAt){
  const [enabled, setEnabled] = useState(false);
  const [idx, setIdx] = useState(0);

  function onClickBoard(e){
    if(!enabled) return;
    const wrap = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - wrap.left) / wrap.width) * 100;
    const y = ((e.clientY - wrap.top) / wrap.height) * 100;
    setPathPoint(idx, x, y);
  }

  function exportJSON(){
    const data = { path: state.path, stages: state.stages, version:'58' };
    download('legislate-calibration-58.json', JSON.stringify(data, null, 2));
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if(Array.isArray(data.path) && Array.isArray(data.stages) && data.path.length===BOARD_SIZE+1 && data.stages.length===BOARD_SIZE+1){
          localStorage.setItem(LS_PATH, JSON.stringify(data.path));
          localStorage.setItem(LS_STAGES, JSON.stringify(data.stages));
          setState(s=>({...s, path:data.path, stages:data.stages}));
        } else alert('Invalid calibration JSON');
      }catch(err){ alert('Failed to parse calibration JSON'); }
    };
    reader.readAsText(file);
  }
  function exportPathCode(){
    const code = 'const PATH_58 = ' + JSON.stringify(state.path) + ';';
    download('path-58.js', code);
  }
  function exportStagesCode(){
    const obj = {}; state.stages.forEach((v,i)=>{ if(v) obj[i]=v; });
    const code = 'const STAGES = new Map(' + JSON.stringify(Object.entries(obj)) + ');';
    download('stages-58.js', code);
  }
  function download(name, text){
    const blob = new Blob([text], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 0);
  }

  return { enabled, setEnabled, idx, setIdx, onClickBoard, exportJSON, importJSON, exportPathCode, exportStagesCode };
}

function Board({state, calib}){
  return _jsxs('div', { className:'board-wrap', onClick: calib.onClickBoard, children:[
    _jsx('div', { className:'board-img' }),
    calib.enabled && _jsx('div', { className:'path-ghost', children:
      state.path.map(([x,y],i)=> _jsx('div', { className:'pt', style:{left:`${x}%`, top:`${y}%`, opacity: i===calib.idx?1:.6 }}, i))
    }),
    calib.enabled && _jsx('div', { className:'calib-dot', style:{
      left: `${(state.path[calib.idx]?.[0] ?? 0)}%`, top: `${(state.path[calib.idx]?.[1] ?? 0)}%`
    }}),
    state.players.map((p,idx)=>{
      const pos = state.positions[idx];
      const [x,y] = state.path[Math.min(pos, state.path.length-1)] || [0,0];
      const isTurn = idx===state.turn && state.winner==null;
      return _jsxs('div', { className:`token ${isTurn?'turn':''}`, style:{ left:`${x}%`, top:`${y}%`, background:p.color }, children:[
        _jsx('span', { children: (idx+1) }),
        _jsx('span', { className:'label', children: (p.name || `P${idx+1}`) })
      ]}, idx);
    })
  ]});
}

function CalibBar({calib, state, setStageAt}){
  const StageBtn = ({id}) => _jsxs('button', { className:'secondary', onClick:()=>setStageAt(calib.idx, id), children:[ _jsx('span', { className:'color-dot', style:{background: STAGE_COLOR[id]} }), STAGE_LABEL[id] ]});
  return _jsxs('div', { className:'calib-bar', children:[
    _jsxs('label', { children:[ _jsx('input', { type:'checkbox', checked:calib.enabled, onChange:e=>calib.setEnabled(e.target.checked)}), ' Calibration mode (click to set index 0..58)' ]}),
    calib.enabled && _jsxs(_Fragment, { children:[
      _jsxs('div', { className:'badge', children:['Index: ', calib.idx]}),
      _jsx('button', { onClick:()=>calib.setIdx(i=>Math.max(0,i-1)), children:'◀ Prev' }),
      _jsx('button', { onClick:()=>calib.setIdx(i=>Math.min(BOARD_SIZE, calib.idx+1)), children:'Next ▶' }),
      _jsx('button', { className:'secondary', onClick:calib.exportJSON, children:'Export JSON (path+stages)' }),
      _jsx('button', { className:'secondary', onClick:calib.exportPathCode, children:'Export PATH (code)' }),
      _jsx('button', { className:'secondary', onClick:calib.exportStagesCode, children:'Export stages (code)' }),
      _jsx('label', { className:'stage-chip', children:_jsxs('span', { children:[ ' Import JSON ', _jsx('input', { type:'file', accept:'.json', onChange:e=> e.target.files?.[0] && calib.importJSON(e.target.files[0]) }) ]}) }),
      _jsx('span', { className:'small', children:'Set stage at this index:'}),
      _jsx(StageBtn, { id:'early' }),
      _jsx(StageBtn, { id:'commons' }),
      _jsx(StageBtn, { id:'lords' }),
      _jsx(StageBtn, { id:'implementation' }),
      _jsx('span', { className:'small', children: state.stages[calib.idx] ? `Tagged: ${STAGE_LABEL[state.stages[calib.idx]]}` : 'No stage' }),
    ]})
  ]});
}

function useGame(){
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState(()=>defaultPlayers(4));
  const [state, setState] = useState(()=>createState(players));

  useEffect(()=>{ setState(createState(players)); }, [players]);

  function start(){ setState(s=>({...s, started:true, log:[`Game started with ${players.length} players.`, ...s.log]})); }
  function reset(){ setState(createState(players)); }

  async function roll(){
    setState(s=>({...s, rolling:true}));
    await new Promise(r=>setTimeout(r, 250));
    const d = randInt(1,6);
    for(let k=0;k<d;k++){
      await new Promise(r=>requestAnimationFrame(()=>setTimeout(r, 160)));
      setState(s=>{
        if(s.winner) return s;
        const np = clamp(s.positions[s.turn] + 1, 0, BOARD_SIZE);
        const positions = [...s.positions]; positions[s.turn] = np;
        const label = s.players[s.turn].name || `P${s.turn+1}`;
        const log = [`${label} moved to ${np}.`, ...s.log];
        return {...s, positions, log};
      });
    }
    setState(s=>{
      if(s.positions[s.turn]===BOARD_SIZE){
        const label = (s.players[s.turn].name||`P${s.turn+1}`);
        return {...s, winner:s.turn, rolling:false, dice:d, log:[`🏆 ${label} has implemented their Act!`, ...s.log]};
      }
      let out = {...s, extraRoll:false, lastCard:null, rolling:false, dice:d};
      const stage = out.stages[out.positions[out.turn]];
      if(stage){
        const [card, rest] = drawFrom(out.decks[stage]);
        out.decks = {...out.decks, [stage]:rest};
        out.lastCard = { stage, ...card };
        out.log = [`Drew ${STAGE_LABEL[stage]} card: ${card.title}`, ...out.log];
        out = applyEffect(card.effect, out);
        if(out.positions[out.turn]===BOARD_SIZE){
          const label = (out.players[out.turn].name||`P${out.turn+1}`);
          return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]};
        }
      }
      let nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length;
      if(out.skips[nextTurn] > 0){
        const nextSkips = [...out.skips]; nextSkips[nextTurn]-=1;
        const label = (out.players[nextTurn].name||`P${nextTurn+1}`);
        out.log = [`${label} skips a turn.`, ...out.log];
        nextTurn = (nextTurn+1) % out.players.length;
        return {...out, skips: nextSkips, turn: nextTurn};
      }
      return {...out, turn: nextTurn};
    });
  }

  return { playerCount, setPlayerCount, players, setPlayers, state, setState, start, reset, roll };
}

function App(){
  const g = useGame();
  const { state, setState } = g;
  function setPathPoint(i,x,y){ setState(s=>{ const p=[...s.path]; p[i]=[x,y]; savePath(p); return {...s, path:p}; }); }
  function setStageAt(i,stage){ setState(s=>{ const a=[...s.stages]; a[i]=stage; saveStages(a); return {...s, stages:a}; }); }
  const calib = useCalibration(state, setState, setPathPoint, setStageAt);

  return _jsxs('div', { className:'grid', children:[
    state.started
      ? _jsx(PlayerSidebar, { state, onRoll: g.roll, onReset: g.reset })
      : _jsx(SetupPanel, { playerCount:g.playerCount, setPlayerCount:g.setPlayerCount, players:g.players, setPlayers:g.setPlayers, onStart:g.start }),
    _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Board (58 spaces)' }),
      _jsx(Board, { state, calib }),
      _jsx(CalibBar, { calib, state, setStageAt }),
      _jsx('div', { className:'small', children:'Your provided calibration is baked in. Click to fine-tune. Export JSON or code to back up.' })
    ]})
  ]});
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));
