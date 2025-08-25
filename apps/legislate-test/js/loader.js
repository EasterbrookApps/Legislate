// Step 4 — Simple pack loader (uk-parliament)
window.LegislateLoader = (function(){
  const PACK_ROOT = './content/uk-parliament';

  async function fetchJson(path){
    const res = await fetch(path, { cache: 'no-store' });
    if(!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return res.json();
  }

  async function loadPack() {
    let board;
    try {
      board = await fetchJson(`${PACK_ROOT}/board.json`);
    } catch {
      board = {
        spaces: Array.from({length:40}, (_,i)=>({ index:i, deck:'none' })),
        asset: './assets/board.png'
      };
    }

    const deckNames = ['early','commons','lords','pingpong','implementation'];
    const decks = {};
    for (const name of deckNames){
      try {
        decks[name] = await fetchJson(`${PACK_ROOT}/cards/${name}.json`);
      } catch {}
    }
    return { board, decks };
  }

  return { loadPack };
})();