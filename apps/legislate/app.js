import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'https://esm.sh/react@18.3.1/jsx-runtime'

const { useState, useEffect } = React;

const BOARD_SIZE = 58;
const LS_KEY = "legislate58_calibration_v1";

let DEFAULT_PATH = [[8.0, 92], [13.25, 92], [18.5, 92], [23.75, 92], [29.0, 92], [34.25, 92], [39.5, 92], [44.75, 92], [50.0, 92], [55.25, 92], [60.5, 92], [65.75, 92], [71.0, 92], [76.25, 92], [81.5, 92], [86.75, 92], [92.0, 92], [92, 86.75], [92, 81.5], [92, 76.25], [92, 71.0], [92, 65.75], [92, 60.5], [92, 55.25], [92, 50.0], [92, 44.75], [92, 39.5], [92, 34.25], [92, 29.0], [92, 23.75], [92, 18.5], [92, 13.25], [92, 8.0], [84.36, 26], [76.73, 26], [69.09, 26], [61.45, 26], [53.82, 26], [46.18, 26], [38.55, 26], [30.91, 26], [23.27, 26], [15.64, 26], [8.0, 26], [8, 30.0], [8, 34.0], [8, 38.0], [8, 42.0], [8, 46.0], [8, 50.0], [8, 54.0], [8, 58.0], [8, 62.0], [8, 66.0], [8, 70.0], [8, 74.0], [8, 74.0], [8, 74.0], [8, 74.0]];

const STAGES = {
  early: "Early stages",
  commons: "Commons",
  lords: "Lords",
  implementation: "Implementation",
};

const SPECIALS_DEFAULT = new Map([[6,'early'],[11,'commons'],[15,'lords'],[20,'implementation'],[25,'early'],[30,'commons'],[35,'lords'],[40,'implementation'],[46,'early'],[52,'lords']]);

const DECKS = {
  early: [
    { title: "Stakeholder scoping", text: "Early engagement finds risks. Move forward 1.", effect:{ type:"move", delta:1 } },
    { title: "Ministerial steer", text: "Scope narrows pending evidence. Go back 1.", effect:{ type:"move", delta:-1 } },
  ],
  commons: [
    { title: "Opposition Day", text: "Parliamentary time is tight. Go back 2.", effect:{ type:"move", delta:-2 } },
    { title: "Select Committee", text: "Helpful recommendations. Move forward 3.", effect:{ type:"move", delta:3 } },
  ],
  lords: [
    { title: "Amendment agreed", text: "Procedural success. Advance to next stage tile.", effect:{ type:"jump_next_special" } },
    { title: "Devolution check", text: "Consultations take time. Go back 1.", effect:{ type:"move", delta:-1 } },
  ],
  implementation: [
    { title: "Commencement regs", text: "Prepare SIs. Move forward 2.", effect:{ type:"move", delta:2 } },
    { title: "Judicial review risk", text: "Proceed with care. Miss a turn.", effect:{ type:"skip_next", count:1 } },
  ],
};

const COLORS = ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'];

function defaultPlayers(n){ return Array.from({length:n}, (_,_i)=>({ name:`Player ${_i+1}`, color: COLORS[_i%COLORS.length] })); }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function drawFrom(deck){ const card=deck[0]; const rest=deck.slice(1).concat([card]); return [card,rest]; }

function specialsFromMap(map, size){
  const arr = Array(size+1).fill(null);
  for (const [i, c] of map.entries()) arr[i] = c;
  return arr;
}

function loadFromLocal(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Array.isArray(obj.path) || !Array.isArray(obj.specials)) return null;
    if(obj.path.length !== BOARD_SIZE+1) return null;
    if(obj.specials.length !== BOARD_SIZE+1) return null;
    return obj;
  } catch(e){ return null; }
}

