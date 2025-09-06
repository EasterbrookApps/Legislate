// server/server.js — multiplayer relay for Legislate?!
//
// Runs on Render: provides /healthz and a WebSocket endpoint /game
// Loads board.json + decks from apps/legislate-test and reuses engine.js

require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Allowed Origins --------------------------------------------------------
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function originAllowed(origin) {
  return !ALLOWED.length || ALLOWED.includes(origin || '');
}

// --- Local Assets -----------------------------------------------------------
const PACK_DIR = '../apps/legislate-test/assets/packs/uk-parliament';
const ASSETS = path.resolve(__dirname, PACK_DIR);

const board = JSON.parse(
  fs.readFileSync(path.join(ASSETS, 'board.json'), 'utf8')
);
const decks = {
  commons: JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'cards/commons.json'), 'utf8')
  ),
  early: JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'cards/early.json'), 'utf8')
  ),
  lords: JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'cards/lords.json'), 'utf8')
  ),
  pingpong: JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'cards/pingpong.json'), 'utf8')
  ),
  implementation: JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'cards/implementation.json'), 'utf8')
  ),
};

// --- Load engine.js via VM --------------------------------------------------
const enginePath = path.resolve(
  __dirname,
  '../apps/legislate-test/js/engine.js'
);
const engineCode = fs.readFileSync(enginePath, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);
const { createEngine, makeRng } = sandbox.window.LegislateEngine;

// --- WebSocket Rooms --------------------------------------------------------
const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) {
    const eng = createEngine({
      board,
      decks,
      rng: makeRng(Date.now()),
      playerCount: 4,
    });
    rooms.set(code, { engine: eng, clients: new Set() });
  }
  return rooms.get(code);
}

// --- HTTP Server ------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- WebSocket Server -------------------------------------------------------
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    socket.destroy();
    return;
  }
  if (req.url === '/game') {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', ws => {
  let currentRoom = null;

  ws.on('message', async msgBuf => {
    let msg;
    try {
      msg = JSON.parse(msgBuf.toString());
    } catch {
      return;
    }

    if (msg.type === 'JOIN') {
      const code = (msg.roomCode || '').toUpperCase();
      const room = getRoom(code);
      currentRoom = room;
      room.clients.add(ws);

      // reset players with requested count
      room.engine.setPlayerCount(msg.playerCount || 4);

      ws.send(
        JSON.stringify({
          type: 'JOIN_OK',
          payload: { state: room.engine.state },
        })
      );
      return;
    }

    if (!currentRoom) return;
    const { engine, clients } = currentRoom;

    if (msg.type === 'ROLL') {
      await engine.takeTurn();
      // broadcast bus events
      engine.bus.on('*', (type, payload) => {
        clients.forEach(c => {
          if (c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify({ type, payload }));
          }
        });
      });
      return;
    }

    if (msg.type === 'RESOLVE_CARD') {
      engine.bus.emit('CARD_RESOLVE');
      return;
    }

    if (msg.type === 'RESET') {
      engine.reset();
      clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(
            JSON.stringify({
              type: 'TURN_BEGIN',
              payload: {
                playerId: engine.state.players[0].id,
                index: 0,
              },
            })
          );
        }
      });
      return;
    }

    if (msg.type === 'RENAME') {
      const { index, name } = msg;
      if (
        index >= 0 &&
        index < engine.state.players.length &&
        typeof name === 'string'
      ) {
        engine.state.players[index].name = name.trim();
        clients.forEach(c => {
          if (c.readyState === WebSocket.OPEN) {
            c.send(
              JSON.stringify({
                type: 'PLAYER_RENAMED',
                payload: { index, name: engine.state.players[index].name },
              })
            );
          }
        });
      }
      return;
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.clients.delete(ws);
    }
  });
});

// --- Start ------------------------------------------------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Legislate?! multiplayer server running on ${PORT}`);
});