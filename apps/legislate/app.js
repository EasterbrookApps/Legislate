import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'https://esm.sh/react@18.3.1/jsx-runtime'

const { useState, useEffect, useRef } = React;

const CALIBRATION = {"path":[[5,90],[6.6,88.9],[8.2,87.8],[9.8,86.7],[11.4,85.6],[13,84.5],[14.600000000000001,83.4],[16.200000000000003,82.3],[17.8,81.2],[19.4,80.1],[21,79],[22.6,77.9],[24.200000000000003,76.8],[25.8,75.7],[27.400000000000002,74.6],[29,73.5],[30.6,72.4],[32.2,71.3],[33.8,70.2],[35.400000000000006,69.1],[37,68],[38.6,66.9],[40.2,65.8],[41.800000000000004,64.7],[43.400000000000006,63.599999999999994],[45,62.5],[46.6,61.4],[48.2,60.3],[49.800000000000004,59.199999999999996],[51.400000000000006,58.099999999999994],[53,57],[54.6,55.9],[56.2,54.8],[57.800000000000004,53.699999999999996],[59.400000000000006,52.599999999999994],[61,51.5],[62.6,50.4],[64.2,49.3],[65.80000000000001,48.199999999999996],[67.4,47.099999999999994],[69,46],[70.60000000000001,44.9],[72.2,43.8],[73.8,42.699999999999996],[75.4,41.599999999999994],[77,40.49999999999999],[78.60000000000001,39.4],[80.2,38.3],[81.80000000000001,37.199999999999996],[83.4,36.099999999999994],[85,34.99999999999999],[86.60000000000001,33.9],[88.2,32.8],[89.80000000000001,31.699999999999996],[91.4,30.599999999999994],[93,30],[94.60000000000001,30],[96.2,30],[97.80000000000001,30]],"stages":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"version":"58"};
const BOARD_SIZE = 58;

const url = new URL(window.location.href);
const ENABLE_CALIB = url.searchParams.has('calib');

const LS_GAME = 'legislate:v58:game';
const LS_AUDIO = 'legislate:v58:audio';
const LS_PREFS = 'legislate:v58:prefs';

const STAGE_LABEL = {
  early: 'Early stages',
  commons: 'House of Commons',
  lords: 'House of Lords',
  implementation: 'Implementation',
};
const STAGE_COLOR = {
  early: '#ff9f43',
  commons: '#18d18c',
  lords: '#ff6b6b',
  implementation: '#58a6ff',
};
const STAGE_IDS = ['early','commons','lords','implementation'];

const ls = {
  load(key, fallback){ try{ const s=localStorage.getItem(key); if(s) return JSON.parse(s); }catch(e){} return fallback; },
  save(key, data){ try{ localStorage.setItem(key, JSON.stringify(data)); }catch(e){} },
};
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function drawFrom(deck){ const card=deck[0]; const rest=deck.slice(1).concat([card]); return [card,rest]; }

const DECKS = {
  early: [
    { title:'Scope rethink', text:'Refocus policy intent.\nMiss a turn.', effect:{ type:'skip_next', count:1 } },
    { title:'Stakeholder discovery', text:'Valuable external input.\nAdvance 2.', effect:{ type:'move', delta:2 } },
    { title:'Cross-gov alignment', text:'Resolve overlaps early.\nRoll again.', effect:{ type:'extra_roll' } },
  ],
  commons: [
    { title:'Bill committee', text:'Line-by-line scrutiny.\nAdvance 1.', effect:{ type:'move', delta:1 } },
    { title:'Programme motion', text:'Keeps things moving.\nRoll again.', effect:{ type:'extra_roll' } },
    { title:'Filibuster risk', text:'Debate drags on.\nGo back 2.', effect:{ type:'move', delta:-2 } },
  ],
  lords: [
    { title:'Constructive challenge', text:'Helpful improvements.\nAdvance 1.', effect:{ type:'move', delta:1 } },
    { title:'Report stage amendments', text:'Significant changes.\nMiss a turn.', effect:{ type:'skip_next', count:1 } },
    { title:'Ping-pong begins', text:'Between Houses.\nRoll again.', effect:{ type:'extra_roll' } },
  ],
  implementation: [
    { title:'Commencement SIs', text:'Phased start dates.\nAdvance 2.', effect:{ type:'move', delta:2 } },
    { title:'Guidance published', text:'Delivery partners ready.\nRoll again.', effect:{ type:'extra_roll' } },
    { title:'Judicial review risk', text:'Proceed carefully.\nGo back 2.', effect:{ type:'move', delta:-2 } },
  ],
};

