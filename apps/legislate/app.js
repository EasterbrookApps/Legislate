import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'https://esm.sh/react@18.3.1/jsx-runtime'

const { useState, useMemo, useEffect, useRef } = React;

const BOARD_SIZE = 50;

// Default PATH (reasonable approximation). Use Calibration mode to fine-tune and export your own.
let DEFAULT_PATH = [
  [6,92],[15,92],[24,92],[33,92],[42,92],[51,92],[60,92],[69,92],[78,92],[87,92],
  [87,83],[87,74],[87,65],[87,56],[87,47],
  [78,47],[69,47],[60,47],[51,47],[42,47],[33,47],[24,47],
  [24,38],[24,29],[24,20],
  [33,20],[42,20],[51,20],[60,20],[69,20],
  [69,29],[69,38],[69,47],
  [60,56],[51,56],[42,56],[33,56],[24,56],
  [15,56],[6,56],
  [6,47],[6,38],[6,29],
  [15,29],[24,29],[33,29],[42,29],[51,29],[60,29],
  [69,29],[78,29],[87,29],
];

// Special tiles (index -> colour)
const SPECIALS = new Map([[5,'red'],[9,'green'],[13,'blue'],[18,'yellow'],[22,'red'],[27,'green'],[31,'blue'],[36,'yellow'],[41,'red'],[46,'blue']]);

// Placeholder decks. Replace with official text as needed.
const DECKS = {
  red: [
    { title: "Opposition Day", text: "Parliamentary time is tight.\nGo back 2 spaces.", effect:{ type:"move", delta:-2 } },
    { title: "Drafting niggle", text: "You spotted an ambiguity early.\nRoll again.", effect:{ type:"extra_roll" } },
    { title: "Select Committee", text: "Helpful recommendations speed things up.\nMove forward 3.", effect:{ type:"move", delta:3 } },
  ],
  green: [
    { title: "Policy rethink", text: "Minister changes scope.\nMiss a turn.", effect:{ type:"skip_next", count:1 } },
    { title: "Stakeholder support", text: "External groups endorse your Bill.\nAdvance 2.", effect:{ type:"move", delta:2 } },
  ],
  blue: [
    { title: "Devolution check", text: "Liaise with devolved govts.\nGo back 1.", effect:{ type:"move", delta:-1 } },
    { title: "Drafting complete", text: "Great work from OPC.\nAdvance to next ❓ space.", effect:{ type:"jump_next_special" } },
  ],
  yellow: [
    { title: "Commencement regs", text: "Implementation requires SIs.\nGo forward 2.", effect:{ type:"move", delta:2 } },
    { title: "Judicial review", text: "Proceed with caution.\nGo back 2.", effect:{ type:"move", delta:-2 } },
  ],
};

const COLORS = ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'];

function defaultPlayers(n){
  return Array.from({length:n}, (_,i)=>({ name:`Player ${i+1}`, color: COLORS[i%COLORS.length] }));
}

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

function drawFrom(deck){ const card=deck[0]; const rest=deck.slice(1).concat([card]); return [card,rest]; }

function createState(players, path=DEFAULT_PATH){
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
  };
}

// ---- Effects engine ----
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
      while(j<=BOARD_SIZE && !SPECIALS.has(j)) j++;
      if(j<=BOARD_SIZE){
        out.positions[out.turn] = j;
        out.log = [`Effect: jump to next ? at ${j}.`, ...out.log];
      }
      break;
    }
    case 'jump_next_color': {
      const target = effect.color;
      const here = out.positions[out.turn];
      let j = here+1;
      while(j<=BOARD_SIZE && SPECIALS.get(j)!==target) j++;
      if(j<=BOARD_SIZE){
        out.positions[out.turn] = j;
        out.log = [`Effect: jump to next ${target} ? at ${j}.`, ...out.log];
      }
      break;
    }
  }
  return out;
}

