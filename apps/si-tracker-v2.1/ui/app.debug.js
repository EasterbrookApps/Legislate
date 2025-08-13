// app.debug.js — logs the full SI object on detail pages
(function(){
  function logCurrent(){
    try{
      const hash = location.hash || '';
      const m = hash.match(/#\/detail\/(.+)$/);
      if(!m) return;
      const id = decodeURIComponent(m[1]);
      fetch('./data/instruments.json')
        .then(r=>r.json())
        .then(arr=>{
          const si = (arr||[]).find(x=> x.id===id);
          console.log('[SI DEBUG]', { id, si });
        })
        .catch(e=> console.warn('[SI DEBUG] load error', e));
    }catch(e){ console.warn('[SI DEBUG]', e); }
  }
  window.addEventListener('hashchange', logCurrent);
  window.addEventListener('DOMContentLoaded', logCurrent);
  logCurrent();
})();
