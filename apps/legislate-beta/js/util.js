
function $(sel, parent=document){ return parent.querySelector(sel); }
function $all(sel, parent=document){ return Array.from(parent.querySelectorAll(sel)); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function downloadJSON(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
function shuffle(array, rng=Math.random){ for(let i=array.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [array[i],array[j]]=[array[j],array[i]];} return array; }