function defaultPlayers(n){ 
  return Array.from({length:n}, function(_,i){ return { name:'', color:['#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b','#f78fb3'][i%6] }; }); 
}

function createState(players, bakedPath = CALIBRATION.path, bakedStages = CALIBRATION.stages){
  const saved = ls.load(LS_GAME, null);
  if(saved && saved.players && Array.isArray(saved.positions)) return saved;
  return {
    players: players,
    path: bakedPath,
    stages: bakedStages,
    turn: 0,
    dice: 0,
    rolling: false,
    positions: players.map(function(){return 0;}),
    skips: players.map(function(){return 0;}),
    winner: null,
    decks: JSON.parse(JSON.stringify(DECKS)),
    lastCard: null,
    history: [],
    toast: '',
    cardOpen: false,
    extraRoll: false,
    started: false,
    muted: ls.load(LS_AUDIO, 'on') !== 'on',
    reduced: !!(ls.load(LS_PREFS, {}).reduced),
    _undo: null,
    calibEnabled: false,
    calibIndex: 0,
    log: []
  };
}

function applyEffect(effect, s){
  var out = Object.assign({}, s);
  if(!effect) return out;
  if(effect.type==='move'){
    var idx = out.turn;
    var dest = clamp(out.positions[idx] + (effect.delta||0), 0, BOARD_SIZE);
    out.positions = out.positions.map(function(p,i){ return i===idx ? dest : p; });
    out.log = [ (effect.delta>=0?('Advanced '+effect.delta):('Went back '+Math.abs(effect.delta))), ].concat(out.log||[]);
  } else if(effect.type==='skip_next'){
    var idx2 = (out.turn + 1) % out.players.length;
    var nextSkips = out.skips.slice(); nextSkips[idx2] = (nextSkips[idx2]||0) + (effect.count||1);
    out.skips = nextSkips;
    out.log = [ 'Next player will skip '+(effect.count||1), ].concat(out.log||[]);
  } else if(effect.type==='extra_roll'){
    out.extraRoll = true;
    out.log = [ 'Roll again' ].concat(out.log||[]);
  }
  return out;
}

function Toast(props){ return props.msg ? _jsx('div',{ className:'toast', children: props.msg }) : null; }

function Modal(props){
  if(!props.open) return null;
  return _jsx('div', { className:'modal-backdrop', onClick: function(e){ if(e.target===e.currentTarget && props.onClose) props.onClose(); }, children:
    _jsxs('div', { className:'modal', role:'dialog', 'aria-modal':true, children:[
      _jsx('h3', { children: props.title }),
      _jsx('div', { children: props.children }),
      _jsxs('div', { className:'actions', children:[ 
        _jsx('button', { className:'secondary', onClick:props.onClose, children:'Close' })
      ]})
    ]})
  });
}

function Dice(props){
  const [face, setFace] = useState(null);
  const [rolling, setRolling] = useState(false);
  async function roll(){
    if(rolling) return;
    setRolling(true);
    const final = randInt(1,6);
    if(!props.reduce){
      const id = setInterval(function(){ setFace(randInt(1,6)); }, 60);
      await new Promise(function(r){ return setTimeout(r, 650); });
      clearInterval(id);
    }
    setFace(final);
    setRolling(false);
    if(props.onFinal) props.onFinal(final);
  }
  return _jsx('button', {
    className:'dice', onClick: roll, disabled: (!!props.disabled) || rolling, 'aria-live':'polite',
    title: rolling ? 'Rolling…' : 'Roll', children: face ?? '–'
  });
}

