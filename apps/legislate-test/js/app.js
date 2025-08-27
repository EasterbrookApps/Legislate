// app.js – last confirmed working version

import { setupEngine } from "./engine.js";
import { setupUI } from "./ui.js";

export function startApp(pack) {
  const state = {
    players: [],
    activePlayerId: null,
    spaces: pack.spaces,
    decks: pack.decks,
  };

  const listeners = {};

  function send(type, payload = {}) {
    if (listeners[type]) {
      listeners[type].forEach((cb) => cb(payload));
    }
  }

  function on(type, cb) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(cb);
  }

  // Setup
  setupEngine({ state, send, on });
  setupUI({ state, send, on });

  // Boot event
  console.log("EVT BOOT_OK", "");
  send("BOOT_OK", {});
}