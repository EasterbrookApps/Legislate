export function createEventBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      (listeners.get(type) || []).forEach(fn => fn(payload));
      (listeners.get('*') || []).forEach(fn => fn(type, payload));
    }
  };
}