// ---- Game hook ----
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
    await moveSteps(d);
    setState(s=>({...s, dice:d, rolling:false}));
  }

  async function moveSteps(steps){
    for(let k=0;k<steps;k++){
      await new Promise(r=>requestAnimationFrame(()=>setTimeout(r, 160)));
      setState(s=>{
        if(s.winner) return s;
        const np = clamp(s.positions[s.turn] + 1, 0, BOARD_SIZE);
        const positions = [...s.positions]; positions[s.turn] = np;
        const log = [`${s.players[s.turn].name} moved to ${np}.`, ...s.log];
        return {...s, positions, log};
      });
    }
    // after movement resolve effects / turn advance
    setState(s=>{
      if(s.positions[s.turn]===BOARD_SIZE){
        return {...s, winner:s.turn, log:[`🏆 ${s.players[s.turn].name} has implemented their Act!`, ...s.log]};
      }
      let out = {...s, extraRoll:false, lastCard:null};
      const specialColor = SPECIALS.get(out.positions[out.turn]);
      if(specialColor){
        const [card, rest] = drawFrom(out.decks[specialColor]);
        out.decks = {...out.decks, [specialColor]:rest};
        out.lastCard = { color: specialColor, ...card };
        out.log = [`Drew ${specialColor.toUpperCase()} card: ${card.title}`, ...out.log];
        out = applyEffect(card.effect, out);
        // Clamp & immediate win check after effect-based moves
        if(out.positions[out.turn]===BOARD_SIZE){
          return {...out, winner: out.turn, log:[`🏆 ${out.players[out.turn].name} has implemented their Act!`, ...out.log]};
        }
      }
      let nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length;
      // handle skip(s)
      if(out.skips[nextTurn] > 0){
        const nextSkips = [...out.skips]; nextSkips[nextTurn]-=1;
        out.log = [`${out.players[nextTurn].name} skips a turn.`, ...out.log];
        nextTurn = (nextTurn+1) % out.players.length;
        return {...out, skips: nextSkips, turn: nextTurn};
      }
      return {...out, turn: nextTurn};
    });
  }

  return { playerCount, setPlayerCount, players, setPlayers, state, start, reset, roll, setState };
}

// ---- UI components ----
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
      _jsx('input', { className:'input', style:{flex:1}, value:p.name, onChange:e=>{
        const v = e.target.value || `Player ${i+1}`;
        setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, name:v} : pp));
      }}),
      _jsx('input', { type:'color', value:p.color, onChange:e=>{
        const v = e.target.value;
        setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, color:v} : pp));
      }}),
    ]}, i)),
    _jsxs('div', { className:'setup-row', children:[
      _jsx('button', { className:'cta', onClick:onStart, children:'Start game' }),
      _jsx('span', { className:'small', children:'Tip: rename players and choose token colours.'})
    ]})
  ]})
}

function PlayerSidebar({state, onRoll, onReset}){
  const me = state.players[state.turn];
  return _jsxs('div', { className:'card', children:[
    _jsx('h2', { className:'h', children:'Current turn'}),
    _jsxs('div', { className:'playercard', children:[
      _jsxs('div', { className:'name', children:[
        _jsx('span', { className:'color-dot', style:{background:me.color}}),
        _jsx('span', { children: me.name }),
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
          _jsx('span', { className:'color-dot', style:{background: swatch(state.lastCard.color)} }),
          _jsx('div', { children: state.lastCard.title })
        ]}),
        _jsx('div', { className:'small', style:{marginTop:6, whiteSpace:'pre-wrap'}, children: state.lastCard.text })
      ]})
    ]}),
    _jsx('h3', { className:'h', style:{marginTop:16}, children:'Players'}),
    _jsx('div', { className:'playerlist', children:
      state.players.map((p,i)=> _jsxs('div', { className:'playercard', children:[
        _jsxs('div', { className:'name', children:[ _jsx('span', { className:'color-dot', style:{background:p.color} }), p.name ] }),
        _jsxs('div', { className:'small', children:['Pos: ', state.positions[i]] })
      ]}, i))
    }),
    state.winner!=null && _jsxs('p', { className:'small', style:{marginTop:12}, children:['🏆 ', state.players[state.winner].name, ' wins!'] }),
    _jsx('hr', {}),
    _jsxs('p', { className:'small', children:[
      'Board image © authors of Legislate?!, OGL v3.0. This web adaptation is unofficial.'
    ]})
  ]})
}

