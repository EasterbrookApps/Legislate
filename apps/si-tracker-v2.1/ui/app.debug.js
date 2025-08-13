// app.debug.js — logs the current SI object to console on detail pages
(function(){
  function logDetail(){
    const hash = location.hash || '';
    if(!hash.startsWith('#/detail/')) return;
    const id = decodeURIComponent(hash.split('/')[2]||'');
    fetch('./data/instruments.json')
      .then(r=>r.json())
      .then(list=>{
        const si = list.find(x=> x.id===id);
        console.log('[SI DEBUG]', { id, si });
        if(!si){ console.warn('[SI DEBUG] Not found in instruments.json'); }
      })
      .catch(err=> console.error('[SI DEBUG] Load error', err));
  }
  window.addEventListener('hashchange', logDetail);
  window.addEventListener('DOMContentLoaded', logDetail);
  logDetail();
})();