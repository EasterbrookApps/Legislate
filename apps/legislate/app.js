import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'https://esm.sh/react@18.3.1/jsx-runtime'


// === Modal helpers (blocking) for centered card ===
function showCardModalBlocking({ title, text }){
  const modal = document.getElementById('card-modal');
  if(!modal) return Promise.resolve();
  const titleEl = modal.querySelector('#card-title');
  const bodyEl = modal.querySelector('#card-body');
  titleEl.textContent = title || 'Card';
  bodyEl.textContent = text || '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  return new Promise(resolve => {
    const dismissers = modal.querySelectorAll('[data-dismiss]');
    const onClose = ()=>{
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden','true');
      dismissers.forEach(el=>el.removeEventListener('click', onClose));
      resolve();
    };
    dismissers.forEach(el=>el.addEventListener('click', onClose, { once:true }));
  });
}

  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  const gain = ctx.createGain(); gain.gain.value = 0.04; // subtle
  // Brown noise approximation
  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 0.5; // scale
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  // Lowpass to soften hiss
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 800;

  noise.connect(lp).connect(gain).connect(ctx.destination);
  noise.start(0);

   = ctx; _ambGain = gain; _noiseNode = noise; window.=true;
}

// Hook that App sets to continue after user clicks OK on a card
window.__onCardOk = null;

function (){
  if(){
    try{ _noiseNode.stop(); }catch{}
    .close(); =null; _ambGain=null; _noiseNode=null; window.=false;
  }
}

function showCardModal({ title, text }){
  const modal = document.getElementById('card-modal');
  if(!modal) return;
  const titleEl = modal.querySelector('#card-title');
  const bodyEl = modal.querySelector('#card-body');
  titleEl.textContent = title || 'Card';
  bodyEl.textContent = text || '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
}
function hideCardModal(){
  const modal = document.getElementById('card-modal');
  if(!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
}



const { useState, useEffect } = React;

// 58 spaces EXCLUDING start => indices 0..58
const BOARD_SIZE = 58;

// Local storage keys
const LS_PATH = 'legislate:path58';
const LS_STAGES = 'legislate:stages58';

// Stage identifiers and colours (requested mapping)
const STAGE_LABEL = {
  early: 'Early stages',
  commons: 'Commons',
  lords: 'Lords',
  implementation: 'Implementation',
};
const STAGE_COLOR = {
  early: '#ff9f43',           // orange
  commons: '#18d18c',         // green
  lords: '#ff6b6b',           // red
  implementation: '#58a6ff',  // blue
};
const STAGE_IDS = ['early','commons','lords','implementation'];

// Default path placeholder; calibrate by clicking
let DEFAULT_PATH = Array.from({length: BOARD_SIZE+1}, (_,i)=>[5+i*1.6, 90 - Math.min(60, i*1.1)]);

// Storage helpers
function loadPath(){ try{ const s = localStorage.getItem(LS_PATH); if(s) return JSON.parse(s); }catch{} return DEFAULT_PATH; }
function loadStages(){ try{ const s = localStorage.getItem(LS_STAGES); if(s) return JSON.parse(s); }catch{} return Array(BOARD_SIZE+1).fill(null); }
function savePath(arr){ try{ localStorage.setItem(LS_PATH, JSON.stringify(arr)); }catch{} }
function saveStages(arr){ try{ localStorage.setItem(LS_STAGES, JSON.stringify(arr)); }catch{} }

// Sample decks (stage-themed placeholders)
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
    stages, // length 59: 'early'|'commons'|'lords'|'implementation'|null
    turn: 0,
    dice: 0,
    rolling: false,
    positions: players.map(()=>0),
    skips: players.map(()=>0),
    winner: null,
    decks: JSON.parse(JSON.stringify(DECKS)),
    lastCard: null,
    pendingEffect:null,
    awaitingAck:false,
    modalOpen:false,
    modalOpen:false,
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
        out.log = [`Effect: jump to next ${STAGE_LABEL[target]} at ${j}.`, ...out.log];
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
        out.pendingEffect = card.effect;
        out.awaitingAck = true;
        out.modalOpen = true;
        if(out.positions[out.turn]===BOARD_SIZE){
          const label = (out.players[out.turn].name||`P${out.turn+1}`);
          return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]};
        }
      }
      if(out.awaitingAck){ return out; }
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

  // calibration mutations that autosave
  function setPathPoint(i,x,y){
    setState(s=>{
      const path = [...s.path];
      path[i] = [x,y];
      savePath(path);
      return {...s, path};
    });
  }
  function setStageAt(i,stage){
    setState(s=>{
      const a = [...s.stages];
      a[i] = stage;
      saveStages(a);
      return {...s, stages:a};
    });
  }

  return { playerCount, setPlayerCount, players, setPlayers, state, setState, start, reset, roll, setPathPoint, setStageAt };
}