function App(){
  const [players, setPlayers] = useState(function(){ return defaultPlayers(4); });
  const [state, setState] = useState(function(){ return createState(defaultPlayers(4)); });
  const appRef = useRef(null);

  useEffect(function(){ ls.save(LS_GAME, state); }, [state]);

  useEffect(function(){
    const menu = document.querySelector('.menu');
    const btn = document.getElementById('menuBtn');
    function toggle(){ menu.classList.toggle('open'); btn.setAttribute('aria-expanded', menu.classList.contains('open')); }
    function onDoc(e){ if(!menu.contains(e.target)) menu.classList.remove('open'); }
    btn.addEventListener('click', toggle);
    document.addEventListener('click', onDoc);
    return function(){ btn.removeEventListener('click', toggle); document.removeEventListener('click', onDoc); };
  },[]);

  useEffect(function(){
    const dev = document.getElementById('devSection');
    if(ENABLE_CALIB) dev.hidden = false;
    document.getElementById('calib-chip').textContent = 'Calibration: v58' + (state.calibEnabled?' (editing)':'');
    const banner = document.getElementById('calib-banner');
    banner.hidden = !(ENABLE_CALIB && state.calibEnabled && !sessionStorage.getItem('hideCalibBanner'));
  }, [state.calibEnabled]);

  function startGame(){
    setState(function(s){ return Object.assign({}, s, { players: players, started:true, toast:'Game started' }); });
  }

  function toggleAudio(){
    setState(function(s){ return Object.assign({}, s, { muted: !s.muted }); });
    ls.save(LS_AUDIO, state.muted ? 'on' : 'muted');
  }
  function setReduced(v){
    setState(function(s){ return Object.assign({}, s, { reduced: v }); });
    const prefs = ls.load(LS_PREFS, {}); prefs.reduced = v; ls.save(LS_PREFS, prefs);
  }

  useEffect(function(){
    const tgl = document.getElementById('toggleCalibration');
    const red = document.getElementById('reducedMotion');
    const mute = document.getElementById('muteAudio');
    if(tgl) tgl.checked = state.calibEnabled;
    if(red) red.checked = !!state.reduced;
    if(mute) mute.checked = !!state.muted;
  },[state]);

  useEffect(function(){
    const tgl = document.getElementById('toggleCalibration');
    const red = document.getElementById('reducedMotion');
    const mute = document.getElementById('muteAudio');
    const exitBtn = document.getElementById('exitCalib');
    const export1 = document.getElementById('exportCalib');
    const export2 = document.getElementById('exportCalib2');
    const importInp = document.getElementById('importCalib');
    const dismiss = document.getElementById('dismissBanner');

    function onTgl(e){ setState(function(s){ return Object.assign({}, s, { calibEnabled: e.target.checked }); }); }
    function onExit(){ setState(function(s){ return Object.assign({}, s, { calibEnabled:false }); }); }
    function onExport(){
      const data = JSON.stringify({ path: state.path, stages: state.stages, version:'58' }, null, 2);
      const blob = new Blob([data], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='legislate-calibration-58-export.json'; a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); },0);
    }
    function onImport(e){
      const file = e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = function(){
        try{ 
          const obj = JSON.parse(reader.result);
          if(Array.isArray(obj.path) && Array.isArray(obj.stages) && obj.path.length===BOARD_SIZE+1 && obj.stages.length===BOARD_SIZE+1){
            setState(function(s){ return s.calibEnabled ? Object.assign({}, s, { path: obj.path, stages: obj.stages }) : s; });
          } else alert('Invalid calibration JSON');
        }catch(err){ alert('Failed to parse calibration JSON'); }
      };
      reader.readAsText(file);
    }
    function onDismiss(){ sessionStorage.setItem('hideCalibBanner','1'); document.getElementById('calib-banner').hidden = true; }

    if(tgl) tgl.addEventListener('change', onTgl);
    if(exitBtn) exitBtn.addEventListener('click', onExit);
    if(export1) export1.addEventListener('click', onExport);
    if(export2) export2.addEventListener('click', onExport);
    if(importInp) importInp.addEventListener('change', onImport);
    if(dismiss) dismiss.addEventListener('click', onDismiss);
    return function(){
      if(tgl) tgl.removeEventListener('change', onTgl);
      if(exitBtn) exitBtn.removeEventListener('click', onExit);
      if(export1) export1.removeEventListener('click', onExport);
      if(export2) export2.removeEventListener('click', onExport);
      if(importInp) importInp.removeEventListener('change', onImport);
      if(dismiss) dismiss.removeEventListener('click', onDismiss);
    }
  }, [state.calibEnabled, state.path, state.stages]);

  function rollDie(final){
    setState(function(s){
      if(s.winner) return s;
      var out = Object.assign({}, s, { toast:'' });
      var d = final;
      out.dice = d;
      out.extraRoll = false;
      out._undo = { positions:s.positions.slice(), skips:s.skips.slice(), turn:s.turn, cardOpen:false, lastCard:null };

      var idx = out.turn;
      var dest = clamp(out.positions[idx] + d, 0, BOARD_SIZE);
      out.positions = out.positions.map(function(p,i){ return i===idx ? dest : p; });
      out.log = ['Rolled '+d].concat(out.log||[]);

      var stage = out.stages[dest];
      if(stage && stage!=='implementation' && dest<BOARD_SIZE){
        var pair = drawFrom(out.decks[stage]);
        var card = pair[0]; var rest = pair[1];
        out.decks[stage] = rest;
        out.lastCard = Object.assign({ stage: stage }, card);
        out.history = [{ stage: stage, title: card.title, text: card.text }].concat(out.history||[]).slice(0,20);
        out.cardOpen = true;
        out = applyEffect(card.effect, out);
        if(out.positions[out.turn]===BOARD_SIZE){
          var label = (out.players[out.turn].name||('P'+(out.turn+1)));
          return Object.assign({}, out, { winner: out.turn, toast: '🏆 '+label+' has implemented their Act!' });
        }
      }
      var nextTurn = out.extraRoll ? out.turn : (out.turn+1) % out.players.length;
      if(out.skips[nextTurn] > 0){
        var nextSkips = out.skips.slice(); nextSkips[nextTurn]-=1;
        var label2 = (out.players[nextTurn].name||('P'+(nextTurn+1)));
        out.log = [label2+' skips a turn.'].concat(out.log||[]);
        nextTurn = (nextTurn+1) % out.players.length;
        return Object.assign({}, out, { skips: nextSkips, turn: nextTurn, toast: label2+' skips a turn' });
      }
      return Object.assign({}, out, { turn: nextTurn, toast: 'Rolled '+d });
    });
  }

  function undo(){
    setState(function(s){
      if(!s._undo) return s;
      var prev = s._undo;
      return Object.assign({}, s, prev, { _undo:null, toast:'Undid last move' });
    });
  }

  function restart(){
    const ps = players.map(function(p){ return { name:p.name, color:p.color }; });
    setState(createState(ps));
  }

  function Setup(){
    function setCount(n){
      setPlayers(function(arr){
        var cur = arr.length; 
        if(n>cur) return arr.concat(defaultPlayers(n-cur));
        return arr.slice(0,n);
      });
    }
    return _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Game setup' }),
      _jsxs('div', { className:'small', children:['Players: ', players.length] }),
      _jsxs('div', { className:'controls', children:[
        _jsx('button', { className:'secondary', onClick:function(){return setCount(Math.max(2, players.length-1));}, children:'–' }),
        _jsx('button', { className:'secondary', onClick:function(){return setCount(Math.min(6, players.length+1));}, children:'+' }),
      ]}),
      _jsx('div', { className:'playerlist', children: players.map(function(p,i){
        return _jsxs('div', { className:'playercard', children:[
          _jsx('span', { className:'color-dot', style:{background:p.color} }),
          _jsx('input', { placeholder:'Player '+(i+1), value:p.name, onChange:function(e){ return setPlayers(function(arr){ return arr.map(function(pp,idx){ return idx===i ? Object.assign({}, pp, { name:e.target.value }) : pp; }); }); } }),
          _jsx('input', { title:'Colour', value:p.color, onChange:function(e){ return setPlayers(function(arr){ return arr.map(function(pp,idx){ return idx===i ? Object.assign({}, pp, { color:e.target.value }) : pp; }); }); } }),
        ]}, i);
      }) }),
      _jsxs('div', { className:'controls', children:[
        _jsx('button', { className:'cta', onClick:startGame, children:'Start game' }),
      ]}),
    ]});
  }

  function Board(){
    var path = state.path;
    var tokens = state.positions.map(function(pos,i){ return { x: path[pos][0], y: path[pos][1], color: state.players[i].color }; });
    return _jsxs('div', { children:[
      _jsxs('div', { className:'board', children:[
        _jsxs('svg', { className:'svg', viewBox:'0 0 100 100', children:[
          path.map(function(pt,idx){ return _jsx('circle', { cx:pt[0], cy:pt[1], r:1.2, className:'square', fill: stageColor(state.stages[idx]) }, idx); }),
          tokens.map(function(t,i){ return _jsx('circle', { cx:t.x, cy:t.y, r:2, className:'token', style:{ transform:'translateZ(0)' }, fill:t.color, stroke:'#000' }, i); })
        ]})
      ]}),
      _jsxs('div', { className:'controls', children:[
        _jsx(Dice, { disabled: !!state.winner, onFinal: rollDie, muted: state.muted, reduce: state.reduced }),
        _jsx('button', { className:'secondary', onClick: undo, disabled: !state._undo, children:'Undo' }),
        _jsx('button', { className:'secondary', onClick: restart, children:'Restart' }),
      ]}),
    ]});
  }

  function Sidebar(){
    var me = state.players[state.turn];
    var label = (me && me.name) ? me.name : ('P'+(state.turn+1));
    return _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Current turn' }),
      _jsxs('div', { className:'playercard', children:[
        _jsx('span', { className:'color-dot', style:{background: me ? me.color : '#999'} }),
        _jsx('span', { children: label }),
      ]}),
      _jsxs('div', { className:'small', children:['Dice: ', state.dice || '–'] }),
      _jsx('div', { className:'small', children: state.winner!==null ? ('🏆 '+(state.players[state.winner].name||('P'+(state.winner+1)))+' wins!') : '' }),
    ]});
  }

  function CalibBar(){
    if(!(ENABLE_CALIB && state.calibEnabled)) return null;
    var idx = state.calibIndex;
    function setIdx(v){ setState(function(s){ return Object.assign({}, s, { calibIndex: clamp(v,0,BOARD_SIZE) }); }); }
    function setPoint(x,y){ setState(function(s){ return Object.assign({}, s, { path: s.path.map(function(pt,i){ return i===idx ? [x,y] : pt; }) }); }); }
    function setStage(stage){ setState(function(s){ return Object.assign({}, s, { stages: s.stages.map(function(v,i){ return i===idx ? stage : v; }) }); }); }
    return _jsxs('div', { className:'calib-bar', children:[
      _jsxs('label', { children:[ _jsx('input', { type:'checkbox', checked:true, onChange:function(){ return setState(function(s){ return Object.assign({}, s, { calibEnabled:false }); }); } }), ' Calibration mode (click to set index 0..58)' ]}),
      _jsxs('div', { className:'idx', children: Array.from({length:BOARD_SIZE+1}, function(_,i){ return _jsx('button', { className: i===idx ? 'active':'' , onClick:function(){ return setIdx(i); }, children: i+1 }, i); }) }),
      _jsxs('div', { className:'controls', children:[
        _jsx('button', { className:'secondary', onClick:function(){ return setPoint(state.path[idx][0]-1, state.path[idx][1]); }, children:'←' }),
        _jsx('button', { className:'secondary', onClick:function(){ return setPoint(state.path[idx][0]+1, state.path[idx][1]); }, children:'→' }),
        _jsx('button', { className:'secondary', onClick:function(){ return setPoint(state.path[idx][0], state.path[idx][1]-1); }, children:'↑' }),
        _jsx('button', { className:'secondary', onClick:function(){ return setPoint(state.path[idx][0], state.path[idx][1]+1); }, children:'↓' }),
        _jsx('button', { className:'secondary', onClick:function(){ return setStage(null); }, children:'Clear stage' }),
        ...STAGE_IDS.map(function(st){ return _jsx('button', { className:'secondary', onClick:function(){ return setStage(st); }, style:{borderColor:STAGE_COLOR[st]}, children: STAGE_LABEL[st] }, st); })
      ]})
    ]});
  }

  function stageColor(s){ if(!s) return '#17324d'; return STAGE_COLOR[s]; }

  return _jsxs('div', { className:'grid', ref:appRef, children:[
    state.started ? _jsx(Sidebar, {}) : _jsx(Setup, {}),
    _jsxs('div', { className:'card', children:[
      _jsx('h2', { className:'h', children:'Board (58 spaces, baked v58)' }),
      _jsx(Board, {}),
      _jsx(CalibBar, {}),
    ]}),
    _jsx(Modal, { open: !!state.cardOpen, onClose: function(){ return setState(function(s){ return Object.assign({}, s, { cardOpen:false }); }); }, title: state.lastCard? (STAGE_LABEL[state.lastCard.stage] + ' — ' + state.lastCard.title) : 'Card', children:
      _jsx('div', { style:{whiteSpace:'pre-wrap'}, children: state.lastCard ? state.lastCard.text : '' })
    }),
    _jsx(Toast, { msg: state.toast })
  ]});
}

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(_jsx(App, {}));
