// loader.js — pack loader (UK Parliament)
window.LegislateLoader = (function(){
  const BASE = './assets/packs/uk-parliament';
  const DECKS = ['commons','early','implementation','lords','pingpong'];

  async function fetchJSON(path){
    const res = await fetch(path, { cache: 'no-store' });
    if(!res.ok) throw new Error('Failed to fetch '+path);
    return res.json();
  }

  async function loadPack(){
    const board = await fetchJSON(`${BASE}/board.json`);
    const decks = {};
    for (const name of DECKS){
      try { decks[name] = await fetchJSON(`${BASE}/cards/${name}.json`); }
      catch { decks[name] = []; }
    }
    return { board, decks };
  }

  return { loadPack };
})();