
(function(){'use strict';
  const { useState, useEffect } = React;

  // Locked calibration
  const CAL = {"path": [[13.045454545454547, 87.45454545454545], [21.136363636363637, 73], [27.227272727272727, 64.72727272727272], [36.04545454545455, 65.54545454545455], [47.77272727272727, 67.45454545454545], [42.04545454545455, 73.0909090909091], [43.86363636363637, 79.54545454545455], [38.68181818181819, 90.9090909090909], [48.77272727272727, 91.0909090909091], [59.409090909090914, 84], [60.22727272727273, 92.9090909090909], [69.04545454545455, 95.9090909090909], [71.04545454545455, 88.18181818181819], [65.77272727272727, 79.27272727272727], [86.13636363636363, 84.9090909090909], [79.31818181818183, 74.90909090909092], [79.13636363636364, 70.27272727272728], [75.31818181818181, 65.63636363636364], [63.13636363636363, 58.909090909090914], [72.68181818181819, 49.36363636363637], [78.22727272727272, 51.90909090909091], [82.5909090909091, 57.54545454545455], [89.5909090909091, 66.54545454545455], [91.95454545454545, 54.18181818181819], [89.95454545454545, 49.27272727272727], [92.5, 41.36363636363637], [85.22727272727273, 33.81818181818182], [79.68181818181819, 38.09090909090909], [73.77272727272727, 38.27272727272727], [62.5, 34.18181818181818], [67.86363636363636, 27.636363636363637], [70.5, 19.18181818181818], [75.86363636363636, 22.454545454545453], [85.4090909090909, 26.272727272727277], [89.5, 18.181818181818183], [90.04545454545455, 7.454545454545454], [77.22727272727272, 8.363636363636363], [68.77272727272728, 6.454545454545454], [58.59090909090909, 6.454545454545454], [53.22727272727272, 7.454545454545454], [50.227272727272734, 13.363636363636363], [49.04545454545455, 19], [52.5, 25.636363636363633], [51.68181818181819, 31], [44.95454545454545, 38.63636363636363], [37.86363636363637, 28.72727272727273], [35.86363636363637, 19.545454545454547], [33.59090909090909, 11.363636363636363], [26.77272727272727, 7.363636363636364], [17.31818181818182, 7.727272727272727], [12.136363636363637, 12.909090909090908], [8.409090909090908, 20.272727272727273], [10.681818181818182, 29.454545454545457], [20.31818181818182, 32.81818181818182], [30.954545454545457, 36.36363636363637], [33.59090909090909, 45.09090909090909], [32.22727272727273, 54.63636363636364], [13.681818181818182, 47.090909090909086], [97.80000000000001, 30]], "stages": [null, null, "early", null, "early", "early", null, "early", null, "early", null, "early", null, "early", "early", null, "early", null, null, null, "commons", null, "commons", null, "commons", null, null, "commons", null, null, null, "lords", null, "lords", null, "lords", null, null, null, "lords", null, "lords", null, "lords", null, null, "implementation", null, "implementation", null, "implementation", null, "implementation", null, "implementation", null, "implementation", "implementation", null], "version": "58"};
  function deepFreeze(o){ return Object.freeze(Array.isArray(o) ? o.map(deepFreeze) : (o && typeof o==='object') ? Object.keys(o).reduce((a,k)=>(a[k]=deepFreeze(o[k]),a),{}) : o); }
  const CALIBRATION_LOCK = deepFreeze(CAL);
  const BOARD_SIZE = CALIBRATION_LOCK.path.length-1;
  function loadPath(){ return CALIBRATION_LOCK.path; }
  function loadStages(){ return CALIBRATION_LOCK.stages; }

  // Firebase init (compat)
  const FB = window.FIREBASE_CONFIG;
  let app=null, auth=null, db=null;
  try{ app=firebase.initializeApp(FB); auth=firebase.auth(); db=firebase.firestore(); }catch(e){ console.log('fb init once', e); }
  function anon(){ return auth.signInAnonymously(); }

  // Helpers
  const STAGE_LABEL={early:'Early stages',commons:'Commons',lords:'Lords',implementation:'Implementation'};
  const DECKS={early:[{title:'Scope rethink',text:'Miss a turn.',effect:{type:'skip_next',count:1}}],commons:[{title:'Opposition day',text:'Go back 2.',effect:{type:'move',delta:-2}}],lords:[{title:'Amendment marshalled',text:'Go back 1.',effect:{type:'move',delta:-1}}],implementation:[{title:'Commencement SIs',text:'Advance 2.',effect:{type:'move',delta:2}}],event:[{title:'General election',text:'All return to Start.',effect:{type:'global_move_all',to:0}},{title:'Filibuster',text:'Everyone skips next turn.',effect:{type:'global_skip_all',count:1}}]};
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
  function drawFrom(d){ const c=d[0]; const r=d.slice(1).concat([c]); return [c,r]; }

  function App(){
    const [mode,setMode]=useState(null); // 'local'|'host'|'join'
    const [gameId,setGameId]=useState('');
    const [me,setMe]=useState(null);
    const [players,setPlayers]=useState([]);
    const [state,setState]=useState(null);
    const [settings,setSettings]=useState({billTracker:false,eventDeckOn:false,showFacts:true});
    const [decks,setDecks]=useState(DECKS);
    const [muted,setMuted]=useState((localStorage.getItem('legislate:audio')??'on')!=='on');

    useEffect(()=>{ if(mode==='host'||mode==='join') anon().then(c=>setMe({uid:c.user.uid,isHost:false})); },[mode]);

    function defaultPlayers(n){ return Array.from({length:n},(_,i)=>({name:'Player '+(i+1),color:['#4bb5ff','#ffd166','#00d68f','#ff6b6b','#c792ea','#50fa7b'][i%6],billTitle:'',billSummary:''})); }
    function createState(ps){ return {started:false,turn:0,positions:ps.map(()=>0),skips:ps.map(()=>0),winner:null,lastCard:null,cardOpen:false,extraRoll:false,history:[]}; }

    // Local boot
    useEffect(()=>{ if(mode==='local'){ const ps=defaultPlayers(4); setPlayers(ps); setState(createState(ps)); } },[mode]);

    function toggleAudio(){ const m=!muted; setMuted(m); try{localStorage.setItem('legislate:audio',m?'off':'on');}catch{} }
    function toggleLocal(key){ if(mode==='local') setSettings(s=>Object.assign({},s,{[key]:!s[key]})); }

    async function rollLocal(){ const d=randInt(1,6); for(let k=0;k<d;k++){ await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,120))); setState(s=>{ const pos=s.positions.slice(); pos[s.turn]=clamp(pos[s.turn]+1,0,BOARD_SIZE); return Object.assign({},s,{positions:pos}); }); } setState(s=>{ let out=Object.assign({},s); const stage=loadStages()[out.positions[out.turn]]; if(stage){ const [card,rest]=drawFrom(decks[stage]); setDecks(dk=>Object.assign({},dk,{[stage]:rest})); out.lastCard=Object.assign({stage},card); out.cardOpen=true; out.history=[{stage,title:card.title,text:card.text},...out.history].slice(0,30); out=applyEffect(card.effect,out); } if(settings.eventDeckOn && randInt(1,6)===1){ const [ec,er]=drawFrom(decks.event); setDecks(dk=>Object.assign({},dk,{event:er})); out.lastCard={stage:'event',title:ec.title,text:ec.text}; out.cardOpen=true; out=applyEffect(ec.effect,out,true); } if(out.positions[out.turn]===BOARD_SIZE){ out.winner=out.turn; } out.turn = out.extraRoll?out.turn:(out.turn+1)%players.length; if(out.skips[out.turn]>0){ out.skips[out.turn]-=1; out.turn=(out.turn+1)%players.length; } return out; }); }
    function applyEffect(effect,s,glob){ if(!effect) return s; let o=Object.assign({},s); switch(effect.type){ case 'move': o.positions[o.turn]=clamp(o.positions[o.turn]+Number(effect.delta||0),0,BOARD_SIZE); break; case 'skip_next': o.skips[o.turn]+=Number(effect.count||1); break; case 'extra_roll': o.extraRoll=true; break; case 'global_move_all': o.positions=o.positions.map(()=>Number(effect.to||0)); break; case 'global_skip_all': o.skips=o.skips.map(v=>v+Number(effect.count||1)); break; } return o; }

    function Board(){ const P=loadPath(); return React.createElement('div',{className:'board-wrap'},React.createElement('div',{className:'board-img'}),(players||[]).map((p,i)=>{ const pos=(state?.positions?.[i]||0); const pt=P[Math.min(pos,P.length-1)]||[0,0]; return React.createElement('div',{key:i,className:'token '+(i===state?.turn&& !state?.winner?'turn':''),style:{left:pt[0]+'%',top:pt[1]+'%',background:p.color}},React.createElement('span',null,i+1),React.createElement('span',{className:'label'}, settings.billTracker?(p.billTitle||('Bill '+(i+1))):(p.name||('P'+(i+1))) )); })); }

    if(!mode) return React.createElement('div',{className:'center card'},React.createElement('h2',{className:'h'},'Legislate?!'),React.createElement('div',{className:'btns'},React.createElement('button',{className:'cta',onClick:()=>setMode('local')},'Play locally'),React.createElement('button',{className:'secondary',onClick:()=>setMode('host')},'Host online'),React.createElement('button',{className:'secondary',onClick:()=>setMode('join')},'Join online')), mode==='join' && React.createElement('div',{className:'setup-row',style:{justifyContent:'center'}},React.createElement('input',{className:'input',placeholder:'GAME ID',style:{width:'160px'},value:gameId,onChange:e=>setGameId(e.target.value.toUpperCase())}),React.createElement('button',null,'Join')));

    if(mode==='local') return React.createElement('div',{className:'grid'}, React.createElement('div',{className:'card'},React.createElement('h2',{className:'h'},'Local setup'), React.createElement('div',{className:'setup-row'},React.createElement('button',{className:'secondary',onClick:()=>toggleLocal('billTracker')},'Bill Tracker: '+(settings.billTracker?'On':'Off')), React.createElement('button',{className:'secondary',onClick:()=>toggleLocal('eventDeckOn')},'Event deck: '+(settings.eventDeckOn?'On':'Off')), React.createElement('button',{className:'secondary',onClick:toggleAudio}, muted?'Unmute':'Mute')), state?.started?React.createElement('div',null):React.createElement('button',{className:'cta',onClick:()=>setState(s=>Object.assign(createState(players),{started:true}))},'Start game'), state?.started && React.createElement('div',{className:'setup-row'},React.createElement('button',{className:'cta',onClick:rollLocal},'Roll'), React.createElement('button',{className:'secondary',onClick:()=>setState(createState(players))},'Reset'))), React.createElement('div',{className:'card'},React.createElement('h2',{className:'h'},'Board'), React.createElement(Board,null)) );

    // Multiplayer UI scaffold (host-only controls to be expanded in next pass)
    return React.createElement('div',{className:'grid'}, React.createElement('div',{className:'card'},React.createElement('h2',{className:'h'},(mode==='host'?'Host':'Join')+' — Firebase ready'), React.createElement('p',null,'This screen will wire turns and settings through Firestore in your project.'), React.createElement('button',{className:'secondary',onClick:toggleAudio}, muted?'Unmute':'Mute')), React.createElement('div',{className:'card'},React.createElement('h2',{className:'h'},'Board'), React.createElement(Board,null)));
  }

  ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
})();
