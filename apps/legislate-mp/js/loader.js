// loader.js — resilient pack loader for GitHub Pages, CodePen, local
// API: window.LegislateLoader.loadPack(packName?: string) -> Promise<{ board, decks }>

window.LegislateLoader = (function () {
  const DEFAULT_PACK = "uk-parliament";
  const DECKS = ["commons", "early", "implementation", "lords", "pingpong"];

  // --- CONFIG ---
  // Your live GitHub Pages base:
  const LIVE_PAGES_BASE =
    "https://easterbrookapps.github.io/Legislate/apps/legislate-test/assets/packs";

  // Raw GitHub base (works cross-origin). Set your branch:
  const RAW_BRANCH = "main"; // change if assets live on a different branch
  const RAW_REPO_BASE =
    "https://raw.githubusercontent.com/easterbrookapps/Legislate/" +
    RAW_BRANCH +
    "/apps/legislate-test/assets/packs";

  // Detect CodePen (covers codepen.io & cdpn.io preview hosts)
  const IS_CODEPEN =
    /(^|\.)codepen\.io$/.test(location.hostname) ||
    /(^|\.)cdpn\.io$/.test(location.hostname) ||
    /\bcodepen\b/i.test(location.hostname);

  function basesFor(pack) {
    // Highest priority: explicit override (useful in CodePen Assets, etc.)
    const overrides = [];
    if (typeof window.LEGISLATE_PACK_BASE === "string" && window.LEGISLATE_PACK_BASE.trim()) {
      overrides.push(trimSlash(window.LEGISLATE_PACK_BASE) + "/" + pack);
    }

    const relative = "./assets/packs/" + pack;
    const pages = LIVE_PAGES_BASE.replace(/\/$/, "") + "/" + pack;
    const raw = RAW_REPO_BASE.replace(/\/$/, "") + "/" + pack;

    // In CodePen, relative will 404/CORS; try Pages then Raw first
    if (IS_CODEPEN) {
      return [...overrides, pages, raw, relative];
    }
    // On GitHub Pages/local, prefer relative, then Pages, then Raw
    return [...overrides, relative, pages, raw];
  }

  function trimSlash(s) {
    return s.replace(/\/+$/, "");
  }

  async function fetchJSON(url) {
    // Explicit CORS mode; cache-bust helps with CodePen reloads
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "_ts=" + Date.now(), {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return res.json();
  }

  async function tryMany(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const json = await fetchJSON(url);
        try {
          window.LegislateDebug?.log?.("LOAD_OK", { url });
        } catch {}
        return { json, url };
      } catch (err) {
        lastErr = err;
        try {
          window.LegislateDebug?.log?.("LOAD_TRY_FAIL", { url, error: String(err) });
        } catch {}
      }
    }
    throw lastErr || new Error("Failed to fetch any candidate URL");
  }

  async function loadPack(packName = DEFAULT_PACK) {
    const bases = basesFor(packName);

    // Board
    const boardTry = bases.map((b) => `${b}/board.json`);
    const { json: board, url: boardURL } = await tryMany(boardTry);

    // Decks
    const decks = {};
    for (const name of DECKS) {
      const deckTry = bases.map((b) => `${b}/cards/${name}.json`);
      try {
        const { json, url } = await tryMany(deckTry);
        decks[name] = json;
        try {
          window.LegislateDebug?.log?.("DECK_OK", { deck: name, url });
        } catch {}
      } catch (e) {
        // Non-fatal: allow boot without a deck
        decks[name] = [];
        try {
          window.LegislateDebug?.log?.("DECK_MISSING", { deck: name, error: String(e) });
        } catch {}
      }
    }

    // Helpful summary
    try {
      window.LegislateDebug?.log?.("PACK_BASES", { chosenForBoard: boardURL, candidates: bases });
    } catch {}

    return { board, decks };
  }

  return { loadPack };
})();
