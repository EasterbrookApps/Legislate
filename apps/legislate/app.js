
(function(){
  'use strict';
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

  const DECKS = {
    early: [{title:'Scope rethink', text:'Refocus policy intent.\nMiss a turn.', effect:{type:'skip_next', count:1}}],
    commons: [{title:'Opposition day', text:'Time squeezed.\nGo back 2.', effect:{type:'move', delta:-2}}],
    lords: [{title:'Amendment marshalled', text:'Complex amendments tabled.\nGo back 1.', effect:{type:'move', delta:-1}}],
    implementation: [{title:'Commencement SIs', text:'Phased start dates.\nAdvance 2.', effect:{type:'move', delta:2}}]
  };
  const FACTS = [
    'A Bill normally has three readings in each House before Royal Assent.'
  ];

  const audioCtx = (typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)) ? new (window.AudioContext || window.webkitAudioContext)() : null;
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
      muted: (ls.get(LS_AUDIO) ?? 'on') !== 'on',
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
    }
    return out;
  }

  function Modal({open, onClose, title, children}){
    const ref = useRef(null);
    useEffect(()=>{ if (!open) return; const prev = document.activeElement; ref.current?.focus(); const onKey = (e)=> { if (e.key === 'Escape') onClose?.(); }; document.addEventListener('keydown', onKey); return ()=> { document.removeEventListener('keydown', onKey); prev?.focus(); }; }, [open]);
    if (!open) return null;
    return React.createElement('div', { className:'backdrop', role:'dialog', 'aria-modal':true, 'aria-label':title, onClick:e=> e.target===e.currentTarget && onClose?.() }, 
      React.createElement('div', { className:'modal', tabIndex:-1, ref:ref }, 
        React.createElement('h3', { className:'h' }, title ),
        children,
        React.createElement('div', { className:'modal-actions' }, React.createElement('button', { className:'cta', onClick:onClose }, 'OK'))
      )
    );
  }

  function Dice({onFinal, disabled, muted}){
    const [face, setFace] = useState(null);
    const [rolling, setRolling] = useState(false);
    const [holding, setHolding] = useState(false);
    async function roll(){
      if (disabled || rolling || holding) return;
      setRolling(true);
      play('dice', muted);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const final = randInt(1,6);
      if (!reduce){ const id = setInterval(()=> setFace(randInt(1,6)), 60); await new Promise(r => setTimeout(r, 650)); clearInterval(id); }
      setFace(final);
      setRolling(false);
      setHolding(true);
      onFinal?.(final);
      setTimeout(()=> setHolding(false), 1800);
    }
    return React.createElement('button', {
      className:'dice '+(rolling?'rolling':''),
      onClick: roll,
      onKeyDown:e=> (e.key===' '||e.key==='Enter') && (e.preventDefault(), roll()),
      disabled: disabled || rolling || holding,
      'aria-live':'polite',
      title: rolling ? 'Rolling…' : (holding ? 'Result shown…' : 'Roll')
    }, face ?? '–');
  }

  function App(){
    const [players, setPlayers] = useState(defaultPlayers(4));
    const [state, setState] = useState(createState(players));
    useEffect(()=>{ saveGame(state); }, [state]);

    async function stepMove(n){ for(let k=0;k<n;k++){ await new Promise(r=>requestAnimationFrame(()=>setTimeout(r, 160))); setState(s=>{ if(s.winner) return s; const np = clamp(s.positions[s.turn] + 1, 0, BOARD_SIZE); const positions = [...s.positions]; positions[s.turn] = np; const label = s.players[s.turn].name || `P${s.turn+1}`; const log = [`${label} moved to ${np}.`, ...s.log]; return {...s, positions, log}; }); } }

    function snapshot(s){ return { positions:[...s.positions], turn:s.turn, skips:[...s.skips], decks:JSON.parse(JSON.stringify(s.decks)), lastCard:s.lastCard?{...s.lastCard}:null, history:[...s.history], extraRoll:s.extraRoll, winner:s.winner, dice:s.dice, log:[...s.log], cardOpen:s.cardOpen, started:s.started, muted:s.muted, factsOn:s.factsOn }; }
    function resetGame(){ setState(createState(players)); }

    async function onDiceFinal(d){ 
      setState(s=>({...s, _undo: snapshot(s)}));
      await stepMove(d);
      setState(s=>{ 
        if(s.positions[s.turn]===BOARD_SIZE){ const label = (s.players[s.turn].name||`P${s.turn+1}`); play('win', s.muted); return {...s, winner:s.turn, dice:d, toast:`🏆 ${label} wins!`, log:[`🏆 ${label} has implemented their Act!`, ...s.log]}; }
        let out = {...s, extraRoll:false, lastCard:null, dice:d};
        const stage = out.stages[out.positions[out.turn]];
        if(stage){
          const [card, rest] = drawFrom(out.decks[stage]);
          out.decks = {...out.decks, [stage]:rest};
          out.lastCard = { stage, ...card };
          out.history = [{ stage, title: card.title, text: card.text }, ...out.history].slice(0,30);
          out.cardOpen = true;
          play('card', out.muted);
          out.log = [`Drew ${STAGE_LABEL[stage]} card: ${card.title}`, ...out.log];
          out = applyEffect(card.effect, out);
          if(out.positions[out.turn]===BOARD_SIZE){ const label = (out.players[out.turn].name||`P${out.turn+1}`); play('win', out.muted); return {...out, winner: out.turn, log:[`🏆 ${label} has implemented their Act!`, ...out.log]}; }
        }
        let nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length;
        if(out.skips[nextTurn] > 0){
          const nextSkips = [...out.skips]; nextSkips[nextTurn]-=1;
          const label = (out.players[nextTurn].name||`P${nextTurn+1}`);
          out.log = [`${label} skips a turn.`, ...out.log];
          nextTurn = (nextTurn+1) % out.players.length;
          return {...out, skips: nextSkips, turn: nextTurn, toast:`${label} skips a turn`};
        }
        return {...out, turn: nextTurn, toast:`Rolled ${d}`};
      });
    }

    function toggleAudio(){ setState(s=>{ const muted = !s.muted; ls.set(LS_AUDIO, muted ? 'off' : 'on'); return {...s, muted, toast: muted ? 'Sounds off' : 'Sounds on'}; }); }
    function toggleFacts(){ setState(s=>{ const on = !s.factsOn; ls.set(LS_FACTS, on ? 'on' : 'off'); return {...s, factsOn:on, toast: on ? 'Facts on' : 'Facts off'}; }); }
    function undo(){ setState(s=>{ if(!s._undo) return s; const prev = s._undo; return {...s, ...prev, _undo:null, toast:'Undid last move'}; }); }

    function Setup(){ 
      const [count, setCount] = useState(state.players.length); 
      const [deckOpen, setDeckOpen] = useState(false); 
      const [deckStage, setDeckStage] = useState('early');
      return React.createElement('div', { className:'card' }, 
        React.createElement('h2', { className:'h' }, 'Players & Setup'),
        React.createElement('div', { className:'setup-row' }, 
          React.createElement('label', null, 'Number of players (2–6): '),
          React.createElement('input', { type:'number', min:2, max:6, className:'input', style:{width:80}, value:count, onChange:e=>{ const n = Math.max(2, Math.min(6, Number(e.target.value)||2)); setCount(n); setPlayers(p=>{ let copy=[...p]; if(copy.length < n){ const extras = Array.from({length:n-copy.length}, (_,i)=>({ name:`Player ${copy.length+i+1}`, color: ['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'][(copy.length+i)%6] })); copy = copy.concat(extras); } else copy = copy.slice(0,n); return copy; }); }})
        ),
        state.players.map((p,i)=> React.createElement('div', { className:'setup-row', key:i }, 
          React.createElement('span', { className:'color-dot', style:{background:p.color} }),
          React.createElement('input', { className:'input', placeholder:`Player ${i+1}`, style:{flex:1}, value:p.name, onChange:e=>{ const v=e.target.value; setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, name:v} : pp)); }}),
          React.createElement('input', { type:'color', value:p.color, onChange:e=>{ const v=e.target.value; setPlayers(arr=>arr.map((pp,idx)=> idx===i ? {...pp, color:v} : pp)); }})
        )),
        React.createElement('div', { className:'setup-row' }, 
          React.createElement('button', { className:'cta', onClick: ()=>setState(s=>({...s, started:true})) }, 'Start game'),
          React.createElement('button', { className:'secondary', onClick: ()=>setDeckOpen(true) }, 'Preview decks'),
          React.createElement('button', { className:'secondary', onClick: toggleAudio }, state.muted ? 'Unmute' : 'Mute'),
          React.createElement('button', { className:'secondary', onClick: toggleFacts }, state.factsOn ? 'Facts: On' : 'Facts: Off')
        ),
        React.createElement(Modal, { open: deckOpen, onClose: ()=>setDeckOpen(false), title:`Preview — ${STAGE_LABEL[deckStage]}`, children: React.createElement(React.Fragment, null, 
          React.createElement('div', { style:{display:'flex', gap:8, marginBottom:8} }, ...['early','commons','lords','implementation'].map(st => React.createElement('button', { key:st, className:'secondary', onClick:()=>setDeckStage(st) }, React.createElement('span', { className:'color-dot', style:{background:STAGE_COLOR[st]} }), ' ', STAGE_LABEL[st] )) ),
          React.createElement('ul', null, (DECKS[deckStage]||[]).map((c,idx)=> React.createElement('li', { key:idx, className:'small', style:{margin:'6px 0'} }, React.createElement('strong', null, c.title), ': ', React.createElement('span', { style:{whiteSpace:'pre-wrap'} }, c.text) ) ))
        )})
      );
    }

    function Sidebar(){
      const me = state.players[state.turn]; const label = me.name || `P${state.turn+1}`;
      return React.createElement('div', { className:'card' }, 
        React.createElement('h2', { className:'h' }, 'Current turn'),
        React.createElement('div', { className:'playercard' }, 
          React.createElement('div', { className:'name' }, React.createElement('span', { className:'color-dot', style:{background:me.color} }), React.createElement('span', null, label ) ),
          state.winner==null ? React.createElement('span', { className:'turnarrow' }, '➡️') : null
        ),
        React.createElement('div', { style:{display:'flex', gap:10, alignItems:'center', marginTop:12} }, 
          React.createElement(Dice, { onFinal: onDiceFinal, disabled: state.winner!=null || state.rolling, muted: state.muted }),
          React.createElement('button', { className:'secondary', onClick: resetGame }, 'Reset'),
          React.createElement('button', { className:'secondary', onClick: undo, disabled: !state._undo }, 'Undo'),
          React.createElement('button', { className:'secondary', onClick: toggleAudio }, state.muted ? 'Unmute' : 'Mute'),
          React.createElement('button', { className:'secondary', onClick: toggleFacts }, state.factsOn ? 'Facts: On' : 'Facts: Off')
        ),
        React.createElement('h3', { className:'h', style:{marginTop:16} }, 'Players'),
        React.createElement('div', { className:'playerlist' }, ...state.players.map((p,i)=> React.createElement('div', { key:i, className:`playercard ${i===state.turn && state.winner==null ? '' : 'dimmed'}` }, 
          React.createElement('div', { className:'name' }, React.createElement('span', { className:'color-dot', style:{background:p.color} }), (p.name || `P${i+1}`) ),
          React.createElement('div', { className:'small' }, 'Pos: ', state.positions[i] )
        ))),
        state.winner!=null && React.createElement('p', { className:'small', style:{marginTop:12} }, '🏆 ', (state.players[state.winner].name||`P${state.winner+1}`), ' wins!'),
        React.createElement('hr', null),
        React.createElement('p', { className:'small' }, 'Board image © authors of Legislate?!, OGL v3.0. This web adaptation is unofficial.')
      );
    }

    function CalibBar(){ 
      const [enabled, setEnabled] = useState(false); const [idx, setIdx] = useState(0);
      function exportJSON(){ const data = { path: state.path, stages: state.stages, version:'58' }; download('legislate-calibration-58.json', JSON.stringify(data, null, 2)); }
      function importJSON(file){ const reader = new FileReader(); reader.onload = () => { try{ const data = JSON.parse(reader.result); if(Array.isArray(data.path) && Array.isArray(data.stages) && data.path.length===BOARD_SIZE+1 && data.stages.length===BOARD_SIZE+1){ ls.save(LS_PATH, data.path); ls.save(LS_STAGES, data.stages); setState(s=>({...s, path:data.path, stages:data.stages})); } else alert('Invalid calibration JSON'); }catch(err){ alert('Failed to parse calibration JSON'); } }; reader.readAsText(file); }
      function exportPathCode(){ const code = 'const PATH_58 = ' + JSON.stringify(state.path) + ';'; download('path-58.js', code); }
      function exportStagesCode(){ const obj = {}; state.stages.forEach((v,i)=>{ if(v) obj[i]=v; }); const code = 'const STAGES = new Map(' + JSON.stringify(Object.entries(obj)) + ');'; download('stages-58.js', code); }
      function download(name, text){ const blob = new Blob([text], {type:'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 0); }
      return React.createElement('div', { className:'calib-bar' }, 
        React.createElement('label', null, React.createElement('input', { type:'checkbox', checked:enabled, onChange:e=>setEnabled(e.target.checked)}), ' Calibration mode (tap board to set index) '),
        enabled && React.createElement(React.Fragment, null, 
          React.createElement('div', { className:'badge' }, 'Index: ', idx),
          React.createElement('button', { onClick:()=>setIdx(i=>Math.max(0,i-1)) }, '◀ Prev'),
          React.createElement('button', { onClick:()=>setIdx(i=>Math.min(BOARD_SIZE, idx+1)) }, 'Next ▶'),
          React.createElement('button', { className:'secondary', onClick:exportJSON }, 'Export JSON (path+stages)'),
          React.createElement('button', { className:'secondary', onClick:exportPathCode }, 'Export PATH (code)'),
          React.createElement('button', { className:'secondary', onClick:exportStagesCode }, 'Export stages (code)'),
          React.createElement('label', null, ' Import JSON ', React.createElement('input', { type:'file', accept:'.json', onChange:e=> e.target.files?.[0] && importJSON(e.target.files[0]) })),
          React.createElement('span', { className:'small' }, 'Set stage at this index:'),
          ...['early','commons','lords','implementation'].map(st=> React.createElement('button', { key:st, className:'secondary', onClick:()=> setStageAt(idx, st) }, React.createElement('span', { className:'color-dot', style:{background:STAGE_COLOR[st]} }), ' ', STAGE_LABEL[st] )),
          React.createElement('span', { className:'small' }, state.stages[idx] ? `Tagged: ${STAGE_LABEL[state.stages[idx]]}` : 'No stage')
        )
      );
    }

    function setStageAt(i,stage){ setState(s=>{ const a=[...s.stages]; a[i]=stage; ls.save(LS_STAGES, a); return {...s, stages:a}; }); }
    function setPathPoint(i,x,y){ setState(s=>{ const path=[...s.path]; path[i]=[x,y]; ls.save(LS_PATH, path); return {...s, path}; }); }

    function Board(){ 
      function onTap(e){
        if (!e.currentTarget.classList.contains('calib-enabled')) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left)/rect.width)*100;
        const y = ((e.clientY - rect.top)/rect.height)*100;
        // example: set point 0 for quick sanity
        setPathPoint(0, x, y);
      }
      return React.createElement('div', { className:'board-wrap', onClick:onTap }, 
        React.createElement('div', { className:'board-img' }),
        ...state.players.map((p,idx)=>{ const pos = state.positions[idx]; const [x,y] = state.path[Math.min(pos, state.path.length-1)] || [0,0]; const isTurn = idx===state.turn && state.winner==null; return React.createElement('div', { key:idx, className:`token ${isTurn?'turn':''}`, style:{ left:`${x}%`, top:`${y}%`, background:p.color } }, React.createElement('span', null, (idx+1)), React.createElement('span', { className:'label' }, (p.name || `P${idx+1}`)) ); })
      );
    }

    return React.createElement('div', { className:'grid' }, 
      state.started ? React.createElement(Sidebar, null) : React.createElement(Setup, null),
      React.createElement('div', { className:'card' }, 
        React.createElement('h2', { className:'h' }, 'Board (58 spaces)'),
        React.createElement(Board, null),
        React.createElement(CalibBar, null)
      )
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('app'));
  root.render(React.createElement(App, null));
})();