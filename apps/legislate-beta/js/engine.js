// engine.js — tiny hook: mark started on first roll so add/remove hides automatically
window.Engine = window.Engine || {};
const __origAfterRoll = Engine.afterRoll;
Engine.afterRoll = function(n){
  GameState.started = true;
  if (typeof renderPlayersUI === 'function') renderPlayersUI();
  if (typeof __origAfterRoll === 'function') return __origAfterRoll(n);
  // fallback: if original isn't defined here, do nothing else (safe patch)
};
