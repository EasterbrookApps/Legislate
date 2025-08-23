import { Config } from '../../config/index.js';

export function createBoardRenderer({ imgEl, tokensLayer, board }) {
  function measure() {
    const rect = imgEl.getBoundingClientRect();
    return { w: rect.width, h: rect.height, x: rect.x, y: rect.y };
  }

  function tokenRadius(playerCount) {
    const w = measure().w;
    const density = [1,1,1,0.95,0.9,0.85,0.8][playerCount] || 0.8;
    const r = Math.round(w * Config.tokenBaseFactor * density);
    return Math.max(Config.tokenMin, Math.min(Config.tokenMax, r));
  }

  function placeTokens(players) {
    const { w, h } = measure();
    const r = tokenRadius(players.length);
    tokensLayer.innerHTML = '';
    // group by position
    const byPos = new Map();
    for (const p of players) {
      const key = p.position;
      if (!byPos.has(key)) byPos.set(key, []);
      byPos.get(key).push(p);
    }
    // Build token elements
    for (const [idx, group] of byPos.entries()) {
      const space = board.spaces.find(s => s.index === idx);
      if (!space) continue;
      const cx = (space.x / 100) * w;
      const cy = (space.y / 100) * h;
      const count = group.length;
      for (let i=0; i<count; i++) {
        const p = group[i];
        const angle = (Math.PI * 2 * i) / Math.max(1, count);
        const rad = r * Config.overlapRadiusFactor * (count > 1 ? 1 : 0);
        const x = cx + Math.cos(angle) * rad;
        const y = cy + Math.sin(angle) * rad;
        const div = document.createElement('div');
        div.className = 'token';
        div.style.width = `${r*2}px`;
        div.style.height = `${r*2}px`;
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.background = p.color;
        div.title = `${p.name} @ ${idx}`;
        tokensLayer.appendChild(div);
      }
    }
  }

  window.addEventListener('resize', () => {
    // On resize, just re-place tokens with same positions
    const markers = [...tokensLayer.querySelectorAll('.token')];
    if (markers.length) tokensLayer.innerHTML = ''; // will be re-rendered on next state update
  });

  return { placeTokens, tokenRadius };
}
