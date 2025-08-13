import { jsx as _jsx, jsxs as _jsxs } from 'https://esm.sh/react@18.3.1/jsx-runtime'

const { useState, useMemo } = React;

/** 
 * Minimal, unofficial web adaptation of alphagov/Legislate.
 * Data model keeps decks generic so you can paste the full card text later.
 * Licence: OGL v3.0 for game content (attribution below). Code here is MIT.
 */

// --- Sample decks (replace with full text from the repo PDFs) ---
const sampleDecks = {
  red: [
    { title: "Opposition Day", text: "Parliamentary time is tight.\nGo back 2 spaces." , effect:{ type:"move", delta:-2 } },
    { title: "Drafting niggle", text: "You spotted an ambiguity early.\nRoll again.", effect:{ type:"extra_roll" } },
    { title: "Select Committee", text: "Helpful recommendations speed things up.\nMove forward 3.", effect:{ type:"move", delta:3 } },
  ],
  green: [
    { title: "Policy rethink", text: "Minister changes scope.\nMiss a turn.", effect:{ type:"skip_next" } },
    { title: "Stakeholder support", text: "External groups endorse your Bill.\nAdvance 2.", effect:{ type:"move", delta:2 } },
  ],
  blue: [
    { title: "Devolution check", text: "Liaise with devolved govts.\nGo back 1.", effect:{ type:"move", delta:-1 } },
    { title: "Drafting complete", text: "Great work from OPC.\nAdvance to next ❓ space.", effect:{ type:"jump_next_special" } },
  ],
  yellow: [
    { title: "Commencement regulations", text: "Implementation requires SIs.\nGo forward 2.", effect:{ type:"move", delta:2 } },
    { title: "Judicial review threat", text: "Proceed with caution.\nGo back 2.", effect:{ type:"move", delta:-2 } },
  ],
};

// --- Board layout: 50 tiles, with special '?' tiles of four colours ---
const BOARD_SIZE = 50;
const specialTiles = new Map([
  [5,  { color:'red'   }],
  [9,  { color:'green' }],
  [13, { color:'blue'  }],
  [18, { color:'yellow'}],
  [22, { color:'red'   }],
  [27, { color:'green' }],
  [31, { color:'blue'  }],
  [36, { color:'yellow'}],
  [41, { color:'red'   }],
  [46, { color:'blue'  }],
]);

const colors = {
  red:   { name: "Commons / Risk", dot:"red" },
  green: { name: "Policy / Support", dot:"green" },
  blue:  { name: "Procedure", dot:"blue" },
  yellow:{ name: "Implementation", dot:"yellow" },
};

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

function drawFrom(deck){
  const card = deck[0];
  const rest = deck.slice(1).concat([card]); // cycle
  return [card, rest];
}

function applyEffect(effect, state){
  if(!effect) return state;
  const s = {...state};
  switch(effect.type){
    case "move":
      s.positions[s.turn] = Math.max(0, Math.min(BOARD_SIZE, s.positions[s.turn] + (effect.delta||0)));
      break;
    case "extra_roll":
      s.extraRoll = true;
      break;
    case "skip_next":
      s.skips[s.turn] += 1;
      break;
    case "jump_next_special": {
      const here = s.positions[s.turn];
      let j = here+1;
      while(j <= BOARD_SIZE && !specialTiles.has(j)) j++;
      if(j<=BOARD_SIZE) s.positions[s.turn] = j;
      break;
    }
  }
  return s;
}

function createInitialState(playerCount){
  return {
    turn: 0,
    dice: 0,
    positions: Array(playerCount).fill(0),
    skips: Array(playerCount).fill(0),
    winner: null,
    decks: JSON.parse(JSON.stringify(sampleDecks)),
    lastCard: null,
    log: [],
    extraRoll: false,
  };
}

const pawnColors = ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'];
function Pawn({i}){
  const size = 8;
  return _jsx('span', { style:{display:'inline-block', width:size, height:size, borderRadius:99, background:pawnColors[i%pawnColors.length], marginRight:6} })
}

function Tile({i, playersHere}){
  const special = specialTiles.get(i);
  const classes = ["tile"];
  if(i===0) classes.push("start");
  if(i===BOARD_SIZE) classes.push("finish");
  const mark = special ? `?` : (i===0?"Start":(i===BOARD_SIZE?"Act":""));
  return _jsxs('div', { className: classes.join(' '), children:[
    special && _jsx('div', { className:'mark', children: {red:'🔴',green:'🟢',blue:'🔵',yellow:'🟡'}[special.color] }),
    _jsx('div', { children: mark }),
    playersHere?.length ? _jsx('div', { style:{ position:'absolute', bottom:6, left:6, right:6, display:'flex', gap:4, flexWrap:'wrap' }, children: playersHere.map(p=>_jsx(Pawn,{i:p},p)) }) : null
  ]});
}

function Board({state}){
  // Map positions to players
  const at = new Map();
  state.positions.forEach((pos, idx)=>{
    const arr = at.get(pos) || [];
    arr.push(idx);
    at.set(pos, arr);
  });
  return _jsx('div', { className:'board', children:
    Array.from({length:BOARD_SIZE+1}, (_,i)=>_jsx(Tile, {i, playersHere: at.get(i)||[]}, i))
  });
}