function swatch(color){
  return ({red:'#ff6b6b', green:'#18d18c', blue:'#58a6ff', yellow:'#ffd166'})[color] || '#ccc';
}

// --- Calibration mode ---
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
  function exportPath(){
    const data = `const PATH = ${JSON.stringify(state.path.map(pt=>[+pt[0].toFixed(2), +pt[1].toFixed(2)]))};`;
    const blob = new Blob([data], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'path.js';
    a.click();
    URL.revokeObjectURL(url);
  }
  function resetToDefault(){
    setState(s=>({...s, path: DEFAULT_PATH.slice()}));
  }
  return { enabled, setEnabled, idx, setIdx, onClickBoard, exportPath, resetToDefault };
}

function Board({state, calib}){
  return _jsxs('div', { className:'board-wrap', onClick: calib.onClickBoard, children:[
    _jsx('div', { className:'board-img' }),
    // Optional ghost points to visualize path points
    calib.enabled && _jsx('div', { className:'path-ghost', children:
      state.path.map(([x,y],i)=> _jsx('div', { className:'pt', style:{left:`${x}%`, top:`${y}%`, opacity: i===calib.idx?1:.6 }}, i))
    }),
    state.players.map((p,idx)=>{
      const pos = state.positions[idx];
      const [x,y] = state.path[Math.min(pos, state.path.length-1)] || [0,0];
      const isTurn = idx===state.turn && state.winner==null;
      return _jsxs('div', { className:`token ${isTurn?'turn':''}`, style:{ left:`${x}%`, top:`${y}%`, background:p.color }, children:[
        _jsx('span', { children: (idx+1) }),
        _jsx('span', { className:'label', children: p.name })
      ]}, idx);
    }),
    calib.enabled && _jsx('div', { className:'calib-dot', style:{
      left: `${(state.path[calib.idx]?.[0] ?? 0)}%`, top: `${(state.path[calib.idx]?.[1] ?? 0)}%`
    }})
  ]});
}

function CalibBar({calib}){
  return _jsxs('div', { className:'calib-bar', children:[
    _jsxs('label', { className:'toggle', children:[
      _jsx('input', { type:'checkbox', checked:calib.enabled, onChange:e=>calib.setEnabled(e.target.checked)}),
      'Calibration mode'
    ]}),
    calib.enabled && _jsxs(_Fragment, { children:[
      _jsxs('div', { className:'badge', children:['Index: ', calib.idx]}),
      _jsx('button', { onClick:()=>calib.setIdx(i=>Math.max(0,i-1)), children:'◀ Prev' }),
      _jsx('button', { onClick:()=>calib.setIdx(i=>Math.min(BOARD_SIZE, i+1)), children:'Next ▶' }),
      _jsx('button', { className:'secondary', onClick:calib.resetToDefault, children:'Reset to default positions' }),
      _jsx('button', { className:'cta', onClick:calib.exportPath, children:'Export PATH as JS' }),
      _jsx('span', { className:'small', children:'Click the board to set the highlighted index position.'})
    ]})
  ]})
}

function App(){
  const { playerCount, setPlayerCount, players, setPlayers, state, start, reset, roll, setState } = useGame();
  const calib = useCalibration(state, setState);
  return _jsxs('div', { className:'grid', children:[
    state.started
      ? _jsx(PlayerSidebar, { state, onRoll: roll, onReset: reset })
      : _jsx(SetupPanel, { playerCount, setPlayerCount, players, setPlayers, onStart: start }),
    _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Board' }),
      _jsx(Board, { state, calib }),
      _jsx(CalibBar, { calib }),
      _jsx('div', { className:'small', children:'Use Calibration mode to click exact square centres in order (0..50), then Export PATH.' })
    ]})
  ]});
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));
