
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'https://esm.sh/react@18.3.1/jsx-runtime'

const { useState, useEffect, useRef } = React;

const BOARD_SIZE = 58;
const LS_PATH = 'legislate:path58';
const LS_STAGES = 'legislate:stages58';
const LS_GAME = 'legislate:game58';
const LS_AUDIO = 'legislate:audio';
const LS_FACTS = 'legislate:facts:on';

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

let DEFAULT_PATH = Array.from({length: BOARD_SIZE+1}, (_,i)=>[5+i*1.6, 90 - Math.min(60, i*1.1)]);

const ls = {
  load(key, fallback){ try{ const s=localStorage.getItem(key); if(s) return JSON.parse(s); }catch{} return fallback; },
  save(key, data){ try{ localStorage.setItem(key, JSON.stringify(data)); }catch{} },
  get(key){ try{ return localStorage.getItem(key); }catch{} },
  set(key, val){ try{ localStorage.setItem(key, val); }catch{} },
};

function loadPath(){ return ls.load(LS_PATH, DEFAULT_PATH); }
function loadStages(){ return ls.load(LS_STAGES, Array(BOARD_SIZE+1).fill(null)); }

const DECKS = {"early": [{"title": "Scope rethink", "text": "Refocus policy intent.\nMiss a turn.", "effect": {"type": "skip_next", "count": 1}}, {"title": "Early extra 1", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 2", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 3", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 4", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 5", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 6", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 7", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 8", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 9", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 10", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 11", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 12", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 13", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 14", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 15", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 16", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 17", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 18", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 19", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 20", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 21", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 22", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 23", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 24", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 25", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 26", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 27", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 28", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 29", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Early extra 30", "text": "Progress update.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}], "commons": [{"title": "Opposition day", "text": "Parliamentary time squeezed.\nGo back 2.", "effect": {"type": "move", "delta": -2}}, {"title": "Commons extra 1", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 2", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 3", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 4", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 5", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 6", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 7", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 8", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 9", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 10", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 11", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 12", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 13", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 14", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 15", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 16", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 17", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 18", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 19", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 20", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 21", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 22", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 23", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 24", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 25", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 26", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 27", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 28", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 29", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Commons extra 30", "text": "Committee work.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}], "lords": [{"title": "Amendment marshalled", "text": "Complex amendments tabled.\nGo back 1.", "effect": {"type": "move", "delta": -1}}, {"title": "Lords extra 1", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 2", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 3", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 4", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 5", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 6", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 7", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 8", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 9", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 10", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 11", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 12", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 13", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 14", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 15", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 16", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 17", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 18", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 19", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 20", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 21", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 22", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 23", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 24", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 25", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 26", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 27", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 28", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 29", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Lords extra 30", "text": "Scrutiny continues.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}], "implementation": [{"title": "Commencement SIs", "text": "Phased start dates.\nAdvance 2.", "effect": {"type": "move", "delta": 2}}, {"title": "Implementation extra 1", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 2", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 3", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 4", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 5", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 6", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 7", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 8", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 9", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 10", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 11", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 12", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 13", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 14", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 15", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 16", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 17", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 18", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 19", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 20", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 21", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 22", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 23", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 24", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 25", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 26", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 27", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 28", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 29", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}, {"title": "Implementation extra 30", "text": "Rollout progresses.\nAdvance 1.", "effect": {"type": "move", "delta": 1}}]};
const FACTS = ["A Bill normally has three readings in each House before Royal Assent.", "Public Bill Committees can take written and oral evidence on Bills.", "The Lords can delay most Bills but cannot block money Bills.", "Programme motions in the Commons can timetable a Bill.", "Statutory Instruments are the most common form of secondary legislation."];

