// server/server.js — multiplayer WS server for Legislate?! (seats + presence)

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

function toStr(v) { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); } }
function roomBroadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}
function debug(room, ...args) {
  const line = args.map(toStr).join(' ');
  console.log('[DEBUG]', line);
  if (room) roomBroadcast(room, { type: 'DEBUG', payload: line });
}
function countPresent(state) {
  return state.players.reduce((n, p) => n + (p.present ? 1 : 0), 0);
}

// ------------------------------ Load assets --------------------------------

const PACK_DIR = '../apps/legislate-test/assets/packs/uk-parliament';
const ASSETS = path.resolve(__dirname, PACK_DIR);

const board = JSON.parse(fs.readFileSync(path.join(ASSETS, 'board.json'), 'utf8'));
const decks = {
  commons: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/commons.json'), 'utf8')),
  early: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/early.json'), 'utf8')),
  lords: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/lords.json'), 'utf8')),
  pingpong: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/pingpong.json'), 'utf8')),
  implementation: JSON.parse(fs.readFileSync(path.join(ASSETS, 'cards/implementation.json'), 'utf8')),
};

// ------------------------------ Load engine --------------------------------

const enginePath = path.resolve(__dirname, '../apps/legislate-test/js/engine.js');
const engineCode = fs.readFileSync(enginePath, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);
const { createEngine, makeRng } = sandbox.window.LegislateEngine;

// ------------------------------ Rooms --------------------------------------

/** Map<roomCode, { engine, clients:Set<WebSocket>, seats: Map<WebSocket,number>, seq:number }> */
const rooms = new Map();

function initPresenceFlags(state) {
  // add stable 'present' flag if missing
  state.players.forEach(p => { if (typeof p.present !== 'boolean') p.present = false; });
}

function getOrCreateRoom(code, playerCount = 4) {
  if (rooms.has(code)) return rooms.get(code);

  const rng = makeRng(Date.now() ^ Math.floor(Math.random() * 1e9));
  const engine = createEngine({ board, decks, rng, playerCount });

  initPresenceFlags(engine.state);

  const room = { engine, clients: new Set(), seats: new Map(), seq: 0 };

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

function nextFreeSeat(state) {
  for (let i = 0; i < state.players.length; i++) {
    if (!state.players[i].present) return i;
  }
  return -1;
}

function ensureTurnOnPresent(room) {
  const s = room.engine.state;
  if (countPresent(s) === 0) return;
  let guard = 0;
  while (!s.players[s.turnIndex].present && guard < s.players.length + 2) {
    room.engine.endTurn(false); // advance until we’re on a present seat
    guard++;
  }
}

// ------------------------------ HTTP server --------------------------------

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') return res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  return res.writeHead(404).end();
});

// ------------------------------ WebSocket ----------------------------------

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    console.warn('WS upgrade blocked for origin:', origin);
    socket.destroy(); return;
  }
  if (req.url !== '/game') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (ws, req) => {
  let room = null;

  ws.on('message', async (buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (msg.type === 'JOIN') {
      const code = (msg.roomCode || '').trim().toUpperCase();
      const count = Number(msg.playerCount) || 4;
      if (!code) return;

      room = getOrCreateRoom(code, count);
      room.clients.add(ws);

      // Resize seats if playerCount changed
      if (count !== room.engine.state.players.length) {
        room.engine.setPlayerCount(count);
        initPresenceFlags(room.engine.state);
      }

      // Assign seat
      let seat = nextFreeSeat(room.engine.state);
      if (seat === -1) {
        // room full for now — join as spectator
        seat = null;
        debug(room, 'SPECTATOR_JOIN', code);
      } else {
        room.engine.state.players[seat].present = true;
        room.seats.set(ws, seat);
        debug(room, 'SEAT_ASSIGNED', `seat=${seat}`);
        roomBroadcast(room, { type: 'PLAYER_PRESENT', payload: { index: seat, name: room.engine.state.players[seat].name } });
        ensureTurnOnPresent(room);
      }

      ws.send(JSON.stringify({
        type: 'JOIN_OK',
        payload: {
          state: room.engine.state,
          seatIndex: seat,
          presentCount: countPresent(room.engine.state),
          endIndex: room.engine.endIndex,
          seq: room.seq
        }
      }));
      debug(room, 'JOIN_OK', `seat=${seat}`, `present=${countPresent(room.engine.state)}`);
      return;
    }

    if (!room) return;

    const { engine } = room;

    if (msg.type === 'ROLL') {
      const seat = room.seats.get(ws);
      const present = countPresent(engine.state);
      if (present < 2) { debug(room, 'ROLL_BLOCKED_MIN_PLAYERS', present); return; }
      if (seat == null) { debug(room, 'ROLL_BLOCKED_SPECTATOR'); return; }
      if (engine.state.turnIndex !== seat) { debug(room, 'ROLL_BLOCKED_NOT_TURN', `want=${seat}`, `turn=${engine.state.turnIndex}`); return; }

      debug(room, 'ROLL_OK', `seat=${seat}`);
      await engine.takeTurn(); // bus relays
      ensureTurnOnPresent(room);
      return;
    }

    if (msg.type === 'RESOLVE_CARD') {
      debug(room, 'RESOLVE_CARD');
      engine.bus.emit('CARD_RESOLVE');
      ensureTurnOnPresent(room);
      return;
    }

    if (msg.type === 'RESET') {
      debug(room, 'RESET');
      engine.reset();
      initPresenceFlags(engine.state);
      // Keep current present seats as-is (don’t auto-clear)
      for (const [client, idx] of room.seats.entries()) {
        if (engine.state.players[idx]) engine.state.players[idx].present = true;
      }
      ensureTurnOnPresent(room);
      roomBroadcast(room, { type: 'TURN_BEGIN', payload: { playerId: engine.state.players[engine.state.turnIndex].id, index: engine.state.turnIndex } });
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
  });

  ws.on('close', () => {
    if (!room) return;
    const seat = room.seats.get(ws);
    room.clients.delete(ws);
    if (seat != null && room.engine.state.players[seat]) {
      room.engine.state.players[seat].present = false;
      room.seats.delete(ws);
      debug(room, 'PLAYER_LEFT', `seat=${seat}`, `present=${countPresent(room.engine.state)}`);
      roomBroadcast(room, { type: 'PLAYER_LEFT', payload: { index: seat } });
      ensureTurnOnPresent(room);
    } else {
      debug(room, 'SPECTATOR_LEFT');
    }
  });
});

// ------------------------------ Boot ---------------------------------------

const PORT = Number(process.env.PORT || 10000);
server.listen(PORT, () => {
  console.log(`Legislate?! WS server on :${PORT}  (path: /game)`);
});