// loader.js — pack loader with CodePen/GitHub fallback
// API: window.LegislateLoader.loadPack(packName?: string) -> Promise<{ board, decks }>
window.LegislateLoader = (function () {
  const DEFAULT_PACK = 'uk-parliament';
  const DECKS = ['commons', 'early', 'implementation', 'lords', 'pingpong'];

  // Change this if you ever move the live assets
  const LIVE_PACKS_BASE = 'https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs';

  function decidedBaseFor(pack) {
    // Optional explicit override for tests/debug:
    //   window.LEGISLATE_PACK_BASE = 'https://example.com/packs';
    if (typeof window.LEGISLATE_PACK_BASE === 'string' && window.LEGISLATE_PACK_BASE.trim()) {
      return window.LEGISLATE_PACK_BASE.replace(/\/$/, '') + '/' + pack;
    }
    // Use absolute on CodePen, relative elsewhere (GitHub Pages/local)
    return location.hostname.includes('codepen.io')
      ? `${LIVE_PACKS_BASE}/${pack}`
      : `./assets/packs/${pack}`;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch ' + url);
    return res.json();
  }

  // Try one URL, then the other (helps when running in CodePen or locally)
  async function fetchWithFallback(primaryUrl, fallbackUrl) {
    try {
      return await fetchJSON(primaryUrl);
    } catch (firstErr) {
      try {
        return await fetchJSON(fallbackUrl);
      } catch (secondErr) {
        try {
          window.LegislateDebug?.log?.('LOAD_FAIL', {
            primary: primaryUrl,
            fallback: fallbackUrl,
            first: String(firstErr),
            second: String(secondErr),
          });
        } catch {}
        throw secondErr;
      }
    }
  }

  async function loadPack(packName = DEFAULT_PACK) {
    const relBase = `./assets/packs/${packName}`;
    const absBase = `${LIVE_PACKS_BASE}/${packName}`;
    const base = decidedBaseFor(packName);

    // Board: try the decided base first, then the opposite as a fallback
    const board = await (base.startsWith('http')
      ? fetchWithFallback(`${absBase}/board.json`, `${relBase}/board.json`)
      : fetchWithFallback(`${relBase}/board.json`, `${absBase}/board.json`)
    );

    // Decks: same fallback pattern; missing decks resolve to []
    const decks = {};
    for (const name of DECKS) {
      const rel = `${relBase}/cards/${name}.json`;
      const abs = `${absBase}/cards/${name}.json`;
      try {
        decks[name] = await (base.startsWith('http')
          ? fetchWithFallback(abs, rel)
          : fetchWithFallback(rel, abs)
        );
      } catch (e) {
        decks[name] = []; // don’t block boot if a deck is absent
        try { window.LegislateDebug?.log?.('DECK_MISSING', { deck: name, error: String(e) }); } catch {}
      }
    }

    return { board, decks };
  }

  return { loadPack };
})();