function saveToLocal(path, specials){
  const obj = { path, specials };
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

function createState(players){
  const saved = loadFromLocal();
  const path = saved?.path || DEFAULT_PATH;
  const specials = saved?.specials || specialsFromMap(SPECIALS_DEFAULT, BOARD_SIZE);
  return {
    players,
    path,
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
    specials,
  };
}

// Effects engine
function applyEffect(effect, s){
  if(!effect) return s;
  let out = {...s};
  switch(effect.type){
    case 'move': {
      const delta = Number(effect.delta||0);
      out.positions[out.turn] = clamp(out.positions[out.turn] + delta, 0, BOARD_SIZE);
      out.log = [`Effect: move ${delta>0?'+':''}${delta}.`, ...out.log];
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
    case 'move_to': {
      const i = clamp(Number(effect.index||0), 0, BOARD_SIZE);
      out.positions[out.turn] = i;
      out.log = [`Effect: move to ${i}.`, ...out.log];
      break;
    }
    case 'jump_next_special': {
      const here = out.positions[out.turn];
      let j = here+1;
      while(j<=BOARD_SIZE && !out.specials[j]) j++;
      if(j<=BOARD_SIZE){
        out.positions[out.turn] = j;
        out.log = [`Effect: jump to next stage tile at ${j}.`, ...out.log];
      }
      break;
    }
    case 'jump_next_stage': {
      const target = effect.stage;
      const here = out.positions[out.turn];
      let j = here+1;
      while(j<=BOARD_SIZE && out.specials[j]!==target) j++;
      if(j<=BOARD_SIZE){
        out.positions[out.turn] = j;
        out.log = [`Effect: jump to next ${STAGES[target]} tile at ${j}.`, ...out.log];
      }
      break;
    }
  }
  return out;
}

function useGame(){
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState(()=>defaultPlayers(4));
  const [state, setState] = useState(()=>createState(players));

  useEffect(()=>{ setState(createState(players)); }, [players]);

  // Auto-save path/specials changes
  useEffect(()=>{
    saveToLocal(state.path, state.specials);
  }, [state.path, state.specials]);

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
        const label = s.players[s.turn].name || `P${s.turn+1}`;
        return {...s, winner:s.turn, rolling:false, dice:d, log:[`🏆 ${label} has implemented their Act!`, ...s.log]};
      }
      let out = {...s, extraRoll:false, lastCard:null, rolling:false, dice:d};
      const stage = out.specials[out.positions[out.turn]];
      if(stage){
        const [card, rest] = drawFrom(out.decks[stage]);
        out.decks = {...out.decks, [stage]:rest};
        out.lastCard = { stage, ...card };
        out.log = [`Drew ${STAGES[stage]} card: ${card.title}`, ...out.log];
        out = applyEffect(card.effect, out);
        if(out.positions[out.turn]===BOARD_SIZE){
          const label = out.players[out.turn].name || `P${out.turn+1}`;
          return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]};
        }
      }
      let nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length;
      if(out.skips[nextTurn] > 0){
        const nextSkips = [...out.skips]; nextSkips[nextTurn]-=1;
        const label = out.players[nextTurn].name || `P${nextTurn+1}`;
        out.log = [`${label} skips a turn.`, ...out.log];
        nextTurn = (nextTurn+1) % out.players.length;
        return {...out, skips: nextSkips, turn: nextTurn};
      }
      return {...out, turn: nextTurn};
    });
  }

  return { playerCount, setPlayerCount, players, setPlayers, state, setState, start, reset, roll };
}

