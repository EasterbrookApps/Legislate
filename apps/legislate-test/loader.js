
window.LegislateLoader = (function(){
  function basePath(){
    const u = new URL('.', window.location.href);
    return u.pathname.endsWith('/') ? u.pathname : (u.pathname + '/');
  }
  function withBase(rel){
    const clean = (rel||'').replace(/^\//,'');
    return window.location.origin + basePath() + clean;
  }
  async function getJSON(rel){
    const res = await fetch(withBase(rel + '?cb=' + Date.now()));
    if (!res.ok) throw new Error('Failed to load ' + rel);
    return res.json();
  }
  async function loadRegistry(){ return getJSON('content/registry.json'); }
  async function loadPack(id, registry){
    const pack = (registry||[]).find(p=>p.id===id) || registry[0];
    const base = pack.path;
    const [meta, board, commons, early, implementation, lords, pingpong] = await Promise.all([
      getJSON(`${base}/meta.json`),
      getJSON(`${base}/board.json`),
      getJSON(`${base}/cards/commons.json`),
      getJSON(`${base}/cards/early.json`),
      getJSON(`${base}/cards/implementation.json`),
      getJSON(`${base}/cards/lords.json`),
      getJSON(`${base}/cards/pingpong.json`),
    ]);
    return { meta, board, decks: { commons, early, implementation, lords, pingpong } };
  }
  return { basePath, withBase, loadRegistry, loadPack };
})();
