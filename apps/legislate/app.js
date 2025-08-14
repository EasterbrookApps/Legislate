
(function(){'use strict';
const { useState } = React;
const CALIBRATION_LOCK = (function(){ 
  const data = {"path": [[13.045454545454547, 87.45454545454545], [21.136363636363637, 73], [27.227272727272727, 64.72727272727272], [36.04545454545455, 65.54545454545455], [47.77272727272727, 67.45454545454545], [42.04545454545455, 73.0909090909091], [43.86363636363637, 79.54545454545455], [38.68181818181819, 90.9090909090909], [48.77272727272727, 91.0909090909091], [59.409090909090914, 84], [60.22727272727273, 92.9090909090909], [69.04545454545455, 95.9090909090909], [71.04545454545455, 88.18181818181819], [65.77272727272727, 79.27272727272727], [86.13636363636363, 84.9090909090909], [79.31818181818183, 74.90909090909092], [79.13636363636364, 70.27272727272728], [75.31818181818181, 65.63636363636364], [63.13636363636363, 58.909090909090914], [72.68181818181819, 49.36363636363637], [78.22727272727272, 51.90909090909091], [82.5909090909091, 57.54545454545455], [89.5909090909091, 66.54545454545455], [91.95454545454545, 54.18181818181819], [89.95454545454545, 49.27272727272727], [92.5, 41.36363636363637], [85.22727272727273, 33.81818181818182], [79.68181818181819, 38.09090909090909], [73.77272727272727, 38.27272727272727], [62.5, 34.18181818181818], [67.86363636363636, 27.636363636363637], [70.5, 19.18181818181818], [75.86363636363636, 22.454545454545453], [85.4090909090909, 26.272727272727277], [89.5, 18.181818181818183], [90.04545454545455, 7.454545454545454], [77.22727272727272, 8.363636363636363], [68.77272727272728, 6.454545454545454], [58.59090909090909, 6.454545454545454], [53.22727272727272, 7.454545454545454], [50.227272727272734, 13.363636363636363], [49.04545454545455, 19], [52.5, 25.636363636363633], [51.68181818181819, 31], [44.95454545454545, 38.63636363636363], [37.86363636363637, 28.72727272727273], [35.86363636363637, 19.545454545454547], [33.59090909090909, 11.363636363636363], [26.77272727272727, 7.363636363636364], [17.31818181818182, 7.727272727272727], [12.136363636363637, 12.909090909090908], [8.409090909090908, 20.272727272727273], [10.681818181818182, 29.454545454545457], [20.31818181818182, 32.81818181818182], [30.954545454545457, 36.36363636363637], [33.59090909090909, 45.09090909090909], [32.22727272727273, 54.63636363636364], [13.681818181818182, 47.090909090909086], [97.80000000000001, 30]], "stages": [null, null, "early", null, "early", "early", null, "early", null, "early", null, "early", null, "early", "early", null, "early", null, null, null, "commons", null, "commons", null, "commons", null, null, "commons", null, null, null, "lords", null, "lords", null, "lords", null, null, null, "lords", null, "lords", null, "lords", null, null, "implementation", null, "implementation", null, "implementation", null, "implementation", null, "implementation", null, "implementation", "implementation", null], "version": "58"};
  function deepFreeze(o){ return Object.freeze(Array.isArray(o) ? o.map(deepFreeze) : (o && typeof o==='object') ? Object.keys(o).reduce((a,k)=> (a[k]=deepFreeze(o[k]), a), {}) : o); }
  return deepFreeze(data);
})();
const BOARD_SIZE = CALIBRATION_LOCK.path.length - 1;
const CALIB_PASSWORD = 'LeGiSlAtE';
function checkPassword(pw){ return pw === CALIB_PASSWORD; }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function defaultPlayers(n){ return Array.from({length:n},(_,i)=>({name:'Player '+(i+1),color:['#4bb5ff','#ffd166','#00d68f','#ff6b6b'][i%4]})); }
function App(){
  const [players] = useState(defaultPlayers(4));
  const [positions, setPositions] = useState(players.map(()=>0));
  const [turn, setTurn] = useState(0);
  const [toast, setToast] = useState(null);
  const [calibUnlocked, setCalibUnlocked] = useState(false);
  const [pathEdit, setPathEdit] = useState(null);
  const path = (calibUnlocked && pathEdit) ? pathEdit : CALIBRATION_LOCK.path;
  function roll(){ 
    const d = randInt(1,6);
    setPositions(p=>{ const copy=p.slice(); copy[turn]=clamp(copy[turn]+d,0,BOARD_SIZE); return copy; });
    setTurn(t=>(t+1)%players.length);
    setToast('Rolled '+d);
    setTimeout(()=>setToast(null),1500);
  }
  function unlockCalib(){ 
    const pw = prompt('Enter calibration password:');
    if(checkPassword(pw)){ 
      setPathEdit(JSON.parse(JSON.stringify(CALIBRATION_LOCK.path)));
      setCalibUnlocked(true);
      setToast('Calibration unlocked (session only)');
      setTimeout(()=>setToast(null),1500);
    } else alert('Incorrect password');
  }
  function relockCalib(){ setCalibUnlocked(false); setPathEdit(null); }
  function onBoardClick(e){ 
    if(!calibUnlocked) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const x=((e.clientX-rect.left)/rect.width)*100;
    const y=((e.clientY-rect.top)/rect.height)*100;
    const i=Number(prompt('Index to move (0..'+BOARD_SIZE+')'));
    if(!Number.isFinite(i)||i<0||i>BOARD_SIZE)return;
    setPathEdit(p=>{ const copy=p.slice(); copy[i]=[Number(x.toFixed(3)),Number(y.toFixed(3))]; return copy; });
  }
  function exportCalibration(){ 
    if(!calibUnlocked) return alert('Unlock first');
    const data={version:CALIBRATION_LOCK.version||'58',path:pathEdit};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='legislate-calibration-export.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  return React.createElement(React.Fragment,null,
    React.createElement('div',{className:'controls'},
      React.createElement('button',{onClick:roll},'Roll'),
      calibUnlocked ? 
        React.createElement(React.Fragment,null,
          React.createElement('button',{onClick:exportCalibration},'Export'),
          React.createElement('button',{onClick:relockCalib},'Relock')
        ) :
        React.createElement('button',{onClick:unlockCalib},'Unlock calibration')
    ),
    React.createElement('div',{className:'board-wrap',onClick:onBoardClick},
      React.createElement('div',{className:'board-img'}),
      players.map((p,idx)=>{
        const pos=positions[idx], pt=path[pos]||[0,0];
        return React.createElement('div',{key:idx,className:'token',style:{left:pt[0]+'%',top:pt[1]+'%',background:p.color}},idx+1);
      })
    ),
    toast && React.createElement('div',{className:'toast'},toast)
  );
}
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
})();
