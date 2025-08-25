// Loads the active pack (board + decks) from assets/packs/<packId>/
window.LegislateLoader = (function(){
  let base = 'assets/packs';

  function withBase(newBase){ base = newBase || base; return api; }

  async function getJSON(url){
    const res = await fetch(url + '?cb=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function loadPack(packId){
    const root = `${base}/${packId}`;
    const board = await getJSON(`${root}/board.json`);

    const decks = {};
    const names = ['early','commons','lords','implementation','pingpong'];
    for (const n of names){
      try { decks[n] = await getJSON(`${root}/cards/${n}.json`); }
      catch { decks[n] = []; } // deck optional
    }
    return { board, decks };
  }

  const api = { withBase, loadPack };
  return api;
})();