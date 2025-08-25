// Debug panel (feature-flagged with ?debug=1). No gameplay logic touched.
(function () {
  const qs = new URLSearchParams(location.search);
  const ENABLED = qs.get('debug') === '1';

  // Expose a stable API even when disabled
  const DBG = {
    enabled: ENABLED,
    info:  noop, log:  noop, event: noop, error: noop,
    clear: noop, download: noop, collapse: noop, expand: noop,
  };
  window.LegislateDebug = DBG;

  if (!ENABLED) return;

  // ---- panel UI ----
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed', left: '0', right: '0', bottom: '0',
    background: '#fff', borderTop: '1px solid #b1b4b6',
    boxShadow: '0 -2px 10px rgba(0,0,0,.06)', zIndex: '2147483647'
  });

  const bar  = document.createElement('div');
  Object.assign(bar.style, {
    display: 'flex', alignItems: 'center', gap: '.5rem',
    padding: '.5rem 1rem', borderBottom: '1px solid #eee'
  });
  bar.innerHTML = `<strong style="font:600 1rem system-ui">Debug</strong>`;

  const btn = (label) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      border: '1px solid #b1b4b6', padding: '.25rem .6rem',
      borderRadius: '.35rem', background: '#f3f2f1', cursor: 'pointer'
    });
    return b;
  };

  const btnDownload = btn('Download');
  const btnClear    = btn('Clear');
  const btnToggle   = btn('Collapse');
  bar.append(btnDownload, btnClear, btnToggle);

  const pre = document.createElement('pre');
  pre.id = 'dbg-log';
  Object.assign(pre.style, {
    margin: 0, padding: '.75rem 1rem', maxHeight: '35vh',
    overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '12px', whiteSpace: 'pre-wrap'
  });

  root.append(bar, pre);
  document.body.appendChild(root);

  // Auto-stick to bottom when new lines arrive
  const stick = () => { pre.scrollTop = pre.scrollHeight; };

  // ---- helpers ----
  function ts() { return new Date().toISOString(); }
  function line(kind, data) {
    const payload = (data === undefined) ? '' :
      (typeof data === 'string' ? data : ' ' + JSON.stringify(data));
    return `[${ts()}] ${kind}${payload}\n`;
  }
  function write(kind, data) {
    pre.textContent += line(kind, data);
    stick();
  }

  function noop(){}

  // Wire API now that panel exists
  DBG.info  = (d) => write('INFO', d);
  DBG.log   = (d) => write('LOG', d);
  DBG.event = (d) => write('EVT ' + (d && d.type ? d.type : ''), d && d.payload ? d.payload : d);
  DBG.error = (d) => write('ERROR', d);
  DBG.clear = () => { pre.textContent = ''; };
  DBG.download = () => {
    const blob = new Blob([pre.textContent], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `legislate-debug-${Date.now()}.log`;
    a.click(); URL.revokeObjectURL(url);
  };

  let collapsed = false;
  DBG.collapse = () => {
    collapsed = true;
    pre.style.display = 'none';
    btnToggle.textContent = 'Expand';
  };
  DBG.expand = () => {
    collapsed = false;
    pre.style.display = 'block';
    btnToggle.textContent = 'Collapse';
    stick();
  };
  btnClear.onclick    = DBG.clear;
  btnDownload.onclick = DBG.download;
  btnToggle.onclick   = () => (collapsed ? DBG.expand() : DBG.collapse());

  // Always log uncaught errors (helps when nothing else prints)
  window.addEventListener('error', (e) => DBG.error(`window.onerror ${e.message || e}`));
  window.addEventListener('unhandledrejection', (e) => DBG.error(`unhandledrejection ${e.reason || e}`));

  // First line so you know it’s live
  DBG.info('[debug enabled]');
})();