function swatch(stage){ return STAGE_COLOR[stage] || '#ccc'; }

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
      _jsx('button', { onClick:onRoll, disabled:state.winner!=null || state.modalOpen || state.awaitingAck, children: state.winner!=null ? 'Game over' : 'Roll 🎲' }),
      _jsx('button', { className:'secondary', onClick:onReset, children:'Reset' }),
          state.lastCard && _jsxs(_Fragment, { children:[
      _jsx('div', { style:{height:10}}),
      _jsxs('div', { className:'card', style:{background:'#0b1320', border:'1px solid #20304a'}, children:[
        _jsx('div', { style:{display:'flex', alignItems:'center', gap:8, fontWeight:800}, children:_jsxs('span', { className:'stage-chip', children:[ _jsx('span', { className:'color-dot', style:{background: swatch(state.lastCard.stage)} }), STAGE_LABEL[state.lastCard.stage] ]}) }),
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

function App(){
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState(()=>defaultPlayers(4));
  const [state, setState] = useState(()=>createState(players));
  const { setPathPoint, setStageAt } = (()=>{
    function setPathPoint(i,x,y){ setState(s=>{ const p=[...s.path]; p[i]=[x,y]; savePath(p); return {...s, path:p}; }); }
    function setStageAt(i,stage){ setState(s=>{ const a=[...s.stages]; a[i]=stage; saveStages(a); return {...s, stages:a}; }); }
    return { setPathPoint, setStageAt };
  })();

  const calib = useCalibration(state, setState, setPathPoint, setStageAt);

  // Show modal when a card is pending
  useEffect(()=>{
    if(state.modalOpen && state.lastCard){
      const { title, text } = state.lastCard;
      const modal = document.getElementById('card-modal');
      if(modal){
        const titleEl = modal.querySelector('#card-title');
        const bodyEl = modal.querySelector('#card-body');
        titleEl.textContent = title || 'Card';
        bodyEl.textContent = text || '';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden','false');
      }
    }
  }, [state.modalOpen, state.lastCard]);


  // Show centered card modal when a card is drawn
  useEffect(()=>{
    if(state && state.lastCard){
      showCardModal({ title: state.lastCard.title, text: state.lastCard.text });
    }
  }, [state && state.lastCard]);


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
        out.pendingEffect = card.effect;
        out.awaitingAck = true;
        out.modalOpen = true;
        if(out.positions[out.turn]===BOARD_SIZE){
          const label = (out.players[out.turn].name||`P${out.turn+1}`);
          return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]};
        }
      }
      if(out.awaitingAck){ return out; }
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

  
  // When user clicks OK on modal, apply pending effect and advance turn
  window.__onCardOk = ()=>{
    setState(s=>{
      if(!s.awaitingAck || !s.pendingEffect) {
        // just close
        return { ...s, modalOpen:false, lastCard:null, awaitingAck:false };
      }
      let out = { ...s, modalOpen:false, awaitingAck:false };
      out = applyEffect(out.pendingEffect, out);
      out.pendingEffect = null;
      // Win check after effect
      if(out.positions[out.turn]===BOARD_SIZE){
        const label = (out.players[out.turn].name||`P${out.turn+1}`);
        return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]};
      }
      // Advance turn (respect extraRoll & skips)
      if(out.awaitingAck){ return out; }
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
    // Hide modal in DOM
    const modal = document.getElementById('card-modal');
    if(modal){
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden','true');
    }
  };

  return _jsxs('div', { className:'grid', children:[
    state.started
      ? _jsx(PlayerSidebar, { state, onRoll: roll, onReset: ()=>setState(createState(players)) })
      : _jsx(SetupPanel, { playerCount, setPlayerCount, players, setPlayers, onStart: ()=>setState(s=>({...s, started:true})) }),
    _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Board (58 spaces)' }),
      _jsx(Board, { state, calib }),
      _jsx(CalibBar, { calib, state, setStageAt }),
      _jsx('div', { className:'small', children:'Click to calibrate PATH (0..58). Tag stages; autosaves locally. Export JSON or code when done.' })
    ]})
  ]});
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));