// server/server.js — multiplayer WS server for Legislate?! (verbose debug)

require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ------------------------------ Config / Helpers ----------------------------

const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function originAllowed(origin) {
  return !ALLOWED.length || ALLOWED.includes(origin || '');
}

// Tiny pretty printer
function toStr(v) {
  try { return typeof v === 'string' ? v : JSON.stringify(v); }
  catch { return String(v); }
}

// Room-scoped broadcaster
function roomBroadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  }
}

// Room-scoped + server log debug
function debug(room, ...args) {
  const line = args.map(toStr).join(' ');
  console.log('[DEBUG]', line);
  if (room) {
    roomBroadcast(room, { type: 'DEBUG', payload: line });
  }
}

// ------------------------------ Load assets --------------------------------

// LOCAL repo path to the active pack (not a web URL)
const PACK_DIR = '../apps/legislate-test/assets/packs/uk-parliament';
const ASSETS = path.resolve(__dirname, PACK_DIR);

const board = JSON.parse(
  fs.readFileSync(path.join(ASSETS, 'board.json'), 'utf8')
);
const decks = {
  commons: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/commons.json'), 'utf8')),
  early: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/early.json'), 'utf8')),
  lords: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/lords.json'), 'utf8')),
  pingpong: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/pingpong.json'), 'utf8')),
  implementation: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/implementation.json'), 'utf8')),
};

// ------------------------------ Load engine --------------------------------

// Evaluate the browser engine in a VM so we can use it in Node
const enginePath = path.resolve(__dirname, '../apps/legislate-test/js/engine.js');
const engineCode = fs.readFileSync(enginePath, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);
const { createEngine, makeRng } = sandbox.window.LegislateEngine;

// ------------------------------ Rooms --------------------------------------

/** Map<roomCode, { engine, clients:Set<WebSocket>, seq:number }> */
const rooms = new Map();

function getOrCreateRoom(code, playerCount = 4) {
  if (rooms.has(code)) return rooms.get(code);

  const rng = makeRng(Date.now() ^ Math.floor(Math.random() * 1e9));
  const engine = createEngine({ board, decks, rng, playerCount });
  const room = { engine, clients: new Set(), seq: 0 };

  // Relay ALL engine events to clients with sequencing + debug
  engine.bus.on('*', (type, payload) => {
    room.seq += 1;
    const msg = { type, payload, seq: room.seq };
    debug(room, 'BUS', type, payload && payload.playerId ? `p=${payload.playerId}` : '');
    roomBroadcast(room, msg);
  });

  rooms.set(code, room);
  debug(room, 'ROOM_CREATED', code, `players=${playerCount}`);
  return room;
}

// ------------------------------ HTTP server --------------------------------

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404).end();
});

// ------------------------------ WebSocket ----------------------------------

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    console.warn('WS upgrade blocked for origin:', origin);
    socket.destroy();
    return;
  }
  if (req.url !== '/game') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (ws, req) => {
  let room = null;

  // helper to send debug before room is known
  function wsDebug(...args) {
    const line = args.map(toStr).join(' ');
    console.log('[DEBUG]', line);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'DEBUG', payload: line }));
    }
  }

  wsDebug('WS_CONNECTED', req.headers['x-forwarded-for'] || req.socket.remoteAddress);

  ws.on('message', async (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { wsDebug('BAD_JSON'); return; }

    if (msg.type === 'JOIN') {
      const code = (msg.roomCode || '').trim().toUpperCase();
      const count = Number(msg.playerCount) || 4;
      if (!code) { wsDebug('JOIN missing code'); return; }

      room = getOrCreateRoom(code, count);
      room.clients.add(ws);

      // If playerCount is different, reflect it (safe reset of seats)
      if (count !== room.engine.state.players.length) {
        debug(room, 'SET_PLAYER_COUNT', count);
        room.engine.setPlayerCount(count);
      }

      ws.send(JSON.stringify({
        type: 'JOIN_OK',
        payload: { state: room.engine.state, endIndex: room.engine.endIndex, seq: room.seq }
      }));
      debug(room, 'JOIN_OK sent', code, `clients=${room.clients.size}`);
      return;
    }

    if (!room) { wsDebug('NO_ROOM_FOR_MSG', msg.type); return; }

    const { engine } = room;

    if (msg.type === 'ROLL') {
      debug(room, 'ROLL');
      // takeTurn() emits DICE_ROLL -> MOVE_STEP... via the bus listener we attached
      await engine.takeTurn();
      return;
    }

    if (msg.type === 'RESOLVE_CARD') {
      debug(room, 'RESOLVE_CARD');
      engine.bus.emit('CARD_RESOLVE');
      return;
    }

    if (msg.type === 'RESET') {
      debug(room, 'RESET');
      engine.reset();
      return;
    }

    if (msg.type === 'RENAME') {
      const i = Number(msg.index);
      const name = String(msg.name || '').trim().slice(0, 40);
      if (!Number.isInteger(i) || !engine.state.players[i]) { debug(room, 'RENAME_INVALID', i); return; }
      engine.state.players[i].name = name;
      debug(room, 'RENAME_OK', `i=${i}`, name);
      roomBroadcast(room, { type: 'PLAYER_RENAMED', payload: { index: i, name } });
      return;
    }

    wsDebug('UNKNOWN_TYPE', msg.type);
  });

  ws.on('close', () => {
    if (room) {
      room.clients.delete(ws);
      debug(room, 'WS_CLOSED', `clients=${room.clients.size}`);
    } else {
      console.log('[DEBUG] WS_CLOSED (no room)');
    }
  });
});

// ------------------------------ Boot ---------------------------------------

const PORT = Number(process.env.PORT || 10000);
server.listen(PORT, () => {
  console.log(`Legislate?! WS server on :${PORT}  (path: /game)`);
});