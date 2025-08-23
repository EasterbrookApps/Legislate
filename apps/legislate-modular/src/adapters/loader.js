export async function loadRegistry() {
  const res = await fetch('./content/registry.json?cb=' + Date.now());
  if (!res.ok) throw new Error('Failed to load registry');
  return res.json();
}

export async function loadPack(id, registry) {
  const pack = (registry || []).find(p => p.id === id) || registry[0];
  const base = pack.path;
  const [meta, board, commons, early, implementation, lords, pingpong] = await Promise.all([
    fetch(`./${base}/meta.json?cb=`+Date.now()).then(r=>r.json()),
    fetch(`./${base}/board.json?cb=`+Date.now()).then(r=>r.json()),
    fetch(`./${base}/cards/commons.json?cb=`+Date.now()).then(r=>r.json()),
    fetch(`./${base}/cards/early.json?cb=`+Date.now()).then(r=>r.json()),
    fetch(`./${base}/cards/implementation.json?cb=`+Date.now()).then(r=>r.json()),
    fetch(`./${base}/cards/lords.json?cb=`+Date.now()).then(r=>r.json()),
    fetch(`./${base}/cards/pingpong.json?cb=`+Date.now()).then(r=>r.json()),
  ]);
  return { meta, board, decks: { commons, early, implementation, lords, pingpong } };
}
