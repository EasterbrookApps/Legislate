// debug.js — legacy always-on <pre id="dbg-log">
(function () {
  function sink(){
    let el = document.getElementById('dbg-log');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'dbg-log';
      el.style.cssText = 'max-height:200px;overflow:auto;background:#111;color:#0f0;font-size:12px;padding:6px;margin:0;white-space:pre-wrap;';
      document.body.appendChild(el);
    }
    return el;
  }
  const out = sink();
  function write(kind, payload){
    const ts = new Date().toISOString();
    const line = `[${ts}] ${kind} ${typeof payload==='string'?payload:JSON.stringify(payload||'')}`;
    out.textContent += line + '\n';
    out.scrollTop = out.scrollHeight;
  }
  window.LegislateDebug = { log: write, info: write, error: write };
  write('INFO','[debug enabled]');
})();