const audioCtx = (typeof window !== 'undefined' && 'AudioContext' in window) ? new (window.AudioContext || window.webkitAudioContext)() : null;
function beep(freq=440, dur=0.08, gain=0.03){ if(!audioCtx) return; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='square'; o.frequency.value=freq; g.gain.value=gain; o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur); }
function noise(dur=0.2, gain=0.02){ if(!audioCtx) return; const n=audioCtx.createBufferSource(); const buffer=audioCtx.createBuffer(1, audioCtx.sampleRate*dur, audioCtx.sampleRate); const data=buffer.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1; const g=audioCtx.createGain(); g.gain.value=gain; n.buffer=buffer; n.connect(g); g.connect(audioCtx.destination); n.start(); }
function chord(freqs=[523,659,784], dur=0.4){ if(!audioCtx) return; const g=audioCtx.createGain(); g.gain.value=0.03; g.connect(audioCtx.destination); freqs.forEach(f=>{ const o=audioCtx.createOscillator(); o.type='sine'; o.frequency.value=f; o.connect(g); o.start(); o.stop(audioCtx.currentTime+dur); }); }
function play(which, muted){ if(muted) return; if(which==='dice'){ noise(0.25, 0.03); setTimeout(()=>beep(220,0.06,0.02),240); } else if(which==='card'){ beep(740,0.05,0.02); setTimeout(()=>beep(620,0.05,0.02),70); } else if(which==='win'){ chord([523,659,784],0.6); } }

function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function drawFrom(deck){ const card=deck[0]; const rest=deck.slice(1).concat([card]); return [card,rest]; }