function useGame() {
  const [playerCount, setPlayerCount] = useState(3);
  const [state, setState] = useState(()=>createInitialState(playerCount));

  function reset(n = playerCount){
    setPlayerCount(n);
    setState(createInitialState(n));
  }

  function roll(){
    if(state.winner) return;
    if(state.skips[state.turn] > 0){
      const msg = `Player ${state.turn+1} skips their turn.`;
      const nextSkips = [...state.skips]; nextSkips[state.turn] -= 1;
      const nextTurn = (state.turn+1) % playerCount;
      setState({...state, skips: nextSkips, log:[msg,...state.log], turn: nextTurn, extraRoll:false});
      return;
    }
    const d = randInt(1,6);
    let s = {...state, dice:d, extraRoll:false};
    // move
    const newPos = Math.min(BOARD_SIZE, s.positions[s.turn] + d);
    s.positions = [...s.positions]; s.positions[s.turn] = newPos;
    s.log = [`Player ${s.turn+1} rolled ${d} and moved to ${newPos}.`, ...s.log];

    if(newPos === BOARD_SIZE){
      s.winner = s.turn;
      s.log = [`🏆 Player ${s.turn+1} has implemented their Act!`, ...s.log];
      setState(s);
      return;
    }

    // Check special tile
    const special = specialTiles.get(newPos);
    if(special){
      const color = special.color;
      const [card, rest] = drawFrom(s.decks[color]);
      s.decks = {...s.decks, [color]: rest};
      s.lastCard = { color, ...card };
      s.log = [`Drew ${color.toUpperCase()} card: ${card.title}`, ...s.log];
      s = applyEffect(card.effect, s);
    } else {
      s.lastCard = null;
    }

    // next turn (unless extra roll)
    const nextTurn = s.extraRoll ? s.turn : (s.turn + 1) % playerCount;
    setState({...s, turn: nextTurn});
  }

  function jumpTo(i){
    if(state.winner) return;
    let s = {...state};
    s.positions = [...s.positions];
    s.positions[s.turn] = Math.max(0, Math.min(BOARD_SIZE, i));
    s.log = [`Player ${s.turn+1} jumps to ${i}.`, ...s.log];
    setState(s);
  }

  return { playerCount, state, reset, roll, jumpTo, setPlayerCount };
}

function Legend(){
  return _jsxs('div', { className:'stack', children:[
    _jsxs('span', { className:'badge', children:[_jsx('span',{className:'dot red'}),'Red: Commons/Risk']}),
    _jsxs('span', { className:'badge', children:[_jsx('span',{className:'dot green'}),'Green: Policy']}),
    _jsxs('span', { className:'badge', children:[_jsx('span',{className:'dot blue'}),'Blue: Procedure']}),
    _jsxs('span', { className:'badge', children:[_jsx('span',{className:'dot yellow'}),'Yellow: Implementation']}),
  ]})
}

function App(){
  const { playerCount, state, reset, roll, setPlayerCount } = useGame();

  return _jsxs('div', { className:'grid', children:[
    _jsxs('div', { className:'card', children:[
      _jsx('h1', { className:'h', children: 'Legislate?! — Web Edition (Unofficial)' }),
      _jsxs('p', { className:'small', children:[
        'Roll a d6, move along the track, draw cards on coloured ❓ tiles, and be first to reach ',
        _jsx('strong', { children:'Act implemented' }), '.',
      ]}),
      _jsx(Legend, {}),
      _jsx('hr', {}),
      _jsxs('div', { className:'stack', children:[
        _jsxs('label', { children:['Players: ', _jsx('input', { className:'input', style:{width:64}, type:'number', min:2, max:6, value:playerCount, onChange:e=>setPlayerCount(Math.max(2,Math.min(6,Number(e.target.value)||2)))} )]}),
        _jsx('button', { onClick: ()=>reset(playerCount), className:'cta', children:'Start / Reset' }),
        _jsx('button', { onClick: roll, children: state.winner!=null ? 'Game over' : 'Roll 🎲' }),
        _jsxs('span', { className:'badge', children:['Turn: Player ', (state.turn+1)]}),
        _jsxs('span', { className:'badge', children:['Last roll: ', state.dice||'—']}),
      ]}),
      _jsx('hr', {}),
      state.lastCard && _jsxs('div', { className:'cardview', children:[
        _jsxs('div', { className:'cardtitle', children:[
          _jsx('span', { className:`dot ${state.lastCard.color}` }),
          state.lastCard.title
        ]}),
        _jsx('div', { className:'cardtext', children: state.lastCard.text }),
      ]}),
      state.winner!=null && _jsx('p', { className:'small', children:`🏆 Player ${state.winner+1} wins!` }),
      _jsx('hr', {}),
      _jsxs('p', { className:'notice', children:[
        'Content derived from ', 
        _jsx('a', { href:'https://github.com/alphagov/Legislate', target:'_blank', rel:'noreferrer', children:'alphagov/Legislate'}),
        ' under the ',
        _jsx('a', { href:'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', target:'_blank', rel:'noreferrer', children:'Open Government Licence v3.0'}),
        '. This web adaptation is unofficial.'
      ]})
    ]}),
    _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'The Board'}),
      _jsx(Board, { state }),
      _jsx('hr', {}),
      _jsx('h3', { className:'h', children:'Event log'}),
      _jsx('div', { className:'sidebarlist', children:
        state.log.map((l,i)=>_jsx('div',{className:'small', style:{opacity:.9}, children:l}, i))
      })
    ]})
  ]});
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));