function swatchStage(stage){
  return ({early:'#d97706', commons:'#16a34a', lords:'#60a5fa', implementation:'#f59e0b'})[stage] || '#ccc';
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
            const extras = defaultPlayers(n - copy.length).map((x,i)=>({...x, name:`Player ${copy.length+i+1}`}));
            return copy.concat(extras);
          }
          return copy.slice(0,n);
        });
      }})
    ]}),
    players.map((p,i)=>_jsxs('div',{className:'setup-row', children:[
      _jsx('span', { className:'color-dot', style:{background:p.color} }),
      _jsx('input', { className:'input', placeholder:`Player ${i+1}`, style:{flex:1}, value:p.name, onChange:e=>{
        const v = e.target.value; // allow empty
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
        _jsxs('div', { style:{display:'flex', alignItems:'center', gap:8, fontWeight:800}, children:[
          _jsx('span', { className:'color-dot', style:{background: swatchStage(state.lastCard.stage)} }),
          _jsx('div', { children: state.lastCard.title })
        ]}),
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
function useCalibration(state, setState){
  const [enabled, setEnabled] = useState(false);
  const [idx, setIdx] = useState(0);
  function onClickBoard(e){
    if(!enabled) return;
    const wrap = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - wrap.left) / wrap.width) * 100;
    const y = ((e.clientY - wrap.top) / wrap.height) * 100;
    setState(s=>{
      const path = [...s.path];
      path[idx] = [x,y];
      return {...s, path};
    });
  }
  function tag(stage){
    setState(s=>{ const arr=[...s.specials]; arr[idx]=stage; return {...s, specials:arr}; });
  }
  function clearTag(){
    setState(s=>{ const arr=[...s.specials]; arr[idx]=null; return {...s, specials:arr}; });
  }
  function exportPath(){
    const data = `const PATH_58 = ${JSON.stringify(state.path.map(pt=>[+pt[0].toFixed(2), +pt[1].toFixed(2)]))};`;
    downloadText('path-58.js', data);
  }
  function exportSpecials(){
    const obj = {}; state.specials.forEach((c,i)=>{ if(c) obj[i]=c; });
    const mapCode = 'const SPECIALS = new Map(' + JSON.stringify(Object.entries(obj)) + ');';
    downloadText('specials-58.js', mapCode);
  }
  function exportJSON(){
    const data = JSON.stringify({ path: state.path, specials: state.specials }, null, 2);
    downloadText('legislate58-calibration.json', data);
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if(Array.isArray(obj.path) && Array.isArray(obj.specials) && obj.path.length===BOARD_SIZE+1 && obj.specials.length===BOARD_SIZE+1){
          setState(s=>({...s, path: obj.path, specials: obj.specials}));
        } else alert('Invalid calibration file');
      } catch(e){ alert('Invalid JSON'); }
    };
    reader.readAsText(file);
  }
  function saveBrowser(){
    saveToLocal(state.path, state.specials);
    alert('Saved to this browser.');
  }
  function loadBrowser(){
    const saved = loadFromLocal();
    if(saved){
      setState(s=>({...s, path: saved.path, specials: saved.specials}));
    } else alert('No saved calibration found in this browser.');
  }
  function clearBrowser(){
    localStorage.removeItem(LS_KEY);
    alert('Cleared saved calibration in this browser.');
  }
  function resetToDefault(){
    setState(s=>({...s, path: DEFAULT_PATH.slice(), specials: specialsFromMap(SPECIALS_DEFAULT, BOARD_SIZE)}));
  }
  return { enabled, setEnabled, idx, setIdx, onClickBoard, tag, clearTag, exportPath, exportSpecials, exportJSON, importJSON, saveBrowser, loadBrowser, clearBrowser, resetToDefault };
}

function Board({state, calib}){
  return _jsxs('div', { className:'board-wrap', onClick: calib.onClickBoard, children:[
    _jsx('div', { className:'board-img' }),
    _jsx(_Fragment, { children:
      state.specials.map((stage,i)=>{
        if(!stage) return null;
        const [x,y] = state.path[i] || [0,0];
        return _jsx('div', { className:'stage-q', style:{ left:`${x}%`, top:`${y}%`, position:'absolute', color: swatchStage(stage), fontSize: 20 }, children:'?' }, 'q'+i);
      })
    }),
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

function CalibBar({calib, state, setState}){
  const stageBtns = Object.entries(STAGES).map(([key, label])=>
    _jsxs('button', { className:'secondary', onClick:()=>calib.tag(key), children:[_jsx('span', { className:'stage-dot', style:{background: swatchStage(key)} }), label] }, key)
  );
  return _jsxs('div', { className:'calib-bar', children:[
    _jsxs('label', { children:[ _jsx('input', { type:'checkbox', checked:calib.enabled, onChange:e=>calib.setEnabled(e.target.checked)}), ' Calibration mode (click to set index 0..58)' ]}),
    calib.enabled && _jsxs(_Fragment, { children:[
      _jsxs('div', { className:'badge', children:['Index: ', calib.idx]}),
      _jsx('button', { onClick:()=>calib.setIdx(i=>Math.max(0,i-1)), children:'◀ Prev' }),
      _jsx('button', { onClick:()=>calib.setIdx(i=>Math.min(BOARD_SIZE, calib.idx+1)), children:'Next ▶' }),
      _jsx('button', { className:'secondary', onClick:calib.resetToDefault, children:'Reset PATH & stages' }),
      _jsx('button', { className:'cta', onClick:calib.exportPath, children:'Export PATH (path-58.js)' }),
      _jsx('button', { className:'cta', onClick:calib.exportSpecials, children:'Export stages (specials-58.js)' }),
      _jsx('button', { onClick:calib.exportJSON, children:'Export JSON' }),
      _jsx('button', { onClick:()=>{ const el=document.createElement('input'); el.type='file'; el.accept='.json'; el.onchange=(e)=>calib.importJSON(e.target.files[0]); el.click(); }, children:'Import JSON' }),
      _jsx('button', { onClick:calib.saveBrowser, children:'Save in this browser' }),
      _jsx('button', { onClick:calib.loadBrowser, children:'Load from this browser' }),
      _jsx('button', { onClick:calib.clearBrowser, children:'Clear browser save' }),
      _jsx('span', { className:'small', children:'Tag stage for selected index:'}),
      ...stageBtns,
      _jsx('button', { onClick:calib.clearTag, children:'Clear stage' }),
      _jsx('span', { className:'small', children: state.specials[calib.idx] ? `Tagged: ${STAGES[state.specials[calib.idx]]}` : 'No tag' }),
    ]})
  ]});
}

function App(){
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState(()=>defaultPlayers(4));
  const [state, setState] = useState(()=>createState(players));
  const calib = useCalibration(state, setState);

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
        const label = s.players[s.turn].name || `P${s.turn+1}`;
        return {...s, winner:s.turn, rolling:false, dice:d, log:[`🏆 ${label} has implemented their Act!`, ...s.log]};
      }
      let out = {...s, extraRoll:false, lastCard:null, rolling:false, dice:d};
      const stage = out.specials[out.positions[out.turn]];
      if(stage){
        const [card, rest] = drawFrom(out.decks[stage]);
        out.decks = {...out.decks, [stage]:rest};
        out.lastCard = { stage, ...card };
        out.log = [`Drew ${STAGES[stage]} card: ${card.title}`, ...out.log];
        out = applyEffect(card.effect, out);
        if(out.positions[out.turn]===BOARD_SIZE){
          const label = out.players[out.turn].name || `P${out.turn+1}`;
          return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]};
        }
      }
      let nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length;
      if(out.skips[nextTurn] > 0){
        const nextSkips = [...out.skips]; nextSkips[nextTurn]-=1;
        const label = out.players[nextTurn].name || `P${nextTurn+1}`;
        out.log = [`${label} skips a turn.`, ...out.log];
        nextTurn = (nextTurn+1) % out.players.length;
        return {...out, skips: nextSkips, turn: nextTurn};
      }
      return {...out, turn: nextTurn};
    });
  }

  return _jsxs('div', { className:'grid', children:[
    state.started
      ? _jsx(PlayerSidebar, { state, onRoll: roll, onReset: reset })
      : _jsx(SetupPanel, { playerCount, setPlayerCount, players, setPlayers, onStart: start }),
    _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Board (58 spaces) — stage-calibrated'}),
      _jsx(Board, { state, calib }),
      _jsx(CalibBar, { calib, state, setState }),
      _jsx('div', { className:'small', children:'Calibrate PATH (0..58) by clicking square centres. Tag stage for each ? square. Export or save to browser.' })
    ]})
  ]});
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));