function defaultPlayers(n){ return Array.from({length:n}, (_,i)=>({ name:`Player ${i+1}`, color: ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'][i%6] })); }

function createState(players, path = loadPath(), stages = loadStages()){ 
  const saved = ls.load(LS_GAME, null);
  if(saved && saved.players && saved.path && saved.stages) return saved;
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
    cardOpen: false,
    history: [],
    log: [],
    extraRoll:false,
    started:false,
    muted: (ls.get(LS_AUDIO) ?? 'on') !== 'on', // default ON => false
    factsOn: (ls.get(LS_FACTS) ?? 'on') === 'on',
    toast: null,
    _undo: null,
  };
}

function saveGame(state){ const copy = {...state}; delete copy._undo; ls.save(LS_GAME, copy); }

function applyEffect(effect, s){
  if(!effect) return s;
  let out = {...s};
  switch(effect.type){
    case 'move': { const d = Number(effect.delta||0); out.positions[out.turn] = clamp(out.positions[out.turn] + d, 0, BOARD_SIZE); out.log = [`Effect: move ${d>0?'+':''}${d}.`, ...out.log]; break; }
    case 'skip_next': { const c = Number(effect.count||1); out.skips[out.turn] += c; out.log = [`Effect: miss ${c} turn${c>1?'s':''}.`, ...out.log]; break; }
    case 'extra_roll': { out.extraRoll = true; out.log = [`Effect: extra roll.`, ...out.log]; break; }
    case 'jump_next_stage': { const target = effect.stage; const here = out.positions[out.turn]; let j = here+1; while(j<=BOARD_SIZE && out.stages[j]!==target) j++; if(j<=BOARD_SIZE){ out.positions[out.turn] = j; out.log = [`Effect: jump to next ${STAGE_LABEL[target]} at ${j}.`, ...out.log]; } break; }
  }
  return out;
}

function Modal({open, onClose, title, children}){
  const ref = useRef(null);
  useEffect(()=>{ if (!open) return; const prev = document.activeElement; ref.current?.focus(); const onKey = (e)=> { if (e.key === 'Escape') onClose?.(); }; document.addEventListener('keydown', onKey); return ()=> { document.removeEventListener('keydown', onKey); prev?.focus(); }; }, [open]);
  if (!open) return null;
  return _jsxs('div', { className:'backdrop', role:'dialog', 'aria-modal':true, 'aria-label':title, onClick:e=> e.target===e.currentTarget && onClose?.(), children:[
    _jsxs('div', { className:'modal', tabIndex:-1, ref:ref, children:[
      _jsx('h3', { className:'h', children:title }),
      children,
      _jsx('div', { className:'modal-actions', children: _jsx('button', { className:'cta', onClick:onClose, children:'OK'}) })
    ]})
  ]});
}

function Dice({onFinal, disabled, muted}){
  const [face, setFace] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [holding, setHolding] = useState(false); // NEW: hold final face for a few seconds

  async function roll(){
    if (disabled || rolling || holding) return;
    setRolling(true);
    play('dice', muted);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const final = randInt(1,6);
    if (!reduce){ const id = setInterval(()=> setFace(randInt(1,6)), 60); await new Promise(r => setTimeout(r, 650)); clearInterval(id); }
    setFace(final);
    setRolling(false);
    setHolding(true);           // disable re-roll and keep face visible
    onFinal?.(final);           // start movement immediately
    setTimeout(()=> setHolding(false), 1800); // keep final value "featured" for ~1.8s
  }

  return _jsx('button', {
    className:`dice ${rolling?'rolling':''}`,
    onClick: roll,
    onKeyDown:e=> (e.key===' '||e.key==='Enter') && (e.preventDefault(), roll()),
    disabled: disabled || rolling || holding,
    'aria-live':'polite',
    title: rolling ? 'Rolling…' : (holding ? 'Result shown…' : 'Roll'),
    children: face ?? '–'
  });
}

function App(){
  const [players, setPlayers] = useState(()=>defaultPlayers(4));
  const [state, setState] = useState(()=>createState(players));
  useEffect(()=>{ saveGame(state); }, [state]);

  function setPathPoint(i,x,y){ setState(s=>{ const path=[...s.path]; path[i]=[x,y]; ls.save(LS_PATH, path); return {...s, path}; }); }
  function setStageAt(i,stage){ setState(s=>{ const a=[...s.stages]; a[i]=stage; ls.save(LS_STAGES, a); return {...s, stages:a}; }); }

  async function stepMove(n){ for(let k=0;k<n;k++){ await new Promise(r=>requestAnimationFrame(()=>setTimeout(r, 160))); setState(s=>{ if(s.winner) return s; const np = clamp(s.positions[s.turn] + 1, 0, BOARD_SIZE); const positions = [...s.positions]; positions[s.turn] = np; const label = s.players[s.turn].name || `P${s.turn+1}`; const log = [`${label} moved to ${np}.`, ...s.log]; return {...s, positions, log}; }); } }

  function snapshot(s){ return { positions:[...s.positions], turn:s.turn, skips:[...s.skips], decks:JSON.parse(JSON.stringify(s.decks)), lastCard:s.lastCard?{...s.lastCard}:null, history:[...s.history], extraRoll:s.extraRoll, winner:s.winner, dice:s.dice, log:[...s.log], cardOpen:s.cardOpen, started:s.started, muted:s.muted, factsOn:s.factsOn }; }

  function startGame(){ setState(s=>({...createState(players), started:true, players, muted: (ls.get(LS_AUDIO) ?? 'on') !== 'on', factsOn: (ls.get(LS_FACTS) ?? 'on') === 'on' })); }
  function resetGame(){ setState(createState(players)); }

  async function onDiceFinal(d){ setState(s=>({...s, _undo: snapshot(s)})); await stepMove(d); setState(s=>{ if(s.positions[s.turn]===BOARD_SIZE){ const label = (s.players[s.turn].name||`P${s.turn+1}`); play('win', s.muted); return {...s, winner:s.turn, dice:d, toast:`🏆 ${label} wins!`, log:[`🏆 ${label} has implemented their Act!`, ...s.log]}; } let out = {...s, extraRoll:false, lastCard:null, dice:d}; const stage = out.stages[out.positions[out.turn]]; if(stage){ const [card, rest] = drawFrom(out.decks[stage]); out.decks = {...out.decks, [stage]:rest}; out.lastCard = { stage, ...card }; out.history = [{ stage, title: card.title, text: card.text }, ...out.history].slice(0,30); out.cardOpen = true; play('card', out.muted); out.log = [`Drew ${STAGE_LABEL[stage]} card: ${card.title}`, ...out.log]; out = applyEffect(card.effect, out); if(out.positions[out.turn]===BOARD_SIZE){ const label = (out.players[out.turn].name||`P${out.turn+1}`); play('win', out.muted); return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]}; } } let nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length; if(out.skips[nextTurn] > 0){ const nextSkips = [...out.skips]; nextSkips[nextTurn]-=1; const label = (out.players[nextTurn].name||`P${nextTurn+1}`); out.log = [`${label} skips a turn.`, ...out.log]; nextTurn = (nextTurn+1) % out.players.length; return {...out, skips: nextSkips, turn: nextTurn, toast:`${label} skips a turn`}; } return {...out, turn: nextTurn, toast:`Rolled ${d}`}; }); }

  function undo(){ setState(s=>{ if(!s._undo) return s; const prev = s._undo; return {...s, ...prev, _undo:null, toast:'Undid last move'}; }); }
  function toggleAudio(){ setState(s=>{ const muted = !s.muted; ls.set(LS_AUDIO, muted ? 'off' : 'on'); return {...s, muted, toast: muted ? 'Sounds off' : 'Sounds on'}; }); }
  function toggleFacts(){ setState(s=>{ const on = !s.factsOn; ls.set(LS_FACTS, on ? 'on' : 'off'); return {...s, factsOn:on, toast: on ? 'Facts on' : 'Facts off'}; }); }

  function Setup(){ const [count, setCount] = useState(state.players.length); const [deckOpen, setDeckOpen] = useState(false); const [deckStage, setDeckStage] = useState('early');
    return _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Players & Setup'}),
      _jsxs('div', { className:'setup-row', children:[ _jsx('label', { children:'Number of players (2–6): '}), _jsx('input', { type:'number', min:2, max:6, className:'input', style:{width:80}, value:count, onChange:e=>{ const n = Math.max(2, Math.min(6, Number(e.target.value)||2)); setCount(n); setPlayers(p=>{ let copy=[...p]; if(copy.length < n){ const extras = Array.from({length:n-copy.length}, (_,i)=>({ name:`Player ${copy.length+i+1}`, color: ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'][(copy.length+i)%6] })); copy = copy.concat(extras); } else copy = copy.slice(0,n); return copy; }); }}) ]}),
      state.players.map((p,i)=>_jsxs('div',{className:'setup-row', children:[ _jsx('span', { className:'color-dot', style:{background:p.color} }), _jsx('input', { className:'input', placeholder:`Player ${i+1}`, style:{flex:1}, value:p.name, onChange:e=>{ const v=e.target.value; setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, name:v} : pp)); }}), _jsx('input', { type:'color', value:p.color, onChange:e=>{ const v=e.target.value; setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, color:v} : pp)); }}) ]}, i)),
      _jsxs('div', { className:'setup-row', children:[ _jsx('button', { className:'cta', onClick: ()=>setState(s=>({...s, started:true})), children:'Start game' }), _jsx('button', { className:'secondary', onClick: ()=>setDeckOpen(true), children:'Preview decks' }), _jsx('button', { className:'secondary', onClick: toggleAudio, children: state.muted ? 'Unmute' : 'Mute' }), _jsx('button', { className:'secondary', onClick: toggleFacts, children: state.factsOn ? 'Facts: On' : 'Facts: Off' }) ]}),
      _jsx(Modal, { open: deckOpen, onClose: ()=>setDeckOpen(false), title:`Preview — ${STAGE_LABEL[deckStage]}`, children: _jsxs(_Fragment, { children:[ _jsxs('div', { style:{display:'flex', gap:8, marginBottom:8}, children:[ ...['early','commons','lords','implementation'].map(st => _jsxs('button', { className:'secondary', onClick:()=>setDeckStage(st), children:[ _jsx('span', { className:'color-dot', style:{background:STAGE_COLOR[st]} }), STAGE_LABEL[st] ] }, st)) ]}), _jsx('ul', { children: DECKS[deckStage].map((c,idx)=> _jsxs('li', { className:'small', style:{margin:'6px 0'}, children:[ _jsx('strong', { children:c.title}), ': ', _jsx('span', { style:{whiteSpace:'pre-wrap'}, children:c.text}) ]}, idx)) }) ]}) })
    ]});
  }

  function Sidebar(){ const me = state.players[state.turn]; const label = me.name || `P${state.turn+1}`; return _jsxs('div', { className:'card', children:[ _jsx('h2', { className:'h', children:'Current turn'}), _jsxs('div', { className:'playercard', children:[ _jsxs('div', { className:'name', children:[ _jsx('span', { className:'color-dot', style:{background:me.color} }), _jsx('span', { children: label }), ]}), state.winner==null ? _jsx('span', { className:'turnarrow', children:'➡️' }) : _jsx(_Fragment, {}) ]}), _jsxs('div', { style:{display:'flex', gap:10, alignItems:'center', marginTop:12}, children:[ _jsx(Dice, { onFinal: onDiceFinal, disabled: state.winner!=null || state.rolling, muted: state.muted }), _jsx('button', { className:'secondary', onClick: resetGame, children:'Reset' }), _jsx('button', { className:'secondary', onClick: undo, disabled: !state._undo, children:'Undo' }), _jsx('button', { className:'secondary', onClick: toggleAudio, children: state.muted ? 'Unmute' : 'Mute' }), _jsx('button', { className:'secondary', onClick: toggleFacts, children: state.factsOn ? 'Facts: On' : 'Facts: Off' }), ]}), _jsx('h3', { className:'h', style:{marginTop:16}, children:'Players'}), _jsx('div', { className:'playerlist', children: state.players.map((p,i)=> _jsxs('div', { className:`playercard ${i===state.turn && state.winner==null ? '' : 'dimmed'}`, children:[ _jsxs('div', { className:'name', children:[ _jsx('span', { className:'color-dot', style:{background:p.color} }), (p.name || `P${i+1}`) ] }), _jsxs('div', { className:'small', children:['Pos: ', state.positions[i]] }) ]}, i)) }), state.winner!=null && _jsxs('p', { className:'small', style:{marginTop:12}, children:['🏆 ', (state.players[state.winner].name||`P${state.winner+1}`), ' wins!'] }), _jsx('hr', {}), _jsx('p', { className:'small', children:'Board image © authors of Legislate?!, OGL v3.0. This web adaptation is unofficial.' }) ]}); }

  function CalibBar(){ const [enabled, setEnabled] = useState(false); const [idx, setIdx] = useState(0);
    function exportJSON(){ const data = { path: state.path, stages: state.stages, version:'58' }; download('legislate-calibration-58.json', JSON.stringify(data, null, 2)); }
    function importJSON(file){ const reader = new FileReader(); reader.onload = () => { try{ const data = JSON.parse(reader.result); if(Array.isArray(data.path) && Array.isArray(data.stages) && data.path.length===BOARD_SIZE+1 && data.stages.length===BOARD_SIZE+1){ ls.save(LS_PATH, data.path); ls.save(LS_STAGES, data.stages); setState(s=>({...s, path:data.path, stages:data.stages})); } else alert('Invalid calibration JSON'); }catch(err){ alert('Failed to parse calibration JSON'); } }; reader.readAsText(file); }
    function exportPathCode(){ const code = 'const PATH_58 = ' + JSON.stringify(state.path) + ';'; download('path-58.js', code); }
    function exportStagesCode(){ const obj = {}; state.stages.forEach((v,i)=>{ if(v) obj[i]=v; }); const code = 'const STAGES = new Map(' + JSON.stringify(Object.entries(obj)) + ');'; download('stages-58.js', code); }
    function download(name, text){ const blob = new Blob([text], {type:'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 0); }
    return _jsxs('div', { className:'calib-bar', children:[ _jsxs('label', { children:[ _jsx('input', { type:'checkbox', checked:enabled, onChange:e=>setEnabled(e.target.checked)}), ' Calibration mode (click to set index 0..58)' ]}), enabled && _jsxs(_Fragment, { children:[ _jsxs('div', { className:'badge', children:['Index: ', idx]}), _jsx('button', { onClick:()=>setIdx(i=>Math.max(0,i-1)), children:'◀ Prev' }), _jsx('button', { onClick:()=>setIdx(i=>Math.min(BOARD_SIZE, idx+1)), children:'Next ▶' }), _jsx('button', { className:'secondary', onClick:exportJSON, children:'Export JSON (path+stages)' }), _jsx('button', { className:'secondary', onClick:exportPathCode, children:'Export PATH (code)' }), _jsx('button', { className:'secondary', onClick:exportStagesCode, children:'Export stages (code)' }), _jsx('label', { className:'stage-chip', children:_jsxs('span', { children:[ ' Import JSON ', _jsx('input', { type:'file', accept:'.json', onChange:e=> e.target.files?.[0] && importJSON(e.target.files[0]) }) ]}) }), _jsx('span', { className:'small', children:'Set stage at this index:'}), ...['early','commons','lords','implementation'].map(st=> _jsxs('button', { className:'secondary', onClick:()=> setStageAt(idx, st), children:[ _jsx('span', { className:'color-dot', style:{background:STAGE_COLOR[st]} }), STAGE_LABEL[st] ]}, st)), _jsx('span', { className:'small', children: state.stages[idx] ? `Tagged: ${STAGE_LABEL[state.stages[idx]]}` : 'No stage' }) ]}), _jsx('div', { className:'small', children:'Tip: while calibrating, click the board to place the current index; use Prev/Next to change index.' }), _jsx('div', { style:{height:8} }), _jsx('div', { className:'badge', children: `Audio: ${state.muted ? 'off' : 'on'}` }), _jsx('div', { className:'badge', children: `Facts: ${state.factsOn ? 'on' : 'off'}` }) ]}); }

  function Board(){ return _jsxs('div', { className:'board-wrap', children:[ _jsx('div', { className:'board-img' }), state.players.map((p,idx)=>{ const pos = state.positions[idx]; const [x,y] = state.path[Math.min(pos, state.path.length-1)] || [0,0]; const isTurn = idx===state.turn && state.winner==null; return _jsxs('div', { className:`token ${isTurn?'turn':''}`, style:{ left:`${x}%`, top:`${y}%`, background:p.color }, children:[ _jsx('span', { children: (idx+1) }), _jsx('span', { className:'label', children: (p.name || `P${idx+1}`) }) ]}, idx); }) ]}); }

  return _jsxs('div', { className:'grid', children:[ state.started ? _jsx(Sidebar, {}) : _jsx(Setup, {}), _jsxs('div', { className:'card', children:[ _jsx('h2', { className:'h', children:'Board (58 spaces)' }), _jsx(Board, {}), _jsx(CalibBar, {}) ]}), _jsx(Modal, { open: state.cardOpen, onClose: ()=> setState(s=>({...s, cardOpen:false})), title: state.lastCard ? `${STAGE_LABEL[state.lastCard.stage]} card` : 'Card', children: state.lastCard && _jsxs(_Fragment, { children:[ _jsxs('div', { style:{display:'flex', alignItems:'center', gap:8, fontWeight:800}, children:[ _jsx('span', { className:'color-dot', style:{background: STAGE_COLOR[state.lastCard.stage]} }), state.lastCard.title ]}), _jsx('div', { className:'small', style:{marginTop:6, whiteSpace:'pre-wrap'}, children: state.lastCard.text }), state.factsOn && _jsx('div', { className:'small', style:{marginTop:10, opacity:.85}, children: 'Did you know? ' + FACTS[Math.floor(Math.random()*FACTS.length)] }) ]}) }), state.toast && _jsx('div', { className:'toast', children: state.toast }), state.history.length>0 && _jsxs('div', { className:'drawer', children:[ _jsx('div', { className:'h', style:{fontSize:16}, children:'Recent cards'}), _jsx('ul', { children: state.history.map((c,i)=> _jsxs('li', { className:'small', style:{margin:'6px 0'}, children:[ _jsxs('span', { children:[ _jsx('span', { className:'color-dot', style:{background: STAGE_COLOR[c.stage], marginRight:6} }), _jsx('strong', { children:c.title }) ]}), _jsx('div', { style:{whiteSpace:'pre-wrap', opacity:.85}, children:c.text }) ]}, i)) }) ]}) ]}); }

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));
