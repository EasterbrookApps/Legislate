import { Config } from '../config/index.js';

export function saveGame(data) {
  try {
    localStorage.setItem(Config.autosaveKey, JSON.stringify(data));
  } catch {}
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(Config.autosaveKey);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(Config.autosaveKey); } catch {}
}
