// storage.js — robust localStorage wrapper
window.LegislateStorage = (function () {
  const KEY = 'legislate.v1.save';

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      // ignore quota/serialization errors
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      // ignore
    }
  }

  return { save, load, clear, KEY };
})();