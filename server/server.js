require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ---- Load board & decks (shared assets path) ----
const ASSETS = path.resolve(__dirname, '../apps/legislate-test/assets/packs/uk-parliament');
const board = JSON.parse(fs.readFileSync(path.join(ASSETS, 'board.json')));
const decks = {
  commons: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/commons.json'))),
  early: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/early.json'))),
  lords: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/lords.json'))),
  pingpong: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/pingpong.json'))),
  implementation: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/implementation.json')))
};

// ---- Engine: import your browser engine in Node ----
// Option A: if you've added module.exports in your engine.js
// const { createEngine, makeRng } = require('../apps/legislate-test/js/engine.js');
// Option B: quick inline require by evaluating the file and reading window.LegislateEngine
const vm = require('vm');
const engineCode = fs.readFileSync(path.resolve(__dirname, '../apps/legislate-test/js/engine.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);
const { createEngine, makeRng } = sandbox.window.LegislateEngine;

// ---- HTTP server (WS only) ----
const server = http.createServer((req, res) => {
  // Optional: health check
  if (req.url === '/healthz') { res.writeHead(200).end('ok'); return; }
  res.writeHead(404).end();
});

const wss = new WebSocket.Server({ server, path: '/game' });
const rooms = new Map(); // roomCode -> { engine, clients:Set<ws>, seq, phase }

// Origin check (very light)
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
function originAllowed(origin){ return !ALLOWED.length || ALLOWED.includes(origin || ''); }

function createRoom(roomCode, playerCount=4){
  const rng = makeRng(Date.now() ^ Math.floor(Math.random()*1e9));
  const engine = createEngine({ board, decks, rng, playerCount });
  const room = { engine, clients: new Set(), seq: 0, phase: 'TURN_BEGIN' };

  engine.bus.on('*', (type, payload) => {
    room.seq += 1;
    const msg = JSON.stringify({ type, payload, seq: room.seq });

    // track phase for validation
    if (type === 'DICE_ROLL') room.phase = 'ROLLING';
    if (type === 'MOVE_STEP') room.phase = 'MOVING';
    if (type === 'CARD_DRAWN') room.phase = 'CARD_PENDING';
    if (type === 'CARD_APPLIED' || type === 'TURN_BEGIN') room.phase = 'TURN_BEGIN';
    if (type === 'GAME_END') room.phase = 'ENDED';

    for (const ws of room.clients) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });

  rooms.set(roomCode, room);
  return room;
}

function safeParse(raw){ try { return JSON.parse(raw); } catch { return null; } }

wss.on('connection', (ws, req) => {
  if (!originAllowed(req.headers.origin)) { ws.close(1008, 'origin not allowed'); return; }

  let room = null;
  let playerIndex = null;

  ws.on('message', (raw) => {
    const msg = safeParse(raw);
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'JOIN': {
        const { roomCode, asIndex, playerCount } = msg;
        if (typeof roomCode !== 'string' || !roomCode.trim()) return;

        room = rooms.get(roomCode) || createRoom(roomCode.trim().toUpperCase(), playerCount || 4);
        room.clients.add(ws);

        // naive assignment (improve later: track claimed seats)
        playerIndex = (typeof asIndex === 'number') ? asIndex : room.engine.state.turnIndex;

        const payload = {
          roomCode,
          you: playerIndex,
          state: room.engine.state,
          endIndex: room.engine.endIndex,
          seq: room.seq
        };
        ws.send(JSON.stringify({ type: 'JOIN_OK', payload }));
        return;
      }

      case 'ROLL': {
        if (!room) return;
        if (room.phase !== 'TURN_BEGIN') return;
        if (room.engine.state.turnIndex !== playerIndex) return;
        room.engine.takeTurn();
        return;
      }

      case 'RESOLVE_CARD': {
        if (!room) return;
        if (room.phase !== 'CARD_PENDING') return;
        if (room.engine.state.turnIndex !== playerIndex) return;
        room.engine.bus.emit('CARD_RESOLVE');
        return;
      }

      case 'RENAME': {
        if (!room) return;
        const { index, name } = msg;
        const i = Number(index);
        if (!Number.isInteger(i)) return;
        const safe = String(name || '').slice(0, 40);
        if (!room.engine.state.players[i]) return;
        room.engine.state.players[i].name = safe;

        room.seq += 1;
        const out = JSON.stringify({ type: 'PLAYER_RENAMED', payload: { index: i, name: safe }, seq: room.seq });
        for (const c of room.clients) if (c.readyState === WebSocket.OPEN) c.send(out);
        return;
      }

      case 'RESET': {
        if (!room) return;
        room.engine.reset();
        room.phase = 'TURN_BEGIN';
        return;
      }
    }
  });

  ws.on('close', () => {
    if (room) room.clients.delete(ws);
  });
});

// Boot
const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, () => {
  console.log(`Legislate?! multiplayer server on :${PORT}  (WS path: /game)`);
});