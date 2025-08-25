<!-- /js/loader.js -->
<script>
window.LegislateLoader = (function(){
  const DBG = window.LegislateDebug || { event(){}, log(){}, error(){} };

  async function getJSON(url){
    const u = new URL(url, window.location.href);
    u.searchParams.set('cb', Date.now()); // bust caches on GH Pages
    const res = await fetch(u.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${u.pathname}`);
    return res.json();
  }

  async function findPackRoot(){
    const candidates = [
      './assets/packs/uk-parliament',  // your new structure
      './assets/uk-parliament',        // older “assets” variant
      './content/uk-parliament',       // legacy modular path
    ];
    for (const root of candidates){
      try { await getJSON(`${root}/board.json`); return root; }
      catch { /* try next */ }
    }
    throw new Error('Could not locate board.json (tried assets/packs…, assets/…, content/…).');
  }

  function normalizeBoard(board){
    if (!board || !Array.isArray(board.spaces)) return board;
    // If it looks like coords are 0–1, convert once to percentages
    const looksFractional = board.spaces.some(s => typeof s.x === 'number' && s.x > 0 && s.x <= 1);
    if (looksFractional){
      board.spaces = board.spaces.map(s => {
        const x = (typeof s.x === 'number') ? (s.x * 100) : s.x;
        const y = (typeof s.y === 'number') ? (s.y * 100) : s.y;
        return { ...s, x, y };
      });
    }
    return board;
  }

  async function loadPack(){
    const root = await findPackRoot();

    const board = normalizeBoard(await getJSON(`${root}/board.json`));

    async function maybe(file){
      try { return await getJSON(`${root}/cards/${file}`); }
      catch { return []; } // missing deck is okay for now
    }
    const [commons, early, implementation, lords, pingpong] = await Promise.all([
      maybe('commons.json'),
      maybe('early.json'),
      maybe('implementation.json'),
      maybe('lords.json'),
      maybe('pingpong.json'),
    ]);
    const decks = { commons, early, implementation, lords, pingpong };

    const loadedDecks = Object.entries(decks)
      .filter(([,arr]) => Array.isArray(arr) && arr.length)
      .map(([k]) => k);

    // Emit a debug event so we can see what actually loaded
    DBG.event && DBG.event('PACK', {
      root,
      spaces: Array.isArray(board?.spaces) ? board.spaces.length : 0,
      decks: loadedDecks
    });

    return { board, decks };
  }

  return { loadPack };
})();
</script>