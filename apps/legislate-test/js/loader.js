// loader.js — fetches pack assets from /assets/packs/<packId>/
(function(){
  function basePath(){
    // Compute base path for the current app directory (e.g. .../apps/legislate-test/)
    const u = new URL('.', window.location.href);
    return u.pathname.endsWith('/') ? u.pathname : (u.pathname + '/');
  }
  function withBase(rel){
    const clean = (rel||'').replace(/^\/+/, '');
    return window.location.origin + basePath() + clean;
  }
  async function fetchJSON(url){
    const res = await fetch(url + '?cb=' + Date.now());
    if (!res.ok) throw new Error('Failed to load ' + url);
    return res.json();
  }

  async function loadPack(packId){
    const root = `assets/packs/${packId}`;
    const board = await fetchJSON(withBase(`${root}/board.json`));

    // Try a known set of deck files; skip missing
    const deckNames = ['commons','early','implementation','lords','pingpong'];
    const decks = {};
    for (const name of deckNames){
      const url = withBase(`${root}/cards/${name}.json`);
      try{
        decks[name] = await fetchJSON(url);
      }catch(e){
        // skip missing
      }
    }
    const meta = { id: packId, boardImage: withBase('assets/board.png') };
    return { meta, board, decks };
  }

  window.LegislateLoader = { basePath, withBase, fetchJSON, loadPack };
})();
