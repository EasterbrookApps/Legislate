export const bus = { on(ev, fn){ (this._[ev] ||= []).push(fn); return () => this.off(ev, fn); },
  off(ev, fn){ this._[ev] = (this._[ev]||[]).filter(f=>f!==fn); },
  emit(ev, payload){ (this._[ev]||[]).forEach(f=>{ try{ f(payload);}catch(e){console.error('bus handler', ev, e);} }); },
  _: {} };